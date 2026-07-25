package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
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

func (s *FileStore) ListServers() []ServerNode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneSlice(s.state.Servers)
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
