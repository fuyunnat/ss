# Proxy Control

Go + React + TypeScript + Vite multi-server proxy control panel.

This project is a new management system. It uses mature proxy cores such as Xray or sing-box as the data plane, and focuses on control-plane features:

- servers and agents
- gateway entries
- self-owned and external exits
- routing policies
- task execution records
- traffic and health model hooks

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

On a controlled Linux server, install from GitHub:

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
