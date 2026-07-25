import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  CheckCircle2,
  Database,
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
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react';
import { api } from './api';
import { AgentAutoOnline } from './components/AgentAutoOnline';
import { BeginnerFlow } from './components/BeginnerFlow';
import { ProtocolBuilder } from './components/ProtocolBuilder';
import { Field, StatusBadge } from './components/ui';
import { messages, type Locale } from './i18n';
import { policyMatchMeta, policyMatchOptions, policyMatchSummary, policyStrategyMeta, policyStrategyOptions } from './policyOptions';
import { createProtocolForm, protocolPresets } from './protocolDefaults';
import type { ExitNode, Gateway, Policy, ProtocolForm, ServerNode, Summary, Task } from './types';

type ActiveTab = 'gateways' | 'exits' | 'policies' | 'servers' | 'tasks';
type ResourceKind = 'server' | 'gateway' | 'exit' | 'policy';

const emptySummary: Summary = { serverCount: 0, gatewayCount: 0, exitCount: 0, policyCount: 0, taskCount: 0, healthyExits: 0 };
const emptyGateway: Gateway = { name: '', serverId: '', listenHost: '0.0.0.0', socksPort: 1080, httpPort: 8081, status: 'planned' };
const emptyExit: ExitNode = { name: '', type: 'external_socks5', serverId: '', address: '', port: 1080, username: '', region: '', weight: 100, enabled: true, health: 'unknown', latencyMs: 0, failureRate: 0 };
const emptyPolicy: Policy = { name: '', matchType: 'default', matchValue: '*', strategy: 'health_weighted', exitIds: [], sticky: true, enabled: true };
const emptyTask: Task = { type: 'sync_config', status: 'queued', targetType: 'gateway', targetId: '', summary: '', logs: [] };
const taskTypes = ['sync_config', 'health_check', 'reload_core', 'switch_core_version'];
const taskTargets = ['gateway', 'server', 'exit'];

