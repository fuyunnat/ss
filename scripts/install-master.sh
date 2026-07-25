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
MANAGER_FILE="/usr/bin/fyss"
LEGACY_MANAGER_FILE="/usr/bin/proxy-control"
HTTP_ADDR="${PROXY_CONTROL_HTTP_ADDR:-:8080}"
ENTRY_PORT_RANGE="${PROXY_CONTROL_ENTRY_PORT_RANGE:-30000-30005}"
FIREWALL_OPEN="${PROXY_CONTROL_FIREWALL_OPEN:-1}"
ADMIN_USERNAME="${PROXY_CONTROL_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${PROXY_CONTROL_ADMIN_PASSWORD:-admin}"
AGENT_TOKEN="${PROXY_CONTROL_AGENT_TOKEN:-}"
SESSION_SECRET="${PROXY_CONTROL_SESSION_SECRET:-}"
PREBUILT_DIR="${PROXY_CONTROL_PREBUILT_DIR:-}"
ACTION="install"

usage() {
  cat <<'EOF'
Proxy Control 主控安装器

用法:
  sudo ./scripts/install-master.sh [--http-addr :8080] [--admin-user admin] [--admin-password admin] [--agent-token TOKEN]
  sudo ./scripts/install-master.sh --uninstall
  sudo ./scripts/install-master.sh --prebuilt-dir /path/to/package

安装后管理命令:
  fyss              显示管理菜单
  fyss status       查看主控状态
  fyss start        启动主控
  fyss stop         停止主控
  fyss restart      重启主控
  fyss log          查看实时日志
  fyss config       修改端口、账号密码、Agent Token
  fyss update       更新主控到最新版
  fyss update v0.1.7 更新主控到指定版本
  fyss uninstall    卸载主控

防火墙:
  默认自动放行面板端口和主入口端口 30000-30005。
  如需关闭自动放行: PROXY_CONTROL_FIREWALL_OPEN=0

主入口:
  自动安装 Xray Core，主控用它监听 VLESS、VMess、Trojan、Shadowsocks、SOCKS5、HTTP 入口。
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
    --prebuilt-dir) PREBUILT_DIR="${2:-}"; shift 2 ;;
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
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
    return
  fi
  od -An -N24 -tx1 /dev/urandom | tr -d ' \n'
}

validate_config() {
  HTTP_ADDR="$(clean_config_value "$HTTP_ADDR")"
  ADMIN_USERNAME="$(clean_config_value "$ADMIN_USERNAME")"
  ADMIN_PASSWORD="$(clean_config_value "$ADMIN_PASSWORD")"
  AGENT_TOKEN="$(clean_config_value "$AGENT_TOKEN")"
  SESSION_SECRET="$(clean_config_value "$SESSION_SECRET")"
  [ -n "$HTTP_ADDR" ] || fail "监听地址不能为空"
  [ -n "$ADMIN_USERNAME" ] || fail "管理员账号不能为空"
  [ -n "$ADMIN_PASSWORD" ] || fail "管理员密码不能为空"
  [ -n "$AGENT_TOKEN" ] || AGENT_TOKEN="$(generate_secret)"
  [ -n "$SESSION_SECRET" ] || SESSION_SECRET="$(generate_secret)"
}

