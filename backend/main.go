package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"proxy-control/backend/internal/api"
	"proxy-control/backend/internal/config"
	"proxy-control/backend/internal/store"
)

func main() {
	cfg := config.Load()

	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	st, err := store.NewFileStore(cfg.StatePath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}

	handler := api.NewRouter(st, api.Options{
		CORSAllowOrigin: cfg.CORSAllowOrigin,
		HTTPAddr:        cfg.HTTPAddr,
		DataDir:         cfg.DataDir,
		FrontendDir:     cfg.FrontendDir,
		AgentToken:      cfg.AgentToken,
		AdminUsername:   cfg.AdminUsername,
		AdminPassword:   cfg.AdminPassword,
		SessionSecret:   cfg.SessionSecret,
		AIBaseURL:       cfg.AIBaseURL,
		AIAPIKey:        cfg.AIAPIKey,
		AIModel:         cfg.AIModel,
	})
	if cfg.FrontendDir != "" {
		handler = withFrontend(handler, cfg.FrontendDir)
	}

	server := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: handler,
	}

	log.Printf("proxy control backend listening on %s", cfg.HTTPAddr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("http server failed: %v", err)
	}
}

func withFrontend(apiHandler http.Handler, frontendDir string) http.Handler {
	files := http.FileServer(http.Dir(frontendDir))
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if strings.HasPrefix(req.URL.Path, "/api/") {
			apiHandler.ServeHTTP(w, req)
			return
		}
		path := filepath.Clean(strings.TrimPrefix(req.URL.Path, "/"))
		if path == ".." || strings.HasPrefix(path, "../") || filepath.IsAbs(path) {
			http.NotFound(w, req)
			return
		}
		if path == "." {
			path = "index.html"
		}
		fullPath := filepath.Join(frontendDir, path)
		if _, err := os.Stat(fullPath); err == nil {
			files.ServeHTTP(w, req)
			return
		} else if !errors.Is(err, os.ErrNotExist) {
			http.Error(w, "frontend asset unavailable", http.StatusInternalServerError)
			return
		}
		http.ServeFile(w, req, filepath.Join(frontendDir, "index.html"))
	})
}
