# Proxy Control

Go + React + TypeScript + Vite multi-server proxy control panel.

This project is a new management system. It uses mature proxy cores such as Xray or sing-box as the data plane, and focuses on control-plane features:

- servers and agents
- gateway entries
- self-owned and external exits
- routing policies
- task execution records
- traffic and health model hooks

## Master One-Click Install

Install the control panel on a Linux master server:

```bash
curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-master.sh | sudo bash
```

After installation:

```bash
proxy-control              # show management menu
proxy-control status       # service status
proxy-control restart      # restart panel
proxy-control log          # live logs
proxy-control config       # change port, admin account, Agent Token
proxy-control update       # update from GitHub installer
proxy-control uninstall    # uninstall panel
```

Default login is `admin / admin`. The installer generates an Agent Token and prints it at the end. Use `proxy-control config` after installation to change the default password and token.

## Beginner Flow

The panel is organized around the shortest usable path:

1. Open **Bring Online / 服务器上线**, enter the VPS SSH information, master URL, token, node name, and region.
2. Click one-click install. The master connects over SSH, runs the GitHub installer, and the server appears in the panel after heartbeat.
3. Open **Create Node / 创建节点**, choose the online server and an inbound protocol, then create the deployment task.

Gateway, routing policy, and task records remain available for advanced control, but a new user does not need to configure them before bringing the first node online.

The inbound form follows the common x-ui flow: remark, enabled switch, protocol, listen IP, port, traffic limit, expiry date, ID, transport, TLS and sniffing. Supported presets include `vless`, `vmess`, `trojan`, `shadowsocks`, `socks5`, and `dokodemo-door`. When `dokodemo-door` is selected, target address, target port, and network fields are shown instead of UUID/TLS fields.

## Development

Backend:

```bash
cd backend
export PROXY_CONTROL_AGENT_TOKEN=change-me
export PROXY_CONTROL_ADMIN_USERNAME=admin
export PROXY_CONTROL_ADMIN_PASSWORD=admin
go run .
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Default backend address: `http://localhost:8080`.

## Login and AI Agent

The panel is protected by an admin login. The default local account is:

```text
username: admin
password: admin
```

For production, override it on the backend before starting the service:

```bash
export PROXY_CONTROL_ADMIN_USERNAME=your-admin
export PROXY_CONTROL_ADMIN_PASSWORD='change-this-password'
export PROXY_CONTROL_SESSION_SECRET='change-this-long-random-secret'
```

AI provider settings are backend-only configuration. The frontend never stores or bundles the API key.

```bash
export PROXY_CONTROL_AI_BASE_URL=https://api.openai.com
export PROXY_CONTROL_AI_API_KEY='your-api-key'
export PROXY_CONTROL_AI_MODEL=gpt-4o-mini
```

The AI assistant calls an OpenAI-compatible chat completions endpoint. If the AI base URL or key is not configured, the AI tab stays usable and shows a backend configuration reminder instead of failing the whole panel.

The AI tab can also draft controlled batch operations. For example, paste:

```text
帮我把这些服务器安装成被控端
1.2.3.4 HK hk-01
root@5.6.7.8:22 JP jp-01
```

The panel drafts one `install_agent` action per server. Fill the shared master URL, agent token, SSH user/port, and authentication method, then confirm the batch. The AI does not execute shell commands directly; it only creates tasks through the existing authenticated panel API after confirmation.

## Agent Install

The normal path is the panel one-click installer. It calls:

```text
POST /api/agent/install
```

The request contains SSH connection details and agent install parameters. After validation, the backend creates an install task and runs SSH installation in the background. SSH passwords or private keys are only used for the current request and are not stored in `state.json`. When `PROXY_CONTROL_AGENT_TOKEN` is configured, the submitted agent token must match it before installation starts.

Manual fallback command:

```bash
curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh \
  | sudo bash -s -- \
    --master-url http://YOUR-MASTER:8080 \
    --token YOUR_AGENT_TOKEN \
    --node-name hk-01 \
    --region HK
```

Or clone this repository and run the local installer:

```bash
sudo ./scripts/install-agent.sh \
  --master-url http://YOUR-MASTER:8080 \
  --token YOUR_AGENT_TOKEN \
  --node-name hk-01 \
  --region HK
```

The installer:

- detects Linux distribution and architecture
- installs missing base dependencies where the system package manager supports it
- builds `backend/cmd/agent`
- installs the binary to `/opt/proxy-control-agent/proxy-control-agent`
- writes `/etc/proxy-control/agent.env`
- creates and starts `proxy-control-agent.service`
- installs `/usr/bin/proxy-control-agent` as an x-ui-style management command
- detects whether `xray` or `sing-box` already exists
- sends heartbeat to the master automatically, so the controlled server appears in the panel without manual creation

After installation, manage the controlled agent from the VPS with:

```bash
proxy-control-agent              # show menu
proxy-control-agent status       # service status
proxy-control-agent restart      # restart agent
proxy-control-agent log          # live logs
proxy-control-agent config       # edit master URL, token, node name, region, host
proxy-control-agent update       # pull the GitHub installer and update agent
proxy-control-agent uninstall    # uninstall agent
```

`--node-name` and `--region` are display labels chosen during installation. If `--node-host` is omitted, the agent tries to detect the public IP first and falls back to a local interface IP. Agent version is compiled into the binary and reported by heartbeat; bump it on each agent update.

The installer does not download or execute third-party proxy-core installation scripts automatically. Install Xray or sing-box separately before enabling protocol deployment tasks.

## Agent API

The agent reports heartbeat to:

```text
POST /api/agent/heartbeat
Authorization: Bearer <PROXY_CONTROL_AGENT_TOKEN>
```

Set `PROXY_CONTROL_AGENT_TOKEN` on the backend in production. If it is empty, heartbeat auth is relaxed for local development only.
