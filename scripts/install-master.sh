#!/usr/bin/env bash
set -euo pipefail

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
plain='\033[0m'

INSTALL_DIR="/opt/proxy-control"
CONFIG_DIR="/etc/proxy-control"
DATA_DIR="/var/lib/proxy-control"
CONFIG_FILE="${CONFIG_DIR}/master.env"
SERVICE_FILE="/etc/systemd/system/proxy-control.service"
MANAGER_FILE="/usr/bin/proxy-control"
HTTP_ADDR="${PROXY_CONTROL_HTTP_ADDR:-:8080}"
ADMIN_USERNAME="${PROXY_CONTROL_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${PROXY_CONTROL_ADMIN_PASSWORD:-admin}"
AGENT_TOKEN="${PROXY_CONTROL_AGENT_TOKEN:-}"
SESSION_SECRET="${PROXY_CONTROL_SESSION_SECRET:-}"
ACTION="install"

usage() {
  cat <<'EOF'
Proxy Control 主控安装器

用法:
  sudo ./scripts/install-master.sh [--http-addr :8080] [--admin-user admin] [--admin-password admin] [--agent-token TOKEN]
  sudo ./scripts/install-master.sh --uninstall

安装后管理命令:
  proxy-control              显示管理菜单
  proxy-control status       查看主控状态
  proxy-control start        启动主控
  proxy-control stop         停止主控
  proxy-control restart      重启主控
  proxy-control log          查看实时日志
  proxy-control config       修改端口、账号密码、Agent Token
  proxy-control update       拉取 GitHub 安装脚本并更新主控
  proxy-control uninstall    卸载主控
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
    --http-addr) HTTP_ADDR="${2:-}"; shift 2 ;;
    --admin-user) ADMIN_USERNAME="${2:-}"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;
    --agent-token) AGENT_TOKEN="${2:-}"; shift 2 ;;
    --session-secret) SESSION_SECRET="${2:-}"; shift 2 ;;
    --uninstall) ACTION="uninstall"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "未知参数: $1" ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  fail "错误：必须使用 root 用户运行"
fi

require_commands() {
  command -v systemctl >/dev/null 2>&1 || fail "当前系统未检测到 systemd，无法安装为系统服务"
  command -v go >/dev/null 2>&1 || fail "未检测到 Go。请使用根目录 install-master.sh 自动安装依赖"
  command -v npm >/dev/null 2>&1 || fail "未检测到 npm。请使用根目录 install-master.sh 自动安装依赖"
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
    return
  fi
  od -An -N24 -tx1 /dev/urandom | tr -d ' \n'
}

validate_config() {
  [ -n "$HTTP_ADDR" ] || fail "监听地址不能为空"
  [ -n "$ADMIN_USERNAME" ] || fail "管理员账号不能为空"
  [ -n "$ADMIN_PASSWORD" ] || fail "管理员密码不能为空"
  [ -n "$AGENT_TOKEN" ] || AGENT_TOKEN="$(generate_secret)"
  [ -n "$SESSION_SECRET" ] || SESSION_SECRET="$(generate_secret)"
}

write_env_line() {
  local name="$1"
  local value="$2"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "$name" "$value"
}

write_config() {
  mkdir -p "$CONFIG_DIR" "$DATA_DIR"
  {
    write_env_line "PROXY_CONTROL_HTTP_ADDR" "$HTTP_ADDR"
    write_env_line "PROXY_CONTROL_CORS_ORIGIN" "*"
    write_env_line "PROXY_CONTROL_FRONTEND_DIR" "${INSTALL_DIR}/frontend/dist"
    write_env_line "PROXY_CONTROL_DATA_DIR" "$DATA_DIR"
    write_env_line "PROXY_CONTROL_ADMIN_USERNAME" "$ADMIN_USERNAME"
    write_env_line "PROXY_CONTROL_ADMIN_PASSWORD" "$ADMIN_PASSWORD"
    write_env_line "PROXY_CONTROL_SESSION_SECRET" "$SESSION_SECRET"
    write_env_line "PROXY_CONTROL_AGENT_TOKEN" "$AGENT_TOKEN"
  } > "$CONFIG_FILE"
  chmod 0600 "$CONFIG_FILE"
}

