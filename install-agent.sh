#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${PROXY_CONTROL_REPO_URL:-https://github.com/fuyunnat/ss.git}"
REPO_REF="${PROXY_CONTROL_REPO_REF:-feature/proxy-control-mvp}"
WORK_DIR=""

usage() {
  cat <<'EOF'
Usage:
  sudo bash install-agent.sh --master-url URL --token TOKEN [--node-name NAME] [--region REGION] [--node-host HOST]

Environment:
  PROXY_CONTROL_REPO_URL  Git repository URL. Default: https://github.com/fuyunnat/ss.git
  PROXY_CONTROL_REPO_REF  Git branch/tag/commit. Default: feature/proxy-control-mvp

Example:
  curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh \
    | sudo bash -s -- --master-url http://YOUR-MASTER:8080 --token YOUR_AGENT_TOKEN --node-name hk-01 --region HK
EOF
}

cleanup() {
  if [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  printf 'Please run as root, for example: curl -fsSL URL | sudo bash -s -- --master-url URL --token TOKEN\n' >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  printf 'git is required to fetch the agent installer from GitHub.\n' >&2
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  printf 'Go is required to build proxy-control-agent on the target server.\n' >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$WORK_DIR"
exec "$WORK_DIR/scripts/install-agent.sh" "$@"
