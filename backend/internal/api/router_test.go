package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"proxy-control/backend/internal/store"
)

func TestCreateServerAndSummary(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPost, "/api/servers", strings.NewReader(`{"name":"sg-01","host":"198.51.100.8"}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create server status = %d, body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/summary", nil)
	authorize(req, token)
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"serverCount":1`) {
		t.Fatalf("summary response = %d %s", res.Code, res.Body.String())
	}
}

func TestCreateExitRequiresAddress(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	body := bytes.NewBufferString(`{"name":"bad-exit","type":"external_socks5","port":1080}`)
	req := httptest.NewRequest(http.MethodPost, "/api/exits", body)
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", res.Code)
	}
}

func TestEmptyListsReturnArrays(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodGet, "/api/gateways", nil)
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.Code)
	}
	var body []store.Gateway
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("expected json array, got %s: %v", res.Body.String(), err)
	}
	if body == nil || len(body) != 0 {
		t.Fatalf("expected empty array, got %#v", body)
	}
}

func TestGatewayPersistsProtocolConnectionInfo(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPost, "/api/gateways", strings.NewReader(`{
		"name":"main-entry",
		"listenHost":"0.0.0.0",
		"protocols":[
			{"protocol":"vless","port":30000,"enabled":true,"credential":"uuid-1"},
			{"protocol":"socks5","port":30004,"enabled":true,"authUser":"fyss","password":"pass-1"}
		]
	}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/gateways", nil)
	authorize(req, token)
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected list status 200, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	for _, want := range []string{`"port":30000`, `"credential":"uuid-1"`, `"authUser":"fyss"`, `"password":"pass-1"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("expected gateway response to contain %s, got %s", want, body)
		}
	}
}

func TestAgentHeartbeatRequiresTokenWhenConfigured(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, _ := newTestRouter(t, st, "secret-token")

	req := httptest.NewRequest(http.MethodPost, "/api/agent/heartbeat", strings.NewReader(`{"name":"hk-01","host":"203.0.113.1"}`))
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", res.Code)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/agent/heartbeat", strings.NewReader(`{"name":"hk-01","host":"203.0.113.1"}`))
	req.Header.Set("Authorization", "Bearer secret-token")
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}
}

func TestAgentInstallValidatesRequiredFields(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "secret-token")

	req := httptest.NewRequest(http.MethodPost, "/api/agent/install", strings.NewReader(`{"sshHost":"","sshUser":"root"}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", res.Code, res.Body.String())
	}
}

func TestAgentInstallRejectsMismatchedToken(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "secret-token")

	req := httptest.NewRequest(http.MethodPost, "/api/agent/install", strings.NewReader(`{
		"sshHost":"203.0.113.10",
		"sshUser":"root",
		"masterUrl":"http://master:8080",
		"agentToken":"wrong-token",
		"nodeName":"hk-01"
	}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", res.Code, res.Body.String())
	}
}

func TestAgentSettingsPersistAndDriveHeartbeatAuth(t *testing.T) {
	path := t.TempDir() + "/state.json"
	st, err := store.NewFileStore(path)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPut, "/api/settings/agent", strings.NewReader(`{
		"masterUrl":"https://master.example.com:8443/",
		"agentToken":"agent-secret",
		"masterServiceName":"fyss-master",
		"agentServiceName":"fyss-agent"
	}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected update status 200, got %d: %s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "agent-secret") {
		t.Fatalf("agent settings update leaked token: %s", res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	authorize(req, token)
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected settings status 200, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	if strings.Contains(body, "agent-secret") {
		t.Fatalf("settings leaked agent token: %s", body)
	}
	for _, want := range []string{`"agentTokenConfigured":true`, `"agentMasterUrl":"https://master.example.com:8443"`, `"masterServiceName":"fyss-master"`, `"agentServiceName":"fyss-agent"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("expected settings response to contain %s, got %s", want, body)
		}
	}

	req = httptest.NewRequest(http.MethodPost, "/api/agent/heartbeat", strings.NewReader(`{"name":"hk-01","host":"203.0.113.1"}`))
	req.Header.Set("Authorization", "Bearer wrong")
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected wrong agent token status 401, got %d: %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/agent/heartbeat", strings.NewReader(`{"name":"hk-01","host":"203.0.113.1"}`))
	req.Header.Set("Authorization", "Bearer agent-secret")
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected heartbeat status 200, got %d: %s", res.Code, res.Body.String())
	}

	reopened, err := store.NewFileStore(path)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	agentConfig, ok := reopened.AgentConfig()
	if !ok || agentConfig.Token != "agent-secret" || agentConfig.MasterURL != "https://master.example.com:8443" || agentConfig.AgentServiceName != "fyss-agent" {
		t.Fatalf("unexpected persisted agent config: ok=%v config=%+v", ok, agentConfig)
	}
}

