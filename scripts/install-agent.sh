#!/usr/bin/env bash
set -euo pipefail

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
plain='\033[0m'

INSTALL_DIR="/opt/proxy-control-agent"
CONFIG_DIR="/etc/proxy-control"
CONFIG_FILE="${CONFIG_DIR}/agent.env"
SERVICE_FILE="/etc/systemd/system/proxy-control-agent.service"
MANAGER_FILE="/usr/bin/fyss"
LEGACY_MANAGER_FILE="/usr/bin/proxy-control-agent"
MASTER_URL="${PROXY_CONTROL_MASTER_URL:-}"
AGENT_TOKEN="${PROXY_CONTROL_AGENT_TOKEN:-}"
NODE_NAME="${PROXY_CONTROL_NODE_NAME:-$(hostname)}"
NODE_REGION="${PROXY_CONTROL_NODE_REGION:-}"
NODE_HOST="${PROXY_CONTROL_NODE_HOST:-}"
HEARTBEAT_INTERVAL="${PROXY_CONTROL_HEARTBEAT_INTERVAL:-30s}"
PREBUILT_DIR="${PROXY_CONTROL_PREBUILT_DIR:-}"
ACTION="install"

usage() {
  cat <<'EOF'
Proxy Control Agent 安装器

用法:
  sudo ./scripts/install-agent.sh --master-url URL --token TOKEN [--node-name NAME] [--region REGION] [--node-host HOST]
  sudo ./scripts/install-agent.sh --uninstall
  sudo ./scripts/install-agent.sh --prebuilt-dir /path/to/package --master-url URL --token TOKEN

安装后管理命令:
  fyss              显示管理菜单
  fyss status       查看 Agent 状态
  fyss start        启动 Agent
  fyss stop         停止 Agent
  fyss restart      重启 Agent
  fyss log          查看实时日志
  fyss config       修改总控地址、Token、节点名称等配置
  fyss open-port    手动开放节点端口
  fyss update       拉取 GitHub 安装脚本并更新 Agent
  fyss uninstall    卸载 Agent
EOF
}

info() {
  echo -e "${green}$*${plain}"
}

warn() {
  echo -e "${yellow}$*${plain}"
}

fail() {
  echo -e "${red}$*${plain}" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --master-url) MASTER_URL="${2:-}"; shift 2 ;;
    --token) AGENT_TOKEN="${2:-}"; shift 2 ;;
    --node-name) NODE_NAME="${2:-}"; shift 2 ;;
    --region) NODE_REGION="${2:-}"; shift 2 ;;
    --node-host) NODE_HOST="${2:-}"; shift 2 ;;
    --interval) HEARTBEAT_INTERVAL="${2:-}"; shift 2 ;;
    --prebuilt-dir) PREBUILT_DIR="${2:-}"; shift 2 ;;
    --uninstall) ACTION="uninstall"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "未知参数: $1" ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  fail "错误：必须使用 root 用户运行"
fi

require_systemd() {
  command -v systemctl >/dev/null 2>&1 || fail "当前系统未检测到 systemd，无法安装为系统服务"
}

require_go() {
  if [ -n "$PREBUILT_DIR" ]; then
    return
  fi
  command -v go >/dev/null 2>&1 || fail "未检测到 Go。本地源码安装才需要 Go；线上请使用根目录 install-agent.sh 下载二进制包安装"
}

prompt_value() {
  local label="$1"
  local default_value="$2"
  local secret="${3:-0}"
  local value=""
  if [ "$secret" = "1" ]; then
    read -r -s -p "${label}: " value
    echo
  else
    read -r -p "${label}${default_value:+ [${default_value}]}: " value
  fi
  printf '%s' "${value:-$default_value}"
}

interactive_config() {
  if [ -n "$MASTER_URL" ] && [ -n "$AGENT_TOKEN" ]; then
    return
  fi
  if [ ! -t 0 ]; then
    usage >&2
    fail "非交互安装必须提供 --master-url 和 --token"
  fi
  info "开始配置被控 Agent"
  MASTER_URL="$(prompt_value '总控地址，例如 http://1.2.3.4:8080' "$MASTER_URL")"
  AGENT_TOKEN="$(prompt_value 'Agent Token' "$AGENT_TOKEN" 1)"
  NODE_NAME="$(prompt_value '节点名称' "$NODE_NAME")"
  NODE_REGION="$(prompt_value '地区，可留空' "$NODE_REGION")"
  NODE_HOST="$(prompt_value '上报 IP/域名，留空自动探测' "$NODE_HOST")"
}

