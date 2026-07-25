package api

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"proxy-control/backend/internal/store"
)

type settingsResponse struct {
	HTTPAddr             string `json:"httpAddr"`
	CORSAllowOrigin      string `json:"corsAllowOrigin"`
	DataDir              string `json:"dataDir"`
	FrontendDir          string `json:"frontendDir"`
	FrontendEnabled      bool   `json:"frontendEnabled"`
	AdminUsername        string `json:"adminUsername"`
	DefaultAdminPassword bool   `json:"defaultAdminPassword"`
	AgentTokenConfigured bool   `json:"agentTokenConfigured"`
	AgentMasterURL       string `json:"agentMasterUrl"`
	PublicHost           string `json:"publicHost"`
	AIConfigured         bool   `json:"aiConfigured"`
	AIBaseURL            string `json:"aiBaseUrl"`
	AIAPIKeyConfigured   bool   `json:"aiApiKeyConfigured"`
	AIModel              string `json:"aiModel"`
	SessionSecretCustom  bool   `json:"sessionSecretCustom"`
	MasterConfigCommand  string `json:"masterConfigCommand"`
	AgentConfigCommand   string `json:"agentConfigCommand"`
	MasterServiceName    string `json:"masterServiceName"`
	AgentServiceName     string `json:"agentServiceName"`
}

type adminSettingsRequest struct {
	Username        string `json:"username"`
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type aiSettingsRequest struct {
	BaseURL string `json:"baseUrl"`
	APIKey  string `json:"apiKey"`
	Model   string `json:"model"`
}

type consoleSettingsRequest struct {
	HTTPAddr        string `json:"httpAddr"`
	CORSAllowOrigin string `json:"corsAllowOrigin"`
	FrontendDir     string `json:"frontendDir"`
}

type agentSettingsRequest struct {
	MasterURL         string `json:"masterUrl"`
	AgentToken        string `json:"agentToken"`
	MasterServiceName string `json:"masterServiceName"`
	AgentServiceName  string `json:"agentServiceName"`
}

func (r *Router) handleSettings(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	adminUsername, defaultAdminPassword := r.adminSettingsSummary()
	consoleConfig := r.consoleConfigSnapshot()
	aiConfig := r.aiConfigSnapshot()
	agentConfig := r.agentConfigSnapshot()

	writeJSON(w, http.StatusOK, settingsResponse{
		HTTPAddr:             consoleConfig.HTTPAddr,
		CORSAllowOrigin:      consoleConfig.CORSAllowOrigin,
		DataDir:              r.dataDir,
		FrontendDir:          consoleConfig.FrontendDir,
		FrontendEnabled:      consoleConfig.FrontendDir != "",
		AdminUsername:        adminUsername,
		DefaultAdminPassword: defaultAdminPassword,
		AgentTokenConfigured: agentConfig.Token != "",
		AgentMasterURL:       agentConfig.MasterURL,
		PublicHost:           r.publicClientHost(req, agentConfig),
		AIConfigured:         aiConfig.configured(),
		AIBaseURL:            aiConfig.BaseURL,
		AIAPIKeyConfigured:   aiConfig.APIKey != "",
		SessionSecretCustom:  r.sessionSecretCustom,
		AIModel:              aiConfig.Model,
		MasterConfigCommand:  "fyss",
		AgentConfigCommand:   "fyss",
		MasterServiceName:    agentConfig.MasterServiceName,
		AgentServiceName:     agentConfig.AgentServiceName,
	})
}

func (r *Router) publicClientHost(req *http.Request, agentConfig store.AgentConfig) string {
	if host := hostFromURL(agentConfig.MasterURL); host != "" {
		return host
	}
	for _, header := range []string{"X-Forwarded-Host", "X-Real-Host"} {
		if host := normalizeClientHost(req.Header.Get(header)); isUsableClientHost(host) {
			return host
		}
	}
	if host := normalizeClientHost(req.Host); isUsableClientHost(host) {
		return host
	}
	return r.detectedPublicHost()
}

func (r *Router) detectedPublicHost() string {
	r.publicHostMu.RLock()
	if r.publicHost != "" {
		defer r.publicHostMu.RUnlock()
		return r.publicHost
	}
	r.publicHostMu.RUnlock()

	r.publicHostMu.Lock()
	defer r.publicHostMu.Unlock()
	if r.publicHost != "" {
		return r.publicHost
	}
	r.publicHost = detectPublicIP(r.httpClient)
	return r.publicHost
}

func detectPublicIP(client *http.Client) string {
	if client == nil {
		client = http.DefaultClient
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1200*time.Millisecond)
	defer cancel()
	for _, endpoint := range []string{"https://api.ipify.org", "https://ifconfig.me/ip"} {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			continue
		}
		res, err := client.Do(req)
		if err != nil {
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(res.Body, 128))
		_ = res.Body.Close()
		if readErr != nil || res.StatusCode < 200 || res.StatusCode >= 300 {
			continue
		}
		host := strings.TrimSpace(string(body))
		if net.ParseIP(host) != nil {
			return host
		}
	}
	return ""
}

