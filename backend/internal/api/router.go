package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"proxy-control/backend/internal/store"
)

type Options struct {
	CORSAllowOrigin string
	AgentToken      string
	AdminUsername   string
	AdminPassword   string
	SessionSecret   string
	AIBaseURL       string
	AIAPIKey        string
	AIModel         string
}

type Router struct {
	store         *store.FileStore
	agentToken    string
	adminUsername string
	adminPassword string
	sessionSecret string
	aiBaseURL     string
	aiAPIKey      string
	aiModel       string
	httpClient    *http.Client
}

func NewRouter(st *store.FileStore, opts Options) http.Handler {
	if opts.AdminUsername == "" {
		opts.AdminUsername = "admin"
	}
	if opts.AdminPassword == "" {
		opts.AdminPassword = "admin"
	}
	if opts.SessionSecret == "" {
		opts.SessionSecret = "proxy-control-session:" + opts.AdminPassword
	}
	if opts.AIModel == "" {
		opts.AIModel = "gpt-4o-mini"
	}

	r := &Router{
		store:         st,
		agentToken:    opts.AgentToken,
		adminUsername: opts.AdminUsername,
		adminPassword: opts.AdminPassword,
		sessionSecret: opts.SessionSecret,
		aiBaseURL:     strings.TrimSpace(opts.AIBaseURL),
		aiAPIKey:      strings.TrimSpace(opts.AIAPIKey),
		aiModel:       opts.AIModel,
		httpClient:    &http.Client{Timeout: 20 * time.Second},
	}
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", r.handleHealth)
	mux.HandleFunc("/api/auth/login", r.handleLogin)
	mux.HandleFunc("/api/auth/me", r.handleMe)
	mux.HandleFunc("/api/ai/chat", r.handleAIChat)
	mux.HandleFunc("/api/agent/heartbeat", r.handleAgentHeartbeat)
	mux.HandleFunc("/api/agent/install", r.handleAgentInstall)
	mux.HandleFunc("/api/summary", r.handleSummary)
	mux.HandleFunc("/api/servers", r.handleServers)
	mux.HandleFunc("/api/servers/", r.handleServerByID)
	mux.HandleFunc("/api/gateways", r.handleGateways)
	mux.HandleFunc("/api/gateways/", r.handleGatewayByID)
	mux.HandleFunc("/api/exits", r.handleExits)
	mux.HandleFunc("/api/exits/", r.handleExitByID)
	mux.HandleFunc("/api/policies", r.handlePolicies)
	mux.HandleFunc("/api/policies/", r.handlePolicyByID)
	mux.HandleFunc("/api/tasks", r.handleTasks)
	mux.HandleFunc("/api/tasks/", r.handleTaskByID)

	return withCORS(r.withAuth(mux), opts.CORSAllowOrigin)
}

func (r *Router) handleHealth(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (r *Router) handleSummary(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, r.store.Summary())
}

func (r *Router) handleAgentHeartbeat(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if r.agentToken != "" && req.Header.Get("Authorization") != "Bearer "+r.agentToken {
		writeError(w, http.StatusUnauthorized, "agent token is invalid")
		return
	}

	var input store.ServerNode
	if !decodeJSON(w, req, &input) {
		return
	}
	if input.Name == "" || input.Host == "" {
		writeError(w, http.StatusBadRequest, "name and host are required")
		return
	}
	input.Status = "online"
	item, err := r.store.UpsertServer(input)
	writeResult(w, item, err)
}

func (r *Router) handleServers(w http.ResponseWriter, req *http.Request) {
	switch req.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, r.store.ListServers())
	case http.MethodPost, http.MethodPut:
		var input store.ServerNode
		if !decodeJSON(w, req, &input) {
			return
		}
		if input.Name == "" || input.Host == "" {
			writeError(w, http.StatusBadRequest, "name and host are required")
			return
		}
		item, err := r.store.UpsertServer(input)
		writeResult(w, item, err)
	default:
		methodNotAllowed(w)
	}
}

