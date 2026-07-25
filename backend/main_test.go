package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWithFrontendServesSPAAndKeepsAPI(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("proxy control app"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "asset.txt"), []byte("asset ok"), 0o644); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	api := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("api ok"))
	})
	handler := withFrontend(api, dir)

	for _, path := range []string{"/", "/nodes"} {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, path, nil))
		if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "proxy control app") {
			t.Fatalf("%s served %d %q", path, res.Code, res.Body.String())
		}
	}

	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/asset.txt", nil))
	if res.Code != http.StatusOK || res.Body.String() != "asset ok" {
		t.Fatalf("asset served %d %q", res.Code, res.Body.String())
	}

	res = httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if res.Code != http.StatusAccepted || res.Body.String() != "api ok" {
		t.Fatalf("api served %d %q", res.Code, res.Body.String())
	}
}
