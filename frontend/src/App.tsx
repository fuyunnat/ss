import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  Cable,
  CheckCircle2,
  Clipboard,
  Cpu,
  Database,
  Gauge,
  Globe2,
  Languages,
  Layers3,
  Network,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  RotateCw,
  Route,
  Server,
  Settings2,
  ShieldCheck,
  Trash2,
  Wifi,
  Zap,
} from 'lucide-react';
import { api } from './api';
import { messages, type Locale } from './i18n';
import type { ExitNode, Gateway, Policy, ServerNode, Summary, Task } from './types';

type ActiveTab = 'gateways' | 'exits' | 'policies' | 'servers' | 'tasks';
type ResourceKind = 'server' | 'gateway' | 'exit' | 'policy';
type ProtocolForm = {
  name: string;
  serverId: string;
  core: string;
  protocol: string;
  transport: string;
  security: string;
  port: number;
  domain: string;
  sni: string;
  path: string;
  credential: string;
};

const emptySummary: Summary = { serverCount: 0, gatewayCount: 0, exitCount: 0, policyCount: 0, taskCount: 0, healthyExits: 0 };
const emptyServer: ServerNode = { name: '', host: '', region: '', tags: [], agentVersion: '', status: 'unknown', cpuPercent: 0, memoryMb: 0 };
const emptyGateway: Gateway = { name: '', serverId: '', listenHost: '0.0.0.0', socksPort: 1080, httpPort: 8081, status: 'planned' };
const emptyExit: ExitNode = { name: '', type: 'external_socks5', serverId: '', address: '', port: 1080, username: '', region: '', weight: 100, enabled: true, health: 'unknown', latencyMs: 0, failureRate: 0 };
const emptyPolicy: Policy = { name: '', matchType: 'default', matchValue: '*', strategy: 'health_weighted', exitIds: [], sticky: true, enabled: true };
const emptyTask: Task = { type: 'sync_config', status: 'queued', targetType: 'gateway', targetId: '', summary: '', logs: [] };
const emptyProtocolForm: ProtocolForm = { name: 'hk-vless-01', serverId: '', core: 'xray', protocol: 'vless', transport: 'tcp', security: 'reality', port: 443, domain: '', sni: 'www.cloudflare.com', path: '/', credential: '' };
const protocolPresets = [
  { protocol: 'vless', core: 'xray', security: 'reality', transport: 'tcp', port: 443 },
  { protocol: 'vmess', core: 'xray', security: 'tls', transport: 'ws', port: 443 },
  { protocol: 'trojan', core: 'xray', security: 'tls', transport: 'tcp', port: 443 },
  { protocol: 'shadowsocks', core: 'sing-box', security: 'none', transport: 'tcp', port: 8388 },
  { protocol: 'socks5', core: 'sing-box', security: 'none', transport: 'tcp', port: 1080 },
];

