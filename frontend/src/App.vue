<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
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
} from '@lucide/vue';
import { api } from './api';
import { messages, type Locale } from './i18n';
import type { ExitNode, Gateway, Policy, ServerNode, Summary, Task } from './types';

type ActiveTab = 'gateways' | 'exits' | 'policies' | 'servers' | 'tasks';

const loading = ref(false);
const error = ref('');
const notice = ref('');
const active = ref<ActiveTab>('gateways');
const locale = ref<Locale>((localStorage.getItem('proxy-control-locale') as Locale) || 'zh-CN');
const summary = ref<Summary>({ serverCount: 0, gatewayCount: 0, exitCount: 0, policyCount: 0, taskCount: 0, healthyExits: 0 });
const servers = ref<ServerNode[]>([]);
const gateways = ref<Gateway[]>([]);
const exits = ref<ExitNode[]>([]);
const policies = ref<Policy[]>([]);
const tasks = ref<Task[]>([]);
const serverTagsText = ref('');
const policyExitIDsText = ref('');

const serverForm = reactive<ServerNode>({ name: '', host: '', region: '', tags: [], agentVersion: '', status: 'unknown', cpuPercent: 0, memoryMb: 0 });
const gatewayForm = reactive<Gateway>({ name: '', serverId: '', listenHost: '0.0.0.0', socksPort: 1080, httpPort: 8081, status: 'planned' });
const exitForm = reactive<ExitNode>({ name: '', type: 'external_socks5', serverId: '', address: '', port: 1080, username: '', region: '', weight: 100, enabled: true, health: 'unknown', latencyMs: 0, failureRate: 0 });
const policyForm = reactive<Policy>({ name: '', matchType: 'default', matchValue: '*', strategy: 'health_weighted', exitIds: [], sticky: true, enabled: true });
const taskForm = reactive<Task>({ type: 'sync_config', status: 'queued', targetType: 'gateway', targetId: '', summary: '', logs: [] });

const t = computed(() => messages[locale.value]);
const primaryGateway = computed(() => gateways.value[0]);
const primaryExit = computed(() => exits.value.find((item) => item.health === 'healthy') ?? exits.value[0]);
const primaryPolicy = computed(() => policies.value[0]);
const latestTask = computed(() => tasks.value[0]);
const installCommand = computed(() => 'curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh | sudo bash -s -- --master-url http://YOUR-MASTER:8080 --token YOUR_AGENT_TOKEN --node-name hk-01 --region HK');

const navItems = computed(() => [
  { id: 'gateways', label: t.value.nav.gateways, count: summary.value.gatewayCount, icon: Network },
  { id: 'exits', label: t.value.nav.exits, count: summary.value.exitCount, icon: Activity },
  { id: 'policies', label: t.value.nav.policies, count: summary.value.policyCount, icon: Route },
  { id: 'servers', label: t.value.nav.servers, count: summary.value.serverCount, icon: Server },
  { id: 'tasks', label: t.value.nav.tasks, count: summary.value.taskCount, icon: Play },
] as const);

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const [nextSummary, nextServers, nextGateways, nextExits, nextPolicies, nextTasks] = await Promise.all([
      api.summary(), api.servers(), api.gateways(), api.exits(), api.policies(), api.tasks(),
    ]);
    summary.value = nextSummary;
    servers.value = nextServers;
    gateways.value = nextGateways;
    exits.value = nextExits;
    policies.value = nextPolicies;
    tasks.value = nextTasks;
  } catch (err) {
    error.value = err instanceof Error ? err.message : t.value.app.saveFailed;
  } finally {
    loading.value = false;
  }
}

function setLocale(next: Locale) {
  locale.value = next;
  localStorage.setItem('proxy-control-locale', next);
}

function showNotice(message: string) {
  notice.value = message;
  window.setTimeout(() => {
    if (notice.value === message) notice.value = '';
  }, 2200);
}

