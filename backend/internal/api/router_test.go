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
	router := NewRouter(st, "http://localhost:5173", "")

	req := httptest.NewRequest(http.MethodPost, "/api/servers", strings.NewReader(`{"name":"sg-01","host":"198.51.100.8"}`))
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create server status = %d, body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/summary", nil)
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
	router := NewRouter(st, "http://localhost:5173", "")

	body := bytes.NewBufferString(`{"name":"bad-exit","type":"external_socks5","port":1080}`)
	req := httptest.NewRequest(http.MethodPost, "/api/exits", body)
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
	router := NewRouter(st, "http://localhost:5173", "")

	req := httptest.NewRequest(http.MethodGet, "/api/gateways", nil)
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
	router := NewRouter(st, "http://localhost:5173", "secret-token")

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
	router := NewRouter(st, "http://localhost:5173", "secret-token")

	req := httptest.NewRequest(http.MethodPost, "/api/agent/install", strings.NewReader(`{"sshHost":"","sshUser":"root"}`))
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
	router := NewRouter(st, "http://localhost:5173", "secret-token")

	req := httptest.NewRequest(http.MethodPost, "/api/agent/install", strings.NewReader(`{
		"sshHost":"203.0.113.10",
		"sshUser":"root",
		"masterUrl":"http://master:8080",
		"agentToken":"wrong-token",
		"nodeName":"hk-01"
	}`))
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