build_master() {
  local script_dir repo_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "${script_dir}/.." && pwd)"

  mkdir -p "${INSTALL_DIR}/bin" "${INSTALL_DIR}/frontend"
  cd "${repo_root}/backend"
  info "构建主控后端"
  go build -trimpath -ldflags="-s -w" -o "${INSTALL_DIR}/bin/proxy-control" .
  chmod 0755 "${INSTALL_DIR}/bin/proxy-control"

  cd "${repo_root}/frontend"
  info "构建主控前端"
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
  npm run build
  rm -rf "${INSTALL_DIR}/frontend/dist"
  cp -a dist "${INSTALL_DIR}/frontend/dist"
}

write_service() {
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Proxy Control Master
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${CONFIG_FILE}
ExecStart=${INSTALL_DIR}/bin/proxy-control
Restart=always
RestartSec=5
WorkingDirectory=${INSTALL_DIR}
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

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

SERVICE_NAME="proxy-control"
CONFIG_FILE="/etc/proxy-control/master.env"
BOOTSTRAP_URL="${PROXY_CONTROL_MASTER_BOOTSTRAP_URL:-https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-master.sh}"

show_menu() {
  echo -e "${green}Proxy Control 主控管理菜单${plain}"
  echo "----------------------------------------------"
  echo "  1. 启动主控"
  echo "  2. 停止主控"
  echo "  3. 重启主控"
  echo "  4. 查看状态"
  echo "  5. 查看实时日志"
  echo "  6. 修改配置"
  echo "  7. 更新主控"
  echo "  8. 卸载主控"
  echo "  0. 退出"
  echo "----------------------------------------------"
  read -r -p "请选择 [0-8]: " num
  case "$num" in
    1) systemctl start "$SERVICE_NAME" ;;
    2) systemctl stop "$SERVICE_NAME" ;;
    3) systemctl restart "$SERVICE_NAME" ;;
    4) systemctl status "$SERVICE_NAME" --no-pager ;;
    5) journalctl -u "$SERVICE_NAME" -f ;;
    6) config_master ;;
    7) update_master ;;
    8) uninstall_master ;;
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

config_master() {
  [ "$(id -u)" -eq 0 ] || { echo -e "${red}请使用 root 运行${plain}"; exit 1; }
  local http_addr admin_user admin_password agent_token session_secret data_dir frontend_dir cors_origin
  http_addr="$(prompt_value '监听地址' "$(read_config_value PROXY_CONTROL_HTTP_ADDR)")"
  admin_user="$(prompt_value '管理员账号' "$(read_config_value PROXY_CONTROL_ADMIN_USERNAME)")"
  admin_password="$(prompt_value '管理员密码，留空保留原值' '' 1)"
  if [ -z "$admin_password" ]; then
    admin_password="$(read_config_value PROXY_CONTROL_ADMIN_PASSWORD)"
  fi
  agent_token="$(prompt_value 'Agent Token，留空保留原值' '' 1)"
  if [ -z "$agent_token" ]; then
    agent_token="$(read_config_value PROXY_CONTROL_AGENT_TOKEN)"
  fi
  session_secret="$(read_config_value PROXY_CONTROL_SESSION_SECRET)"
  data_dir="$(read_config_value PROXY_CONTROL_DATA_DIR)"
  frontend_dir="$(read_config_value PROXY_CONTROL_FRONTEND_DIR)"
  cors_origin="$(read_config_value PROXY_CONTROL_CORS_ORIGIN)"
  {
    write_env_line "PROXY_CONTROL_HTTP_ADDR" "$http_addr"
    write_env_line "PROXY_CONTROL_CORS_ORIGIN" "${cors_origin:-*}"
    write_env_line "PROXY_CONTROL_FRONTEND_DIR" "$frontend_dir"
    write_env_line "PROXY_CONTROL_DATA_DIR" "$data_dir"
    write_env_line "PROXY_CONTROL_ADMIN_USERNAME" "$admin_user"
    write_env_line "PROXY_CONTROL_ADMIN_PASSWORD" "$admin_password"
    write_env_line "PROXY_CONTROL_SESSION_SECRET" "$session_secret"
    write_env_line "PROXY_CONTROL_AGENT_TOKEN" "$agent_token"
  } > "$CONFIG_FILE"
  chmod 0600 "$CONFIG_FILE"
  systemctl restart "$SERVICE_NAME"
  echo -e "${green}配置已保存，主控已重启${plain}"
}

