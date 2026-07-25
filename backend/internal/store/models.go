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
	Protocol   string `json:"protocol"`
	Port       int    `json:"port"`
	Enabled    bool   `json:"enabled"`
	Credential string `json:"credential,omitempty"`
	Method     string `json:"method,omitempty"`
	AuthUser   string `json:"authUser,omitempty"`
	Password   string `json:"password,omitempty"`
	Network    string `json:"network,omitempty"`
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

type AgentCommand struct {
	ID         string    `json:"id"`
	Type       string    `json:"type"`
	Status     string    `json:"status"`
	ServerID   string    `json:"serverId"`
	ServerName string    `json:"serverName"`
	ServerHost string    `json:"serverHost"`
	TaskID     string    `json:"taskId"`
	Port       int       `json:"port"`
	Network    string    `json:"network"`
	Summary    string    `json:"summary"`
	Message    string    `json:"message,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type State struct {
	Servers       []ServerNode   `json:"servers"`
	Gateways      []Gateway      `json:"gateways"`
	Exits         []ExitNode     `json:"exits"`
	Policies      []Policy       `json:"policies"`
	Tasks         []Task         `json:"tasks"`
	AgentCommands []AgentCommand `json:"agentCommands,omitempty"`
	Admin         *AdminConfig   `json:"admin,omitempty"`
	AI            *AIConfig      `json:"ai,omitempty"`
	Console       *ConsoleConfig `json:"console,omitempty"`
	Agent         *AgentConfig   `json:"agent,omitempty"`
}

type Summary struct {
	ServerCount  int `json:"serverCount"`
	GatewayCount int `json:"gatewayCount"`
	ExitCount    int `json:"exitCount"`
	PolicyCount  int `json:"policyCount"`
	TaskCount    int `json:"taskCount"`
	HealthyExits int `json:"healthyExits"`
}

type AdminConfig struct {
	Username       string    `json:"username"`
	PasswordSalt   string    `json:"passwordSalt"`
	PasswordHash   string    `json:"passwordHash"`
	SessionVersion int64     `json:"sessionVersion"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type AIConfig struct {
	BaseURL   string    `json:"baseUrl"`
	APIKey    string    `json:"apiKey,omitempty"`
	Model     string    `json:"model"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type ConsoleConfig struct {
	HTTPAddr        string    `json:"httpAddr"`
	CORSAllowOrigin string    `json:"corsAllowOrigin"`
	FrontendDir     string    `json:"frontendDir"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type AgentConfig struct {
	Token             string    `json:"token,omitempty"`
	MasterURL         string    `json:"masterUrl"`
	MasterServiceName string    `json:"masterServiceName"`
	AgentServiceName  string    `json:"agentServiceName"`
	UpdatedAt         time.Time `json:"updatedAt"`
}
