package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"
)

const version = "0.1.2"

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

type agentCommand struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Port    int    `json:"port"`
	Network string `json:"network"`
	Summary string `json:"summary"`
}

type commandResult struct {
	Status  string `json:"status"`
	Message string `json:"message"`
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
		cfg.Host = detectHost()
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	log.Printf("proxy-control-agent %s started, node=%s master=%s", version, cfg.NodeName, cfg.MasterURL)
	if err := sendHeartbeat(ctx, cfg); err != nil {
		log.Printf("first heartbeat failed: %v", err)
	} else if err := processCommands(ctx, cfg); err != nil {
		log.Printf("first command sync failed: %v", err)
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
				continue
			}
			if err := processCommands(ctx, cfg); err != nil {
				log.Printf("command sync failed: %v", err)
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

func processCommands(ctx context.Context, cfg config) error {
	commands, err := fetchCommands(ctx, cfg)
	if err != nil {
		return err
	}
	for _, command := range commands {
		status, message := executeCommand(ctx, command)
		if err := reportCommand(ctx, cfg, command.ID, status, message); err != nil {
			return err
		}
		log.Printf("command completed: id=%s type=%s status=%s message=%s", command.ID, command.Type, status, message)
	}
	return nil
}

func fetchCommands(ctx context.Context, cfg config) ([]agentCommand, error) {
	endpoint := strings.TrimRight(cfg.MasterURL, "/") + "/api/agent/commands?nodeName=" + url.QueryEscape(cfg.NodeName) + "&host=" + url.QueryEscape(cfg.Host)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("master command endpoint returned %s", res.Status)
	}
	var commands []agentCommand
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&commands); err != nil {
		return nil, err
	}
	return commands, nil
}

func reportCommand(ctx context.Context, cfg config, id string, status string, message string) error {
	body, err := json.Marshal(commandResult{Status: status, Message: message})
	if err != nil {
		return err
	}
	endpoint := strings.TrimRight(cfg.MasterURL, "/") + "/api/agent/commands/" + url.PathEscape(id) + "/complete"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
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
		content, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("master command report returned %s: %s", res.Status, strings.TrimSpace(string(content)))
	}
	return nil
}

func executeCommand(ctx context.Context, command agentCommand) (string, string) {
	switch command.Type {
	case "open_firewall_port":
		message, err := openFirewallPort(ctx, command.Port, command.Network)
		if err != nil {
			return "failed", err.Error()
		}
		return "succeeded", message
	default:
		return "failed", "不支持的 Agent 命令类型: " + command.Type
	}
}

func openFirewallPort(ctx context.Context, port int, network string) (string, error) {
	if port < 1 || port > 65535 {
		return "", fmt.Errorf("端口不合法: %d", port)
	}
	protocols, err := firewallProtocols(network)
	if err != nil {
		return "", err
	}

	firewalldActive := commandExists("firewall-cmd") && serviceActive(ctx, "firewalld")
	ufwActive := commandExists("ufw") && isUFWActive(ctx)
	if !firewalldActive && !ufwActive {
		return fmt.Sprintf("未检测到已启用的 firewalld/ufw，端口 %d 不需要 Agent 额外放行", port), nil
	}

	var actions []string
	for _, proto := range protocols {
		if firewalldActive {
			portSpec := fmt.Sprintf("%d/%s", port, proto)
			if out, err := runOutput(ctx, "firewall-cmd", "--permanent", "--add-port="+portSpec); err != nil {
				return "", fmt.Errorf("firewalld 放行 %s 失败: %v: %s", portSpec, err, out)
			}
			actions = append(actions, "firewalld "+portSpec)
		}
		if ufwActive {
			if out, err := runOutput(ctx, "ufw", "allow", fmt.Sprintf("%d/%s", port, proto)); err != nil {
				return "", fmt.Errorf("ufw 放行 %d/%s 失败: %v: %s", port, proto, err, out)
			}
			actions = append(actions, fmt.Sprintf("ufw %d/%s", port, proto))
		}
	}
	if firewalldActive {
		if out, err := runOutput(ctx, "firewall-cmd", "--reload"); err != nil {
			return "", fmt.Errorf("firewalld reload 失败: %v: %s", err, out)
		}
	}
	return "已开放节点端口: " + strings.Join(actions, ", "), nil
}

func firewallProtocols(network string) ([]string, error) {
	switch strings.ToLower(strings.TrimSpace(network)) {
	case "", "tcp":
		return []string{"tcp"}, nil
	case "udp":
		return []string{"udp"}, nil
	case "both", "tcp+udp":
		return []string{"tcp", "udp"}, nil
	default:
		return nil, fmt.Errorf("协议网络不合法: %s", network)
	}
}

func commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func serviceActive(ctx context.Context, name string) bool {
	if !commandExists("systemctl") {
		return false
	}
	return exec.CommandContext(ctx, "systemctl", "is-active", "--quiet", name).Run() == nil
}

func isUFWActive(ctx context.Context) bool {
	out, err := runOutput(ctx, "ufw", "status")
	return err == nil && strings.Contains(strings.ToLower(out), "status: active")
}

func runOutput(ctx context.Context, name string, args ...string) (string, error) {
	commandCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	out, err := exec.CommandContext(commandCtx, name, args...).CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func fallbackHostname() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "controlled-node"
	}
	return name
}

func detectHost() string {
	if ip := publicIP(); ip != "" {
		return ip
	}
	return firstPrivateIP()
}

func publicIP() string {
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Get("https://api.ipify.org")
	if err != nil {
		return ""
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return ""
	}
	content, err := io.ReadAll(io.LimitReader(res.Body, 64))
	if err != nil {
		return ""
	}
	value := strings.TrimSpace(string(content))
	if net.ParseIP(value) == nil {
		return ""
	}
	return value
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
