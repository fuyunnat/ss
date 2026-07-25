package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"proxy-control/backend/internal/store"
)

type aiChatRequest struct {
	Message string `json:"message"`
}

type aiChatResponse struct {
	Configured bool       `json:"configured"`
	Reply      string     `json:"reply"`
	Plan       []string   `json:"plan"`
	Actions    []aiAction `json:"actions"`
}

type aiAction struct {
	ID                   string         `json:"id"`
	Type                 string         `json:"type"`
	Title                string         `json:"title"`
	Description          string         `json:"description"`
	Payload              map[string]any `json:"payload"`
	MissingFields        []string       `json:"missingFields"`
	RequiresConfirmation bool           `json:"requiresConfirmation"`
}

type openAIChatRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Temperature float64         `json:"temperature"`
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIChatResponse struct {
	Choices []struct {
		Message openAIMessage `json:"message"`
	} `json:"choices"`
}

func (r *Router) handleAIChat(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var input aiChatRequest
	if !decodeJSON(w, req, &input) {
		return
	}
	message := strings.TrimSpace(input.Message)
	if message == "" {
		writeError(w, http.StatusBadRequest, "请输入要让 AI 处理的问题")
		return
	}
	if len(message) > 4000 {
		writeError(w, http.StatusBadRequest, "问题太长，请控制在 4000 字以内")
		return
	}
	actions := inferActionsFromMessage(message)
	if len(actions) > 0 && (r.aiBaseURL == "" || r.aiAPIKey == "") {
		writeJSON(w, http.StatusOK, aiChatResponse{
			Configured: false,
			Reply:      fmt.Sprintf("已从你的描述里识别出 %d 台待安装服务器。补齐总控地址、Agent Token 和 SSH 认证方式后，可以在右侧确认批量安装。", len(actions)),
			Plan:       []string{"检查识别出来的服务器 IP、SSH 用户、端口和地区", "填写批量安装默认参数", "确认后由总控逐台创建安装任务", "安装完成后等待 Agent 心跳自动上线"},
			Actions:    actions,
		})
		return
	}

	if r.aiBaseURL == "" || r.aiAPIKey == "" {
		writeJSON(w, http.StatusOK, aiChatResponse{
			Configured: false,
			Reply:      "后台还没有配置 AI 接口和密钥。请在后端环境变量里配置 PROXY_CONTROL_AI_BASE_URL 和 PROXY_CONTROL_AI_API_KEY。",
			Plan:       []string{"配置后端 AI 接口地址", "配置后端 AI API Key", "重启后端服务后再使用 AI 助手", "也可以直接粘贴服务器 IP 列表，系统会先生成批量安装草案"},
			Actions:    []aiAction{},
		})
		return
	}

	reply, err := r.callAIProvider(req.Context(), message)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, aiChatResponse{
		Configured: true,
		Reply:      reply,
		Plan:       extractPlan(reply),
		Actions:    actions,
	})
}

func (r *Router) callAIProvider(ctx context.Context, message string) (string, error) {
	body := openAIChatRequest{
		Model:       r.aiModel,
		Temperature: 0.2,
		Messages: []openAIMessage{
			{
				Role: "system",
				Content: strings.Join([]string{
					"你是代理总控面板里的运维 Agent。",
					"你只能基于当前控制面数据给出建议、排查步骤、配置草案和待确认操作。",
					"不要要求用户在前端粘贴 API Key、密码或 token。",
					"不要声称已经执行了命令、部署或重启；真正执行动作必须走面板受控任务并等待管理员确认。",
					"输出使用中文，先给结论，再给最多 5 条可执行步骤。",
					"当前控制面状态：",
					r.aiContextSnapshot(),
				}, "\n"),
			},
			{Role: "user", Content: message},
		},
	}
	rawBody, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("生成 AI 请求失败")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.aiChatURL(), bytes.NewReader(rawBody))
	if err != nil {
		return "", fmt.Errorf("AI 接口地址无效")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+r.aiAPIKey)

	res, err := r.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("AI 接口请求失败")
	}
	defer res.Body.Close()

	rawResponse, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("读取 AI 响应失败")
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("AI 接口返回失败状态：%d", res.StatusCode)
	}

	var output openAIChatResponse
	if err := json.Unmarshal(rawResponse, &output); err != nil {
		return "", fmt.Errorf("AI 响应格式不正确")
	}
	if len(output.Choices) == 0 || strings.TrimSpace(output.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("AI 没有返回有效内容")
	}
	return strings.TrimSpace(output.Choices[0].Message.Content), nil
}

