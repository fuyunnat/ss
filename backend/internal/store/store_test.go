package store

import "testing"

func TestFileStorePersistsServer(t *testing.T) {
	path := t.TempDir() + "/state.json"
	st, err := NewFileStore(path)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	item, err := st.UpsertServer(ServerNode{Name: "hk-01", Host: "203.0.113.10"})
	if err != nil {
		t.Fatalf("upsert server: %v", err)
	}
	if item.ID == "" {
		t.Fatal("expected generated id")
	}

	reopened, err := NewFileStore(path)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	items := reopened.ListServers()
	if len(items) != 1 || items[0].Name != "hk-01" {
		t.Fatalf("unexpected persisted servers: %+v", items)
	}
}

func TestDeleteMissingServerReturnsNotFound(t *testing.T) {
	st, err := NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := st.DeleteServer("missing"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestUpsertServerMergesAgentHeartbeatByNameAndHost(t *testing.T) {
	st, err := NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	first, err := st.UpsertServer(ServerNode{Name: "hk-01", Host: "203.0.113.10", Status: "online"})
	if err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	second, err := st.UpsertServer(ServerNode{Name: "hk-01", Host: "203.0.113.10", Status: "online", AgentVersion: "0.1.1"})
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}

	items := st.ListServers()
	if len(items) != 1 {
		t.Fatalf("expected one merged server, got %d", len(items))
	}
	if second.ID != first.ID || items[0].AgentVersion != "0.1.1" {
		t.Fatalf("unexpected merged server: first=%+v second=%+v items=%+v", first, second, items)
	}
}

func TestEnsureDefaultGatewayCreatesEntryProtocols(t *testing.T) {
	st, err := NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	gateway, created, err := st.EnsureDefaultGateway()
	if err != nil {
		t.Fatalf("ensure default gateway: %v", err)
	}
	if !created {
		t.Fatal("expected default gateway to be created")
	}
	if gateway.Name != "main-entry" || gateway.ListenHost != "0.0.0.0" || len(gateway.Protocols) != 6 {
		t.Fatalf("unexpected default gateway: %+v", gateway)
	}
	ports := map[string]int{}
	for _, protocol := range gateway.Protocols {
		ports[protocol.Protocol] = protocol.Port
		if !protocol.Enabled {
			t.Fatalf("expected protocol enabled: %+v", protocol)
		}
	}
	if ports["vless"] != 30000 || ports["vmess"] != 30001 || ports["trojan"] != 30002 || ports["shadowsocks"] != 30003 || ports["socks5"] != 30004 || ports["http"] != 30005 {
		t.Fatalf("unexpected default ports: %+v", ports)
	}

	_, created, err = st.EnsureDefaultGateway()
	if err != nil {
		t.Fatalf("second ensure default gateway: %v", err)
	}
	if created {
		t.Fatal("expected second ensure to keep existing gateway")
	}
}

func TestUpsertGatewayGeneratesAndPreservesCredentials(t *testing.T) {
	st, err := NewFileStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	first, err := st.UpsertGateway(Gateway{
		Name:       "main-entry",
		ListenHost: "0.0.0.0",
		Protocols: []ProtocolListener{
			{Protocol: "vless", Port: 30000, Enabled: true},
			{Protocol: "socks5", Port: 30004, Enabled: true, AuthUser: "fyss"},
		},
	})
	if err != nil {
		t.Fatalf("first upsert gateway: %v", err)
	}
	firstVLESS := protocolByName(first.Protocols, "vless")
	firstSocks := protocolByName(first.Protocols, "socks5")
	if firstVLESS.Credential == "" || firstSocks.Password == "" {
		t.Fatalf("expected generated credentials: %+v", first.Protocols)
	}

	second, err := st.UpsertGateway(Gateway{
		ID:         first.ID,
		Name:       first.Name,
		ListenHost: first.ListenHost,
		Protocols: []ProtocolListener{
			{Protocol: "vless", Port: 31000, Enabled: true},
			{Protocol: "socks5", Port: 31004, Enabled: true, AuthUser: "fyss"},
		},
	})
	if err != nil {
		t.Fatalf("second upsert gateway: %v", err)
	}
	secondVLESS := protocolByName(second.Protocols, "vless")
	secondSocks := protocolByName(second.Protocols, "socks5")
	if secondVLESS.Credential != firstVLESS.Credential {
		t.Fatalf("expected vless credential to be preserved, first=%q second=%q", firstVLESS.Credential, secondVLESS.Credential)
	}
	if secondSocks.Password != firstSocks.Password {
		t.Fatalf("expected socks password to be preserved, first=%q second=%q", firstSocks.Password, secondSocks.Password)
	}
	if secondVLESS.Port != 31000 || secondSocks.Port != 31004 {
		t.Fatalf("expected updated ports, got vless=%d socks=%d", secondVLESS.Port, secondSocks.Port)
	}
}

func protocolByName(protocols []ProtocolListener, name string) ProtocolListener {
	for _, protocol := range protocols {
		if protocol.Protocol == name {
			return protocol
		}
	}
	return ProtocolListener{}
}