func TestAgentSettingsRejectInvalidValues(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	for _, body := range []string{
		`{"masterUrl":"ftp://master.example.com","agentToken":"secret","masterServiceName":"proxy-control","agentServiceName":"proxy-control-agent"}`,
		`{"masterUrl":"https://master.example.com","agentToken":"secret","masterServiceName":"bad name","agentServiceName":"proxy-control-agent"}`,
		"{\"masterUrl\":\"https://master.example.com\",\"agentToken\":\"bad\nsecret\",\"masterServiceName\":\"proxy-control\",\"agentServiceName\":\"proxy-control-agent\"}",
	} {
		req := httptest.NewRequest(http.MethodPut, "/api/settings/agent", strings.NewReader(body))
		authorize(req, token)
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != http.StatusBadRequest {
			t.Fatalf("expected invalid agent config status 400, got %d: %s", res.Code, res.Body.String())
		}
	}
}

func TestAgentInstallDefaultsUseConfiguredAccess(t *testing.T) {
	input := agentInstallRequest{
		SSHHost:    "203.0.113.10",
		SSHUser:    "root",
		AuthMethod: "agent",
		NodeName:   "hk-01",
	}
	normalizeAgentInstall(&input)
	applyAgentInstallDefaults(&input, store.AgentConfig{
		Token:     "agent-secret",
		MasterURL: "https://master.example.com:8443",
	})
	if err := validateAgentInstall(input, "agent-secret"); err != nil {
		t.Fatalf("expected configured defaults to validate: %v", err)
	}
	if input.AgentToken != "agent-secret" || input.MasterURL != "https://master.example.com:8443" {
		t.Fatalf("expected install defaults to be applied: %+v", input)
	}
}

func TestBuildSSHCommandDoesNotPutPasswordInArgs(t *testing.T) {
	command, args, err := buildSSHCommand(agentInstallRequest{
		SSHHost:     "203.0.113.10",
		SSHUser:     "root",
		AuthMethod:  "password",
		SSHPassword: "secret-password",
		MasterURL:   "http://master:8080",
		AgentToken:  "agent-token",
		NodeName:    "hk-01",
	}, "")
	if err != nil && strings.Contains(err.Error(), "sshpass") {
		t.Skip("sshpass is not installed in this environment")
	}
	if err != nil {
		t.Fatalf("build command: %v", err)
	}
	if command != "sshpass" {
		t.Fatalf("expected sshpass command, got %s", command)
	}
	if strings.Contains(strings.Join(args, " "), "secret-password") {
		t.Fatalf("ssh password leaked into command args: %#v", args)
	}
}

func TestBuildSSHCommandDoesNotPutAgentTokenInArgs(t *testing.T) {
	_, args, err := buildSSHCommand(agentInstallRequest{
		SSHHost:    "203.0.113.10",
		SSHUser:    "root",
		AuthMethod: "agent",
		MasterURL:  "http://master:8080",
		AgentToken: "agent-token",
		NodeName:   "hk-01",
	}, "")
	if err != nil {
		t.Fatalf("build command: %v", err)
	}
	if strings.Contains(strings.Join(args, " "), "agent-token") {
		t.Fatalf("agent token leaked into command args: %#v", args)
	}
}

func TestLoginAndProtectedRoutes(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, _ := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodGet, "/api/summary", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected protected route status 401, got %d", res.Code)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"admin"}`))
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected login status 200, got %d: %s", res.Code, res.Body.String())
	}
	var body authResponse
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if body.Token == "" || body.Username != "admin" {
		t.Fatalf("unexpected login response: %#v", body)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"wrong"}`))
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected wrong password status 401, got %d", res.Code)
	}
}

func TestAdminSettingsUpdatesCredentialsAndInvalidatesOldToken(t *testing.T) {
	path := t.TempDir() + "/state.json"
	st, err := store.NewFileStore(path)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPut, "/api/settings/admin", strings.NewReader(`{"username":"owner","currentPassword":"admin","newPassword":"better-secret"}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected update status 200, got %d: %s", res.Code, res.Body.String())
	}
	bodyText := res.Body.String()
	if strings.Contains(bodyText, "better-secret") {
		t.Fatalf("admin update leaked password: %s", bodyText)
	}
	var session authResponse
	if err := json.Unmarshal(res.Body.Bytes(), &session); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	if session.Token == "" || session.Username != "owner" {
		t.Fatalf("unexpected update response: %#v", session)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	authorize(req, token)
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected old token status 401, got %d: %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"owner","password":"better-secret"}`))
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected new login status 200, got %d: %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"admin"}`))
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected old login status 401, got %d", res.Code)
	}

	reopened, err := store.NewFileStore(path)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	adminConfig, ok := reopened.AdminConfig()
	if !ok {
		t.Fatal("expected persisted admin config")
	}
	if adminConfig.Username != "owner" || adminConfig.PasswordHash == "" || adminConfig.PasswordSalt == "" {
		t.Fatalf("unexpected persisted admin config: %+v", adminConfig)
	}
	if adminConfig.PasswordHash == "better-secret" || adminConfig.PasswordSalt == "better-secret" {
		t.Fatalf("admin password persisted in plaintext: %+v", adminConfig)
	}
}