func (r *Router) handleServerByID(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}
	writeDelete(w, r.store.DeleteServer(pathID(req.URL.Path, "/api/servers/")))
}

func (r *Router) handleGateways(w http.ResponseWriter, req *http.Request) {
	switch req.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, r.store.ListGateways())
	case http.MethodPost, http.MethodPut:
		var input store.Gateway
		if !decodeJSON(w, req, &input) {
			return
		}
		if input.Name == "" || input.ListenHost == "" {
			writeError(w, http.StatusBadRequest, "name and listenHost are required")
			return
		}
		item, err := r.store.UpsertGateway(input)
		writeResult(w, item, err)
	default:
		methodNotAllowed(w)
	}
}

func (r *Router) handleGatewayByID(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}
	writeDelete(w, r.store.DeleteGateway(pathID(req.URL.Path, "/api/gateways/")))
}

func (r *Router) handleExits(w http.ResponseWriter, req *http.Request) {
	switch req.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, r.store.ListExits())
	case http.MethodPost, http.MethodPut:
		var input store.ExitNode
		if !decodeJSON(w, req, &input) {
			return
		}
		if input.Name == "" || input.Type == "" || input.Address == "" || input.Port == 0 {
			writeError(w, http.StatusBadRequest, "name, type, address and port are required")
			return
		}
		item, err := r.store.UpsertExit(input)
		writeResult(w, item, err)
	default:
		methodNotAllowed(w)
	}
}

func (r *Router) handleExitByID(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}
	writeDelete(w, r.store.DeleteExit(pathID(req.URL.Path, "/api/exits/")))
}

func (r *Router) handlePolicies(w http.ResponseWriter, req *http.Request) {
	switch req.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, r.store.ListPolicies())
	case http.MethodPost, http.MethodPut:
		var input store.Policy
		if !decodeJSON(w, req, &input) {
			return
		}
		if input.Name == "" || input.MatchType == "" || input.Strategy == "" {
			writeError(w, http.StatusBadRequest, "name, matchType and strategy are required")
			return
		}
		item, err := r.store.UpsertPolicy(input)
		writeResult(w, item, err)
	default:
		methodNotAllowed(w)
	}
}

func (r *Router) handlePolicyByID(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}
	writeDelete(w, r.store.DeletePolicy(pathID(req.URL.Path, "/api/policies/")))
}

func (r *Router) handleTasks(w http.ResponseWriter, req *http.Request) {
	switch req.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, r.store.ListTasks())
	case http.MethodPost:
		var input store.Task
		if !decodeJSON(w, req, &input) {
			return
		}
		if input.Type == "" || input.TargetType == "" || input.Summary == "" {
			writeError(w, http.StatusBadRequest, "type, targetType and summary are required")
			return
		}
		item, err := r.store.CreateTask(input)
		writeResult(w, item, err)
	default:
		methodNotAllowed(w)
	}
}

func (r *Router) handleTaskByID(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	rest := strings.TrimPrefix(req.URL.Path, "/api/tasks/")
	id, action, ok := strings.Cut(rest, "/")
	if !ok || action != "run" {
		writeError(w, http.StatusNotFound, "route not found")
		return
	}

	item, err := r.store.RunTask(id)
	writeResult(w, item, err)
}

func decodeJSON(w http.ResponseWriter, req *http.Request, out any) bool {
	defer req.Body.Close()
	if err := json.NewDecoder(req.Body).Decode(out); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return false
	}
	return true
}

func writeResult(w http.ResponseWriter, item any, err error) {
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func writeDelete(w http.ResponseWriter, err error) {
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func methodNotAllowed(w http.ResponseWriter) {
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}

func pathID(path string, prefix string) string {
	return strings.Trim(strings.TrimPrefix(path, prefix), "/")
}

func withCORS(next http.Handler, allowOrigin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		origin := req.Header.Get("Origin")
		if allowOrigin == "*" || origin == allowOrigin {
			w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if req.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, req)
	})
}
