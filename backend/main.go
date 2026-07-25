package main

import (
	"log"
	"net/http"
	"os"

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

	server := &http.Server{
		Addr: cfg.HTTPAddr,
		Handler: api.NewRouter(st, api.Options{
			CORSAllowOrigin: cfg.CORSAllowOrigin,
			AgentToken:      cfg.AgentToken,
			AdminUsername:   cfg.AdminUsername,
			AdminPassword:   cfg.AdminPassword,
			SessionSecret:   cfg.SessionSecret,
			AIBaseURL:       cfg.AIBaseURL,
			AIAPIKey:        cfg.AIAPIKey,
			AIModel:         cfg.AIModel,
		}),
	}

	log.Printf("proxy control backend listening on %s", cfg.HTTPAddr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("http server failed: %v", err)
	}
}
