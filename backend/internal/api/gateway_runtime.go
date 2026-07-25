package api

import (
	"encoding/json"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"proxy-control/backend/internal/store"
)

type xrayConfig struct {
	Log       map[string]string `json:"log"`
	Inbounds  []xrayInbound     `json:"inbounds"`
	Outbounds []xrayOutbound    `json:"outbounds"`
}

type xrayInbound struct {
	Tag            string         `json:"tag"`
	Listen         string         `json:"listen"`
	Port           int            `json:"port"`
	Protocol       string         `json:"protocol"`
	Settings       map[string]any `json:"settings"`
	StreamSettings map[string]any `json:"streamSettings,omitempty"`
}

type xrayOutbound struct {
	Tag      string `json:"tag"`
	Protocol string `json:"protocol"`
}

func (r *Router) ensureDefaultGateway() {
	gateway, created, err := r.store.EnsureDefaultGateway()
	if err != nil {
		log.Printf("ensure default gateway failed: %v", err)
		return
	}
	if created {
		log.Printf("default gateway created: %s", gateway.Name)
	}
}

func (r *Router) reloadGatewayRuntime() {
	r.gatewayRuntimeMu.Lock()
	defer r.gatewayRuntimeMu.Unlock()

	if r.gatewayRuntimeCmd != nil && r.gatewayRuntimeCmd.Process != nil {
		_ = r.gatewayRuntimeCmd.Process.Kill()
		_, _ = r.gatewayRuntimeCmd.Process.Wait()
		r.gatewayRuntimeCmd = nil
	}

	config, inboundCount := buildXrayConfig(r.store.ListGateways())
	if inboundCount == 0 {
		log.Println("xray gateway runtime skipped: no enabled entry protocols")
		return
	}
	xrayPath, err := exec.LookPath("xray")
	if err != nil {
		log.Printf("xray gateway runtime skipped: xray binary not found")
		return
	}
	if err := os.MkdirAll(r.dataDir, 0o755); err != nil {
		log.Printf("xray gateway runtime skipped: create data dir failed: %v", err)
		return
	}
	configPath := filepath.Join(r.dataDir, "xray-entry.json")
	content, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		log.Printf("xray gateway runtime skipped: encode config failed: %v", err)
		return
	}
	if err := os.WriteFile(configPath, content, 0o600); err != nil {
		log.Printf("xray gateway runtime skipped: write config failed: %v", err)
		return
	}

	cmd := exec.Command(xrayPath, "run", "-config", configPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		log.Printf("xray gateway runtime start failed: %v", err)
		return
	}
	r.gatewayRuntimeCmd = cmd
	go func() {
		err := cmd.Wait()
		r.gatewayRuntimeMu.Lock()
		if r.gatewayRuntimeCmd == cmd {
			r.gatewayRuntimeCmd = nil
		}
		r.gatewayRuntimeMu.Unlock()
		if err != nil {
			log.Printf("xray gateway runtime exited: %v", err)
		}
	}()
	log.Printf("xray gateway runtime started: %d inbound(s)", inboundCount)
}

func buildXrayConfig(gateways []store.Gateway) (xrayConfig, int) {
	config := xrayConfig{
		Log:       map[string]string{"loglevel": "warning"},
		Outbounds: []xrayOutbound{{Tag: "direct", Protocol: "freedom"}},
	}
	for _, gateway := range gateways {
		listen := gateway.ListenHost
		if strings.TrimSpace(listen) == "" {
			listen = "0.0.0.0"
		}
		for _, protocol := range gateway.Protocols {
			if !protocol.Enabled || protocol.Port <= 0 {
				continue
			}
			inbound, ok := xrayInboundForProtocol(gateway.Name, listen, protocol)
			if !ok {
				continue
			}
			config.Inbounds = append(config.Inbounds, inbound)
		}
	}
	return config, len(config.Inbounds)
}

func xrayInboundForProtocol(gatewayName string, listen string, protocol store.ProtocolListener) (xrayInbound, bool) {
	tag := "entry-" + gatewayName + "-" + protocol.Protocol
	inbound := xrayInbound{
		Tag:      tag,
		Listen:   listen,
		Port:     protocol.Port,
		Protocol: protocol.Protocol,
		Settings: map[string]any{},
	}
	switch protocol.Protocol {
	case "vless":
		if protocol.Credential == "" {
			return xrayInbound{}, false
		}
		inbound.Settings = map[string]any{
			"clients":    []map[string]any{{"id": protocol.Credential}},
			"decryption": "none",
		}
		inbound.StreamSettings = map[string]any{"network": "tcp", "security": "none"}
	case "vmess":
		if protocol.Credential == "" {
			return xrayInbound{}, false
		}
		inbound.Settings = map[string]any{
			"clients": []map[string]any{{"id": protocol.Credential, "alterId": 0, "security": "auto"}},
		}
		inbound.StreamSettings = map[string]any{"network": "tcp"}
	case "trojan":
		if protocol.Password == "" {
			return xrayInbound{}, false
		}
		inbound.Settings = map[string]any{
			"clients": []map[string]any{{"password": protocol.Password}},
		}
		inbound.StreamSettings = map[string]any{"network": "tcp", "security": "none"}
	case "shadowsocks":
		if protocol.Method == "" || protocol.Password == "" {
			return xrayInbound{}, false
		}
		network := strings.ReplaceAll(defaultString(protocol.Network, "tcp+udp"), "+", ",")
		inbound.Settings = map[string]any{
			"method":   protocol.Method,
			"password": protocol.Password,
			"network":  network,
		}
	case "socks5":
		inbound.Protocol = "socks"
		if protocol.AuthUser == "" || protocol.Password == "" {
			inbound.Settings = map[string]any{"auth": "noauth", "udp": true}
			break
		}
		inbound.Settings = map[string]any{
			"auth":     "password",
			"udp":      true,
			"accounts": []map[string]any{{"user": protocol.AuthUser, "pass": protocol.Password}},
		}
	case "http":
		if protocol.AuthUser == "" || protocol.Password == "" {
			inbound.Settings = map[string]any{}
			break
		}
		inbound.Settings = map[string]any{
			"accounts": []map[string]any{{"user": protocol.AuthUser, "pass": protocol.Password}},
		}
	default:
		return xrayInbound{}, false
	}
	return inbound, true
}