function App() {
  const [locale, setLocaleState] = useState<Locale>(() => readLocale());
  const [active, setActive] = useState<ActiveTab>('servers');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [servers, setServers] = useState<ServerNode[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [exits, setExits] = useState<ExitNode[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [gatewayForm, setGatewayForm] = useState<Gateway>(emptyGateway);
  const [exitForm, setExitForm] = useState<ExitNode>(emptyExit);
  const [policyForm, setPolicyForm] = useState<Policy>(emptyPolicy);
  const [taskForm, setTaskForm] = useState<Task>(emptyTask);
  const [protocolForm, setProtocolForm] = useState<ProtocolForm>(() => createProtocolForm());
  const [policyExitIDsText, setPolicyExitIDsText] = useState('');

  const t = messages[locale];
  const isZh = locale === 'zh-CN';
  const copyText = (zh: string, en: string) => (isZh ? zh : en);
  const installCommand = 'curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh | sudo bash -s -- --master-url http://YOUR-MASTER:8080 --token YOUR_AGENT_TOKEN --node-name hk-01 --region HK';

  const navItems = useMemo(() => [
    { id: 'servers' as const, label: t.nav.servers, count: summary.serverCount, icon: Server, hint: copyText('Agent 接入', 'Agent enroll') },
    { id: 'exits' as const, label: t.nav.exits, count: summary.exitCount, icon: Activity, hint: copyText('协议节点', 'Protocol nodes') },
    { id: 'gateways' as const, label: t.nav.gateways, count: summary.gatewayCount, icon: Network, hint: copyText('入口监听', 'Listeners') },
    { id: 'policies' as const, label: t.nav.policies, count: summary.policyCount, icon: Route, hint: copyText('流量调度', 'Traffic routing') },
    { id: 'tasks' as const, label: t.nav.tasks, count: summary.taskCount, icon: Play, hint: copyText('任务审计', 'Task audit') },
  ], [copyText, summary, t]);

  const activeNav = navItems.find((item) => item.id === active) ?? navItems[0];
  const onlineServers = servers.filter((item) => item.status === 'online').length;
  const enabledExits = exits.filter((item) => item.enabled).length;
  const taskSuccess = tasks.filter((item) => item.status === 'succeeded').length;
  const healthRate = summary.exitCount === 0 ? 0 : Math.round((summary.healthyExits / summary.exitCount) * 100);
  const selectedTaskType = taskTypeMeta(taskForm.type, copyText);
  const selectedTaskTarget = taskTargetLabel(taskForm.targetType, copyText);
  const selectedPolicyMatch = policyMatchMeta(policyForm.matchType, copyText);
  const selectedPolicyStrategy = policyStrategyMeta(policyForm.strategy, copyText);
  const selectedProtocolServer = servers.find((item) => item.id === protocolForm.serverId);
  const protocolDeploySummary = [
    `${protocolForm.core.toUpperCase()} ${protocolForm.protocol.toUpperCase()}`,
    `${copyText('监听端口', 'listen')} ${protocolForm.port}`,
    protocolForm.listenIp ? `${copyText('监听', 'listen IP')} ${protocolForm.listenIp}` : '',
    protocolForm.protocol === 'dokodemo-door' ? `${copyText('目标', 'target')} ${protocolForm.targetAddress || '-'}:${protocolForm.targetPort || '-'}` : `${copyText('传输', 'transport')} ${protocolForm.transport}`,
    protocolForm.protocol === 'dokodemo-door' ? `${copyText('网络', 'network')} ${protocolForm.network}` : `${copyText('安全', 'security')} ${protocolForm.security}`,
    protocolForm.protocol !== 'dokodemo-door' && protocolForm.sni ? `SNI ${protocolForm.sni}` : '',
    protocolForm.protocol !== 'dokodemo-door' && protocolForm.path && protocolForm.transport !== 'tcp' ? `path ${protocolForm.path}` : '',
    protocolForm.totalGb > 0 ? `${copyText('流量', 'traffic')} ${protocolForm.totalGb}GB` : '',
    protocolForm.expiryDate ? `${copyText('到期', 'expiry')} ${protocolForm.expiryDate}` : '',
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

  useEffect(() => {
    if (!protocolForm.serverId && servers.length > 0) {
      setProtocolForm((current) => current.serverId ? current : { ...current, serverId: servers[0].id ?? '' });
    }
  }, [protocolForm.serverId, servers]);

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
      if (!protocolForm.serverId) {
        throw new Error(copyText('先安装被控服务器，在线后再创建节点', 'Install an agent first, then create a node'));
      }
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
        enabled: protocolForm.enabled,
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

        <BeginnerFlow
          copyText={copyText}
          onlineServers={onlineServers}
          exitCount={summary.exitCount}
          onOpenServers={() => setActive('servers')}
          onOpenNodes={() => setActive('exits')}
          onOpenTasks={() => setActive('tasks')}
        />

        <section className="ops-strip">
          <HealthTile icon={Server} label={copyText('在线 Agent', 'Online Agents')} value={`${onlineServers}/${summary.serverCount}`} detail={copyText('被控端心跳', 'Agent heartbeat')} />
          <HealthTile icon={Globe2} label={copyText('可用出口', 'Enabled Exits')} value={`${enabledExits}/${summary.exitCount}`} detail={`${healthRate}% ${copyText('健康率', 'healthy')}`} />
          <HealthTile icon={Layers3} label={copyText('策略数', 'Policies')} value={summary.policyCount} detail={copyText('入口命中后调度', 'Route after entry')} />
          <HealthTile icon={Database} label={copyText('任务完成', 'Tasks Done')} value={`${taskSuccess}/${summary.taskCount}`} detail={copyText('可审计操作流', 'Auditable actions')} />
        </section>

        <section className={`control-grid ${active === 'exits' ? 'node-mode' : ''} ${active === 'servers' ? 'setup-mode' : ''}`}>
          <section className="config-panel">
            <PanelHeader icon={activeNav.icon} title={activeNav.label} desc={panelDesc(active, copyText)} />
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
                  presets={protocolPresets}
                  servers={servers}
                  summary={protocolDeploySummary}
                  onChange={setProtocolForm}
                  onSubmit={deployProtocolNode}
                  onReset={() => setProtocolForm(createProtocolForm())}
                />
                <details className="sub-panel advanced-side">
                  <summary>{copyText('高级：接入第三方代理', 'Advanced: attach external proxy')}</summary>
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
                </details>
              </div>
            )}

            {active === 'policies' && (
              <form className="control-form" onSubmit={savePolicy}>
                <div className="task-guide">
                  <strong>{selectedPolicyStrategy.label}</strong>
                  <span>{selectedPolicyMatch.hint}</span>
                  <small>{copyText('不确定就保持默认：全部流量 + 自动选择健康出口。', 'If unsure, keep the default: all traffic + healthy automatic routing.')}</small>
                </div>
                <Field label={copyText('规则名称', 'Rule Name')}><input value={policyForm.name} onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })} required placeholder={copyText('例如：默认出口规则', 'e.g. Default exit rule')} /></Field>
                <div className="form-row">
                  <Field label={copyText('适用流量', 'Traffic Scope')}>
                    <select value={policyForm.matchType} onChange={(e) => setPolicyForm({ ...policyForm, matchType: e.target.value, matchValue: e.target.value === 'default' ? '*' : policyForm.matchValue === '*' ? '' : policyForm.matchValue })}>
                      {policyMatchOptions(copyText).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </Field>
                  <Field label={copyText('出口选择', 'Exit Selection')}>
                    <select value={policyForm.strategy} onChange={(e) => setPolicyForm({ ...policyForm, strategy: e.target.value })}>
                      {policyStrategyOptions(copyText).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </Field>
                </div>
                {policyForm.matchType !== 'default' && (
                  <Field label={selectedPolicyMatch.valueLabel}><input value={policyForm.matchValue === '*' ? '' : policyForm.matchValue} onChange={(e) => setPolicyForm({ ...policyForm, matchValue: e.target.value })} required placeholder={selectedPolicyMatch.placeholder} /></Field>
                )}
                <details className="advanced-box">
                  <summary>{copyText('高级：指定出口节点', 'Advanced: pin exit nodes')}</summary>
                  <Field label={copyText('出口 ID，可选', 'Exit IDs, optional')}><input value={policyExitIDsText} onChange={(e) => setPolicyExitIDsText(e.target.value)} placeholder={copyText('留空使用所有可用出口；多个出口用逗号分隔', 'Blank uses all enabled exits; comma-separated IDs')} /></Field>
                </details>
                <FormActions primary={policyForm.id ? t.actions.update : t.actions.add} reset={t.actions.reset} onReset={() => { setPolicyForm(emptyPolicy); setPolicyExitIDsText(''); }} />
              </form>
            )}

            {active === 'servers' && (
              <AgentAutoOnline
                copyText={copyText}
                installCommand={installCommand}
                onCopied={copyInstallCommand}
                onInstalled={refresh}
                onNotice={showNotice}
                onError={setError}
              />
            )}

            {active === 'tasks' && (
              <form className="control-form" onSubmit={createTask}>
                <div className="task-guide">
                  <strong>{selectedTaskType.label}</strong>
                  <span>{selectedTaskType.desc}</span>
                  <small>{copyText('作用目标', 'Target scope')}: {selectedTaskTarget}</small>
                </div>
                <div className="form-row">
                  <Field label={t.common.type}>
                    <select value={taskForm.type} onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value, summary: taskForm.summary || taskTypeMeta(e.target.value, copyText).summary })}>
                      {taskTypes.map((type) => <option key={type} value={type}>{taskTypeMeta(type, copyText).label}</option>)}
                    </select>
                  </Field>
                  <Field label={t.common.target}>
                    <select value={taskForm.targetType} onChange={(e) => setTaskForm({ ...taskForm, targetType: e.target.value })}>
                      {taskTargets.map((target) => <option key={target} value={target}>{taskTargetLabel(target, copyText)}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label={t.forms.targetId}><input value={taskForm.targetId} onChange={(e) => setTaskForm({ ...taskForm, targetId: e.target.value })} placeholder={t.forms.targetId} /></Field>
                <Field label={t.forms.taskSummary}><input value={taskForm.summary} onChange={(e) => setTaskForm({ ...taskForm, summary: e.target.value })} required placeholder={selectedTaskType.summary} /></Field>
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
                {policies.map((item) => <DataRow key={item.id} title={item.name} detail={policyMatchSummary(item, copyText)} status={policyStrategyMeta(item.strategy, copyText).label} actions={<>
                  <IconButton label={t.actions.edit} onClick={() => { setPolicyForm(item); setPolicyExitIDsText(item.exitIds.join(', ')); }} icon={Pencil} />
                  <IconButton danger label={t.actions.delete} onClick={() => removeItem('policy', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'servers' && (
              <DataTable headers={[t.common.name, t.forms.host, t.common.status, t.common.operations]} empty={servers.length === 0 ? t.common.empty : ''}>
                {servers.map((item) => <DataRow key={item.id} title={item.name} detail={`${item.host} | ${item.region || '-'} | agent ${item.agentVersion || '-'}`} status={item.status} good={item.status === 'online'} actions={<>
                  <IconButton label={t.actions.queueReload} onClick={() => queueTask('reload_core', 'server', item.id ?? '', `${t.actions.queueReload}: ${item.name}`)} icon={RotateCw} />
                  <IconButton danger label={t.actions.delete} onClick={() => removeItem('server', item.id)} icon={Trash2} />
                </>} />)}
              </DataTable>
            )}
            {active === 'tasks' && (
              <DataTable headers={[t.common.details, t.common.type, t.common.status, t.common.operations]} empty={tasks.length === 0 ? t.common.empty : ''}>
                {tasks.map((item) => <DataRow key={item.id} title={item.summary} detail={`${taskTypeMeta(item.type, copyText).label} | ${taskTargetLabel(item.targetType, copyText)} | ${shortID(item.targetId)}`} status={taskStatusLabel(item.status, copyText)} good={item.status === 'succeeded'} actions={<IconButton label={t.actions.run} onClick={() => runTask(item.id)} icon={Play} />} />)}
              </DataTable>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

function HealthTile({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string | number; detail: string }) {
  return <article className="health-tile"><Icon size={18} /><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function PanelHeader({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return <header className="panel-head"><Icon size={18} /><div><h3>{title}</h3><span>{desc}</span></div></header>;
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

function IconButton({ label, onClick, icon: Icon, danger = false, disabled = false }: { label: string; onClick: () => void; icon: LucideIcon; danger?: boolean; disabled?: boolean }) {
  return <button className={`icon-button ${danger ? 'danger' : ''}`} type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}><Icon size={15} /></button>;
}

function taskTypeMeta(type: string, copyText: (zh: string, en: string) => string) {
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

function taskTargetLabel(target: string, copyText: (zh: string, en: string) => string) {
  const map: Record<string, string> = {
    gateway: copyText('代理入口', 'Gateway'),
    server: copyText('被控服务器', 'Agent Server'),
    exit: copyText('出口节点', 'Exit Node'),
  };
  return map[target] ?? target;
}

function panelDesc(active: ActiveTab, copyText: (zh: string, en: string) => string) {
  const map: Record<ActiveTab, string> = {
    servers: copyText('通过 SSH 安装 Agent，心跳成功后自动进入被控列表', 'Install the agent over SSH; heartbeat registers it automatically'),
    exits: copyText('按协议模板生成入站配置并创建部署任务', 'Create protocol inbounds and queue deployment tasks'),
    gateways: copyText('配置客户端连接入口和监听端口', 'Configure client-facing listeners and ports'),
    policies: copyText('定义入口流量到出口池的调度规则', 'Define routing rules from entries to exits'),
    tasks: copyText('安装、部署、重载、检查的执行记录', 'Install, deploy, reload, and health-check records'),
  };
  return map[active];
}

function taskStatusLabel(status: string, copyText: (zh: string, en: string) => string) {
  const map: Record<string, string> = {
    queued: copyText('排队中', 'Queued'),
    running: copyText('执行中', 'Running'),
    succeeded: copyText('成功', 'Succeeded'),
    failed: copyText('失败', 'Failed'),
  };
  return map[status] ?? status;
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