func TestAdminSettingsRejectsWrongCurrentPassword(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPut, "/api/settings/admin", strings.NewReader(`{"username":"owner","currentPassword":"wrong","newPassword":"better-secret"}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected wrong current password status 401, got %d: %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"admin"}`))
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected old credentials to remain valid, got %d: %s", res.Code, res.Body.String())
	}
}

func TestAIChatWithoutBackendConfig(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPost, "/api/ai/chat", strings.NewReader(`{"message":"帮我检查节点"}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"configured":false`) {
		t.Fatalf("expected configured false response, got %s", res.Body.String())
	}
}

func TestAISettingsPersistAndConfigureProvider(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected provider path: %s", req.URL.Path)
		}
		if req.Header.Get("Authorization") != "Bearer ai-secret" {
			t.Fatalf("unexpected auth header: %s", req.Header.Get("Authorization"))
		}
		var body openAIChatRequest
		if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		if body.Model != "gpt-test" {
			t.Fatalf("unexpected model: %s", body.Model)
		}
		writeJSON(w, http.StatusOK, openAIChatResponse{Choices: []struct {
			Message openAIMessage `json:"message"`
		}{{Message: openAIMessage{Role: "assistant", Content: "AI 配置可用"}}}})
	}))
	defer provider.Close()

	path := t.TempDir() + "/state.json"
	st, err := store.NewFileStore(path)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPut, "/api/settings/ai", strings.NewReader(`{"baseUrl":"`+provider.URL+`/v1","apiKey":"ai-secret","model":"gpt-test"}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected update status 200, got %d: %s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "ai-secret") {
		t.Fatalf("ai settings update leaked api key: %s", res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	authorize(req, token)
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected settings status 200, got %d: %s", res.Code, res.Body.String())
	}
	bodyText := res.Body.String()
	if strings.Contains(bodyText, "ai-secret") {
		t.Fatalf("settings leaked api key: %s", bodyText)
	}
	for _, want := range []string{`"aiConfigured":true`, `"aiApiKeyConfigured":true`, `"aiModel":"gpt-test"`} {
		if !strings.Contains(bodyText, want) {
			t.Fatalf("expected settings response to contain %s, got %s", want, bodyText)
		}
	}

	req = httptest.NewRequest(http.MethodPost, "/api/ai/chat", strings.NewReader(`{"message":"检查 AI 配置"}`))
	authorize(req, token)
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected ai chat status 200, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"configured":true`) || !strings.Contains(res.Body.String(), "AI 配置可用") {
		t.Fatalf("unexpected ai chat response: %s", res.Body.String())
	}

	reopened, err := store.NewFileStore(path)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	aiConfig, ok := reopened.AIConfig()
	if !ok || aiConfig.BaseURL != provider.URL+"/v1" || aiConfig.APIKey != "ai-secret" || aiConfig.Model != "gpt-test" {
		t.Fatalf("unexpected persisted ai config: ok=%v config=%+v", ok, aiConfig)
	}
}