func hostFromURL(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return ""
	}
	return normalizeClientHost(parsed.Host)
}

func normalizeClientHost(value string) string {
	host := strings.TrimSpace(value)
	if host == "" {
		return ""
	}
	if first, _, ok := strings.Cut(host, ","); ok {
		host = strings.TrimSpace(first)
	}
	if parsed, err := url.Parse(host); err == nil && parsed.Host != "" {
		host = parsed.Host
	}
	host = strings.Trim(strings.Split(host, "/")[0], " ")
	if splitHost, _, err := net.SplitHostPort(host); err == nil {
		return strings.TrimPrefix(strings.TrimSuffix(splitHost, "]"), "[")
	}
	host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")
	if before, after, ok := strings.Cut(host, ":"); ok && !strings.Contains(after, ":") {
		if port, err := strconv.Atoi(after); err == nil && port > 0 && port <= 65535 {
			return before
		}
	}
	return host
}

func isUsableClientHost(host string) bool {
	if host == "" {
		return false
	}
	if strings.EqualFold(host, "localhost") {
		return false
	}
	ip := net.ParseIP(host)
	return ip == nil || (!ip.IsLoopback() && !ip.IsUnspecified())
}

func (r *Router) consoleConfigSnapshot() store.ConsoleConfig {
	r.configMu.RLock()
	defer r.configMu.RUnlock()

	return store.ConsoleConfig{
		HTTPAddr:        strings.TrimSpace(r.httpAddr),
		CORSAllowOrigin: strings.TrimSpace(r.corsOrigin),
		FrontendDir:     strings.TrimSpace(r.frontendDir),
	}
}

func (r *Router) handleConsoleSettings(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPut {
		methodNotAllowed(w)
		return
	}

	var input consoleSettingsRequest
	if !decodeJSON(w, req, &input) {
		return
	}
	httpAddr := strings.TrimSpace(input.HTTPAddr)
	corsOrigin := strings.TrimSpace(input.CORSAllowOrigin)
	frontendDir := strings.TrimSpace(input.FrontendDir)
	if err := validateHTTPAddr(httpAddr); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateCORSOrigin(corsOrigin); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if frontendDir != "" && !filepath.IsAbs(frontendDir) {
		writeError(w, http.StatusBadRequest, "前端托管目录必须是绝对路径，或留空关闭托管")
		return
	}

	next := store.ConsoleConfig{
		HTTPAddr:        httpAddr,
		CORSAllowOrigin: corsOrigin,
		FrontendDir:     frontendDir,
	}
	if err := r.store.SaveConsoleConfig(next); err != nil {
		writeError(w, http.StatusInternalServerError, "保存控制台配置失败")
		return
	}

	r.configMu.Lock()
	r.httpAddr = next.HTTPAddr
	r.corsOrigin = next.CORSAllowOrigin
	r.frontendDir = next.FrontendDir
	r.configMu.Unlock()

	writeJSON(w, http.StatusOK, settingsResponse{
		HTTPAddr:        next.HTTPAddr,
		CORSAllowOrigin: next.CORSAllowOrigin,
		DataDir:         r.dataDir,
		FrontendDir:     next.FrontendDir,
		FrontendEnabled: next.FrontendDir != "",
	})
}

func (r *Router) agentConfigSnapshot() store.AgentConfig {
	r.agentMu.RLock()
	defer r.agentMu.RUnlock()

	return store.AgentConfig{
		Token:             strings.TrimSpace(r.agentToken),
		MasterURL:         strings.TrimRight(strings.TrimSpace(r.agentMasterURL), "/"),
		MasterServiceName: defaultString(strings.TrimSpace(r.agentMasterService), "proxy-control"),
		AgentServiceName:  defaultString(strings.TrimSpace(r.agentService), "proxy-control-agent"),
	}
}