update_master() {
  [ "$(id -u)" -eq 0 ] || { echo -e "${red}请使用 root 运行${plain}"; exit 1; }
  command -v curl >/dev/null 2>&1 || { echo -e "${red}未检测到 curl，无法在线更新${plain}"; exit 1; }
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  curl -fsSL "$BOOTSTRAP_URL" -o "$tmp"
  env \
    PROXY_CONTROL_HTTP_ADDR="$(read_config_value PROXY_CONTROL_HTTP_ADDR)" \
    PROXY_CONTROL_ADMIN_USERNAME="$(read_config_value PROXY_CONTROL_ADMIN_USERNAME)" \
    PROXY_CONTROL_ADMIN_PASSWORD="$(read_config_value PROXY_CONTROL_ADMIN_PASSWORD)" \
    PROXY_CONTROL_AGENT_TOKEN="$(read_config_value PROXY_CONTROL_AGENT_TOKEN)" \
    PROXY_CONTROL_SESSION_SECRET="$(read_config_value PROXY_CONTROL_SESSION_SECRET)" \
    bash "$tmp"
}

uninstall_master() {
  [ "$(id -u)" -eq 0 ] || { echo -e "${red}请使用 root 运行${plain}"; exit 1; }
  read -r -p "确认卸载 Proxy Control 主控? [y/N]: " confirm
  case "$confirm" in
    y|Y)
      systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
      rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
      systemctl daemon-reload
      rm -rf /opt/proxy-control /etc/proxy-control /var/lib/proxy-control
      rm -f /usr/bin/proxy-control
      echo -e "${green}已卸载 Proxy Control 主控${plain}"
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
  config) config_master ;;
  update) update_master ;;
  uninstall) uninstall_master ;;
  *) echo "用法: proxy-control {start|stop|restart|status|log|config|update|uninstall}"; exit 1 ;;
esac
EOF
  chmod 0755 "$MANAGER_FILE"
}

start_service() {
  systemctl daemon-reload
  systemctl enable --now proxy-control
}

print_result() {
  local display_addr="$HTTP_ADDR"
  if [[ "$HTTP_ADDR" == :* ]]; then
    display_addr="http://服务器IP${HTTP_ADDR}"
  elif [[ "$HTTP_ADDR" == 0.0.0.0:* ]]; then
    display_addr="http://服务器IP:${HTTP_ADDR#*:}"
  else
    display_addr="http://${HTTP_ADDR}"
  fi

  echo
  info "Proxy Control 主控安装完成，服务已启动"
  echo "----------------------------------------------"
  echo "访问地址: ${display_addr}"
  echo "默认账号: ${ADMIN_USERNAME}"
  echo "默认密码: ${ADMIN_PASSWORD}"
  echo "Agent Token: ${AGENT_TOKEN}"
  echo "----------------------------------------------"
  echo "proxy-control              - 显示管理菜单"
  echo "proxy-control status       - 查看主控状态"
  echo "proxy-control restart      - 重启主控"
  echo "proxy-control log          - 查看实时日志"
  echo "proxy-control config       - 修改配置"
  echo "proxy-control update       - 更新主控"
  echo "proxy-control uninstall    - 卸载主控"
  echo "----------------------------------------------"
  warn "生产环境请安装后立即使用 proxy-control config 修改默认管理员密码。"
}

uninstall_master() {
  read -r -p "确认卸载 Proxy Control 主控? [y/N]: " confirm
  case "$confirm" in
    y|Y)
      systemctl disable --now proxy-control 2>/dev/null || true
      rm -f "$SERVICE_FILE"
      systemctl daemon-reload
      rm -rf "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR"
      rm -f "$MANAGER_FILE"
      info "已卸载 Proxy Control 主控"
      ;;
    *) warn "已取消卸载" ;;
  esac
}

main() {
  require_commands
  validate_config
  write_config
  build_master
  write_service
  write_manager
  start_service
  print_result
}

if [ "$ACTION" = "uninstall" ]; then
  require_commands
  uninstall_master
  exit 0
fi

main