clean_config_value() {
  local value="${1:-}"
  value="${value%$'\r'}"
  while [[ "$value" == \"* && "$value" == *\" && "${#value}" -gt 1 ]]; do
    value="${value:1:${#value}-2}"
  done
  value="${value#\"}"
  value="${value%\"}"
  printf '%s' "$value"
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
    write_env_line "PROXY_CONTROL_CORS_ORIGIN" ""
    write_env_line "PROXY_CONTROL_FRONTEND_DIR" "${INSTALL_DIR}/frontend/dist"
    write_env_line "PROXY_CONTROL_DATA_DIR" "$DATA_DIR"
    write_env_line "PROXY_CONTROL_ADMIN_USERNAME" "$ADMIN_USERNAME"
    write_env_line "PROXY_CONTROL_ADMIN_PASSWORD" "$ADMIN_PASSWORD"
    write_env_line "PROXY_CONTROL_SESSION_SECRET" "$SESSION_SECRET"
    write_env_line "PROXY_CONTROL_AGENT_TOKEN" "$AGENT_TOKEN"
  } > "$CONFIG_FILE"
  chmod 0600 "$CONFIG_FILE"
}

listen_port() {
  local value="${1:-}"
  local port="${value##*:}"
  case "$port" in
    ''|*[!0-9]*) return 1 ;;
    *) printf '%s' "$port" ;;
  esac
}

open_firewall() {
  local http_port
  if [ "$FIREWALL_OPEN" = "0" ]; then
    warn "已跳过防火墙端口放行"
    return
  fi
  http_port="$(listen_port "$HTTP_ADDR" || true)"
  if [ -z "$http_port" ]; then
    warn "无法识别监听端口 ${HTTP_ADDR}，跳过防火墙自动放行"
    return
  fi

  if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    info "检测到 firewalld，放行端口: ${http_port}/tcp, ${ENTRY_PORT_RANGE}/tcp, ${ENTRY_PORT_RANGE}/udp"
    firewall-cmd --permanent --add-port="${http_port}/tcp" >/dev/null || warn "firewalld 放行 ${http_port}/tcp 失败"
    firewall-cmd --permanent --add-port="${ENTRY_PORT_RANGE}/tcp" >/dev/null || warn "firewalld 放行 ${ENTRY_PORT_RANGE}/tcp 失败"
    firewall-cmd --permanent --add-port="${ENTRY_PORT_RANGE}/udp" >/dev/null || warn "firewalld 放行 ${ENTRY_PORT_RANGE}/udp 失败"
    firewall-cmd --reload >/dev/null || warn "firewalld 重载失败"
    return
  fi

  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    local ufw_entry_range="${ENTRY_PORT_RANGE/-/:}"
    info "检测到 ufw，放行端口: ${http_port}/tcp, ${ENTRY_PORT_RANGE}/tcp, ${ENTRY_PORT_RANGE}/udp"
    ufw allow "${http_port}/tcp" >/dev/null || warn "ufw 放行 ${http_port}/tcp 失败"
    ufw allow "${ufw_entry_range}/tcp" >/dev/null || warn "ufw 放行 ${ENTRY_PORT_RANGE}/tcp 失败"
    ufw allow "${ufw_entry_range}/udp" >/dev/null || warn "ufw 放行 ${ENTRY_PORT_RANGE}/udp 失败"
    return
  fi

  warn "未检测到启用的 firewalld/ufw，跳过系统防火墙自动放行"
}

xray_asset() {
  case "$(uname -m)" in
    x86_64|x64|amd64) printf 'Xray-linux-64.zip' ;;
    aarch64|arm64) printf 'Xray-linux-arm64-v8a.zip' ;;
    *) return 1 ;;
  esac
}

install_xray() {
  if command -v xray >/dev/null 2>&1; then
    info "检测到 Xray: $(command -v xray)"
    return
  fi
  command -v curl >/dev/null 2>&1 || fail "未检测到 curl，无法安装 Xray"
  command -v unzip >/dev/null 2>&1 || fail "未检测到 unzip，无法安装 Xray"

  local asset url tmp archive
  asset="$(xray_asset)" || fail "当前架构暂不支持自动安装 Xray: $(uname -m)"
  url="https://github.com/XTLS/Xray-core/releases/latest/download/${asset}"
  tmp="$(mktemp -d)"
  archive="${tmp}/${asset}"
  info "安装 Xray Core: ${url}"
  curl -fL --retry 3 --retry-delay 2 "$url" -o "$archive" || fail "下载 Xray 失败"
  unzip -q "$archive" -d "$tmp" || fail "解压 Xray 失败"
  [ -x "${tmp}/xray" ] || fail "Xray 安装包缺少 xray 二进制"
  install -m 0755 "${tmp}/xray" /usr/local/bin/xray
  mkdir -p /usr/local/share/xray
  [ -f "${tmp}/geoip.dat" ] && install -m 0644 "${tmp}/geoip.dat" /usr/local/share/xray/geoip.dat
  [ -f "${tmp}/geosite.dat" ] && install -m 0644 "${tmp}/geosite.dat" /usr/local/share/xray/geosite.dat
  rm -rf "$tmp"
  info "Xray Core 已安装: /usr/local/bin/xray"
}

