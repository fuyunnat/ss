package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"
)

var ErrNotFound = errors.New("resource not found")

type FileStore struct {
	path  string
	mu    sync.RWMutex
	state State
}

func NewFileStore(path string) (*FileStore, error) {
	s := &FileStore{path: path}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *FileStore) Summary() Summary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	healthy := 0
	for _, exit := range s.state.Exits {
		if exit.Enabled && exit.Health == "healthy" {
			healthy++
		}
	}

	return Summary{
		ServerCount:  len(s.state.Servers),
		GatewayCount: len(s.state.Gateways),
		ExitCount:    len(s.state.Exits),
		PolicyCount:  len(s.state.Policies),
		TaskCount:    len(s.state.Tasks),
		HealthyExits: healthy,
	}
}

func (s *FileStore) AdminConfig() (AdminConfig, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.state.Admin == nil || s.state.Admin.Username == "" || s.state.Admin.PasswordHash == "" || s.state.Admin.PasswordSalt == "" {
		return AdminConfig{}, false
	}
	return *s.state.Admin, true
}

func (s *FileStore) SaveAdminConfig(input AdminConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	input.UpdatedAt = time.Now().UTC()
	s.state.Admin = &input
	return s.saveLocked()
}

func (s *FileStore) AIConfig() (AIConfig, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.state.AI == nil || (s.state.AI.BaseURL == "" && s.state.AI.APIKey == "" && s.state.AI.Model == "") {
		return AIConfig{}, false
	}
	return *s.state.AI, true
}

func (s *FileStore) SaveAIConfig(input AIConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	input.UpdatedAt = time.Now().UTC()
	s.state.AI = &input
	return s.saveLocked()
}

func (s *FileStore) ConsoleConfig() (ConsoleConfig, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.state.Console == nil || (s.state.Console.HTTPAddr == "" && s.state.Console.CORSAllowOrigin == "" && s.state.Console.FrontendDir == "") {
		return ConsoleConfig{}, false
	}
	return *s.state.Console, true
}

func (s *FileStore) SaveConsoleConfig(input ConsoleConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	input.UpdatedAt = time.Now().UTC()
	s.state.Console = &input
	return s.saveLocked()
}

func (s *FileStore) AgentConfig() (AgentConfig, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.state.Agent == nil || (s.state.Agent.Token == "" && s.state.Agent.MasterURL == "" && s.state.Agent.MasterServiceName == "" && s.state.Agent.AgentServiceName == "") {
		return AgentConfig{}, false
	}
	return *s.state.Agent, true
}

func (s *FileStore) SaveAgentConfig(input AgentConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	input.UpdatedAt = time.Now().UTC()
	s.state.Agent = &input
	return s.saveLocked()
}

func (s *FileStore) ListServers() []ServerNode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneSlice(s.state.Servers)
}

func (s *FileStore) GetServer(id string) (ServerNode, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, item := range s.state.Servers {
		if item.ID == id {
			return item, nil
		}
	}
	return ServerNode{}, ErrNotFound
}

func (s *FileStore) FindServerByIdentity(name string, host string) (ServerNode, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, item := range s.state.Servers {
		if item.Name == name && item.Host == host {
			return item, nil
		}
	}
	for _, item := range s.state.Servers {
		if item.Name == name {
			return item, nil
		}
	}
	return ServerNode{}, ErrNotFound
}

func (s *FileStore) UpsertServer(input ServerNode) (ServerNode, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if input.ID == "" {
		for i := range s.state.Servers {
			if s.state.Servers[i].Name == input.Name && s.state.Servers[i].Host == input.Host {
				input.ID = s.state.Servers[i].ID
				input.CreatedAt = s.state.Servers[i].CreatedAt
				input.UpdatedAt = now
				s.state.Servers[i] = input
				return input, s.saveLocked()
			}
		}
		input.ID = newID()
		input.CreatedAt = now
		input.Status = defaultString(input.Status, "unknown")
	}
	input.UpdatedAt = now

	for i := range s.state.Servers {
		if s.state.Servers[i].ID == input.ID {
			input.CreatedAt = s.state.Servers[i].CreatedAt
			s.state.Servers[i] = input
			return input, s.saveLocked()
		}
	}
	s.state.Servers = append(s.state.Servers, input)
	return input, s.saveLocked()
}

