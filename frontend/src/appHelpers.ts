import type { Locale } from './i18n';

export type ActiveTab = 'gateways' | 'exits' | 'policies' | 'servers' | 'tasks' | 'ai';

export function taskTypeMeta(type: string, copyText: (zh: string, en: string) => string) {
  const map: Record<string, { label: string; desc: string; summary: string }> = {
    sync_config: {
      label: copyText('同步配置', 'Sync Config'),
      desc: copyText('把总控里的入口、出口、策略配置下发到目标节点，让实际流量按最新规则走。', 'Push the latest gateway, exit, and policy config to the target node.'),
      summary: copyText('同步目标节点的最新代理配置', 'Sync the latest proxy config to target node'),
    },
    health_check: {
      label: copyText('健康检查', 'Health Check'),
      desc: copyText('检测出口节点是否可连、延迟是否正常，用于策略调度和故障剔除。', 'Check exit reachability and latency for routing and failover.'),
      summary: copyText('检查目标出口或服务器健康状态', 'Check target exit or server health'),
    },
    reload_core: {
      label: copyText('重载核心', 'Reload Core'),
      desc: copyText('让被控端重新加载 Xray 或 sing-box 配置，通常在协议节点变更后执行。', 'Reload Xray or sing-box config on the agent after node changes.'),
      summary: copyText('重载目标服务器代理核心', 'Reload proxy core on target server'),
    },
    switch_core_version: {
      label: copyText('切换核心版本', 'Switch Core Version'),
      desc: copyText('切换被控端使用的 Xray 或 sing-box 版本，用于升级、回退或兼容测试。', 'Switch Xray or sing-box version for upgrade, rollback, or compatibility tests.'),
      summary: copyText('切换目标服务器核心版本', 'Switch target server core version'),
    },
    deploy_protocol_node: {
      label: copyText('部署协议节点', 'Deploy Protocol Node'),
      desc: copyText('在被控服务器生成协议配置并启动服务。', 'Generate protocol config and start service on the agent server.'),
      summary: copyText('部署自建协议节点', 'Deploy self-hosted protocol node'),
    },
  };
  return map[type] ?? { label: type, desc: copyText('未知任务类型，保留原始值用于兼容。', 'Unknown task type, raw value kept for compatibility.'), summary: type };
}

export function taskTargetLabel(target: string, copyText: (zh: string, en: string) => string) {
  const map: Record<string, string> = {
    gateway: copyText('代理入口', 'Gateway'),
    server: copyText('被控服务器', 'Agent Server'),
    exit: copyText('出口节点', 'Exit Node'),
  };
  return map[target] ?? target;
}

export function panelDesc(active: ActiveTab, copyText: (zh: string, en: string) => string) {
  const map: Record<ActiveTab, string> = {
    gateways: copyText('配置主控对外监听协议和端口', 'Configure master-facing listener protocols and ports'),
    exits: copyText('管理自建协议节点和第三方代理出口', 'Manage self-hosted protocol nodes and external proxy exits'),
    policies: copyText('定义入口流量命中后的出口调度规则', 'Define exit routing rules after entry traffic matches'),
    servers: copyText('纳管被控服务器，安装 Agent 并上报心跳', 'Enroll controlled servers, install agents, and report heartbeat'),
    tasks: copyText('审计安装、部署、同步、检查等执行记录', 'Audit install, deploy, sync, and health-check records'),
    ai: copyText('根据服务器清单生成批量安装和运维草案', 'Draft batch installs and ops from server lists'),
  };
  return map[active];
}

export function taskStatusLabel(status: string, copyText: (zh: string, en: string) => string) {
  const map: Record<string, string> = {
    queued: copyText('排队中', 'Queued'),
    running: copyText('执行中', 'Running'),
    succeeded: copyText('成功', 'Succeeded'),
    failed: copyText('失败', 'Failed'),
  };
  return map[status] ?? status;
}

export function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function shortID(id?: string) {
  return id ? id.slice(0, 8) : '-';
}

export function numberValue(value: string) {
  return Number.parseInt(value, 10) || 0;
}

export function readLocale(): Locale {
  const saved = localStorage.getItem('proxy-control-locale');
  return saved === 'en-US' ? 'en-US' : 'zh-CN';
}