validate_config() {
  MASTER_URL="${MASTER_URL%/}"
  [ -n "$MASTER_URL" ] || fail "总控地址不能为空"
  [ -n "$AGENT_TOKEN" ] || fail "Agent Token 不能为空"
  [ -n "$NODE_NAME" ] || NODE_NAME="$(hostname)"
}

write_env_line() {
  local name="$1"
  local value="$2"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "$name" "$value"
}

write_config() {
  mkdir -p "$CONFIG_DIR"
  {
    write_env_line "PROXY_CONTROL_MASTER_URL" "$MASTER_URL"
    write_env_line "PROXY_CONTROL_AGENT_TOKEN" "$AGENT_TOKEN"
    write_env_line "PROXY_CONTROL_NODE_NAME" "$NODE_NAME"
    write_env_line "PROXY_CONTROL_NODE_REGION" "$NODE_REGION"
    write_env_line "PROXY_CONTROL_NODE_HOST" "$NODE_HOST"
    write_env_line "PROXY_CONTROL_HEARTBEAT_INTERVAL" "$HEARTBEAT_INTERVAL"
  } > "$CONFIG_FILE"
  chmod 0600 "$CONFIG_FILE"
}

build_agent() {
  local script_dir repo_root
  mkdir -p "$INSTALL_DIR"
  if [ -n "$PREBUILT_DIR" ]; then
    [ -x "${PREBUILT_DIR}/bin/proxy-control-agent" ] || fail "预编译包缺少 Agent 二进制: ${PREBUILT_DIR}/bin/proxy-control-agent"
    info "安装 Agent 二进制: ${INSTALL_DIR}/proxy-control-agent"
    install -m 0755 "${PREBUILT_DIR}/bin/proxy-control-agent" "${INSTALL_DIR}/proxy-control-agent"
    return
  fi

  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "${script_dir}/.." && pwd)"
  cd "${repo_root}/backend"
  info "本地编译 Agent: ${INSTALL_DIR}/proxy-control-agent"
  go build -trimpath -ldflags="-s -w" -o "${INSTALL_DIR}/proxy-control-agent" ./cmd/agent
  chmod 0755 "${INSTALL_DIR}/proxy-control-agent"
}

write_service() {
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
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
}

write_manager() {
  cat > "$MANAGER_FILE" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
plain='\033[0m'

SERVICE_NAME="proxy-control-agent"
CONFIG_FILE="/etc/proxy-control/agent.env"
BOOTSTRAP_URL="${PROXY_CONTROL_BOOTSTRAP_URL:-https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh}"

show_menu() {
  echo -e "${green}fyss Agent 管理菜单${plain}"
  echo "----------------------------------------------"
  echo "  1. 启动 Agent"
  echo "  2. 停止 Agent"
  echo "  3. 重启 Agent"
  echo "  4. 查看状态"
  echo "  5. 查看实时日志"
  echo "  6. 修改配置"
  echo "  7. 开放节点端口"
  echo "  8. 更新 Agent"
  echo "  9. 卸载 Agent"
  echo "  0. 退出"
  echo "----------------------------------------------"
  read -r -p "请选择 [0-9]: " num
  case "$num" in
    1) systemctl start "$SERVICE_NAME" ;;
    2) systemctl stop "$SERVICE_NAME" ;;
    3) systemctl restart "$SERVICE_NAME" ;;
    4) systemctl status "$SERVICE_NAME" --no-pager ;;
    5) journalctl -u "$SERVICE_NAME" -f ;;
    6) config_agent ;;
    7) open_port_prompt ;;
    8) update_agent ;;
    9) uninstall_agent ;;
    0) exit 0 ;;
    *) echo -e "${red}无效选择${plain}" ;;
  esac
}

read_config_value() {
  local key="$1"
  if [ -f "$CONFIG_FILE" ]; then
    grep -E "^${key}=" "$CONFIG_FILE" | sed -E 's/^[^=]+="?(.*?)"?$/\1/' || true
  fi
}

write_env_line() {
  local name="$1"
  local value="$2"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "$name" "$value"
}

prompt_value() {
  local label="$1"
  local default_value="$2"
  local secret="${3:-0}"
  local value=""
  if [ "$secret" = "1" ]; then
    read -r -s -p "${label}: " value
    echo
  else
    read -r -p "${label}${default_value:+ [${default_value}]}: " value
  fi
  printf '%s' "${value:-$default_value}"
}

