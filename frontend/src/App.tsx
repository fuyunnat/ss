import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Cable,
  CheckCircle2,
  Clipboard,
  Languages,
  Network,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  RotateCw,
  Route,
  Server,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import { api } from './api';
import { messages, type Locale } from './i18n';
import type { ExitNode, Gateway, Policy, ServerNode, Summary, Task } from './types';

type ActiveTab = 'gateways' | 'exits' | 'policies' | 'servers' | 'tasks';
type ResourceKind = 'server' | 'gateway' | 'exit' | 'policy';

const emptySummary: Summary = { serverCount: 0, gatewayCount: 0, exitCount: 0, policyCount: 0, taskCount: 0, healthyExits: 0 };
const emptyServer: ServerNode = { name: '', host: '', region: '', tags: [], agentVersion: '', status: 'unknown', cpuPercent: 0, memoryMb: 0 };
const emptyGateway: Gateway = { name: '', serverId: '', listenHost: '0.0.0.0', socksPort: 1080, httpPort: 8081, status: 'planned' };
const emptyExit: ExitNode = { name: '', type: 'external_socks5', serverId: '', address: '', port: 1080, username: '', region: '', weight: 100, enabled: true, health: 'unknown', latencyMs: 0, failureRate: 0 };
const emptyPolicy: Policy = { name: '', matchType: 'default', matchValue: '*', strategy: 'health_weighted', exitIds: [], sticky: true, enabled: true };
const emptyTask: Task = { type: 'sync_config', status: 'queued', targetType: 'gateway', targetId: '', summary: '', logs: [] };

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
  const [serverTagsText, setServerTagsText] = useState('');
  const [policyExitIDsText, setPolicyExitIDsText] = useState('');

  const t = messages[locale];
  const installCommand = 'curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh | sudo bash -s -- --master-url http://YOUR-MASTER:8080 --token YOUR_AGENT_TOKEN --node-name hk-01 --region HK';

  const navItems = useMemo(() => [
    { id: 'gateways' as const, label: t.nav.gateways, count: summary.gatewayCount, icon: Network },
    { id: 'exits' as const, label: t.nav.exits, count: summary.exitCount, icon: Activity },
    { id: 'policies' as const, label: t.nav.policies, count: summary.policyCount, icon: Route },
    { id: 'servers' as const, label: t.nav.servers, count: summary.serverCount, icon: Server },
    { id: 'tasks' as const, label: t.nav.tasks, count: summary.taskCount, icon: Play },
  ], [summary, t]);

  const primaryGateway = gateways[0];
  const primaryPolicy = policies[0];
  const primaryExit = exits.find((item) => item.health === 'healthy') ?? exits[0];
  const latestTask = tasks[0];

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

  async function copyInstallCommand() {
    await navigator.clipboard?.writeText(installCommand);
    showNotice(t.app.copied);
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">PC</div>
          <div>
            <h1>Proxy Control</h1>
            <p>Gateway / Agent / Exit</p>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`nav-button ${active === item.id ? 'active' : ''}`} type="button" onClick={() => setActive(item.id)}>
                <Icon size={18} />
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t.app.eyebrow}</p>
            <h2>{t.app.title}</h2>
            <p className="subhead">{t.app.subtitle}</p>
          </div>
          <div className="toolbar">
            <div className="segmented" aria-label={t.app.language}>
              <button type="button" className={locale === 'zh-CN' ? 'active' : ''} onClick={() => setLocale('zh-CN')}><Languages size={15} />中文</button>
              <button type="button" className={locale === 'en-US' ? 'active' : ''} onClick={() => setLocale('en-US')}>EN</button>
            </div>
            <button className="icon-button" type="button" disabled={loading} title={t.app.refresh} aria-label={t.app.refresh} onClick={refresh}>
              <RefreshCcw size={18} />
            </button>
          </div>
        </header>

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice"><CheckCircle2 size={16} />{notice}</p>}

        <section className="route-strip">
          <RouteCard icon={Cable} label={t.route.entry} title={primaryGateway?.name ?? t.route.noGateway} detail={primaryGateway ? `${primaryGateway.listenHost}:${primaryGateway.socksPort}` : t.route.gatewayHint} />
          <RouteCard icon={Route} label={t.route.policy} title={primaryPolicy?.name ?? t.route.noPolicy} detail={primaryPolicy ? `${primaryPolicy.matchType} -> ${primaryPolicy.strategy}` : t.route.policyHint} />
          <RouteCard icon={Activity} label={t.route.exit} title={primaryExit?.name ?? t.route.noExit} detail={primaryExit ? `${primaryExit.type} ${primaryExit.address}:${primaryExit.port}` : t.route.exitHint} />
          <RouteCard icon={ShieldCheck} label={t.route.task} title={latestTask?.status ?? t.route.noTask} detail={latestTask?.summary ?? t.route.taskHint} />
        </section>

        <section className="metrics">
          <Metric label={t.metrics.servers} value={summary.serverCount} />
          <Metric label={t.metrics.gateways} value={summary.gatewayCount} />
          <Metric label={t.metrics.exits} value={summary.exitCount} />
          <Metric label={t.metrics.healthyExits} value={summary.healthyExits} />
          <Metric label={t.metrics.policyCount} value={summary.policyCount} compact />
          <Metric label={t.metrics.taskCount} value={summary.taskCount} compact />
        </section>

        <section className="work-grid">
          <aside className="command-panel">
            {active === 'gateways' && (
              <>
                <PanelHead title={t.sections.gatewaysTitle} desc={t.sections.gatewaysDesc} />
                <form className="stack-form" onSubmit={saveGateway}>
                  <input value={gatewayForm.name} onChange={(e) => setGatewayForm({ ...gatewayForm, name: e.target.value })} required placeholder={t.forms.gatewayName} />
                  <input value={gatewayForm.serverId} onChange={(e) => setGatewayForm({ ...gatewayForm, serverId: e.target.value })} placeholder={t.forms.serverId} />
                  <div className="inline-fields three">
                    <input value={gatewayForm.listenHost} onChange={(e) => setGatewayForm({ ...gatewayForm, listenHost: e.target.value })} required placeholder={t.forms.listenHost} />
                    <input value={gatewayForm.socksPort} onChange={(e) => setGatewayForm({ ...gatewayForm, socksPort: numberValue(e.target.value) })} type="number" min="1" placeholder={t.forms.socksPort} />
                    <input value={gatewayForm.httpPort} onChange={(e) => setGatewayForm({ ...gatewayForm, httpPort: numberValue(e.target.value) })} type="number" min="1" placeholder={t.forms.httpPort} />
                  </div>
                  <FormActions primary={gatewayForm.id ? t.actions.update : t.actions.add} reset={t.actions.reset} onReset={() => setGatewayForm(emptyGateway)} />
                </form>
              </>
            )}

            {active === 'exits' && (
              <>
                <PanelHead title={t.sections.exitsTitle} desc={t.sections.exitsDesc} />
                <form className="stack-form" onSubmit={saveExit}>
                  <input value={exitForm.name} onChange={(e) => setExitForm({ ...exitForm, name: e.target.value })} required placeholder={t.forms.exitName} />
                  <select value={exitForm.type} onChange={(e) => setExitForm({ ...exitForm, type: e.target.value })}><option>external_socks5</option><option>external_http</option><option>self_xray</option><option>self_singbox</option></select>
                  <div className="inline-fields">
                    <input value={exitForm.address} onChange={(e) => setExitForm({ ...exitForm, address: e.target.value })} required placeholder={t.forms.address} />
                    <input value={exitForm.port} onChange={(e) => setExitForm({ ...exitForm, port: numberValue(e.target.value) })} required type="number" min="1" placeholder={t.forms.port} />
                  </div>
                  <div className="inline-fields">
                    <input value={exitForm.region} onChange={(e) => setExitForm({ ...exitForm, region: e.target.value })} placeholder={t.forms.region} />
                    <input value={exitForm.weight} onChange={(e) => setExitForm({ ...exitForm, weight: numberValue(e.target.value) })} type="number" min="1" placeholder={t.forms.weight} />
                  </div>
                  <FormActions primary={exitForm.id ? t.actions.update : t.actions.add} reset={t.actions.reset} onReset={() => setExitForm(emptyExit)} />
                </form>
              </>
            )}

            {active === 'policies' && (
              <>
                <PanelHead title={t.sections.policiesTitle} desc={t.sections.policiesDesc} />
                <form className="stack-form" onSubmit={savePolicy}>
                  <input value={policyForm.name} onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })} required placeholder={t.forms.policyName} />
                  <div className="inline-fields">
                    <select value={policyForm.matchType} onChange={(e) => setPolicyForm({ ...policyForm, matchType: e.target.value })}><option>default</option><option>user</option><option>domain</option><option>cidr</option><option>region</option></select>
                    <select value={policyForm.strategy} onChange={(e) => setPolicyForm({ ...policyForm, strategy: e.target.value })}><option>fixed</option><option>weighted</option><option>health_weighted</option><option>cost_first</option></select>
                  </div>
                  <input value={policyForm.matchValue} onChange={(e) => setPolicyForm({ ...policyForm, matchValue: e.target.value })} placeholder={t.forms.matchValue} />
                  <input value={policyExitIDsText} onChange={(e) => setPolicyExitIDsText(e.target.value)} placeholder={t.forms.exitIds} />
                  <FormActions primary={policyForm.id ? t.actions.update : t.actions.add} reset={t.actions.reset} onReset={() => { setPolicyForm(emptyPolicy); setPolicyExitIDsText(''); }} />
                </form>
              </>
            )}

            {active === 'servers' && (
              <>
                <PanelHead title={t.sections.serversTitle} desc={t.sections.serversDesc} />
                <div className="install-box">
                  <b>{t.install.title}</b>
                  <p>{t.install.hint}</p>
                  <code>{installCommand}</code>
                  <button className="ghost full" type="button" onClick={copyInstallCommand}><Clipboard size={16} />{t.actions.copy}</button>
                </div>
                <form className="stack-form" onSubmit={saveServer}>
                  <input value={serverForm.name} onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })} required placeholder={t.forms.serverName} />
                  <input value={serverForm.host} onChange={(e) => setServerForm({ ...serverForm, host: e.target.value })} required placeholder={t.forms.host} />
                  <div className="inline-fields">
                    <input value={serverForm.region} onChange={(e) => setServerForm({ ...serverForm, region: e.target.value })} placeholder={t.forms.region} />
                    <input value={serverForm.agentVersion} onChange={(e) => setServerForm({ ...serverForm, agentVersion: e.target.value })} placeholder={t.forms.agentVersion} />
                  </div>
                  <input value={serverTagsText} onChange={(e) => setServerTagsText(e.target.value)} placeholder={t.forms.tags} />
                  <FormActions primary={serverForm.id ? t.actions.update : t.actions.add} reset={t.actions.reset} onReset={() => { setServerForm(emptyServer); setServerTagsText(''); }} />
                </form>
              </>
            )}

            {active === 'tasks' && (
              <>
                <PanelHead title={t.sections.tasksTitle} desc={t.sections.tasksDesc} />
                <form className="stack-form" onSubmit={createTask}>
                  <select value={taskForm.type} onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}><option>sync_config</option><option>health_check</option><option>reload_core</option><option>switch_core_version</option></select>
                  <select value={taskForm.targetType} onChange={(e) => setTaskForm({ ...taskForm, targetType: e.target.value })}><option>gateway</option><option>server</option><option>exit</option></select>
                  <input value={taskForm.targetId} onChange={(e) => setTaskForm({ ...taskForm, targetId: e.target.value })} placeholder={t.forms.targetId} />
                  <input value={taskForm.summary} onChange={(e) => setTaskForm({ ...taskForm, summary: e.target.value })} required placeholder={t.forms.taskSummary} />
                  <FormActions primary={t.actions.add} reset={t.actions.reset} onReset={() => setTaskForm(emptyTask)} />
                </form>
              </>
            )}
          </aside>

          <section className="data-panel">
            <div className="table-actions">
              <span>{loading ? t.app.loading : navItems.find((item) => item.id === active)?.label}</span>
              <button className="ghost small" type="button" onClick={refresh}><RefreshCcw size={15} />{t.app.refresh}</button>
            </div>
            {active === 'gateways' && (
              <DataTable headers={[t.common.name, t.common.endpoint, t.common.status, t.common.operations]} empty={gateways.length === 0 ? t.common.empty : ''}>
                {gateways.map((item) => <DataRow key={item.id} title={item.name} detail={`${item.listenHost} | SOCKS ${item.socksPort} | HTTP ${item.httpPort}`} status={item.status} actions={<>
                  <IconAction label={t.actions.edit} onClick={() => setGatewayForm(item)} icon={Pencil} />
                  <IconAction label={t.actions.queueSync} onClick={() => queueTask('sync_config', 'gateway', item.id ?? '', `${t.actions.queueSync}: ${item.name}`)} icon={RotateCw} />
                  <IconAction danger label={t.actions.delete} onClick={() => removeItem('gateway', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'exits' && (
              <DataTable headers={[t.common.name, t.common.type, t.common.endpoint, t.common.operations]} empty={exits.length === 0 ? t.common.empty : ''}>
                {exits.map((item) => <DataRow key={item.id} title={item.name} detail={`${item.type} | ${item.region || '-'} | weight ${item.weight}`} status={`${item.address}:${item.port}`} good={item.health === 'healthy'} actions={<>
                  <IconAction label={t.actions.edit} onClick={() => setExitForm(item)} icon={Pencil} />
                  <IconAction label={t.actions.queueHealth} onClick={() => queueTask('health_check', 'exit', item.id ?? '', `${t.actions.queueHealth}: ${item.name}`)} icon={ShieldCheck} />
                  <IconAction danger label={t.actions.delete} onClick={() => removeItem('exit', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'policies' && (
              <DataTable headers={[t.common.name, t.common.match, t.common.strategy, t.common.operations]} empty={policies.length === 0 ? t.common.empty : ''}>
                {policies.map((item) => <DataRow key={item.id} title={item.name} detail={`${item.matchType}: ${item.matchValue || '*'}`} status={`${item.strategy} / ${item.sticky ? 'sticky' : 'stateless'}`} actions={<>
                  <IconAction label={t.actions.edit} onClick={() => { setPolicyForm(item); setPolicyExitIDsText(item.exitIds.join(', ')); }} icon={Pencil} />
                  <IconAction danger label={t.actions.delete} onClick={() => removeItem('policy', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'servers' && (
              <DataTable headers={[t.common.name, t.forms.host, t.common.status, t.common.operations]} empty={servers.length === 0 ? t.common.empty : ''}>
                {servers.map((item) => <DataRow key={item.id} title={item.name} detail={`${item.host} | ${item.region || '-'} | agent ${item.agentVersion || '-'}`} status={item.status} good={item.status === 'online'} actions={<>
                  <IconAction label={t.actions.edit} onClick={() => { setServerForm(item); setServerTagsText(item.tags.join(', ')); }} icon={Pencil} />
                  <IconAction label={t.actions.queueReload} onClick={() => queueTask('reload_core', 'server', item.id ?? '', `${t.actions.queueReload}: ${item.name}`)} icon={RotateCw} />
                  <IconAction danger label={t.actions.delete} onClick={() => removeItem('server', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'tasks' && (
              <DataTable headers={[t.common.details, t.common.type, t.common.status, t.common.operations]} empty={tasks.length === 0 ? t.common.empty : ''}>
                {tasks.map((item) => <DataRow key={item.id} title={item.summary} detail={`${item.type} | ${item.targetType} | ${shortID(item.targetId)}`} status={item.status} actions={<IconAction label={t.actions.run} onClick={() => runTask(item.id)} icon={Play} />} />)}
              </DataTable>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

function RouteCard({ icon: Icon, label, title, detail }: { icon: typeof Cable; label: string; title: string; detail: string }) {
  return <article><Icon size={20} /><span>{label}</span><strong>{title}</strong><small>{detail}</small></article>;
}

function Metric({ label, value, compact = false }: { label: string; value: number; compact?: boolean }) {
  return <div className={`metric ${compact ? 'compact' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

function PanelHead({ title, desc }: { title: string; desc: string }) {
  return <div className="panel-head compact-head"><h3>{title}</h3><span>{desc}</span></div>;
}

function FormActions({ primary, reset, onReset }: { primary: string; reset: string; onReset: () => void }) {
  return <div className="form-actions"><button className="primary" type="submit"><Plus size={17} />{primary}</button><button className="ghost" type="button" onClick={onReset}>{reset}</button></div>;
}

function DataTable({ headers, empty, children }: { headers: string[]; empty: string; children: React.ReactNode }) {
  return <div className="data-table"><div className="data-row head">{headers.map((header) => <span key={header}>{header}</span>)}</div>{empty ? <p className="empty">{empty}</p> : children}</div>;
}

function DataRow({ title, detail, status, good = false, actions }: { title: string; detail: string; status: string; good?: boolean; actions: React.ReactNode }) {
  return <div className="data-row"><strong>{title}</strong><span>{detail}</span><em className={good ? 'good' : ''}>{status}</em><div className="row-actions">{actions}</div></div>;
}

function IconAction({ label, onClick, icon: Icon, danger = false }: { label: string; onClick: () => void; icon: typeof Zap; danger?: boolean }) {
  return <button className={`icon-button ${danger ? 'danger' : ''}`} type="button" title={label} aria-label={label} onClick={onClick}><Icon size={15} /></button>;
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
