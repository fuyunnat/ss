package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"
)

const version = "0.1.0"

type config struct {
	MasterURL string
	Token     string
	NodeName  string
	Host      string
	Region    string
	Interval  time.Duration
}

type heartbeat struct {
	Name         string   `json:"name"`
	Host         string   `json:"host"`
	Region       string   `json:"region"`
	Tags         []string `json:"tags"`
	AgentVersion string   `json:"agentVersion"`
	Status       string   `json:"status"`
	MemoryMB     int      `json:"memoryMb"`
}

func main() {
	cfg := loadConfig()
	if cfg.MasterURL == "" {
		log.Fatal("PROXY_CONTROL_MASTER_URL is required")
	}
	if cfg.NodeName == "" {
		cfg.NodeName = fallbackHostname()
	}
	if cfg.Host == "" {
		cfg.Host = firstPrivateIP()
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	log.Printf("proxy-control-agent %s started, node=%s master=%s", version, cfg.NodeName, cfg.MasterURL)
	if err := sendHeartbeat(ctx, cfg); err != nil {
		log.Printf("first heartbeat failed: %v", err)
	}

	ticker := time.NewTicker(cfg.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Println("agent stopped")
			return
		case <-ticker.C:
			if err := sendHeartbeat(ctx, cfg); err != nil {
				log.Printf("heartbeat failed: %v", err)
			}
		}
	}
}

func loadConfig() config {
	var cfg config
	flag.StringVar(&cfg.MasterURL, "master-url", getenv("PROXY_CONTROL_MASTER_URL", ""), "master backend URL")
	flag.StringVar(&cfg.Token, "token", getenv("PROXY_CONTROL_AGENT_TOKEN", ""), "agent shared token")
	flag.StringVar(&cfg.NodeName, "node-name", getenv("PROXY_CONTROL_NODE_NAME", ""), "node display name")
	flag.StringVar(&cfg.Host, "host", getenv("PROXY_CONTROL_NODE_HOST", ""), "node host or IP reported to master")
	flag.StringVar(&cfg.Region, "region", getenv("PROXY_CONTROL_NODE_REGION", ""), "node region label")
	interval := flag.Duration("interval", getenvDuration("PROXY_CONTROL_HEARTBEAT_INTERVAL", 30*time.Second), "heartbeat interval")
	flag.Parse()
	cfg.Interval = *interval
	return cfg
}

func sendHeartbeat(ctx context.Context, cfg config) error {
	payload := heartbeat{
		Name:         cfg.NodeName,
		Host:         cfg.Host,
		Region:       cfg.Region,
		Tags:         []string{"agent", "controlled-node"},
		AgentVersion: version,
		Status:       "online",
		MemoryMB:     memoryMB(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := strings.TrimRight(cfg.MasterURL, "/") + "/api/agent/heartbeat"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("master returned %s", res.Status)
	}
	log.Printf("heartbeat sent: node=%s host=%s", cfg.NodeName, cfg.Host)
	return nil
}

func fallbackHostname() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "controlled-node"
	}
	return name
}

func firstPrivateIP() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "127.0.0.1"
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ip, _, err := net.ParseCIDR(addr.String())
			if err == nil && ip.To4() != nil {
				return ip.String()
			}
		}
	}
	return "127.0.0.1"
}

func memoryMB() int {
	var stats runtime.MemStats
	runtime.ReadMemStats(&stats)
	return int(stats.Alloc / 1024 / 1024)
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getenvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}