build_master() {
  local script_dir repo_root
  mkdir -p "${INSTALL_DIR}/bin" "${INSTALL_DIR}/frontend"
  if [ -n "$PREBUILT_DIR" ]; then
    [ -x "${PREBUILT_DIR}/bin/proxy-control" ] || fail "预编译包缺少主控二进制: ${PREBUILT_DIR}/bin/proxy-control"
    [ -d "${PREBUILT_DIR}/frontend/dist" ] || fail "预编译包缺少前端静态文件: ${PREBUILT_DIR}/frontend/dist"
    info "安装主控二进制: ${INSTALL_DIR}/bin/proxy-control"
    install -m 0755 "${PREBUILT_DIR}/bin/proxy-control" "${INSTALL_DIR}/bin/proxy-control"
    info "安装前端静态文件: ${INSTALL_DIR}/frontend/dist"
    rm -rf "${INSTALL_DIR}/frontend/dist"
    cp -a "${PREBUILT_DIR}/frontend/dist" "${INSTALL_DIR}/frontend/dist"
    return
  fi

  command -v go >/dev/null 2>&1 || fail "未检测到 Go。本地源码安装才需要 Go；线上请使用根目录 install-master.sh 下载二进制包安装"
  command -v npm >/dev/null 2>&1 || fail "未检测到 npm。本地源码安装才需要 npm；线上请使用根目录 install-master.sh 下载二进制包安装"
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "${script_dir}/.." && pwd)"
  cd "${repo_root}/backend"
  info "本地编译主控后端: ${INSTALL_DIR}/bin/proxy-control"
  go build -trimpath -ldflags="-s -w" -o "${INSTALL_DIR}/bin/proxy-control" .
  chmod 0755 "${INSTALL_DIR}/bin/proxy-control"

  cd "${repo_root}/frontend"
  info "本地构建主控前端: ${INSTALL_DIR}/frontend/dist"
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
BOOTSTRAP_URL="${PROXY_CONTROL_MASTER_BOOTSTRAP_URL:-${PROXY_CONTROL_BOOTSTRAP_URL:-https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-master.sh}}"
ENTRY_PORT_RANGE="${PROXY_CONTROL_ENTRY_PORT_RANGE:-30000-30005}"
FIREWALL_OPEN="${PROXY_CONTROL_FIREWALL_OPEN:-1}"

show_menu() {
  echo -e "${green}fyss 主控管理菜单${plain}"
  echo "----------------------------------------------"
  echo "  1. 启动主控"
  echo "  2. 停止主控"
  echo "  3. 重启主控"
  echo "  4. 查看状态"
  echo "  5. 查看实时日志"
  echo "  6. 修改配置"
  echo "  7. 更新 fyss 到最新版"
  echo "  8. 指定版本更新"
  echo "  9. 卸载主控"
  echo "  0. 退出"
  echo "----------------------------------------------"
  read -r -p "请选择 [0-9]: " num
  case "$num" in
    1) systemctl start "$SERVICE_NAME" ;;
    2) systemctl stop "$SERVICE_NAME" ;;
    3) systemctl restart "$SERVICE_NAME" ;;
    4) systemctl status "$SERVICE_NAME" --no-pager ;;
    5) journalctl -u "$SERVICE_NAME" -f ;;
    6) config_master ;;
    7) update_master ;;
    8) update_master_prompt ;;
    9) uninstall_master ;;
    0) exit 0 ;;
    *) echo -e "${red}无效选择${plain}" ;;
  esac
}

