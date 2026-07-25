package api

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"proxy-control/backend/internal/store"
)

const defaultInstallScriptURL = "https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh"

var (
	sshUserPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
	sshHostPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]+$`)
)

type agentInstallRequest struct {
	SSHHost     string `json:"sshHost"`
	SSHPort     int    `json:"sshPort"`
	SSHUser     string `json:"sshUser"`
	AuthMethod  string `json:"authMethod"`
	SSHPassword string `json:"sshPassword"`
	PrivateKey  string `json:"privateKey"`
	MasterURL   string `json:"masterUrl"`
	AgentToken  string `json:"agentToken"`
	NodeName    string `json:"nodeName"`
	Region      string `json:"region"`
	NodeHost    string `json:"nodeHost"`
}

func (r *Router) handleAgentInstall(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var input agentInstallRequest
	if !decodeJSON(w, req, &input) {
		return
	}
	normalizeAgentInstall(&input)
	agentConfig := r.agentConfigSnapshot()
	applyAgentInstallDefaults(&input, agentConfig)
	if err := validateAgentInstall(input, agentConfig.Token); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	task, err := r.store.CreateTask(store.Task{
		Type:       "install_agent",
		Status:     "running",
		TargetType: "server",
		Summary:    fmt.Sprintf("安装被控 Agent: %s@%s:%d / %s", input.SSHUser, input.SSHHost, normalizedSSHPort(input.SSHPort), input.NodeName),
		Logs: []store.TaskLog{{
			At:      time.Now().UTC(),
			Level:   "info",
			Message: "received one-click agent install request",
		}},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	go r.runAgentInstallTask(task.ID, input)
	writeJSON(w, http.StatusAccepted, task)
}

func (r *Router) runAgentInstallTask(taskID string, input agentInstallRequest) {
	result, runErr := runAgentInstall(context.Background(), input)
	status := "succeeded"
	level := "info"
	message := result
	if runErr != nil {
		status = "failed"
		level = "error"
		message = runErr.Error()
	}
	_, _ = r.store.UpdateTask(taskID, status, store.TaskLog{
		At:      time.Now().UTC(),
		Level:   level,
		Message: message,
	})
}

func normalizeAgentInstall(input *agentInstallRequest) {
	input.SSHHost = strings.TrimSpace(input.SSHHost)
	input.SSHUser = strings.TrimSpace(input.SSHUser)
	input.AuthMethod = strings.TrimSpace(input.AuthMethod)
	input.MasterURL = strings.TrimRight(strings.TrimSpace(input.MasterURL), "/")
	input.AgentToken = strings.TrimSpace(input.AgentToken)
	input.NodeName = strings.TrimSpace(input.NodeName)
	input.Region = strings.TrimSpace(input.Region)
	input.NodeHost = strings.TrimSpace(input.NodeHost)
	if input.AuthMethod == "" {
		input.AuthMethod = "agent"
	}
}

func applyAgentInstallDefaults(input *agentInstallRequest, agentConfig store.AgentConfig) {
	if input.MasterURL == "" {
		input.MasterURL = strings.TrimRight(strings.TrimSpace(agentConfig.MasterURL), "/")
	}
	if input.AgentToken == "" {
		input.AgentToken = strings.TrimSpace(agentConfig.Token)
	}
}

func validateAgentInstall(input agentInstallRequest, configuredAgentToken string) error {
	if strings.TrimSpace(input.SSHHost) == "" || strings.TrimSpace(input.SSHUser) == "" {
		return errors.New("服务器 IP 和 SSH 用户必填")
	}
	if !sshHostPattern.MatchString(input.SSHHost) || !sshUserPattern.MatchString(input.SSHUser) {
		return errors.New("服务器 IP 或 SSH 用户包含不支持的字符")
	}
	if input.SSHPort < 0 || input.SSHPort > 65535 {
		return errors.New("SSH 端口必须在 1 到 65535 之间")
	}
	if input.MasterURL == "" || input.AgentToken == "" || input.NodeName == "" {
		return errors.New("总控地址、Agent Token 和节点名称必填")
	}
	if configuredAgentToken != "" && input.AgentToken != configuredAgentToken {
		return errors.New("Agent Token 与后端配置不一致")
	}
	if hasControlChar(input.MasterURL) || hasControlChar(input.AgentToken) || hasControlChar(input.NodeName) || hasControlChar(input.Region) || hasControlChar(input.NodeHost) {
		return errors.New("安装参数不能包含换行或控制字符")
	}
	masterURL, err := url.Parse(input.MasterURL)
	if err != nil || masterURL.Host == "" || (masterURL.Scheme != "http" && masterURL.Scheme != "https") {
		return errors.New("总控地址必须是 http 或 https URL")
	}
	switch input.AuthMethod {
	case "agent":
		return nil
	case "password":
		if input.SSHPassword == "" {
			return errors.New("使用 SSH 密码认证时必须填写密码")
		}
	case "private_key":
		if strings.TrimSpace(input.PrivateKey) == "" {
			return errors.New("使用 SSH 私钥认证时必须填写私钥")
		}
	default:
		return errors.New("认证方式必须是 SSH Key、私钥或密码")
	}
	return nil
}

func runAgentInstall(ctx context.Context, input agentInstallRequest) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()

	keyPath := ""
	if input.AuthMethod == "private_key" {
		path, err := writeTempPrivateKey(input.PrivateKey)
		if err != nil {
			return "", err
		}
		keyPath = path
		defer os.RemoveAll(filepath.Dir(keyPath))
	}

	command, args, err := buildSSHCommand(input, keyPath)
	if err != nil {
		return "", err
	}
	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Stdin = strings.NewReader(remoteInstallScript(input))
	if input.AuthMethod == "password" {
		cmd.Env = append(os.Environ(), "SSHPASS="+input.SSHPassword)
	}
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	err = cmd.Run()
	summary := sanitizeInstallOutput(output.String())
	if ctx.Err() == context.DeadlineExceeded {
		return summary, errors.New("agent install timed out after 3 minutes")
	}
	if err != nil {
		if summary == "" {
			return "", fmt.Errorf("agent install failed: %w", err)
		}
		return summary, fmt.Errorf("agent install failed: %w; output: %s", err, summary)
	}
	if summary == "" {
		return "agent install command completed", nil
	}
	return summary, nil
}

func buildSSHCommand(input agentInstallRequest, keyPath string) (string, []string, error) {
	port := fmt.Sprintf("%d", normalizedSSHPort(input.SSHPort))
	target := input.SSHUser + "@" + sshHost(input.SSHHost)
	args := []string{
		"-p", port,
		"-o", "StrictHostKeyChecking=accept-new",
		"-o", "ConnectTimeout=10",
	}
	switch input.AuthMethod {
	case "password":
		if _, err := exec.LookPath("sshpass"); err != nil {
			return "", nil, errors.New("password auth requires sshpass on the master server; use SSH key auth or install sshpass")
		}
		return "sshpass", append([]string{"-e", "ssh"}, append(args, target, "sh", "-lc", "bash -s")...), nil
	case "private_key":
		args = append(args, "-i", keyPath, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes")
	default:
		args = append(args, "-o", "BatchMode=yes")
	}
	return "ssh", append(args, target, "sh", "-lc", "bash -s"), nil
}

func remoteInstallScript(input agentInstallRequest) string {
	env := []string{
		"PROXY_CONTROL_MASTER_URL=" + shQuote(input.MasterURL),
		"PROXY_CONTROL_AGENT_TOKEN=" + shQuote(input.AgentToken),
		"PROXY_CONTROL_NODE_NAME=" + shQuote(input.NodeName),
	}
	if input.Region != "" {
		env = append(env, "PROXY_CONTROL_NODE_REGION="+shQuote(input.Region))
	}
	if input.NodeHost != "" {
		env = append(env, "PROXY_CONTROL_NODE_HOST="+shQuote(input.NodeHost))
	}

	return strings.Join([]string{
		"set -euo pipefail",
		"install_script=$(mktemp)",
		"cleanup() { rm -f \"$install_script\"; }",
		"trap cleanup EXIT",
		"curl -fsSL " + shQuote(defaultInstallScriptURL) + " -o \"$install_script\"",
		"chmod 0700 \"$install_script\"",
		"sudo env " + strings.Join(env, " ") + " bash \"$install_script\"",
	}, "\n")
}

func writeTempPrivateKey(value string) (string, error) {
	dir, err := os.MkdirTemp("", "proxy-control-key-*")
	if err != nil {
		return "", err
	}
	path := filepath.Join(dir, "id")
	if err := os.WriteFile(path, []byte(value), 0o600); err != nil {
		_ = os.RemoveAll(dir)
		return "", err
	}
	return path, nil
}

func normalizedSSHPort(port int) int {
	if port <= 0 {
		return 22
	}
	return port
}

func sshHost(host string) string {
	if strings.Contains(host, ":") && net.ParseIP(host) != nil {
		return "[" + host + "]"
	}
	return host
}

func shQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

func sanitizeInstallOutput(value string) string {
	lines := strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.Contains(strings.ToLower(line), "token") {
			continue
		}
		kept = append(kept, line)
		if len(kept) >= 8 {
			break
		}
	}
	return strings.Join(kept, "\n")
}

func hasControlChar(value string) bool {
	for _, r := range value {
		if r < 32 || r == 127 {
			return true
		}
	}
	return false
}
