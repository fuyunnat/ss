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
