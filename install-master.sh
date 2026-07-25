#!/usr/bin/env bash
set -euo pipefail

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
plain='\033[0m'

GITHUB_REPO="${PROXY_CONTROL_GITHUB_REPO:-fuyunnat/ss}"
RELEASE_VERSION="${PROXY_CONTROL_VERSION:-latest}"
PACKAGE_URL="${PROXY_CONTROL_MASTER_PACKAGE_URL:-}"
WORK_DIR=""
release="unknown"
arch_name="$(uname -m)"

usage() {
  cat <<'EOF'
fyss 主控一键安装脚本

用法:
  sudo bash install-master.sh [--http-addr :8080] [--admin-user admin] [--admin-password admin] [--agent-token TOKEN]

GitHub 一键安装:
  curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-master.sh | sudo bash

安装方式:
  下载已经编译好的 Linux 主控安装包，不在服务器上安装 Go、Node 或 npm。
  安装包内包含主控二进制和前端 dist，解压后安装到 /opt/proxy-control，
  并注册 systemd 服务。
  如果检测到已启用的 firewalld 或 ufw，会自动放行面板端口和默认主入口端口。

安装完成后会自动打开 fyss 管理菜单；以后直接执行 fyss 进入菜单。

环境变量:
  PROXY_CONTROL_GITHUB_REPO          GitHub 仓库，默认: fuyunnat/ss
  PROXY_CONTROL_VERSION              Release 版本，默认: latest
  PROXY_CONTROL_MASTER_PACKAGE_URL   自定义主控安装包 URL
  PROXY_CONTROL_FIREWALL_OPEN        是否自动放行防火墙端口，默认: 1
  PROXY_CONTROL_ENTRY_PORT_RANGE     主入口端口范围，默认: 30000-30005
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

cleanup() {
  if [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "${ID:-}" in
      ubuntu|debian) release="${ID}" ;;
      centos|rhel|rocky|almalinux|fedora) release="centos" ;;
      *) release="${ID:-unknown}" ;;
    esac
  elif [ -f /etc/redhat-release ]; then
    release="centos"
  fi
}

normalize_arch() {
  case "$arch_name" in
    x86_64|x64|amd64) arch_name="amd64" ;;
    aarch64|arm64) arch_name="arm64" ;;
    *) warn "未识别架构 ${arch_name}，继续尝试安装" ;;
  esac
}

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    yum install -y "$@"
    return
  fi
  fail "未找到 apt-get/dnf/yum，无法自动安装依赖"
}

ensure_dependencies() {
  local missing=()
  command -v curl >/dev/null 2>&1 || missing+=("curl")
  command -v tar >/dev/null 2>&1 || missing+=("tar")
  command -v systemctl >/dev/null 2>&1 || fail "当前系统未检测到 systemd，无法安装为系统服务"

  if [ "${#missing[@]}" -eq 0 ]; then
    return
  fi

  warn "检测到缺少依赖: ${missing[*]}，开始自动安装"
  case "$release" in
    ubuntu|debian)
      install_packages ca-certificates curl tar
      ;;
    centos|fedora|rocky|almalinux|rhel)
      install_packages ca-certificates curl tar
      ;;
    *)
      install_packages ca-certificates curl tar
      ;;
  esac

  command -v curl >/dev/null 2>&1 || fail "curl 安装失败"
  command -v tar >/dev/null 2>&1 || fail "tar 安装失败"
}

release_download_url() {
  local asset="$1"
  if [ "$RELEASE_VERSION" = "latest" ]; then
    printf 'https://github.com/%s/releases/latest/download/%s' "$GITHUB_REPO" "$asset"
    return
  fi
  printf 'https://github.com/%s/releases/download/%s/%s' "$GITHUB_REPO" "$RELEASE_VERSION" "$asset"
}

download_package() {
  local asset archive
  asset="fyss-master-linux-${arch_name}.tar.gz"
  archive="${WORK_DIR}/${asset}"
  if [ -z "$PACKAGE_URL" ]; then
    PACKAGE_URL="$(release_download_url "$asset")"
  fi
  info "下载安装包: ${PACKAGE_URL}"
  curl -fL --retry 3 --retry-delay 2 "$PACKAGE_URL" -o "$archive" || fail "下载安装包失败。请确认 GitHub Release 已发布 ${asset}"
  tar -xzf "$archive" -C "$WORK_DIR"
  [ -x "${WORK_DIR}/bin/proxy-control" ] || fail "安装包缺少主控二进制: bin/proxy-control"
  [ -d "${WORK_DIR}/frontend/dist" ] || fail "安装包缺少前端静态文件: frontend/dist"
  [ -x "${WORK_DIR}/scripts/install-master.sh" ] || fail "安装包缺少安装器: scripts/install-master.sh"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  fail "错误：必须使用 root 用户运行，例如 curl -fsSL URL | sudo bash"
fi

detect_os
normalize_arch
info "开始安装 fyss 主控"
echo "系统: ${release}"
echo "架构: ${arch_name}"
echo "安装流程: 下载二进制包 -> 安装主控二进制 -> 安装前端 dist -> 注册 systemd"
ensure_dependencies

WORK_DIR="$(mktemp -d)"
download_package
"$WORK_DIR/scripts/install-master.sh" --prebuilt-dir "$WORK_DIR" "$@"