func (r *Router) aiChatURL() string {
	base := strings.TrimRight(r.aiBaseURL, "/")
	if strings.HasSuffix(base, "/v1") {
		return base + "/chat/completions"
	}
	return base + "/v1/chat/completions"
}

func (r *Router) aiContextSnapshot() string {
	summary := r.store.Summary()
	servers := r.store.ListServers()
	exits := r.store.ListExits()
	policies := r.store.ListPolicies()
	tasks := r.store.ListTasks()
	return fmt.Sprintf(
		"服务器 %d 台，入口 %d 个，出口 %d 个，健康出口 %d 个，策略 %d 条，任务 %d 条。在线服务器：%s。可用出口：%s。策略：%s。最近任务：%s。",
		summary.ServerCount,
		summary.GatewayCount,
		summary.ExitCount,
		summary.HealthyExits,
		summary.PolicyCount,
		summary.TaskCount,
		joinServerNames(servers),
		joinExitNames(exits),
		joinPolicyNames(policies),
		joinTaskSummaries(tasks),
	)
}

func joinServerNames(items []store.ServerNode) string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		if item.Status == "online" {
			names = append(names, item.Name+"("+item.Region+")")
		}
	}
	if len(names) == 0 {
		return "无"
	}
	return strings.Join(limitStrings(names, 8), "、")
}

func joinExitNames(items []store.ExitNode) string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		if item.Enabled {
			names = append(names, item.Name+"("+item.Health+")")
		}
	}
	if len(names) == 0 {
		return "无"
	}
	return strings.Join(limitStrings(names, 8), "、")
}

func joinPolicyNames(items []store.Policy) string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		if item.Enabled {
			names = append(names, item.Name+"("+item.Strategy+")")
		}
	}
	if len(names) == 0 {
		return "无"
	}
	return strings.Join(limitStrings(names, 8), "、")
}

func joinTaskSummaries(items []store.Task) string {
	if len(items) == 0 {
		return "无"
	}
	start := len(items) - 5
	if start < 0 {
		start = 0
	}
	summaries := make([]string, 0, len(items)-start)
	for _, item := range items[start:] {
		summaries = append(summaries, item.Summary+"("+item.Status+")")
	}
	return strings.Join(summaries, "、")
}

func limitStrings(items []string, limit int) []string {
	if len(items) <= limit {
		return items
	}
	return append(items[:limit], "...")
}

func extractPlan(reply string) []string {
	lines := strings.Split(reply, "\n")
	plan := make([]string, 0, 5)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		line = strings.TrimLeft(line, "-*0123456789.、) ")
		if line == "" || strings.Contains(line, "结论") {
			continue
		}
		plan = append(plan, line)
		if len(plan) == 5 {
			break
		}
	}
	if len(plan) == 0 {
		return []string{"查看 AI 回复中的建议", "确认后再通过面板任务执行变更"}
	}
	return plan
}

func inferActionsFromMessage(message string) []aiAction {
	hosts := parseInstallTargets(message)
	actions := make([]aiAction, 0, len(hosts))
	seen := make(map[string]bool, len(hosts))
	for _, target := range hosts {
		if target.SSHHost == "" || seen[target.SSHHost] {
			continue
		}
		seen[target.SSHHost] = true
		payload := map[string]any{
			"sshHost":    target.SSHHost,
			"sshPort":    target.SSHPort,
			"sshUser":    target.SSHUser,
			"authMethod": "agent",
			"nodeName":   target.NodeName,
			"region":     target.Region,
			"masterUrl":  "",
			"agentToken": "",
			"nodeHost":   "",
		}
		actions = append(actions, aiAction{
			ID:                   fmt.Sprintf("install-%d", len(actions)+1),
			Type:                 "install_agent",
			Title:                "安装被控 Agent: " + target.NodeName,
			Description:          fmt.Sprintf("%s@%s:%d，地区 %s", target.SSHUser, target.SSHHost, target.SSHPort, aiDefaultString(target.Region, "未指定")),
			Payload:              payload,
			MissingFields:        []string{"masterUrl", "agentToken"},
			RequiresConfirmation: true,
		})
	}
	return actions
}

