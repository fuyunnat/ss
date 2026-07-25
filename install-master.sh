#!/usr/bin/env bash
set -euo pipefail

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
plain='\033[0m'

REPO_URL="${PROXY_CONTROL_REPO_URL:-https://github.com/fuyunnat/ss.git}"
REPO_REF="${PROXY_CONTROL_REPO_REF:-feature/proxy-control-mvp}"
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

安装完成后会自动打开 fyss 管理菜单；以后直接执行 fyss 进入菜单。

环境变量:
  PROXY_CONTROL_REPO_URL  Git 仓库地址，默认: https://github.com/fuyunnat/ss.git
  PROXY_CONTROL_REPO_REF  Git 分支/标签/commit，默认: feature/proxy-control-mvp
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
  command -v git >/dev/null 2>&1 || missing+=("git")
  command -v go >/dev/null 2>&1 || missing+=("go")
  command -v node >/dev/null 2>&1 || missing+=("nodejs")
  command -v npm >/dev/null 2>&1 || missing+=("npm")

  if [ "${#missing[@]}" -eq 0 ]; then
    return
  fi

  warn "检测到缺少依赖: ${missing[*]}，开始自动安装"
  case "$release" in
    ubuntu|debian)
      install_packages ca-certificates curl git golang-go nodejs npm
      ;;
    centos|fedora|rocky|almalinux|rhel)
      install_packages ca-certificates curl git golang nodejs npm
      ;;
    *)
      install_packages ca-certificates curl git golang-go nodejs npm || install_packages ca-certificates curl git golang nodejs npm
      ;;
  esac

  command -v curl >/dev/null 2>&1 || fail "curl 安装失败"
  command -v git >/dev/null 2>&1 || fail "git 安装失败"
  command -v go >/dev/null 2>&1 || fail "Go 安装失败"
  command -v node >/dev/null 2>&1 || fail "Node.js 安装失败"
  command -v npm >/dev/null 2>&1 || fail "npm 安装失败"
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
ensure_dependencies

WORK_DIR="$(mktemp -d)"
info "拉取安装仓库: ${REPO_URL} (${REPO_REF})"
git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$WORK_DIR"
"$WORK_DIR/scripts/install-master.sh" "$@"
