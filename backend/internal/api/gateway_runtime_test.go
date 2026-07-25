package api

import (
	"testing"

	"proxy-control/backend/internal/store"
)

func TestBuildXrayConfigIncludesDefaultEntryPorts(t *testing.T) {
	gateway := store.Gateway{
		Name:       "main-entry",
		ListenHost: "0.0.0.0",
		Protocols: []store.ProtocolListener{
			{Protocol: "vless", Port: 30000, Enabled: true, Credential: "11111111-1111-4111-8111-111111111111"},
			{Protocol: "vmess", Port: 30001, Enabled: true, Credential: "22222222-2222-4222-8222-222222222222"},
			{Protocol: "trojan", Port: 30002, Enabled: true, Password: "trojan-pass"},
			{Protocol: "shadowsocks", Port: 30003, Enabled: true, Method: "chacha20-ietf-poly1305", Password: "ss-pass", Network: "tcp+udp"},
			{Protocol: "socks5", Port: 30004, Enabled: true, AuthUser: "fyss", Password: "socks-pass"},
			{Protocol: "http", Port: 30005, Enabled: true, AuthUser: "fyss", Password: "http-pass"},
		},
	}

	config, count := buildXrayConfig([]store.Gateway{gateway})
	if count != 6 || len(config.Inbounds) != 6 {
		t.Fatalf("expected 6 inbounds, got count=%d config=%+v", count, config.Inbounds)
	}
	ports := map[int]string{}
	for _, inbound := range config.Inbounds {
		ports[inbound.Port] = inbound.Protocol
	}
	for port, protocol := range map[int]string{30000: "vless", 30001: "vmess", 30002: "trojan", 30003: "shadowsocks", 30004: "socks", 30005: "http"} {
		if ports[port] != protocol {
			t.Fatalf("expected port %d protocol %s, got %q", port, protocol, ports[port])
		}
	}
}