config_agent() {
  [ "$(id -u)" -eq 0 ] || { echo -e "${red}请使用 root 运行${plain}"; exit 1; }
  local master token name region host interval
  master="$(prompt_value '总控地址' "$(read_config_value PROXY_CONTROL_MASTER_URL)")"
  token="$(prompt_value 'Agent Token，留空保留原值' '' 1)"
  if [ -z "$token" ]; then
    token="$(read_config_value PROXY_CONTROL_AGENT_TOKEN)"
  fi
  name="$(prompt_value '节点名称' "$(read_config_value PROXY_CONTROL_NODE_NAME)")"
  region="$(prompt_value '地区，可留空' "$(read_config_value PROXY_CONTROL_NODE_REGION)")"
  host="$(prompt_value '上报 IP/域名，留空自动探测' "$(read_config_value PROXY_CONTROL_NODE_HOST)")"
  interval="$(prompt_value '心跳间隔' "$(read_config_value PROXY_CONTROL_HEARTBEAT_INTERVAL)")"
  {
    write_env_line "PROXY_CONTROL_MASTER_URL" "${master%/}"
    write_env_line "PROXY_CONTROL_AGENT_TOKEN" "$token"
    write_env_line "PROXY_CONTROL_NODE_NAME" "$name"
    write_env_line "PROXY_CONTROL_NODE_REGION" "$region"
    write_env_line "PROXY_CONTROL_NODE_HOST" "$host"
    write_env_line "PROXY_CONTROL_HEARTBEAT_INTERVAL" "${interval:-30s}"
  } > "$CONFIG_FILE"
  chmod 0600 "$CONFIG_FILE"
  systemctl restart "$SERVICE_NAME"
  echo -e "${green}配置已保存，Agent 已重启${plain}"
}

firewall_active() {
  local service="$1"
  command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$service"
}

ufw_active() {
  command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi 'Status: active'
}

open_firewall_port() {
  [ "$(id -u)" -eq 0 ] || { echo -e "${red}请使用 root 运行${plain}"; exit 1; }
  local port="${1:-}"
  local network="${2:-tcp}"
  local protocols changed proto
  [ -n "$port" ] || { echo -e "${red}端口不能为空${plain}"; exit 1; }
  case "$port" in
    *[!0-9]*) echo -e "${red}端口必须是数字${plain}"; exit 1 ;;
  esac
  [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { echo -e "${red}端口范围必须是 1-65535${plain}"; exit 1; }
  case "$network" in
    tcp) protocols="tcp" ;;
    udp) protocols="udp" ;;
    both|tcp+udp) protocols="tcp udp" ;;
    *) echo -e "${red}协议只能是 tcp、udp 或 both${plain}"; exit 1 ;;
  esac

  changed=0
  if command -v firewall-cmd >/dev/null 2>&1 && firewall_active firewalld; then
    for proto in $protocols; do
      firewall-cmd --permanent --add-port="${port}/${proto}"
      changed=1
    done
    firewall-cmd --reload
  fi
  if command -v ufw >/dev/null 2>&1 && ufw_active; then
    for proto in $protocols; do
      ufw allow "${port}/${proto}"
      changed=1
    done
  fi
  if [ "$changed" -eq 0 ]; then
    echo -e "${yellow}未检测到已启用的 firewalld/ufw，未执行放行；如果云安全组拦截，需要到云厂商控制台开放端口。${plain}"
    return
  fi
  echo -e "${green}已开放节点端口: ${port}/${network}${plain}"
}

open_port_prompt() {
  local port network
  read -r -p "节点端口: " port
  read -r -p "协议 [tcp/udp/both，默认 tcp]: " network
  open_firewall_port "$port" "${network:-tcp}"
}

update_agent() {
  [ "$(id -u)" -eq 0 ] || { echo -e "${red}请使用 root 运行${plain}"; exit 1; }
  command -v curl >/dev/null 2>&1 || { echo -e "${red}未检测到 curl，无法在线更新${plain}"; exit 1; }
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  curl -fsSL "$BOOTSTRAP_URL" -o "$tmp"
  env \
    PROXY_CONTROL_MASTER_URL="$(read_config_value PROXY_CONTROL_MASTER_URL)" \
    PROXY_CONTROL_AGENT_TOKEN="$(read_config_value PROXY_CONTROL_AGENT_TOKEN)" \
    PROXY_CONTROL_NODE_NAME="$(read_config_value PROXY_CONTROL_NODE_NAME)" \
    PROXY_CONTROL_NODE_REGION="$(read_config_value PROXY_CONTROL_NODE_REGION)" \
    PROXY_CONTROL_NODE_HOST="$(read_config_value PROXY_CONTROL_NODE_HOST)" \
    PROXY_CONTROL_HEARTBEAT_INTERVAL="$(read_config_value PROXY_CONTROL_HEARTBEAT_INTERVAL)" \
    bash "$tmp"
}