func (s *FileStore) DeleteServer(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.state.Servers {
		if s.state.Servers[i].ID == id {
			s.state.Servers = append(s.state.Servers[:i], s.state.Servers[i+1:]...)
			return s.saveLocked()
		}
	}
	return ErrNotFound
}

func (s *FileStore) ListGateways() []Gateway {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneSlice(s.state.Gateways)
}

func (s *FileStore) EnsureDefaultGateway() (Gateway, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.state.Gateways) > 0 {
		return Gateway{}, false, nil
	}
	now := time.Now().UTC()
	item := Gateway{
		ID:         newID(),
		Name:       "main-entry",
		ListenHost: "0.0.0.0",
		SocksPort:  30004,
		HTTPPort:   30005,
		Status:     "active",
		Protocols: []ProtocolListener{
			{Protocol: "vless", Port: 30000, Enabled: true, Credential: newUUID()},
			{Protocol: "vmess", Port: 30001, Enabled: true, Credential: newUUID()},
			{Protocol: "trojan", Port: 30002, Enabled: true, Password: newToken(16)},
			{Protocol: "shadowsocks", Port: 30003, Enabled: true, Method: "chacha20-ietf-poly1305", Password: newToken(16), Network: "tcp+udp"},
			{Protocol: "socks5", Port: 30004, Enabled: true, AuthUser: "fyss", Password: newToken(12)},
			{Protocol: "http", Port: 30005, Enabled: true, AuthUser: "fyss", Password: newToken(12)},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.state.Gateways = append(s.state.Gateways, item)
	return item, true, s.saveLocked()
}

func (s *FileStore) UpsertGateway(input Gateway) (Gateway, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if input.ID == "" {
		input.ID = newID()
		input.CreatedAt = now
		input.Status = defaultString(input.Status, "planned")
	}
	input.UpdatedAt = now

	for i := range s.state.Gateways {
		if s.state.Gateways[i].ID == input.ID {
			input.CreatedAt = s.state.Gateways[i].CreatedAt
			s.state.Gateways[i] = input
			return input, s.saveLocked()
		}
	}
	s.state.Gateways = append(s.state.Gateways, input)
	return input, s.saveLocked()
}

func (s *FileStore) DeleteGateway(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.state.Gateways {
		if s.state.Gateways[i].ID == id {
			s.state.Gateways = append(s.state.Gateways[:i], s.state.Gateways[i+1:]...)
			return s.saveLocked()
		}
	}
	return ErrNotFound
}

func (s *FileStore) ListExits() []ExitNode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneSlice(s.state.Exits)
}

func (s *FileStore) GetExit(id string) (ExitNode, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, item := range s.state.Exits {
		if item.ID == id {
			return item, nil
		}
	}
	return ExitNode{}, ErrNotFound
}

func (s *FileStore) UpsertExit(input ExitNode) (ExitNode, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if input.ID == "" {
		input.ID = newID()
		input.CreatedAt = now
		input.Enabled = true
		input.Health = defaultString(input.Health, "unknown")
	}
	if input.Weight == 0 {
		input.Weight = 100
	}
	input.UpdatedAt = now

	for i := range s.state.Exits {
		if s.state.Exits[i].ID == input.ID {
			input.CreatedAt = s.state.Exits[i].CreatedAt
			s.state.Exits[i] = input
			return input, s.saveLocked()
		}
	}
	s.state.Exits = append(s.state.Exits, input)
	return input, s.saveLocked()
}

func (s *FileStore) DeleteExit(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.state.Exits {
		if s.state.Exits[i].ID == id {
			s.state.Exits = append(s.state.Exits[:i], s.state.Exits[i+1:]...)
			return s.saveLocked()
		}
	}
	return ErrNotFound
}

func (s *FileStore) ListPolicies() []Policy {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneSlice(s.state.Policies)
}

func (s *FileStore) UpsertPolicy(input Policy) (Policy, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if input.ID == "" {
		input.ID = newID()
		input.CreatedAt = now
		input.Enabled = true
	}
	input.UpdatedAt = now

	for i := range s.state.Policies {
		if s.state.Policies[i].ID == input.ID {
			input.CreatedAt = s.state.Policies[i].CreatedAt
			s.state.Policies[i] = input
			return input, s.saveLocked()
		}
	}
	s.state.Policies = append(s.state.Policies, input)
	return input, s.saveLocked()
}

