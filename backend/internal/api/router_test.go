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