func (r *Router) handleAgentSettings(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPut {
		methodNotAllowed(w)
		return
	}

	var input agentSettingsRequest
	if !decodeJSON(w, req, &input) {
		return
	}
	masterURL := strings.TrimRight(strings.TrimSpace(input.MasterURL), "/")
	agentToken := strings.TrimSpace(input.AgentToken)
	current := r.agentConfigSnapshot()
	masterServiceName := defaultString(strings.TrimSpace(input.MasterServiceName), current.MasterServiceName)
	agentServiceName := defaultString(strings.TrimSpace(input.AgentServiceName), current.AgentServiceName)
	if err := validateAgentMasterURL(masterURL); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateServiceName(masterServiceName, "主控服务名"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateServiceName(agentServiceName, "被控服务名"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if agentToken != "" && hasControlChar(agentToken) {
		writeError(w, http.StatusBadRequest, "Agent Token 不能包含换行或控制字符")
		return
	}

	if agentToken == "" {
		agentToken = current.Token
	}
	next := store.AgentConfig{
		Token:             agentToken,
		MasterURL:         masterURL,
		MasterServiceName: masterServiceName,
		AgentServiceName:  agentServiceName,
	}
	if err := r.store.SaveAgentConfig(next); err != nil {
		writeError(w, http.StatusInternalServerError, "保存被控接入配置失败")
		return
	}

	r.agentMu.Lock()
	r.agentToken = next.Token
	r.agentMasterURL = next.MasterURL
	r.agentMasterService = next.MasterServiceName
	r.agentService = next.AgentServiceName
	r.agentMu.Unlock()

	writeJSON(w, http.StatusOK, settingsResponse{
		AgentTokenConfigured: next.Token != "",
		AgentMasterURL:       next.MasterURL,
		MasterServiceName:    next.MasterServiceName,
		AgentServiceName:     next.AgentServiceName,
	})
}

func validateAgentMasterURL(value string) error {
	if value == "" {
		return nil
	}
	parsed, err := url.ParseRequestURI(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("总控地址必须是 http 或 https URL，或留空")
	}
	return nil
}

func validateServiceName(value string, label string) error {
	if value == "" {
		return errors.New(label + "不能为空")
	}
	if len(value) > 80 || hasControlChar(value) || strings.ContainsAny(value, " \t\r\n/\\") {
		return errors.New(label + "只能使用不含空格的 systemd 服务名")
	}
	return nil
}

func defaultString(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func validateHTTPAddr(value string) error {
	if value == "" {
		return errors.New("监听地址不能为空")
	}
	_, port, err := net.SplitHostPort(value)
	if err != nil || port == "" {
		return errors.New("监听地址必须是 host:port 格式，例如 :8080 或 0.0.0.0:8080")
	}
	return nil
}

func validateCORSOrigin(value string) error {
	if value == "" || value == "*" {
		return nil
	}
	parsed, err := url.ParseRequestURI(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("跨域来源必须是 http/https 地址、* 或留空")
	}
	return nil
}

func (r *Router) adminSettingsSummary() (string, bool) {
	r.authMu.RLock()
	defer r.authMu.RUnlock()

	if r.adminHash != "" {
		return r.adminUsername, false
	}
	return r.adminUsername, r.adminUsername == "admin" && r.adminPassword == "admin"
}

func (r *Router) handleAdminSettings(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPut {
		methodNotAllowed(w)
		return
	}

	var input adminSettingsRequest
	if !decodeJSON(w, req, &input) {
		return
	}
	username := strings.TrimSpace(input.Username)
	currentPassword := input.CurrentPassword
	newPassword := input.NewPassword
	if username == "" {
		writeError(w, http.StatusBadRequest, "管理员账号不能为空")
		return
	}
	if len(username) < 3 || len(username) > 64 {
		writeError(w, http.StatusBadRequest, "管理员账号长度需要在 3 到 64 位之间")
		return
	}
	if currentPassword == "" {
		writeError(w, http.StatusBadRequest, "请输入当前密码")
		return
	}
	currentUsername := usernameFromContext(req.Context())
	if currentUsername == "" {
		writeError(w, http.StatusUnauthorized, "登录已失效")
		return
	}
	if _, ok := r.validateAdminLogin(currentUsername, currentPassword); !ok {
		writeError(w, http.StatusUnauthorized, "当前密码不正确")
		return
	}

	passwordToSave := currentPassword
	if newPassword != "" {
		if len(newPassword) < 6 || len(newPassword) > 128 {
			writeError(w, http.StatusBadRequest, "新密码长度需要在 6 到 128 位之间")
			return
		}
		if username == "admin" && newPassword == "admin" {
			writeError(w, http.StatusBadRequest, "不能继续使用默认 admin/admin")
			return
		}
		passwordToSave = newPassword
	}

	session, err := r.updateAdminCredentials(username, passwordToSave)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "保存管理员配置失败")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (r *Router) handleAISettings(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPut {
		methodNotAllowed(w)
		return
	}

	var input aiSettingsRequest
	if !decodeJSON(w, req, &input) {
		return
	}
	baseURL := strings.TrimSpace(input.BaseURL)
	apiKey := strings.TrimSpace(input.APIKey)
	model := strings.TrimSpace(input.Model)
	if model == "" {
		model = "gpt-4o-mini"
	}
	if baseURL != "" {
		parsed, err := url.ParseRequestURI(baseURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			writeError(w, http.StatusBadRequest, "AI 接口地址必须是 http 或 https 地址")
			return
		}
	}
	if len(model) > 120 {
		writeError(w, http.StatusBadRequest, "模型名称过长")
		return
	}

	current := r.aiConfigSnapshot()
	if apiKey == "" {
		apiKey = current.APIKey
	}
	next := store.AIConfig{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   model,
	}
	if err := r.store.SaveAIConfig(next); err != nil {
		writeError(w, http.StatusInternalServerError, "保存 AI 配置失败")
		return
	}

	r.aiMu.Lock()
	r.aiBaseURL = next.BaseURL
	r.aiAPIKey = next.APIKey
	r.aiModel = next.Model
	r.aiMu.Unlock()

	writeJSON(w, http.StatusOK, settingsResponse{
		AIConfigured:       next.BaseURL != "" && next.APIKey != "",
		AIBaseURL:          next.BaseURL,
		AIAPIKeyConfigured: next.APIKey != "",
		AIModel:            next.Model,
	})
}
