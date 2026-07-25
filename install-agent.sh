#!/usr/bin/env bash
set -euo pipefail

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
plain='\033[0m'

GITHUB_REPO="${PROXY_CONTROL_GITHUB_REPO:-fuyunnat/ss}"
RELEASE_VERSION="${PROXY_CONTROL_VERSION:-latest}"
PACKAGE_URL="${PROXY_CONTROL_AGENT_PACKAGE_URL:-}"
WORK_DIR=""
release="unknown"
arch_name="$(uname -m)"

usage() {
  cat <<'EOF'
fyss Agent 一键安装脚本

用法:
  sudo bash install-agent.sh --master-url URL --token TOKEN [--node-name NAME] [--region REGION] [--node-host HOST]

安装方式:
  下载已经编译好的 Linux Agent 安装包，不在服务器上安装 Go。
  安装包内包含 Agent 二进制，解压后安装到 /opt/proxy-control-agent，
  并注册 systemd 服务。节点名称每台被控单独传入。

环境变量:
  PROXY_CONTROL_GITHUB_REPO         GitHub 仓库，默认: fuyunnat/ss
  PROXY_CONTROL_VERSION             Release 版本，默认: latest
  PROXY_CONTROL_AGENT_PACKAGE_URL   自定义 Agent 安装包 URL

示例:
  curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh \
    | sudo bash -s -- --master-url http://YOUR-MASTER:8080 --token YOUR_AGENT_TOKEN --node-name hk-01 --region HK

安装完成后会自动打开 fyss 管理菜单；以后直接执行 fyss 进入菜单。
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
  asset="fyss-agent-linux-${arch_name}.tar.gz"
  archive="${WORK_DIR}/${asset}"
  if [ -z "$PACKAGE_URL" ]; then
    PACKAGE_URL="$(release_download_url "$asset")"
  fi
  info "下载安装包: ${PACKAGE_URL}"
  curl -fL --retry 3 --retry-delay 2 "$PACKAGE_URL" -o "$archive" || fail "下载安装包失败。请确认 GitHub Release 已发布 ${asset}"
  tar -xzf "$archive" -C "$WORK_DIR"
  [ -x "${WORK_DIR}/bin/proxy-control-agent" ] || fail "安装包缺少 Agent 二进制: bin/proxy-control-agent"
  [ -x "${WORK_DIR}/scripts/install-agent.sh" ] || fail "安装包缺少安装器: scripts/install-agent.sh"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  fail "错误：必须使用 root 用户运行，例如 curl -fsSL URL | sudo bash -s -- --master-url URL --token TOKEN"
fi

detect_os
normalize_arch
info "开始安装 fyss Agent"
echo "系统: ${release}"
echo "架构: ${arch_name}"
echo "安装流程: 下载二进制包 -> 安装 Agent 二进制 -> 注册 systemd -> 自动上线"
ensure_dependencies

WORK_DIR="$(mktemp -d)"
download_package
"$WORK_DIR/scripts/install-agent.sh" --prebuilt-dir "$WORK_DIR" "$@"
