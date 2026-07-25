package api

import (
	"bytes"
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
