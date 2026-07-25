# Proxy Control

Go + React + TypeScript + Vite multi-server proxy control panel.

This project is a new management system. It uses mature proxy cores such as Xray or sing-box as the data plane, and focuses on control-plane features:

- servers and agents
- gateway entries
- self-owned and external exits
- routing policies
- task execution records
- traffic and health model hooks

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
go run .
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Default backend address: `http://localhost:8080`.

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

- builds `backend/cmd/agent`
- installs the binary to `/opt/proxy-control-agent/proxy-control-agent`
- writes `/etc/proxy-control/agent.env`
- creates and starts `proxy-control-agent.service`
- detects whether `xray` or `sing-box` already exists
- sends heartbeat to the master automatically, so the controlled server appears in the panel without manual creation

`--node-name` and `--region` are display labels chosen during installation. If `--node-host` is omitted, the agent tries to detect the public IP first and falls back to a local interface IP. Agent version is compiled into the binary and reported by heartbeat; bump it on each agent update.

The installer does not download or execute third-party proxy-core installation scripts automatically. Install Xray or sing-box separately before enabling protocol deployment tasks.

## Agent API

The agent reports heartbeat to:

```text
POST /api/agent/heartbeat
Authorization: Bearer <PROXY_CONTROL_AGENT_TOKEN>
```

Set `PROXY_CONTROL_AGENT_TOKEN` on the backend in production. If it is empty, heartbeat auth is relaxed for local development only.