func (s *FileStore) DeletePolicy(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.state.Policies {
		if s.state.Policies[i].ID == id {
			s.state.Policies = append(s.state.Policies[:i], s.state.Policies[i+1:]...)
			return s.saveLocked()
		}
	}
	return ErrNotFound
}

func (s *FileStore) ListTasks() []Task {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneSlice(s.state.Tasks)
}

func (s *FileStore) GetTask(id string) (Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, item := range s.state.Tasks {
		if item.ID == id {
			return item, nil
		}
	}
	return Task{}, ErrNotFound
}

func (s *FileStore) CreateTask(input Task) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	input.ID = newID()
	input.Status = defaultString(input.Status, "queued")
	input.CreatedAt = now
	input.UpdatedAt = now
	input.Logs = append(input.Logs, TaskLog{At: now, Level: "info", Message: "task queued"})
	s.state.Tasks = append([]Task{input}, s.state.Tasks...)
	return input, s.saveLocked()
}

func (s *FileStore) RunTask(id string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	for i := range s.state.Tasks {
		if s.state.Tasks[i].ID == id {
			s.state.Tasks[i].Status = "succeeded"
			s.state.Tasks[i].UpdatedAt = now
			s.state.Tasks[i].Logs = append(s.state.Tasks[i].Logs, TaskLog{
				At:      now,
				Level:   "info",
				Message: "task completed by local controller simulator",
			})
			return s.state.Tasks[i], s.saveLocked()
		}
	}
	return Task{}, ErrNotFound
}

func (s *FileStore) UpdateTask(id string, status string, logs ...TaskLog) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	for i := range s.state.Tasks {
		if s.state.Tasks[i].ID == id {
			if status != "" {
				s.state.Tasks[i].Status = status
			}
			s.state.Tasks[i].UpdatedAt = now
			s.state.Tasks[i].Logs = append(s.state.Tasks[i].Logs, logs...)
			return s.state.Tasks[i], s.saveLocked()
		}
	}
	return Task{}, ErrNotFound
}

func (s *FileStore) CreateAgentCommand(input AgentCommand) (AgentCommand, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	input.ID = newID()
	input.Status = defaultString(input.Status, "queued")
	input.CreatedAt = now
	input.UpdatedAt = now
	s.state.AgentCommands = append(s.state.AgentCommands, input)
	return input, s.saveLocked()
}

func (s *FileStore) ListPendingAgentCommands(serverID string) []AgentCommand {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []AgentCommand
	for _, item := range s.state.AgentCommands {
		if item.ServerID == serverID && (item.Status == "queued" || item.Status == "running") {
			result = append(result, item)
		}
	}
	return result
}

func (s *FileStore) UpdateAgentCommand(id string, status string, message string) (AgentCommand, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	for i := range s.state.AgentCommands {
		if s.state.AgentCommands[i].ID == id {
			if status != "" {
				s.state.AgentCommands[i].Status = status
			}
			s.state.AgentCommands[i].Message = message
			s.state.AgentCommands[i].UpdatedAt = now
			return s.state.AgentCommands[i], s.saveLocked()
		}
	}
	return AgentCommand{}, ErrNotFound
}

func (s *FileStore) load() error {
	content, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		s.state = State{}
		return nil
	}
	if err != nil {
		return err
	}
	if len(content) == 0 {
		s.state = State{}
		return nil
	}
	return json.Unmarshal(content, &s.state)
}

func (s *FileStore) saveLocked() error {
	content, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, content, 0o600)
}

func newID() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return time.Now().UTC().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(buf[:])
}

func newToken(size int) string {
	if size <= 0 {
		size = 16
	}
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return newID() + newID()
	}
	return hex.EncodeToString(buf)[:size]
}

func newUUID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return fmt.Sprintf("%s-%s-%s-%s-%s", newID()[:8], newID()[:4], newID()[:4], newID()[:4], newID()[:12])
	}
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}

func defaultString(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func cloneSlice[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return append([]T(nil), items...)
}
