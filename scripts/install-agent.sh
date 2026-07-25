#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/proxy-control-agent"
CONFIG_DIR="/etc/proxy-control"
CONFIG_FILE="${CONFIG_DIR}/agent.env"
SERVICE_FILE="/etc/systemd/system/proxy-control-agent.service"
MASTER_URL="${PROXY_CONTROL_MASTER_URL:-}"
AGENT_TOKEN="${PROXY_CONTROL_AGENT_TOKEN:-}"
NODE_NAME="${PROXY_CONTROL_NODE_NAME:-$(hostname)}"
NODE_REGION="${PROXY_CONTROL_NODE_REGION:-}"
NODE_HOST="${PROXY_CONTROL_NODE_HOST:-}"

usage() {
  printf 'Usage: sudo %s --master-url URL --token TOKEN [--node-name NAME] [--region REGION] [--node-host HOST]\n' "$0"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --master-url) MASTER_URL="${2:-}"; shift 2 ;;
    --token) AGENT_TOKEN="${2:-}"; shift 2 ;;
    --node-name) NODE_NAME="${2:-}"; shift 2 ;;
    --region) NODE_REGION="${2:-}"; shift 2 ;;
    --node-host) NODE_HOST="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  printf 'Please run as root, for example: sudo %s --master-url URL --token TOKEN\n' "$0" >&2
  exit 1
fi

if [ -z "$MASTER_URL" ] || [ -z "$AGENT_TOKEN" ]; then
  usage >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  printf 'systemd is required for this installer.\n' >&2
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  printf 'Go is required to build the agent from this source tree.\n' >&2
  exit 1
fi

write_env() {
  local name="$1"
  local value="$2"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "$name" "$value"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"
cd "${REPO_ROOT}/backend"
go build -trimpath -ldflags="-s -w" -o "${INSTALL_DIR}/proxy-control-agent" ./cmd/agent
chmod 0755 "${INSTALL_DIR}/proxy-control-agent"

{
  write_env "PROXY_CONTROL_MASTER_URL" "$MASTER_URL"
  write_env "PROXY_CONTROL_AGENT_TOKEN" "$AGENT_TOKEN"
  write_env "PROXY_CONTROL_NODE_NAME" "$NODE_NAME"
  write_env "PROXY_CONTROL_NODE_REGION" "$NODE_REGION"
  write_env "PROXY_CONTROL_NODE_HOST" "$NODE_HOST"
  write_env "PROXY_CONTROL_HEARTBEAT_INTERVAL" "30s"
} > "$CONFIG_FILE"
chmod 0600 "$CONFIG_FILE"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Proxy Control Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${CONFIG_FILE}
ExecStart=${INSTALL_DIR}/proxy-control-agent
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now proxy-control-agent

printf 'Proxy Control Agent installed.\n'
printf 'Service: systemctl status proxy-control-agent\n'
if command -v xray >/dev/null 2>&1; then
  printf 'Detected xray: %s\n' "$(command -v xray)"
else
  printf 'xray was not detected. Install xray or sing-box before enabling protocol deployment tasks.\n'
fi
if command -v sing-box >/dev/null 2>&1; then
  printf 'Detected sing-box: %s\n' "$(command -v sing-box)"
else
  printf 'sing-box was not detected. Install xray or sing-box before enabling protocol deployment tasks.\n'
fi