async function saveServer() {
  await withAction(async () => {
    await api.saveServer({ ...serverForm, tags: splitList(serverTagsText.value) });
    resetServer();
    await refresh();
  }, t.value.app.saved);
}

async function saveGateway() {
  await withAction(async () => {
    await api.saveGateway({ ...gatewayForm });
    resetGateway();
    await refresh();
  }, t.value.app.saved);
}

async function saveExit() {
  await withAction(async () => {
    await api.saveExit({ ...exitForm });
    resetExit();
    await refresh();
  }, t.value.app.saved);
}

async function savePolicy() {
  await withAction(async () => {
    await api.savePolicy({ ...policyForm, exitIds: splitList(policyExitIDsText.value) });
    resetPolicy();
    await refresh();
  }, t.value.app.saved);
}

async function createTask() {
  await withAction(async () => {
    await api.createTask({ ...taskForm, logs: [] });
    resetTask();
    await refresh();
  }, t.value.app.taskQueued);
}

async function removeItem(kind: 'server' | 'gateway' | 'exit' | 'policy', id?: string) {
  if (!id) return;
  await withAction(async () => {
    if (kind === 'server') await api.deleteServer(id);
    if (kind === 'gateway') await api.deleteGateway(id);
    if (kind === 'exit') await api.deleteExit(id);
    if (kind === 'policy') await api.deletePolicy(id);
    await refresh();
  }, t.value.app.deleted);
}

async function runTask(id?: string) {
  if (!id) return;
  await withAction(async () => {
    await api.runTask(id);
    await refresh();
  }, t.value.app.runDone);
}

async function queueTask(type: string, targetType: string, targetId: string, summaryText: string) {
  await withAction(async () => {
    await api.createTask({ type, targetType, targetId, summary: summaryText, status: 'queued', logs: [] });
    await refresh();
  }, t.value.app.taskQueued);
}

async function copyInstallCommand() {
  await navigator.clipboard?.writeText(installCommand.value);
  showNotice(t.value.app.copied);
}

async function withAction(action: () => Promise<void>, successMessage: string) {
  error.value = '';
  try {
    await action();
    showNotice(successMessage);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t.value.app.saveFailed;
  }
}

function editGateway(item: Gateway) {
  Object.assign(gatewayForm, item);
  active.value = 'gateways';
}

function editExit(item: ExitNode) {
  Object.assign(exitForm, item);
  active.value = 'exits';
}

function editPolicy(item: Policy) {
  Object.assign(policyForm, item);
  policyExitIDsText.value = item.exitIds.join(', ');
  active.value = 'policies';
}

function editServer(item: ServerNode) {
  Object.assign(serverForm, item);
  serverTagsText.value = item.tags.join(', ');
  active.value = 'servers';
}

function resetGateway() {
  Object.assign(gatewayForm, { id: undefined, name: '', serverId: '', listenHost: '0.0.0.0', socksPort: 1080, httpPort: 8081, status: 'planned' });
}

function resetExit() {
  Object.assign(exitForm, { id: undefined, name: '', type: 'external_socks5', serverId: '', address: '', port: 1080, username: '', region: '', weight: 100, enabled: true, health: 'unknown', latencyMs: 0, failureRate: 0 });
}

function resetPolicy() {
  Object.assign(policyForm, { id: undefined, name: '', matchType: 'default', matchValue: '*', strategy: 'health_weighted', exitIds: [], sticky: true, enabled: true });
  policyExitIDsText.value = '';
}

function resetServer() {
  Object.assign(serverForm, { id: undefined, name: '', host: '', region: '', tags: [], agentVersion: '', status: 'unknown', cpuPercent: 0, memoryMb: 0 });
  serverTagsText.value = '';
}