clean_config_value() {
  local value="${1:-}"
  value="${value%$'\r'}"
  while [[ "$value" == \"* && "$value" == *\" && "${#value}" -gt 1 ]]; do
    value="${value:1:${#value}-2}"
  done
  value="${value#\"}"
  value="${value%\"}"
  printf '%s' "$value"
}

read_config_value() {
  local key="$1"
  local line value
  if [ -f "$CONFIG_FILE" ]; then
    line="$(grep -E "^${key}=" "$CONFIG_FILE" | tail -n 1 || true)"
    [ -n "$line" ] || return 0
    value="${line#*=}"
    value="${value//\\\"/\"}"
    value="${value//\\\\/\\}"
    clean_config_value "$value"
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

listen_port() {
  local value="${1:-}"
  local port="${value##*:}"
  case "$port" in
    ''|*[!0-9]*) return 1 ;;
    *) printf '%s' "$port" ;;
  esac
}

open_firewall() {
  local http_port
  if [ "$FIREWALL_OPEN" = "0" ]; then
    echo -e "${yellow}已跳过防火墙端口放行${plain}"
    return
  fi
  http_port="$(listen_port "$1" || true)"
  if [ -z "$http_port" ]; then
    echo -e "${yellow}无法识别监听端口 $1，跳过防火墙自动放行${plain}"
    return
  fi

  if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    echo -e "${green}检测到 firewalld，放行端口: ${http_port}/tcp, ${ENTRY_PORT_RANGE}/tcp, ${ENTRY_PORT_RANGE}/udp${plain}"
    firewall-cmd --permanent --add-port="${http_port}/tcp" >/dev/null || true
    firewall-cmd --permanent --add-port="${ENTRY_PORT_RANGE}/tcp" >/dev/null || true
    firewall-cmd --permanent --add-port="${ENTRY_PORT_RANGE}/udp" >/dev/null || true
    firewall-cmd --reload >/dev/null || true
    return
  fi

  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    local ufw_entry_range="${ENTRY_PORT_RANGE/-/:}"
    echo -e "${green}检测到 ufw，放行端口: ${http_port}/tcp, ${ENTRY_PORT_RANGE}/tcp, ${ENTRY_PORT_RANGE}/udp${plain}"
    ufw allow "${http_port}/tcp" >/dev/null || true
    ufw allow "${ufw_entry_range}/tcp" >/dev/null || true
    ufw allow "${ufw_entry_range}/udp" >/dev/null || true
    return
  fi

  echo -e "${yellow}未检测到启用的 firewalld/ufw，跳过系统防火墙自动放行${plain}"
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
    write_env_line "PROXY_CONTROL_CORS_ORIGIN" "$cors_origin"
    write_env_line "PROXY_CONTROL_FRONTEND_DIR" "$frontend_dir"
    write_env_line "PROXY_CONTROL_DATA_DIR" "$data_dir"
    write_env_line "PROXY_CONTROL_ADMIN_USERNAME" "$admin_user"
    write_env_line "PROXY_CONTROL_ADMIN_PASSWORD" "$admin_password"
    write_env_line "PROXY_CONTROL_SESSION_SECRET" "$session_secret"
    write_env_line "PROXY_CONTROL_AGENT_TOKEN" "$agent_token"
  } > "$CONFIG_FILE"
  chmod 0600 "$CONFIG_FILE"
  open_firewall "$http_addr"
  systemctl restart "$SERVICE_NAME"
  echo -e "${green}配置已保存，主控已重启${plain}"
}

update_master() {
  [ "$(id -u)" -eq 0 ] || { echo -e "${red}请使用 root 运行${plain}"; exit 1; }
  command -v curl >/dev/null 2>&1 || { echo -e "${red}未检测到 curl，无法在线更新${plain}"; exit 1; }
  local tmp version
  version="${1:-latest}"
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  curl -fsSL "$BOOTSTRAP_URL" -o "$tmp"
  env \
    PROXY_CONTROL_VERSION="$version" \
    PROXY_CONTROL_HTTP_ADDR="$(read_config_value PROXY_CONTROL_HTTP_ADDR)" \
    PROXY_CONTROL_ADMIN_USERNAME="$(read_config_value PROXY_CONTROL_ADMIN_USERNAME)" \
    PROXY_CONTROL_ADMIN_PASSWORD="$(read_config_value PROXY_CONTROL_ADMIN_PASSWORD)" \
    PROXY_CONTROL_AGENT_TOKEN="$(read_config_value PROXY_CONTROL_AGENT_TOKEN)" \
    PROXY_CONTROL_SESSION_SECRET="$(read_config_value PROXY_CONTROL_SESSION_SECRET)" \
    bash "$tmp"
}

update_master_prompt() {
  local version
  read -r -p "请输入版本号，例如 v0.1.7；留空更新最新版: " version
  update_master "${version:-latest}"
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
      rm -f /usr/bin/fyss /usr/bin/proxy-control
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
  update) update_master "${2:-latest}" ;;
  uninstall) uninstall_master ;;
  *) echo "用法: fyss {start|stop|restart|status|log|config|update [version]|uninstall}"; exit 1 ;;
