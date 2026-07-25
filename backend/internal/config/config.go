package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	HTTPAddr        string
	CORSAllowOrigin string
	AgentToken      string
	DataDir         string
	StatePath       string
}

func Load() Config {
	dataDir := getenv("PROXY_CONTROL_DATA_DIR", "../data")
	return Config{
		HTTPAddr:        getenv("PROXY_CONTROL_HTTP_ADDR", ":8080"),
		CORSAllowOrigin: getenv("PROXY_CONTROL_CORS_ORIGIN", "http://localhost:5173"),
		AgentToken:      os.Getenv("PROXY_CONTROL_AGENT_TOKEN"),
		DataDir:         dataDir,
		StatePath:       filepath.Join(dataDir, "state.json"),
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
