package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	HTTPAddr        string
	CORSAllowOrigin string
	FrontendDir     string
	AgentToken      string
	DataDir         string
	StatePath       string
	AdminUsername   string
	AdminPassword   string
	SessionSecret   string
	AIBaseURL       string
	AIAPIKey        string
	AIModel         string
}

func Load() Config {
	dataDir := getenv("PROXY_CONTROL_DATA_DIR", "../data")
	return Config{
		HTTPAddr:        getenv("PROXY_CONTROL_HTTP_ADDR", ":8080"),
		CORSAllowOrigin: os.Getenv("PROXY_CONTROL_CORS_ORIGIN"),
		FrontendDir:     os.Getenv("PROXY_CONTROL_FRONTEND_DIR"),
		AgentToken:      os.Getenv("PROXY_CONTROL_AGENT_TOKEN"),
		DataDir:         dataDir,
		StatePath:       filepath.Join(dataDir, "state.json"),
		AdminUsername:   getenv("PROXY_CONTROL_ADMIN_USERNAME", "admin"),
		AdminPassword:   getenv("PROXY_CONTROL_ADMIN_PASSWORD", "admin"),
		SessionSecret:   os.Getenv("PROXY_CONTROL_SESSION_SECRET"),
		AIBaseURL:       os.Getenv("PROXY_CONTROL_AI_BASE_URL"),
		AIAPIKey:        os.Getenv("PROXY_CONTROL_AI_API_KEY"),
		AIModel:         getenv("PROXY_CONTROL_AI_MODEL", "gpt-4o-mini"),
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