type installTarget struct {
	SSHHost  string
	SSHPort  int
	SSHUser  string
	NodeName string
	Region   string
}

var hostTokenPattern = regexp.MustCompile(`^([A-Za-z0-9._-]+@)?([A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?$`)
var regionTokenPattern = regexp.MustCompile(`^[A-Z][A-Z0-9]{1,5}$`)
var nodeNameTokenPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`)

func parseInstallTargets(message string) []installTarget {
	lines := strings.Split(strings.ReplaceAll(message, "\r\n", "\n"), "\n")
	targets := make([]installTarget, 0)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		tokens := strings.Fields(strings.NewReplacer(",", " ", "，", " ", "|", " ", "\t", " ").Replace(line))
		for index, token := range tokens {
			target, ok := parseHostToken(token)
			if !ok {
				continue
			}
			target.Region = nearbyRegion(tokens, index)
			target.NodeName = nearbyName(tokens, index, target.SSHHost)
			targets = append(targets, target)
			break
		}
	}
	if len(targets) == 0 {
		for _, token := range strings.Fields(message) {
			if target, ok := parseHostToken(strings.Trim(token, "，,;；。")); ok {
				target.NodeName = safeNodeName(target.SSHHost)
				targets = append(targets, target)
			}
		}
	}
	return targets
}

func parseHostToken(token string) (installTarget, bool) {
	token = strings.TrimSpace(strings.Trim(token, "，,;；。()[]{}"))
	match := hostTokenPattern.FindStringSubmatch(token)
	if match == nil {
		return installTarget{}, false
	}
	user := strings.TrimSuffix(match[1], "@")
	if user == "" {
		user = "root"
	}
	port := 22
	if match[3] != "" {
		parsed, err := strconv.Atoi(match[3])
		if err != nil || parsed <= 0 || parsed > 65535 {
			return installTarget{}, false
		}
		port = parsed
	}
	return installTarget{
		SSHHost:  match[2],
		SSHPort:  port,
		SSHUser:  user,
		NodeName: safeNodeName(match[2]),
	}, true
}

func nearbyRegion(tokens []string, hostIndex int) string {
	for _, offset := range []int{1, 2, -1, -2} {
		index := hostIndex + offset
		if index < 0 || index >= len(tokens) {
			continue
		}
		value := strings.Trim(strings.TrimSpace(tokens[index]), "，,;；。()[]{}")
		upper := strings.ToUpper(value)
		if len(upper) >= 2 && len(upper) <= 8 && regionTokenPattern.MatchString(upper) {
			return upper
		}
	}
	return ""
}

func nearbyName(tokens []string, hostIndex int, host string) string {
	for _, offset := range []int{-1, 1, 2} {
		index := hostIndex + offset
		if index < 0 || index >= len(tokens) {
			continue
		}
		value := strings.Trim(strings.TrimSpace(tokens[index]), "，,;；。()[]{}")
		upper := strings.ToUpper(value)
		if value == "" || strings.Contains(value, "@") || hostTokenPattern.MatchString(value) || regionTokenPattern.MatchString(upper) || !nodeNameTokenPattern.MatchString(value) {
			continue
		}
		if len([]rune(value)) <= 32 {
			return value
		}
	}
	return safeNodeName(host)
}

func safeNodeName(host string) string {
	name := strings.NewReplacer(".", "-", ":", "-").Replace(host)
	if len(name) > 32 {
		return name[:32]
	}
	return name
}

func aiDefaultString(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