func TestConsoleSettingsPersistAndUpdateRuntimeCORS(t *testing.T) {
	path := t.TempDir() + "/state.json"
	st, err := store.NewFileStore(path)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPut, "/api/settings/console", strings.NewReader(`{"httpAddr":"0.0.0.0:18080","corsAllowOrigin":"https://panel.example.com","frontendDir":"/opt/fyss/frontend"}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected update status 200, got %d: %s", res.Code, res.Body.String())
	}
	for _, want := range []string{`"httpAddr":"0.0.0.0:18080"`, `"corsAllowOrigin":"https://panel.example.com"`, `"frontendDir":"/opt/fyss/frontend"`, `"frontendEnabled":true`} {
		if !strings.Contains(res.Body.String(), want) {
			t.Fatalf("expected console update response to contain %s, got %s", want, res.Body.String())
		}
	}

	req = httptest.NewRequest(http.MethodOptions, "/api/settings", nil)
	req.Header.Set("Origin", "https://panel.example.com")
	res = httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusNoContent || res.Header().Get("Access-Control-Allow-Origin") != "https://panel.example.com" {
		t.Fatalf("expected runtime cors update, status=%d origin=%q", res.Code, res.Header().Get("Access-Control-Allow-Origin"))
	}

	reopened, err := store.NewFileStore(path)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	consoleConfig, ok := reopened.ConsoleConfig()
	if !ok || consoleConfig.HTTPAddr != "0.0.0.0:18080" || consoleConfig.CORSAllowOrigin != "https://panel.example.com" || consoleConfig.FrontendDir != "/opt/fyss/frontend" {
		t.Fatalf("unexpected persisted console config: ok=%v config=%+v", ok, consoleConfig)
	}
}

func TestConsoleSettingsRejectInvalidValues(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	for _, body := range []string{
		`{"httpAddr":"8080","corsAllowOrigin":"https://panel.example.com","frontendDir":"/opt/fyss/frontend"}`,
		`{"httpAddr":":8080","corsAllowOrigin":"ftp://panel.example.com","frontendDir":"/opt/fyss/frontend"}`,
		`{"httpAddr":":8080","corsAllowOrigin":"https://panel.example.com","frontendDir":"relative/dist"}`,
	} {
		req := httptest.NewRequest(http.MethodPut, "/api/settings/console", strings.NewReader(body))
		authorize(req, token)
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != http.StatusBadRequest {
			t.Fatalf("expected invalid console config status 400, got %d: %s", res.Code, res.Body.String())
		}
	}
}

func TestSettingsDoesNotExposeSecrets(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router := NewRouter(st, Options{
		CORSAllowOrigin: "http://localhost:5173",
		HTTPAddr:        ":8080",
		DataDir:         "/tmp/proxy-control",
		FrontendDir:     "/opt/proxy-control/frontend/dist",
		AgentToken:      "agent-secret",
		AdminUsername:   "admin",
		AdminPassword:   "strong-password",
		SessionSecret:   "session-secret",
		AIBaseURL:       "https://api.example.com/v1",
		AIAPIKey:        "ai-secret",
		AIModel:         "gpt-test",
	})
	token, err := (&Router{sessionSecret: "session-secret"}).issueToken("admin")
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	for _, secret := range []string{"agent-secret", "strong-password", "session-secret", "ai-secret"} {
		if strings.Contains(body, secret) {
			t.Fatalf("settings leaked secret %q in response: %s", secret, body)
		}
	}
	if !strings.Contains(body, `"agentTokenConfigured":true`) || !strings.Contains(body, `"aiApiKeyConfigured":true`) {
		t.Fatalf("expected configured flags, got %s", body)
	}
}

func TestAIChatDraftsBatchAgentInstalls(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPost, "/api/ai/chat", strings.NewReader(`{"message":"帮我安装这些服务器\nroot@203.0.113.10:22 HK hk-01\n198.51.100.8 JP jp-01"}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}

	var body aiChatResponse
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Actions) != 2 {
		t.Fatalf("expected 2 install actions, got %#v", body.Actions)
	}
	if body.Actions[0].Type != "install_agent" || body.Actions[0].Payload["sshHost"] != "203.0.113.10" {
		t.Fatalf("unexpected first action: %#v", body.Actions[0])
	}
	if body.Actions[0].Payload["region"] != "HK" || body.Actions[0].Payload["nodeName"] != "hk-01" {
		t.Fatalf("unexpected first action labels: %#v", body.Actions[0])
	}
	if body.Actions[1].Payload["sshHost"] != "198.51.100.8" {
		t.Fatalf("unexpected second action: %#v", body.Actions[1])
	}
	if body.Actions[1].Payload["region"] != "JP" || body.Actions[1].Payload["nodeName"] != "jp-01" {
		t.Fatalf("unexpected second action labels: %#v", body.Actions[1])
	}
}

func TestAIChatIgnoresCommandWordsAsNodeName(t *testing.T) {
	st, err := store.NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	router, token := newTestRouter(t, st, "")

	req := httptest.NewRequest(http.MethodPost, "/api/ai/chat", strings.NewReader(`{"message":"帮我安装 root@203.0.113.10:22 HK hk-01"}`))
	authorize(req, token)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", res.Code, res.Body.String())
	}

	var body aiChatResponse
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Actions) != 1 {
		t.Fatalf("expected 1 install action, got %#v", body.Actions)
	}
	if body.Actions[0].Payload["nodeName"] != "hk-01" {
		t.Fatalf("unexpected node name: %#v", body.Actions[0])
	}
}

func newTestRouter(t *testing.T, st *store.FileStore, agentToken string) (http.Handler, string) {
	t.Helper()
	router := NewRouter(st, Options{
		CORSAllowOrigin: "http://localhost:5173",
		AgentToken:      agentToken,
		AdminUsername:   "admin",
		AdminPassword:   "admin",
		SessionSecret:   "test-session-secret",
	})
	token, err := (&Router{sessionSecret: "test-session-secret"}).issueToken("admin")
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return router, token
}

func authorize(req *http.Request, token string) {
	req.Header.Set("Authorization", "Bearer "+token)
}