function resetTask() {
  Object.assign(taskForm, { id: undefined, type: 'sync_config', status: 'queued', targetType: 'gateway', targetId: '', summary: '', logs: [] });
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function shortID(id?: string) {
  return id ? id.slice(0, 8) : '-';
}

onMounted(refresh);
</script>

<template>
  <main class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="mark">PC</div>
        <div>
          <h1>Proxy Control</h1>
          <p>Gateway / Agent / Exit</p>
        </div>
      </div>
      <nav>
        <button v-for="item in navItems" :key="item.id" class="nav-button" :class="{ active: active === item.id }" type="button" @click="active = item.id">
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
          <strong>{{ item.count }}</strong>
        </button>
      </nav>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ t.app.eyebrow }}</p>
          <h2>{{ t.app.title }}</h2>
          <p class="subhead">{{ t.app.subtitle }}</p>
        </div>
        <div class="toolbar">
          <div class="segmented" :aria-label="t.app.language">
            <button type="button" :class="{ active: locale === 'zh-CN' }" @click="setLocale('zh-CN')"><Languages :size="15" />中文</button>
            <button type="button" :class="{ active: locale === 'en-US' }" @click="setLocale('en-US')">EN</button>
          </div>
          <button class="icon-button" type="button" :disabled="loading" :title="t.app.refresh" :aria-label="t.app.refresh" @click="refresh">
            <RefreshCcw :size="18" />
          </button>
        </div>
      </header>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="notice" class="notice"><CheckCircle2 :size="16" />{{ notice }}</p>

      <section class="route-strip">
        <article>
          <Cable :size="20" />
          <span>{{ t.route.entry }}</span>
          <strong>{{ primaryGateway?.name ?? t.route.noGateway }}</strong>
          <small>{{ primaryGateway ? `${primaryGateway.listenHost}:${primaryGateway.socksPort}` : t.route.gatewayHint }}</small>
        </article>
        <article>
          <Route :size="20" />
          <span>{{ t.route.policy }}</span>
          <strong>{{ primaryPolicy?.name ?? t.route.noPolicy }}</strong>
          <small>{{ primaryPolicy ? `${primaryPolicy.matchType} -> ${primaryPolicy.strategy}` : t.route.policyHint }}</small>
        </article>
        <article>
          <Activity :size="20" />
          <span>{{ t.route.exit }}</span>
          <strong>{{ primaryExit?.name ?? t.route.noExit }}</strong>
          <small>{{ primaryExit ? `${primaryExit.type} ${primaryExit.address}:${primaryExit.port}` : t.route.exitHint }}</small>
        </article>
        <article>
          <ShieldCheck :size="20" />
          <span>{{ t.route.task }}</span>
          <strong>{{ latestTask?.status ?? t.route.noTask }}</strong>
          <small>{{ latestTask?.summary ?? t.route.taskHint }}</small>
        </article>
      </section>

      <section class="metrics">
        <div class="metric"><span>{{ t.metrics.servers }}</span><strong>{{ summary.serverCount }}</strong></div>
        <div class="metric"><span>{{ t.metrics.gateways }}</span><strong>{{ summary.gatewayCount }}</strong></div>
        <div class="metric"><span>{{ t.metrics.exits }}</span><strong>{{ summary.exitCount }}</strong></div>
        <div class="metric"><span>{{ t.metrics.healthyExits }}</span><strong>{{ summary.healthyExits }}</strong></div>
        <div class="metric compact"><span>{{ t.metrics.policyCount }}</span><strong>{{ summary.policyCount }}</strong></div>
        <div class="metric compact"><span>{{ t.metrics.taskCount }}</span><strong>{{ summary.taskCount }}</strong></div>
      </section>

      <section class="work-grid">
        <aside class="command-panel">
          <template v-if="active === 'gateways'">
            <div class="panel-head compact-head"><h3>{{ t.sections.gatewaysTitle }}</h3><span>{{ t.sections.gatewaysDesc }}</span></div>
            <form class="stack-form" @submit.prevent="saveGateway">
              <input v-model.trim="gatewayForm.name" required :placeholder="t.forms.gatewayName" />
              <input v-model.trim="gatewayForm.serverId" :placeholder="t.forms.serverId" />
              <div class="inline-fields">
                <input v-model.trim="gatewayForm.listenHost" required :placeholder="t.forms.listenHost" />
                <input v-model.number="gatewayForm.socksPort" type="number" min="1" :placeholder="t.forms.socksPort" />
                <input v-model.number="gatewayForm.httpPort" type="number" min="1" :placeholder="t.forms.httpPort" />
              </div>
              <div class="form-actions">
                <button class="primary" type="submit"><Plus :size="17" />{{ gatewayForm.id ? t.actions.update : t.actions.add }}</button>
                <button class="ghost" type="button" @click="resetGateway">{{ t.actions.reset }}</button>
              </div>
            </form>
          </template>

          <template v-if="active === 'exits'">
            <div class="panel-head compact-head"><h3>{{ t.sections.exitsTitle }}</h3><span>{{ t.sections.exitsDesc }}</span></div>
            <form class="stack-form" @submit.prevent="saveExit">
              <input v-model.trim="exitForm.name" required :placeholder="t.forms.exitName" />
              <select v-model="exitForm.type"><option>external_socks5</option><option>external_http</option><option>self_xray</option><option>self_singbox</option></select>
              <div class="inline-fields">
                <input v-model.trim="exitForm.address" required :placeholder="t.forms.address" />
                <input v-model.number="exitForm.port" required type="number" min="1" :placeholder="t.forms.port" />
              </div>
              <div class="inline-fields">
                <input v-model.trim="exitForm.region" :placeholder="t.forms.region" />
                <input v-model.number="exitForm.weight" type="number" min="1" :placeholder="t.forms.weight" />
              </div>
              <div class="form-actions">
                <button class="primary" type="submit"><Plus :size="17" />{{ exitForm.id ? t.actions.update : t.actions.add }}</button>
                <button class="ghost" type="button" @click="resetExit">{{ t.actions.reset }}</button>
              </div>
            </form>
          </template>

          <template v-if="active === 'policies'">
            <div class="panel-head compact-head"><h3>{{ t.sections.policiesTitle }}</h3><span>{{ t.sections.policiesDesc }}</span></div>
            <form class="stack-form" @submit.prevent="savePolicy">
              <input v-model.trim="policyForm.name" required :placeholder="t.forms.policyName" />
              <div class="inline-fields">
                <select v-model="policyForm.matchType"><option>default</option><option>user</option><option>domain</option><option>cidr</option><option>region</option></select>
                <select v-model="policyForm.strategy"><option>fixed</option><option>weighted</option><option>health_weighted</option><option>cost_first</option></select>
              </div>
              <input v-model.trim="policyForm.matchValue" :placeholder="t.forms.matchValue" />
              <input v-model="policyExitIDsText" :placeholder="t.forms.exitIds" />
              <div class="form-actions">
                <button class="primary" type="submit"><Plus :size="17" />{{ policyForm.id ? t.actions.update : t.actions.add }}</button>
                <button class="ghost" type="button" @click="resetPolicy">{{ t.actions.reset }}</button>
              </div>
            </form>
          </template>

          <template v-if="active === 'servers'">
            <div class="panel-head compact-head"><h3>{{ t.sections.serversTitle }}</h3><span>{{ t.sections.serversDesc }}</span></div>
            <div class="install-box">
              <b>{{ t.install.title }}</b>
              <p>{{ t.install.hint }}</p>
              <code>{{ installCommand }}</code>
              <button class="ghost full" type="button" @click="copyInstallCommand"><Clipboard :size="16" />{{ t.actions.copy }}</button>
            </div>
            <form class="stack-form" @submit.prevent="saveServer">
              <input v-model.trim="serverForm.name" required :placeholder="t.forms.serverName" />
              <input v-model.trim="serverForm.host" required :placeholder="t.forms.host" />
              <div class="inline-fields">
                <input v-model.trim="serverForm.region" :placeholder="t.forms.region" />
                <input v-model.trim="serverForm.agentVersion" :placeholder="t.forms.agentVersion" />
              </div>
              <input v-model="serverTagsText" :placeholder="t.forms.tags" />
              <div class="form-actions">
                <button class="primary" type="submit"><Plus :size="17" />{{ serverForm.id ? t.actions.update : t.actions.add }}</button>
                <button class="ghost" type="button" @click="resetServer">{{ t.actions.reset }}</button>
              </div>
            </form>
          </template>

          <template v-if="active === 'tasks'">
            <div class="panel-head compact-head"><h3>{{ t.sections.tasksTitle }}</h3><span>{{ t.sections.tasksDesc }}</span></div>
            <form class="stack-form" @submit.prevent="createTask">
              <select v-model="taskForm.type"><option>sync_config</option><option>health_check</option><option>reload_core</option><option>switch_core_version</option></select>
              <select v-model="taskForm.targetType"><option>gateway</option><option>server</option><option>exit</option></select>
              <input v-model.trim="taskForm.targetId" :placeholder="t.forms.targetId" />
              <input v-model.trim="taskForm.summary" required :placeholder="t.forms.taskSummary" />
              <div class="form-actions">
                <button class="primary" type="submit"><Plus :size="17" />{{ t.actions.add }}</button>
                <button class="ghost" type="button" @click="resetTask">{{ t.actions.reset }}</button>
              </div>
            </form>
          </template>
        </aside>

        <section class="data-panel">
          <div class="table-actions">
            <span v-if="loading">{{ t.app.loading }}</span>
            <span v-else>{{ navItems.find((item) => item.id === active)?.label }}</span>
            <button class="ghost small" type="button" @click="refresh"><RefreshCcw :size="15" />{{ t.app.refresh }}</button>
          </div>

          <div v-if="active === 'gateways'" class="data-table">
            <div class="data-row head"><span>{{ t.common.name }}</span><span>{{ t.common.endpoint }}</span><span>{{ t.common.status }}</span><span>{{ t.common.operations }}</span></div>
            <p v-if="gateways.length === 0" class="empty">{{ t.common.empty }}</p>
            <div v-for="item in gateways" :key="item.id" class="data-row">
              <strong>{{ item.name }}</strong>
              <span>{{ item.listenHost }} | SOCKS {{ item.socksPort }} | HTTP {{ item.httpPort }}</span>
              <em>{{ item.status }}</em>
              <div class="row-actions">
                <button class="icon-button" type="button" :title="t.actions.edit" :aria-label="t.actions.edit" @click="editGateway(item)"><Pencil :size="15" /></button>
                <button class="icon-button" type="button" :title="t.actions.queueSync" :aria-label="t.actions.queueSync" @click="queueTask('sync_config', 'gateway', item.id ?? '', `${t.actions.queueSync}: ${item.name}`)"><RotateCw :size="15" /></button>
                <button class="icon-button danger" type="button" :title="t.actions.delete" :aria-label="t.actions.delete" @click="removeItem('gateway', item.id)"><Trash2 :size="15" /></button>
              </div>
            </div>
          </div>

          <div v-if="active === 'exits'" class="data-table">
            <div class="data-row head"><span>{{ t.common.name }}</span><span>{{ t.common.type }}</span><span>{{ t.common.endpoint }}</span><span>{{ t.common.operations }}</span></div>
            <p v-if="exits.length === 0" class="empty">{{ t.common.empty }}</p>
            <div v-for="item in exits" :key="item.id" class="data-row">
              <strong>{{ item.name }}</strong>
              <span>{{ item.type }} | {{ item.region || '-' }} | weight {{ item.weight }}</span>
              <em :class="{ good: item.health === 'healthy' }">{{ item.address }}:{{ item.port }}</em>
              <div class="row-actions">
                <button class="icon-button" type="button" :title="t.actions.edit" :aria-label="t.actions.edit" @click="editExit(item)"><Pencil :size="15" /></button>
                <button class="icon-button" type="button" :title="t.actions.queueHealth" :aria-label="t.actions.queueHealth" @click="queueTask('health_check', 'exit', item.id ?? '', `${t.actions.queueHealth}: ${item.name}`)"><ShieldCheck :size="15" /></button>
                <button class="icon-button danger" type="button" :title="t.actions.delete" :aria-label="t.actions.delete" @click="removeItem('exit', item.id)"><Trash2 :size="15" /></button>
              </div>
            </div>
          </div>

          <div v-if="active === 'policies'" class="data-table">
            <div class="data-row head"><span>{{ t.common.name }}</span><span>{{ t.common.match }}</span><span>{{ t.common.strategy }}</span><span>{{ t.common.operations }}</span></div>
            <p v-if="policies.length === 0" class="empty">{{ t.common.empty }}</p>
            <div v-for="item in policies" :key="item.id" class="data-row">
              <strong>{{ item.name }}</strong>
              <span>{{ item.matchType }}: {{ item.matchValue || '*' }}</span>
              <em>{{ item.strategy }} / {{ item.sticky ? 'sticky' : 'stateless' }}</em>
              <div class="row-actions">
                <button class="icon-button" type="button" :title="t.actions.edit" :aria-label="t.actions.edit" @click="editPolicy(item)"><Pencil :size="15" /></button>
                <button class="icon-button danger" type="button" :title="t.actions.delete" :aria-label="t.actions.delete" @click="removeItem('policy', item.id)"><Trash2 :size="15" /></button>
              </div>
            </div>
          </div>

          <div v-if="active === 'servers'" class="data-table">
            <div class="data-row head"><span>{{ t.common.name }}</span><span>{{ t.forms.host }}</span><span>{{ t.common.status }}</span><span>{{ t.common.operations }}</span></div>
            <p v-if="servers.length === 0" class="empty">{{ t.common.empty }}</p>
            <div v-for="item in servers" :key="item.id" class="data-row">
              <strong>{{ item.name }}</strong>
              <span>{{ item.host }} | {{ item.region || '-' }} | agent {{ item.agentVersion || '-' }}</span>
              <em :class="{ good: item.status === 'online' }">{{ item.status }}</em>
              <div class="row-actions">
                <button class="icon-button" type="button" :title="t.actions.edit" :aria-label="t.actions.edit" @click="editServer(item)"><Pencil :size="15" /></button>
                <button class="icon-button" type="button" :title="t.actions.queueReload" :aria-label="t.actions.queueReload" @click="queueTask('reload_core', 'server', item.id ?? '', `${t.actions.queueReload}: ${item.name}`)"><RotateCw :size="15" /></button>
                <button class="icon-button danger" type="button" :title="t.actions.delete" :aria-label="t.actions.delete" @click="removeItem('server', item.id)"><Trash2 :size="15" /></button>
              </div>
            </div>
          </div>

          <div v-if="active === 'tasks'" class="data-table">
            <div class="data-row head"><span>{{ t.common.details }}</span><span>{{ t.common.type }}</span><span>{{ t.common.status }}</span><span>{{ t.common.operations }}</span></div>
            <p v-if="tasks.length === 0" class="empty">{{ t.common.empty }}</p>
            <div v-for="item in tasks" :key="item.id" class="data-row">
              <strong>{{ item.summary }}</strong>
              <span>{{ item.type }} | {{ item.targetType }} | {{ shortID(item.targetId) }}</span>
              <em>{{ item.status }}</em>
              <div class="row-actions">
                <button class="icon-button" type="button" :title="t.actions.run" :aria-label="t.actions.run" @click="runTask(item.id)"><Play :size="15" /></button>
              </div>
            </div>
          </div>
        </section>
      </section>
    </section>
  </main>
</template>