uninstall_agent() {
  [ "$(id -u)" -eq 0 ] || { echo -e "${red}请使用 root 运行${plain}"; exit 1; }
  read -r -p "确认卸载 Proxy Control Agent? [y/N]: " confirm
  case "$confirm" in
    y|Y)
      systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
      rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
      systemctl daemon-reload
      rm -rf /opt/proxy-control-agent /etc/proxy-control
      rm -f /usr/bin/fyss /usr/bin/proxy-control-agent
      echo -e "${green}已卸载 Proxy Control Agent${plain}"
      ;;
    *) echo -e "${yellow}已取消卸载${plain}" ;;
  esac
}

case "${1:-menu}" in
  menu) show_menu ;;
  start) systemctl start "$SERVICE_NAME" ;;
  stop) systemctl stop "$SERVICE_NAME" ;;
  restart) systemctl restart "$SERVICE_NAME" ;;
  status) systemctl status "$SERVICE_NAME" --no-pager ;;
  log|logs) journalctl -u "$SERVICE_NAME" -f ;;
  config) config_agent ;;
  open-port) open_firewall_port "${2:-}" "${3:-tcp}" ;;
  update) update_agent ;;
  uninstall) uninstall_agent ;;
  *) echo "用法: fyss {start|stop|restart|status|log|config|open-port|update|uninstall}"; exit 1 ;;
esac
EOF
  chmod 0755 "$MANAGER_FILE"
  ln -sf "$MANAGER_FILE" "$LEGACY_MANAGER_FILE"
}

copy_source_for_update() {
  local script_dir repo_root target
  if [ -n "$PREBUILT_DIR" ]; then
    return
  fi
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "${script_dir}/.." && pwd -P)"
  target="${INSTALL_DIR}/source"
  if [ "$repo_root" = "$target" ]; then
    return
  fi
  rm -rf "$target"
  mkdir -p "$target"
  cp -a "${repo_root}/." "$target/"
}

start_service() {
  systemctl daemon-reload
  systemctl enable --now proxy-control-agent
}

print_result() {
  echo
	info "Proxy Control Agent 安装完成，服务已启动"
	echo "----------------------------------------------"
	echo "安装目录: ${INSTALL_DIR}"
	echo "Agent 二进制: ${INSTALL_DIR}/proxy-control-agent"
	echo "systemd 服务: proxy-control-agent"
	echo "节点名称: ${NODE_NAME}"
	echo "fyss              - 显示管理菜单"
  echo "fyss status       - 查看 Agent 状态"
  echo "fyss restart      - 重启 Agent"
  echo "fyss log          - 查看实时日志"
  echo "fyss config       - 修改配置"
  echo "fyss open-port    - 手动开放节点端口"
  echo "fyss update       - 更新 Agent"
  echo "fyss uninstall    - 卸载 Agent"
  echo "----------------------------------------------"
  if command -v xray >/dev/null 2>&1; then
    echo "检测到 xray: $(command -v xray)"
  else
    warn "未检测到 xray。创建 Xray 协议节点前需要安装 Xray 核心。"
  fi
  if command -v sing-box >/dev/null 2>&1; then
    echo "检测到 sing-box: $(command -v sing-box)"
  else
    warn "未检测到 sing-box。创建 sing-box 协议节点前需要安装 sing-box 核心。"
  fi
}

open_manager_menu() {
  if [ -r /dev/tty ]; then
    echo
    info "打开 fyss 管理菜单"
    "$MANAGER_FILE" menu </dev/tty
  fi
}

uninstall_agent() {
  read -r -p "确认卸载 Proxy Control Agent? [y/N]: " confirm
  case "$confirm" in
    y|Y)
      systemctl disable --now proxy-control-agent 2>/dev/null || true
      rm -f "$SERVICE_FILE"
      systemctl daemon-reload
      rm -rf "$INSTALL_DIR" "$CONFIG_DIR"
      rm -f "$MANAGER_FILE" "$LEGACY_MANAGER_FILE"
      info "已卸载 Proxy Control Agent"
      ;;
    *) warn "已取消卸载" ;;
  esac
}

main() {
  require_systemd
  require_go
  interactive_config
  validate_config
  write_config
  build_agent
  copy_source_for_update
  write_service
  write_manager
  start_service
  print_result
  open_manager_menu
}

if [ "$ACTION" = "uninstall" ]; then
  require_systemd
  uninstall_agent
  exit 0
fi

main