esac
EOF
  chmod 0755 "$MANAGER_FILE"
  ln -sf "$MANAGER_FILE" "$LEGACY_MANAGER_FILE"
}

start_service() {
  systemctl daemon-reload
  systemctl enable proxy-control
  systemctl restart proxy-control
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
	echo "安装目录: ${INSTALL_DIR}"
	echo "主控二进制: ${INSTALL_DIR}/bin/proxy-control"
	echo "前端静态文件: ${INSTALL_DIR}/frontend/dist"
	echo "systemd 服务: proxy-control"
	echo "访问地址: ${display_addr}"
	echo "默认账号: ${ADMIN_USERNAME}"
	echo "默认密码: ${ADMIN_PASSWORD}"
  echo "Agent Token: ${AGENT_TOKEN}"
  echo "----------------------------------------------"
  echo "fyss              - 显示管理菜单"
  echo "fyss status       - 查看主控状态"
  echo "fyss restart      - 重启主控"
  echo "fyss log          - 查看实时日志"
  echo "fyss config       - 修改配置"
  echo "fyss update       - 更新主控到最新版"
  echo "fyss update v0.1.7 - 更新主控到指定版本"
  echo "fyss uninstall    - 卸载主控"
  echo "----------------------------------------------"
  warn "生产环境请安装后立即使用 fyss config 修改默认管理员密码。"
}

open_manager_menu() {
  if [ -t 0 ] && [ -t 1 ] && [ -r /dev/tty ]; then
    echo
    info "打开 fyss 管理菜单"
    "$MANAGER_FILE" menu </dev/tty
  fi
}

uninstall_master() {
  read -r -p "确认卸载 Proxy Control 主控? [y/N]: " confirm
  case "$confirm" in
    y|Y)
      systemctl disable --now proxy-control 2>/dev/null || true
      rm -f "$SERVICE_FILE"
      systemctl daemon-reload
      rm -rf "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR"
      rm -f "$MANAGER_FILE" "$LEGACY_MANAGER_FILE"
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
  install_xray
  write_service
  write_manager
  open_firewall
  start_service
  print_result
  open_manager_menu
}

if [ "$ACTION" = "uninstall" ]; then
  require_commands
  uninstall_master
  exit 0
fi

main
