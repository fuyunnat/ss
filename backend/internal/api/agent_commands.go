package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"proxy-control/backend/internal/store"
)

type agentCommandResult struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

func (r *Router) handleAgentCommands(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	if !r.requireAgentToken(w) {
		return
	}
	if !r.validateAgentRequest(w, req) {
		return
	}

	nodeName := strings.TrimSpace(req.URL.Query().Get("nodeName"))
	host := strings.TrimSpace(req.URL.Query().Get("host"))
	if nodeName == "" {
		writeError(w, http.StatusBadRequest, "nodeName is required")
		return
	}
	server, err := r.store.FindServerByIdentity(nodeName, host)
	if err != nil {
		writeJSON(w, http.StatusOK, []store.AgentCommand{})
		return
	}
	commands := r.store.ListPendingAgentCommands(server.ID)
	for i := range commands {
		if commands[i].Status == "queued" {
			updated, err := r.store.UpdateAgentCommand(commands[i].ID, "running", "Agent 已领取命令")
			if err == nil {
				commands[i] = updated
			}
		}
	}
	writeJSON(w, http.StatusOK, commands)
}

func (r *Router) handleAgentCommandByID(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if !r.requireAgentToken(w) {
		return
	}
	if !r.validateAgentRequest(w, req) {
		return
	}

	rest := strings.TrimPrefix(req.URL.Path, "/api/agent/commands/")
	id, action, ok := strings.Cut(rest, "/")
	if !ok || action != "complete" || id == "" {
		writeError(w, http.StatusNotFound, "route not found")
		return
	}
	var input agentCommandResult
	if !decodeJSON(w, req, &input) {
		return
	}
	if input.Status != "succeeded" && input.Status != "failed" {
		writeError(w, http.StatusBadRequest, "status must be succeeded or failed")
		return
	}
	command, err := r.store.UpdateAgentCommand(id, input.Status, strings.TrimSpace(input.Message))
	if err != nil {
		writeResult(w, command, err)
		return
	}
	if command.TaskID != "" {
		level := "info"
		taskStatus := "succeeded"
		message := defaultString(command.Message, "Agent 命令执行完成")
		if input.Status == "failed" {
			level = "error"
			taskStatus = "failed"
			message = defaultString(command.Message, "Agent 命令执行失败")
		}
		_, _ = r.store.UpdateTask(command.TaskID, taskStatus, store.TaskLog{
			At:      time.Now().UTC(),
			Level:   level,
			Message: message,
		})
	}
	writeJSON(w, http.StatusOK, command)
}

func (r *Router) validateAgentRequest(w http.ResponseWriter, req *http.Request) bool {
	agentConfig := r.agentConfigSnapshot()
	if agentConfig.Token != "" && req.Header.Get("Authorization") != "Bearer "+agentConfig.Token {
		writeError(w, http.StatusUnauthorized, "agent token is invalid")
		return false
	}
	return true
}

func (r *Router) requireAgentToken(w http.ResponseWriter) bool {
	if r.agentConfigSnapshot().Token == "" {
		writeError(w, http.StatusUnauthorized, "agent token is not configured")
		return false
	}
	return true
}

func (r *Router) runTask(id string) (store.Task, error) {
	task, err := r.store.GetTask(id)
	if err != nil {
		return store.Task{}, err
	}
	if task.Type != "deploy_protocol_node" && !(task.Type == "sync_config" && task.TargetType == "exit") {
		return r.store.RunTask(id)
	}
	exit, err := r.taskExit(task)
	if err != nil {
		_, _ = r.store.UpdateTask(task.ID, "failed", store.TaskLog{
			At:      time.Now().UTC(),
			Level:   "error",
			Message: err.Error(),
		})
		return store.Task{}, err
	}
	server, err := r.store.GetServer(exit.ServerID)
	if err != nil {
		err = fmt.Errorf("找不到节点绑定的被控服务器")
		_, _ = r.store.UpdateTask(task.ID, "failed", store.TaskLog{
			At:      time.Now().UTC(),
			Level:   "error",
			Message: err.Error(),
		})
		return store.Task{}, err
	}
	network := firewallNetworkForExit(exit)
	command, err := r.store.CreateAgentCommand(store.AgentCommand{
		Type:       "open_firewall_port",
		Status:     "queued",
		ServerID:   server.ID,
		ServerName: server.Name,
		ServerHost: server.Host,
		TaskID:     task.ID,
		Port:       exit.Port,
		Network:    network,
		Summary:    fmt.Sprintf("开放节点端口 %d/%s：%s", exit.Port, network, exit.Name),
	})
	if err != nil {
		return store.Task{}, err
	}
	return r.store.UpdateTask(task.ID, "running", store.TaskLog{
		At:      time.Now().UTC(),
		Level:   "info",
		Message: fmt.Sprintf("已下发到 Agent：%s，等待被控服务器执行", command.Summary),
	})
}

func (r *Router) taskExit(task store.Task) (store.ExitNode, error) {
	if task.TargetType == "exit" {
		return r.store.GetExit(task.TargetID)
	}
	if task.TargetType == "server" {
		var match store.ExitNode
		for _, item := range r.store.ListExits() {
			if item.ServerID == task.TargetID {
				if match.ID != "" {
					return store.ExitNode{}, fmt.Errorf("该服务器有多个节点，请选择具体协议节点执行")
				}
				match = item
			}
		}
		if match.ID != "" {
			return match, nil
		}
	}
	return store.ExitNode{}, fmt.Errorf("找不到任务对应的协议节点")
}

func firewallNetworkForExit(exit store.ExitNode) string {
	settings, ok := exit.Settings.(map[string]any)
	if ok {
		if udp, _ := settings["udp"].(bool); udp {
			return "both"
		}
		if network, _ := settings["network"].(string); strings.EqualFold(network, "udp") {
			return "udp"
		}
	}
	return "tcp"
}