function App() {
  const [locale, setLocaleState] = useState<Locale>(() => readLocale());
  const [active, setActive] = useState<ActiveTab>('gateways');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [servers, setServers] = useState<ServerNode[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [exits, setExits] = useState<ExitNode[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [serverForm, setServerForm] = useState<ServerNode>(emptyServer);
  const [gatewayForm, setGatewayForm] = useState<Gateway>(emptyGateway);
  const [exitForm, setExitForm] = useState<ExitNode>(emptyExit);
  const [policyForm, setPolicyForm] = useState<Policy>(emptyPolicy);
  const [taskForm, setTaskForm] = useState<Task>(emptyTask);
  const [protocolForm, setProtocolForm] = useState<ProtocolForm>(emptyProtocolForm);
  const [serverTagsText, setServerTagsText] = useState('');
  const [policyExitIDsText, setPolicyExitIDsText] = useState('');

  const t = messages[locale];
  const isZh = locale === 'zh-CN';
  const copyText = (zh: string, en: string) => (isZh ? zh : en);
  const installCommand = 'curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh | sudo bash -s -- --master-url http://YOUR-MASTER:8080 --token YOUR_AGENT_TOKEN --node-name hk-01 --region HK';

  const navItems = useMemo(() => [
    { id: 'gateways' as const, label: t.nav.gateways, count: summary.gatewayCount, icon: Network, hint: copyText('入口端口 / 协议', 'Entry ports') },
    { id: 'exits' as const, label: t.nav.exits, count: summary.exitCount, icon: Activity, hint: copyText('自建 / 第三方', 'Owned / external') },
    { id: 'policies' as const, label: t.nav.policies, count: summary.policyCount, icon: Route, hint: copyText('按规则分流', 'Traffic rules') },
    { id: 'servers' as const, label: t.nav.servers, count: summary.serverCount, icon: Server, hint: copyText('Agent 节点', 'Agent nodes') },
    { id: 'tasks' as const, label: t.nav.tasks, count: summary.taskCount, icon: Play, hint: copyText('下发和审计', 'Dispatch log') },
  ], [copyText, summary, t]);

  const activeNav = navItems.find((item) => item.id === active) ?? navItems[0];
  const primaryGateway = gateways[0];
  const primaryPolicy = policies[0];
  const primaryExit = exits.find((item) => item.health === 'healthy') ?? exits[0];
  const latestTask = tasks[0];
  const onlineServers = servers.filter((item) => item.status === 'online').length;
  const enabledExits = exits.filter((item) => item.enabled).length;
  const taskSuccess = tasks.filter((item) => item.status === 'succeeded').length;
  const healthRate = summary.exitCount === 0 ? 0 : Math.round((summary.healthyExits / summary.exitCount) * 100);
  const selectedProtocolServer = servers.find((item) => item.id === protocolForm.serverId);
  const protocolDeploySummary = [
    `${protocolForm.core.toUpperCase()} ${protocolForm.protocol.toUpperCase()}`,
    `${copyText('监听端口', 'listen')} ${protocolForm.port}`,
    `${copyText('传输', 'transport')} ${protocolForm.transport}`,
    `${copyText('安全', 'security')} ${protocolForm.security}`,
    protocolForm.sni ? `SNI ${protocolForm.sni}` : '',
    protocolForm.path && protocolForm.transport !== 'tcp' ? `path ${protocolForm.path}` : '',
  ].filter(Boolean).join(' / ');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [nextSummary, nextServers, nextGateways, nextExits, nextPolicies, nextTasks] = await Promise.all([
        api.summary(), api.servers(), api.gateways(), api.exits(), api.policies(), api.tasks(),
      ]);
      setSummary(nextSummary);
      setServers(nextServers ?? []);
      setGateways(nextGateways ?? []);
      setExits(nextExits ?? []);
      setPolicies(nextPolicies ?? []);
      setTasks(nextTasks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.app.saveFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    localStorage.setItem('proxy-control-locale', next);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? '' : current)), 2200);
  }

  async function withAction(action: () => Promise<void>, successMessage: string) {
    setError('');
    try {
      await action();
      showNotice(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.app.saveFailed);
    }
  }

  async function saveGateway(event: FormEvent) {
    event.preventDefault();
    await withAction(async () => {
      await api.saveGateway(gatewayForm);
      setGatewayForm(emptyGateway);
      await refresh();
    }, t.app.saved);
  }

  async function saveExit(event: FormEvent) {
    event.preventDefault();
    await withAction(async () => {
      await api.saveExit(exitForm);
      setExitForm(emptyExit);
      await refresh();
    }, t.app.saved);
  }

  async function savePolicy(event: FormEvent) {
    event.preventDefault();
    await withAction(async () => {
      await api.savePolicy({ ...policyForm, exitIds: splitList(policyExitIDsText) });
      setPolicyForm(emptyPolicy);
      setPolicyExitIDsText('');
      await refresh();
    }, t.app.saved);
  }

  async function saveServer(event: FormEvent) {
    event.preventDefault();
    await withAction(async () => {
      await api.saveServer({ ...serverForm, tags: splitList(serverTagsText) });
      setServerForm(emptyServer);
      setServerTagsText('');
      await refresh();
    }, t.app.saved);
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    await withAction(async () => {
      await api.createTask({ ...taskForm, logs: [] });
      setTaskForm(emptyTask);
      await refresh();
    }, t.app.taskQueued);
  }

  async function removeItem(kind: ResourceKind, id?: string) {
    if (!id) return;
    await withAction(async () => {
      if (kind === 'server') await api.deleteServer(id);
      if (kind === 'gateway') await api.deleteGateway(id);
      if (kind === 'exit') await api.deleteExit(id);
      if (kind === 'policy') await api.deletePolicy(id);
      await refresh();
    }, t.app.deleted);
  }

  async function runTask(id?: string) {
    if (!id) return;
    await withAction(async () => {
      await api.runTask(id);
      await refresh();
    }, t.app.runDone);
  }

  async function queueTask(type: string, targetType: string, targetId: string, summaryText: string) {
    await withAction(async () => {
      await api.createTask({ type, targetType, targetId, summary: summaryText, status: 'queued', logs: [] });
      await refresh();
    }, t.app.taskQueued);
  }

  async function deployProtocolNode(event: FormEvent) {
    event.preventDefault();
    await withAction(async () => {
      const nodeName = protocolForm.name.trim();
      const address = protocolForm.domain.trim() || selectedProtocolServer?.host || 'pending-agent';
      const savedExit = await api.saveExit({
        ...emptyExit,
        name: nodeName,
        type: `self_${protocolForm.core}_${protocolForm.protocol}`,
        serverId: protocolForm.serverId,
        address,
        port: protocolForm.port,
        username: protocolForm.credential,
        region: selectedProtocolServer?.region ?? '',
        health: 'unknown',
      });
      await api.createTask({
        type: 'deploy_protocol_node',
        targetType: protocolForm.serverId ? 'server' : 'exit',
        targetId: protocolForm.serverId || savedExit.id || '',
        summary: `${copyText('搭建协议节点', 'Deploy protocol node')}: ${nodeName} | ${protocolDeploySummary}`,
        status: 'queued',
        logs: [],
      });
      setExitForm((current) => ({ ...current, serverId: protocolForm.serverId, name: nodeName, type: `self_${protocolForm.core}_${protocolForm.protocol}`, address, port: protocolForm.port }));
      await refresh();
    }, t.app.taskQueued);
  }

  async function copyInstallCommand() {
    await navigator.clipboard?.writeText(installCommand);
    showNotice(t.app.copied);
  }

  return (
    <main className="app-shell">
      <aside className="side-rail">
        <div className="brand-block">
          <div className="brand-mark"><Network size={22} /></div>
          <div>
            <h1>Proxy Control</h1>
            <p>{copyText('总控调度台', 'Control Plane')}</p>
          </div>
        </div>

        <div className="side-status">
          <span>{copyText('控制面', 'Control')}</span>
          <strong>{loading ? copyText('同步中', 'Syncing') : copyText('在线', 'Online')}</strong>
        </div>

        <nav className="nav-list" aria-label={copyText('主导航', 'Primary navigation')}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} type="button" onClick={() => setActive(item.id)}>
                <Icon size={18} />
                <span>
                  <b>{item.label}</b>
                  <small>{item.hint}</small>
                </span>
                <strong>{item.count}</strong>
              </button>
            );
          })}
        </nav>

        <div className="rail-foot">
          <span>{copyText('支持 Xray / sing-box / SOCKS5 / HTTP', 'Xray / sing-box / SOCKS5 / HTTP')}</span>
        </div>
      </aside>

      <section className="main-stage">
        <header className="stage-header">
          <div className="title-stack">
            <span className="section-kicker">{t.app.eyebrow}</span>
            <h2>{t.app.title}</h2>
            <p>{t.app.subtitle}</p>
          </div>
          <div className="header-actions">
            <div className="segmented" aria-label={t.app.language}>
              <button type="button" className={locale === 'zh-CN' ? 'active' : ''} onClick={() => setLocale('zh-CN')}><Languages size={15} />中文</button>
              <button type="button" className={locale === 'en-US' ? 'active' : ''} onClick={() => setLocale('en-US')}>EN</button>
            </div>
            <IconButton label={t.app.refresh} icon={RefreshCcw} disabled={loading} onClick={refresh} />
          </div>
        </header>

        {error && <div className="alert error-alert">{error}</div>}
        {notice && <div className="alert success-alert"><CheckCircle2 size={16} />{notice}</div>}

        <section className="ops-strip">
          <HealthTile icon={Server} label={copyText('在线 Agent', 'Online Agents')} value={`${onlineServers}/${summary.serverCount}`} detail={copyText('被控端心跳', 'Agent heartbeat')} />
          <HealthTile icon={Globe2} label={copyText('可用出口', 'Enabled Exits')} value={`${enabledExits}/${summary.exitCount}`} detail={`${healthRate}% ${copyText('健康率', 'healthy')}`} />
          <HealthTile icon={Layers3} label={copyText('策略数', 'Policies')} value={summary.policyCount} detail={copyText('入口命中后调度', 'Route after entry')} />
          <HealthTile icon={Database} label={copyText('任务完成', 'Tasks Done')} value={`${taskSuccess}/${summary.taskCount}`} detail={copyText('可审计操作流', 'Auditable actions')} />
        </section>

        <section className="traffic-board">
          <TrafficStep icon={Cable} label={t.route.entry} title={primaryGateway?.name ?? t.route.noGateway} meta={primaryGateway ? `${primaryGateway.listenHost}:${primaryGateway.socksPort}` : t.route.gatewayHint} />
          <ArrowRight className="flow-arrow" size={18} />
          <TrafficStep icon={Route} label={t.route.policy} title={primaryPolicy?.name ?? t.route.noPolicy} meta={primaryPolicy ? `${primaryPolicy.matchType} -> ${primaryPolicy.strategy}` : t.route.policyHint} />
          <ArrowRight className="flow-arrow" size={18} />
          <TrafficStep icon={Activity} label={t.route.exit} title={primaryExit?.name ?? t.route.noExit} meta={primaryExit ? `${primaryExit.type} / ${primaryExit.region || '-'}` : t.route.exitHint} />
          <ArrowRight className="flow-arrow" size={18} />
          <TrafficStep icon={ShieldCheck} label={t.route.task} title={latestTask?.status ?? t.route.noTask} meta={latestTask?.summary ?? t.route.taskHint} />
        </section>

        <section className={`control-grid ${active === 'exits' ? 'node-mode' : ''}`}>
          <section className="config-panel">
            <PanelHeader icon={activeNav.icon} title={activeNav.label} desc={copyText('配置、下发、检查都在这里完成', 'Configure, dispatch, and audit here')} />
            {active === 'gateways' && (
              <form className="control-form" onSubmit={saveGateway}>
                <Field label={t.common.name}><input value={gatewayForm.name} onChange={(e) => setGatewayForm({ ...gatewayForm, name: e.target.value })} required placeholder={t.forms.gatewayName} /></Field>
                <Field label={t.forms.serverId}><input value={gatewayForm.serverId} onChange={(e) => setGatewayForm({ ...gatewayForm, serverId: e.target.value })} placeholder={copyText('可为空，后续绑定 Agent', 'Optional until agent binding')} /></Field>
                <div className="form-row three">
                  <Field label={t.forms.listenHost}><input value={gatewayForm.listenHost} onChange={(e) => setGatewayForm({ ...gatewayForm, listenHost: e.target.value })} required /></Field>
                  <Field label={t.forms.socksPort}><input value={gatewayForm.socksPort} onChange={(e) => setGatewayForm({ ...gatewayForm, socksPort: numberValue(e.target.value) })} type="number" min="1" /></Field>
                  <Field label={t.forms.httpPort}><input value={gatewayForm.httpPort} onChange={(e) => setGatewayForm({ ...gatewayForm, httpPort: numberValue(e.target.value) })} type="number" min="1" /></Field>
                </div>
                <FormActions primary={gatewayForm.id ? t.actions.update : t.actions.add} reset={t.actions.reset} onReset={() => setGatewayForm(emptyGateway)} />
              </form>
            )}

            {active === 'exits' && (
              <div className="node-stack">
                <ProtocolBuilder
                  copyText={copyText}
                  form={protocolForm}
                  installCommand={installCommand}
                  presets={protocolPresets}
                  servers={servers}
                  summary={protocolDeploySummary}
                  onChange={setProtocolForm}
                  onSubmit={deployProtocolNode}
                />
                <section className="sub-panel">
                  <div className="sub-panel-head">
                    <strong>{copyText('接入第三方代理', 'Attach External Proxy')}</strong>
                    <span>{copyText('已有 SOCKS5 / HTTP 代理直接登记到出口池', 'Register existing SOCKS5 / HTTP proxies as exits')}</span>
                  </div>
                  <form className="control-form" onSubmit={saveExit}>
                    <Field label={t.common.name}><input value={exitForm.name} onChange={(e) => setExitForm({ ...exitForm, name: e.target.value })} required placeholder={t.forms.exitName} /></Field>
                    <div className="form-row">
                      <Field label={t.common.type}><select value={exitForm.type} onChange={(e) => setExitForm({ ...exitForm, type: e.target.value })}><option>external_socks5</option><option>external_http</option><option>self_xray</option><option>self_singbox</option></select></Field>
                      <Field label={t.forms.region}><input value={exitForm.region} onChange={(e) => setExitForm({ ...exitForm, region: e.target.value })} placeholder={copyText('HK / JP / US', 'HK / JP / US')} /></Field>
                    </div>
                    <div className="form-row">
                      <Field label={t.forms.address}><input value={exitForm.address} onChange={(e) => setExitForm({ ...exitForm, address: e.target.value })} required placeholder="proxy.example.com" /></Field>
                      <Field label={t.forms.port}><input value={exitForm.port} onChange={(e) => setExitForm({ ...exitForm, port: numberValue(e.target.value) })} required type="number" min="1" /></Field>
                    </div>
                    <Field label={t.forms.weight}><input value={exitForm.weight} onChange={(e) => setExitForm({ ...exitForm, weight: numberValue(e.target.value) })} type="number" min="1" /></Field>
                    <FormActions primary={exitForm.id ? t.actions.update : t.actions.add} reset={t.actions.reset} onReset={() => setExitForm(emptyExit)} />
                  </form>
                </section>
              </div>
            )}

            {active === 'policies' && (
              <form className="control-form" onSubmit={savePolicy}>
                <Field label={t.common.name}><input value={policyForm.name} onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })} required placeholder={t.forms.policyName} /></Field>
                <div className="form-row">
                  <Field label={t.common.match}><select value={policyForm.matchType} onChange={(e) => setPolicyForm({ ...policyForm, matchType: e.target.value })}><option>default</option><option>user</option><option>domain</option><option>cidr</option><option>region</option></select></Field>
                  <Field label={t.common.strategy}><select value={policyForm.strategy} onChange={(e) => setPolicyForm({ ...policyForm, strategy: e.target.value })}><option>fixed</option><option>weighted</option><option>health_weighted</option><option>cost_first</option></select></Field>
                </div>
                <Field label={t.forms.matchValue}><input value={policyForm.matchValue} onChange={(e) => setPolicyForm({ ...policyForm, matchValue: e.target.value })} placeholder={t.forms.matchValue} /></Field>
                <Field label={t.forms.exitIds}><input value={policyExitIDsText} onChange={(e) => setPolicyExitIDsText(e.target.value)} placeholder={copyText('exit-a, exit-b', 'exit-a, exit-b')} /></Field>
                <FormActions primary={policyForm.id ? t.actions.update : t.actions.add} reset={t.actions.reset} onReset={() => { setPolicyForm(emptyPolicy); setPolicyExitIDsText(''); }} />
              </form>
            )}

            {active === 'servers' && (
              <>
                <div className="install-card">
                  <div>
                    <strong>{t.install.title}</strong>
                    <span>{t.install.hint}</span>
                  </div>
                  <code>{installCommand}</code>
                  <button className="secondary-button full" type="button" onClick={copyInstallCommand}><Clipboard size={16} />{t.actions.copy}</button>
                </div>
                <form className="control-form" onSubmit={saveServer}>
                  <Field label={t.common.name}><input value={serverForm.name} onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })} required placeholder={t.forms.serverName} /></Field>
                  <Field label={t.forms.host}><input value={serverForm.host} onChange={(e) => setServerForm({ ...serverForm, host: e.target.value })} required placeholder={t.forms.host} /></Field>
                  <div className="form-row">
                    <Field label={t.forms.region}><input value={serverForm.region} onChange={(e) => setServerForm({ ...serverForm, region: e.target.value })} placeholder="HK" /></Field>
                    <Field label={t.forms.agentVersion}><input value={serverForm.agentVersion} onChange={(e) => setServerForm({ ...serverForm, agentVersion: e.target.value })} placeholder="0.1.0" /></Field>
                  </div>
                  <Field label={t.forms.tags}><input value={serverTagsText} onChange={(e) => setServerTagsText(e.target.value)} placeholder={t.forms.tags} /></Field>
                  <FormActions primary={serverForm.id ? t.actions.update : t.actions.add} reset={t.actions.reset} onReset={() => { setServerForm(emptyServer); setServerTagsText(''); }} />
                </form>
              </>
            )}

            {active === 'tasks' && (
              <form className="control-form" onSubmit={createTask}>
                <div className="form-row">
                  <Field label={t.common.type}><select value={taskForm.type} onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}><option>sync_config</option><option>health_check</option><option>reload_core</option><option>switch_core_version</option></select></Field>
                  <Field label={t.common.target}><select value={taskForm.targetType} onChange={(e) => setTaskForm({ ...taskForm, targetType: e.target.value })}><option>gateway</option><option>server</option><option>exit</option></select></Field>
                </div>
                <Field label={t.forms.targetId}><input value={taskForm.targetId} onChange={(e) => setTaskForm({ ...taskForm, targetId: e.target.value })} placeholder={t.forms.targetId} /></Field>
                <Field label={t.forms.taskSummary}><input value={taskForm.summary} onChange={(e) => setTaskForm({ ...taskForm, summary: e.target.value })} required placeholder={t.forms.taskSummary} /></Field>
                <FormActions primary={t.actions.add} reset={t.actions.reset} onReset={() => setTaskForm(emptyTask)} />
              </form>
            )}
          </section>

          <section className="data-panel">
            <div className="panel-toolbar">
              <div>
                <span>{loading ? t.app.loading : activeNav.hint}</span>
                <strong>{activeNav.label}</strong>
              </div>
              <button className="secondary-button compact" type="button" onClick={refresh}><RefreshCcw size={15} />{t.app.refresh}</button>
            </div>
            {active === 'gateways' && (
              <DataTable headers={[t.common.name, t.common.endpoint, t.common.status, t.common.operations]} empty={gateways.length === 0 ? t.common.empty : ''}>
                {gateways.map((item) => <DataRow key={item.id} title={item.name} detail={`${item.listenHost} | SOCKS ${item.socksPort} | HTTP ${item.httpPort}`} status={item.status} actions={<>
                  <IconButton label={t.actions.edit} onClick={() => setGatewayForm(item)} icon={Pencil} />
                  <IconButton label={t.actions.queueSync} onClick={() => queueTask('sync_config', 'gateway', item.id ?? '', `${t.actions.queueSync}: ${item.name}`)} icon={RotateCw} />
                  <IconButton danger label={t.actions.delete} onClick={() => removeItem('gateway', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'exits' && (
              <DataTable headers={[t.common.name, t.common.type, t.common.endpoint, t.common.operations]} empty={exits.length === 0 ? t.common.empty : ''}>
                {exits.map((item) => <DataRow key={item.id} title={item.name} detail={`${item.type} | ${item.region || '-'} | weight ${item.weight}`} status={item.health || `${item.address}:${item.port}`} good={item.health === 'healthy'} actions={<>
                  <IconButton label={t.actions.edit} onClick={() => setExitForm(item)} icon={Pencil} />
                  <IconButton label={t.actions.queueHealth} onClick={() => queueTask('health_check', 'exit', item.id ?? '', `${t.actions.queueHealth}: ${item.name}`)} icon={ShieldCheck} />
                  <IconButton danger label={t.actions.delete} onClick={() => removeItem('exit', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'policies' && (
              <DataTable headers={[t.common.name, t.common.match, t.common.strategy, t.common.operations]} empty={policies.length === 0 ? t.common.empty : ''}>
                {policies.map((item) => <DataRow key={item.id} title={item.name} detail={`${item.matchType}: ${item.matchValue || '*'}`} status={`${item.strategy} / ${item.sticky ? 'sticky' : 'stateless'}`} actions={<>
                  <IconButton label={t.actions.edit} onClick={() => { setPolicyForm(item); setPolicyExitIDsText(item.exitIds.join(', ')); }} icon={Pencil} />
                  <IconButton danger label={t.actions.delete} onClick={() => removeItem('policy', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'servers' && (
              <DataTable headers={[t.common.name, t.forms.host, t.common.status, t.common.operations]} empty={servers.length === 0 ? t.common.empty : ''}>
                {servers.map((item) => <DataRow key={item.id} title={item.name} detail={`${item.host} | ${item.region || '-'} | agent ${item.agentVersion || '-'}`} status={item.status} good={item.status === 'online'} actions={<>
                  <IconButton label={t.actions.edit} onClick={() => { setServerForm(item); setServerTagsText(item.tags.join(', ')); }} icon={Pencil} />
                  <IconButton label={t.actions.queueReload} onClick={() => queueTask('reload_core', 'server', item.id ?? '', `${t.actions.queueReload}: ${item.name}`)} icon={RotateCw} />
                  <IconButton danger label={t.actions.delete} onClick={() => removeItem('server', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'tasks' && (
              <DataTable headers={[t.common.details, t.common.type, t.common.status, t.common.operations]} empty={tasks.length === 0 ? t.common.empty : ''}>
                {tasks.map((item) => <DataRow key={item.id} title={item.summary} detail={`${item.type} | ${item.targetType} | ${shortID(item.targetId)}`} status={item.status} good={item.status === 'succeeded'} actions={<IconButton label={t.actions.run} onClick={() => runTask(item.id)} icon={Play} />} />)}
              </DataTable>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

function ProtocolBuilder({
  copyText,
  form,
  installCommand,
  presets,
  servers,
  summary,
  onChange,
  onSubmit,
}: {
  copyText: (zh: string, en: string) => string;
  form: ProtocolForm;
  installCommand: string;
  presets: typeof protocolPresets;
  servers: ServerNode[];
  summary: string;
  onChange: (next: ProtocolForm) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const update = (patch: Partial<ProtocolForm>) => onChange({ ...form, ...patch });

  return (
    <section className="protocol-builder">
      <div className="builder-head">
        <div>
          <span>{copyText('自建协议节点', 'Self-hosted Protocol Node')}</span>
          <strong>{copyText('选服务器、选协议、生成部署任务', 'Pick server, protocol, and dispatch a deploy task')}</strong>
        </div>
        <StatusBadge value={copyText('可下发', 'ready')} good />
      </div>

      <div className="build-steps">
        <StepItem index="1" title={copyText('安装 Agent', 'Install Agent')} text={copyText('先在 VPS 执行被控端脚本', 'Run the agent installer on the VPS')} />
        <StepItem index="2" title={copyText('选择协议', 'Choose Protocol')} text={copyText('VLESS / VMess / Trojan / SS / SOCKS5', 'VLESS / VMess / Trojan / SS / SOCKS5')} />
        <StepItem index="3" title={copyText('下发核心', 'Deploy Core')} text={copyText('生成 Xray 或 sing-box 配置任务', 'Generate Xray or sing-box config task')} />
        <StepItem index="4" title={copyText('接入策略', 'Route Traffic')} text={copyText('保存为出口后给策略引用', 'Saved exit can be referenced by policies')} />
      </div>

      <div className="preset-grid">
        {presets.map((preset) => (
          <button
            key={`${preset.protocol}-${preset.core}-${preset.security}`}
            className={form.protocol === preset.protocol && form.core === preset.core && form.security === preset.security ? 'preset active' : 'preset'}
            type="button"
            onClick={() => update({ ...preset })}
          >
            <strong>{preset.protocol.toUpperCase()}</strong>
            <span>{preset.core} / {preset.security} / {preset.transport}</span>
          </button>
        ))}
      </div>

      <form className="control-form" onSubmit={onSubmit}>
        <div className="form-row">
          <Field label={copyText('节点名称', 'Node Name')}><input value={form.name} onChange={(e) => update({ name: e.target.value })} required placeholder="hk-vless-01" /></Field>
          <Field label={copyText('被控服务器', 'Agent Server')}>
            <select value={form.serverId} onChange={(e) => update({ serverId: e.target.value })}>
              <option value="">{copyText('先选择 Agent，没有就先安装', 'Choose an agent, install one first if empty')}</option>
              {servers.map((server) => <option key={server.id} value={server.id}>{server.name} / {server.host}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-row three">
          <Field label={copyText('核心', 'Core')}><select value={form.core} onChange={(e) => update({ core: e.target.value })}><option>xray</option><option>sing-box</option></select></Field>
          <Field label={copyText('协议', 'Protocol')}><select value={form.protocol} onChange={(e) => update({ protocol: e.target.value })}><option>vless</option><option>vmess</option><option>trojan</option><option>shadowsocks</option><option>socks5</option></select></Field>
          <Field label={copyText('端口', 'Port')}><input value={form.port} onChange={(e) => update({ port: numberValue(e.target.value) })} type="number" min="1" required /></Field>
        </div>
        <div className="form-row three">
          <Field label={copyText('传输', 'Transport')}><select value={form.transport} onChange={(e) => update({ transport: e.target.value })}><option>tcp</option><option>ws</option><option>grpc</option><option>httpupgrade</option></select></Field>
          <Field label={copyText('TLS / Reality', 'TLS / Reality')}><select value={form.security} onChange={(e) => update({ security: e.target.value })}><option>reality</option><option>tls</option><option>none</option></select></Field>
          <Field label="SNI"><input value={form.sni} onChange={(e) => update({ sni: e.target.value })} placeholder="www.cloudflare.com" /></Field>
        </div>
        <div className="form-row three">
          <Field label={copyText('域名或出口地址', 'Domain / Exit Address')}><input value={form.domain} onChange={(e) => update({ domain: e.target.value })} placeholder={copyText('留空则使用服务器 IP', 'Blank uses server IP')} /></Field>
          <Field label={copyText('路径', 'Path')}><input value={form.path} onChange={(e) => update({ path: e.target.value })} placeholder="/proxy" /></Field>
          <Field label={copyText('UUID / 密码', 'UUID / Password')}><input value={form.credential} onChange={(e) => update({ credential: e.target.value })} placeholder={copyText('留空由 Agent 生成', 'Blank lets agent generate')} /></Field>
        </div>

        <div className="deploy-preview">
          <span>{copyText('将创建部署任务', 'Deploy task preview')}</span>
          <strong>{summary}</strong>
          <code>{installCommand}</code>
        </div>

        <div className="form-actions">
          <button className="primary-button" type="submit"><Zap size={17} />{copyText('保存出口并下发部署任务', 'Save Exit And Queue Deploy')}</button>
          <button className="secondary-button" type="button" onClick={() => onChange(emptyProtocolForm)}>{copyText('恢复默认', 'Reset')}</button>
        </div>
      </form>
    </section>
  );
}

function StepItem({ index, title, text }: { index: string; title: string; text: string }) {
  return <article className="step-item"><b>{index}</b><strong>{title}</strong><span>{text}</span></article>;
}

function HealthTile({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string | number; detail: string }) {
  return <article className="health-tile"><Icon size={18} /><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function TrafficStep({ icon: Icon, label, title, meta }: { icon: LucideIcon; label: string; title: string; meta: string }) {
  return <article className="traffic-step"><Icon size={18} /><span>{label}</span><strong>{title}</strong><small>{meta}</small></article>;
}

function PanelHeader({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return <header className="panel-head"><Icon size={18} /><div><h3>{title}</h3><span>{desc}</span></div></header>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function FormActions({ primary, reset, onReset }: { primary: string; reset: string; onReset: () => void }) {
  return <div className="form-actions"><button className="primary-button" type="submit"><Plus size={17} />{primary}</button><button className="secondary-button" type="button" onClick={onReset}>{reset}</button></div>;
}

function DataTable({ headers, empty, children }: { headers: string[]; empty: string; children: ReactNode }) {
  return <div className="data-table"><div className="data-row head">{headers.map((header) => <span key={header}>{header}</span>)}</div>{empty ? <div className="empty-state"><Wifi size={20} /><strong>{empty}</strong></div> : children}</div>;
}

function DataRow({ title, detail, status, good = false, actions }: { title: string; detail: string; status: string; good?: boolean; actions: ReactNode }) {
  return <div className="data-row"><strong>{title}</strong><span>{detail}</span><StatusBadge value={status} good={good} /><div className="row-actions">{actions}</div></div>;
}

function StatusBadge({ value, good = false }: { value: string; good?: boolean }) {
  const tone = good || value === 'online' || value === 'healthy' || value === 'succeeded' ? 'good' : value === 'failed' || value === 'offline' ? 'bad' : 'neutral';
  return <em className={`status-badge ${tone}`}>{value}</em>;
}

function IconButton({ label, onClick, icon: Icon, danger = false, disabled = false }: { label: string; onClick: () => void; icon: LucideIcon; danger?: boolean; disabled?: boolean }) {
  return <button className={`icon-button ${danger ? 'danger' : ''}`} type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}><Icon size={15} /></button>;
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function shortID(id?: string) {
  return id ? id.slice(0, 8) : '-';
}

function numberValue(value: string) {
  return Number.parseInt(value, 10) || 0;
}

function readLocale(): Locale {
  const saved = localStorage.getItem('proxy-control-locale');
  return saved === 'en-US' ? 'en-US' : 'zh-CN';
}

export default App;
