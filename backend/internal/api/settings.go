package api

import (
	"net/http"
	"net/url"
	"strings"

	"proxy-control/backend/internal/store"
)

type settingsResponse struct {
	HTTPAddr             string `json:"httpAddr"`
	CORSAllowOrigin      string `json:"corsAllowOrigin"`
	DataDir              string `json:"dataDir"`
	FrontendEnabled      bool   `json:"frontendEnabled"`
	AdminUsername        string `json:"adminUsername"`
	DefaultAdminPassword bool   `json:"defaultAdminPassword"`
	AgentTokenConfigured bool   `json:"agentTokenConfigured"`
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

func (r *Router) handleSettings(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	adminUsername, defaultAdminPassword := r.adminSettingsSummary()
	aiConfig := r.aiConfigSnapshot()

	writeJSON(w, http.StatusOK, settingsResponse{
		HTTPAddr:             r.httpAddr,
		CORSAllowOrigin:      r.corsOrigin,
		DataDir:              r.dataDir,
		FrontendEnabled:      r.frontendDir != "",
		AdminUsername:        adminUsername,
		DefaultAdminPassword: defaultAdminPassword,
		AgentTokenConfigured: r.agentToken != "",
		AIConfigured:         aiConfig.configured(),
		AIBaseURL:            aiConfig.BaseURL,
		AIAPIKeyConfigured:   aiConfig.APIKey != "",
		SessionSecretCustom:  r.sessionSecretCustom,
		AIModel:              aiConfig.Model,
		MasterConfigCommand:  "fyss",
		AgentConfigCommand:   "fyss",
		MasterServiceName:    "proxy-control",
		AgentServiceName:     "proxy-control-agent",
	})
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
