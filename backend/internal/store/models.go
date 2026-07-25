package store

import "time"

type ServerNode struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Host         string    `json:"host"`
	Region       string    `json:"region"`
	Tags         []string  `json:"tags"`
	AgentVersion string    `json:"agentVersion"`
	Status       string    `json:"status"`
	CPUPercent   float64   `json:"cpuPercent"`
	MemoryMB     int       `json:"memoryMb"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Gateway struct {
	ID         string             `json:"id"`
	Name       string             `json:"name"`
	ServerID   string             `json:"serverId"`
	ListenHost string             `json:"listenHost"`
	SocksPort  int                `json:"socksPort"`
	HTTPPort   int                `json:"httpPort"`
	Protocols  []ProtocolListener `json:"protocols"`
	Status     string             `json:"status"`
	CreatedAt  time.Time          `json:"createdAt"`
	UpdatedAt  time.Time          `json:"updatedAt"`
}

type ProtocolListener struct {
	Protocol string `json:"protocol"`
	Port     int    `json:"port"`
	Enabled  bool   `json:"enabled"`
}

type ExitNode struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	ServerID    string    `json:"serverId"`
	Address     string    `json:"address"`
	Port        int       `json:"port"`
	Username    string    `json:"username"`
	ShareLink   string    `json:"shareLink,omitempty"`
	Settings    any       `json:"settings,omitempty"`
	Region      string    `json:"region"`
	Weight      int       `json:"weight"`
	Enabled     bool      `json:"enabled"`
	Health      string    `json:"health"`
	LatencyMS   int       `json:"latencyMs"`
	FailureRate float64   `json:"failureRate"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Policy struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	MatchType  string    `json:"matchType"`
	MatchValue string    `json:"matchValue"`
	Strategy   string    `json:"strategy"`
	ExitIDs    []string  `json:"exitIds"`
	Sticky     bool      `json:"sticky"`
	Enabled    bool      `json:"enabled"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type Task struct {
	ID         string    `json:"id"`
	Type       string    `json:"type"`
	Status     string    `json:"status"`
	TargetType string    `json:"targetType"`
	TargetID   string    `json:"targetId"`
	Summary    string    `json:"summary"`
	Logs       []TaskLog `json:"logs"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type TaskLog struct {
	At      time.Time `json:"at"`
	Level   string    `json:"level"`
	Message string    `json:"message"`
}

type State struct {
	Servers  []ServerNode `json:"servers"`
	Gateways []Gateway    `json:"gateways"`
	Exits    []ExitNode   `json:"exits"`
	Policies []Policy     `json:"policies"`
	Tasks    []Task       `json:"tasks"`
}

type Summary struct {
	ServerCount  int `json:"serverCount"`
	GatewayCount int `json:"gatewayCount"`
	ExitCount    int `json:"exitCount"`
	PolicyCount  int `json:"policyCount"`
	TaskCount    int `json:"taskCount"`
	HealthyExits int `json:"healthyExits"`
}
