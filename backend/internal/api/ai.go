package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"proxy-control/backend/internal/store"
)

type aiChatRequest struct {
	Message string `json:"message"`
}

type aiChatResponse struct {
	Configured bool     `json:"configured"`
	Reply      string   `json:"reply"`
	Plan       []string `json:"plan"`
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

	if r.aiBaseURL == "" || r.aiAPIKey == "" {
		writeJSON(w, http.StatusOK, aiChatResponse{
			Configured: false,
			Reply:      "后台还没有配置 AI 接口和密钥。请在后端环境变量里配置 PROXY_CONTROL_AI_BASE_URL 和 PROXY_CONTROL_AI_API_KEY。",
			Plan:       []string{"配置后端 AI 接口地址", "配置后端 AI API Key", "重启后端服务后再使用 AI 助手"},
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
