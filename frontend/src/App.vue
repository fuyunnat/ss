<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Activity, Cable, CircleDot, Network, Play, Plus, RefreshCcw, Route, Server, ShieldCheck, Trash2 } from '@lucide/vue';
import { api } from './api';
import type { ExitNode, Gateway, Policy, ServerNode, Summary, Task } from './types';

const loading = ref(false);
const error = ref('');
const active = ref<'servers' | 'gateways' | 'exits' | 'policies' | 'tasks'>('gateways');
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

const navItems = computed(() => [
  { id: 'gateways', label: '代理入口', count: summary.value.gatewayCount, icon: Network },
  { id: 'exits', label: '出口池', count: summary.value.exitCount, icon: Activity },
  { id: 'policies', label: '调度策略', count: summary.value.policyCount, icon: Route },
  { id: 'servers', label: '被控服务器', count: summary.value.serverCount, icon: Server },
  { id: 'tasks', label: '执行任务', count: summary.value.taskCount, icon: Play },
] as const);

const primaryGateway = computed(() => gateways.value[0]);
const primaryExit = computed(() => exits.value.find((item) => item.health === 'healthy') ?? exits.value[0]);
const primaryPolicy = computed(() => policies.value[0]);
const latestTask = computed(() => tasks.value[0]);

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
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function saveServer() {
  await api.saveServer({ ...serverForm, tags: splitList(serverTagsText.value) });
  Object.assign(serverForm, { name: '', host: '', region: '', tags: [], agentVersion: '', status: 'unknown', cpuPercent: 0, memoryMb: 0 });
  serverTagsText.value = '';
  await refresh();
}

async function saveGateway() {
  await api.saveGateway({ ...gatewayForm });
  Object.assign(gatewayForm, { name: '', serverId: '', listenHost: '0.0.0.0', socksPort: 1080, httpPort: 8081, status: 'planned' });
  await refresh();
}

async function saveExit() {
  await api.saveExit({ ...exitForm });
  Object.assign(exitForm, { name: '', type: 'external_socks5', serverId: '', address: '', port: 1080, username: '', region: '', weight: 100, enabled: true, health: 'unknown', latencyMs: 0, failureRate: 0 });
  await refresh();
}

async function savePolicy() {
  await api.savePolicy({ ...policyForm, exitIds: splitList(policyExitIDsText.value) });
  Object.assign(policyForm, { name: '', matchType: 'default', matchValue: '*', strategy: 'health_weighted', exitIds: [], sticky: true, enabled: true });
  policyExitIDsText.value = '';
  await refresh();
}

async function createTask() {
  await api.createTask({ ...taskForm, logs: [] });
  Object.assign(taskForm, { type: 'sync_config', status: 'queued', targetType: 'gateway', targetId: '', summary: '', logs: [] });
  await refresh();
}

async function removeItem(kind: 'server' | 'gateway' | 'exit' | 'policy', id?: string) {
  if (!id) return;
  if (kind === 'server') await api.deleteServer(id);
  if (kind === 'gateway') await api.deleteGateway(id);
  if (kind === 'exit') await api.deleteExit(id);
  if (kind === 'policy') await api.deletePolicy(id);
  await refresh();
}

async function runTask(id?: string) {
  if (!id) return;
  await api.runTask(id);
  await refresh();
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function shortID(id?: string) {
  return id ? id.slice(0, 8) : '-';
}
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
          <p class="eyebrow">Proxy Orchestration Console</p>
          <h2>统一入口调度到多出口</h2>
        </div>
        <button class="icon-button" type="button" :disabled="loading" title="刷新控制面数据" aria-label="刷新控制面数据" @click="refresh">
          <RefreshCcw :size="18" />
        </button>
      </header>

      <p v-if="error" class="error">{{ error }}</p>
      <section class="route-strip">
        <article>
          <Cable :size="20" />
          <span>入口</span>
          <strong>{{ primaryGateway?.name ?? '未配置 Gateway' }}</strong>
          <small>{{ primaryGateway ? `${primaryGateway.listenHost}:${primaryGateway.socksPort}` : 'SOCKS5 / HTTP CONNECT' }}</small>
        </article>
        <article>
          <Route :size="20" />
          <span>策略</span>
          <strong>{{ primaryPolicy?.name ?? '未配置策略' }}</strong>
          <small>{{ primaryPolicy ? `${primaryPolicy.matchType} -> ${primaryPolicy.strategy}` : '按用户、域名、地区、健康状态分流' }}</small>
        </article>
        <article>
          <CircleDot :size="20" />
          <span>出口</span>
          <strong>{{ primaryExit?.name ?? '未配置出口' }}</strong>
          <small>{{ primaryExit ? `${primaryExit.type} ${primaryExit.address}:${primaryExit.port}` : '自建节点 / 第三方 SOCKS5' }}</small>
        </article>
        <article>
          <ShieldCheck :size="20" />
          <span>任务</span>
          <strong>{{ latestTask?.status ?? '无任务' }}</strong>
          <small>{{ latestTask?.summary ?? '安装、重载、同步、健康检查' }}</small>
        </article>
      </section>

      <section class="metrics">
        <div class="metric"><span>被控服务器</span><strong>{{ summary.serverCount }}</strong></div>
        <div class="metric"><span>Gateway</span><strong>{{ summary.gatewayCount }}</strong></div>
        <div class="metric"><span>出口总数</span><strong>{{ summary.exitCount }}</strong></div>
        <div class="metric"><span>健康出口</span><strong>{{ summary.healthyExits }}</strong></div>
      </section>

      <section v-if="active === 'gateways'" class="panel">
        <div class="panel-head"><h3>代理入口 Gateway</h3><span>用户只连入口，真实出口由总控策略决定</span></div>
        <form class="form-grid" @submit.prevent="saveGateway">
          <input v-model.trim="gatewayForm.name" required placeholder="入口名称，例如 main-gateway" />
          <input v-model.trim="gatewayForm.serverId" placeholder="承载服务器 ID" />
          <input v-model.trim="gatewayForm.listenHost" required placeholder="监听地址，例如 0.0.0.0" />
          <input v-model.number="gatewayForm.socksPort" type="number" min="1" placeholder="SOCKS5 端口" />
          <input v-model.number="gatewayForm.httpPort" type="number" min="1" placeholder="HTTP 端口" />
          <button class="primary" type="submit"><Plus :size="17" />添加入口</button>
        </form>
        <div v-if="gateways.length === 0" class="empty">还没有 Gateway 入口。</div>
        <article v-for="item in gateways" :key="item.id" class="resource-card">
          <div><b>{{ item.name }}</b><span>{{ item.listenHost }} | SOCKS {{ item.socksPort }} | HTTP {{ item.httpPort }}</span></div>
          <em>{{ item.status }}</em>
          <button class="icon-button danger" type="button" title="删除入口" aria-label="删除入口" @click="removeItem('gateway', item.id)"><Trash2 :size="16" /></button>
        </article>
      </section>

      <section v-if="active === 'exits'" class="panel">
        <div class="panel-head"><h3>出口池</h3><span>自建 Agent 节点和第三方代理统一纳管</span></div>
        <form class="form-grid" @submit.prevent="saveExit">
          <input v-model.trim="exitForm.name" required placeholder="出口名称" />
          <select v-model="exitForm.type"><option>external_socks5</option><option>external_http</option><option>self_xray</option><option>self_singbox</option></select>
          <input v-model.trim="exitForm.address" required placeholder="地址" />
          <input v-model.number="exitForm.port" required type="number" min="1" placeholder="端口" />
          <input v-model.trim="exitForm.region" placeholder="地区" />
          <input v-model.number="exitForm.weight" type="number" min="1" placeholder="权重" />
          <button class="primary" type="submit"><Plus :size="17" />添加出口</button>
        </form>
        <div v-if="exits.length === 0" class="empty">还没有出口，第三方 SOCKS5 也从这里添加。</div>
        <article v-for="item in exits" :key="item.id" class="resource-card">
          <div><b>{{ item.name }}</b><span>{{ item.type }} | {{ item.address }}:{{ item.port }} | weight {{ item.weight }}</span></div>
          <em :class="{ good: item.health === 'healthy' }">{{ item.health }}</em>
          <button class="icon-button danger" type="button" title="删除出口" aria-label="删除出口" @click="removeItem('exit', item.id)"><Trash2 :size="16" /></button>
        </article>
      </section>

      <section v-if="active === 'policies'" class="panel">
        <div class="panel-head"><h3>调度策略</h3><span>把用户、域名、CIDR、地区映射到出口池</span></div>
        <form class="form-grid" @submit.prevent="savePolicy">
          <input v-model.trim="policyForm.name" required placeholder="策略名称" />
          <select v-model="policyForm.matchType"><option>default</option><option>user</option><option>domain</option><option>cidr</option><option>region</option></select>
          <input v-model.trim="policyForm.matchValue" placeholder="匹配值，例如 *.google.com" />
          <select v-model="policyForm.strategy"><option>fixed</option><option>weighted</option><option>health_weighted</option><option>cost_first</option></select>
          <input v-model="policyExitIDsText" placeholder="出口 ID，逗号分隔" />
          <button class="primary" type="submit"><Plus :size="17" />添加策略</button>
        </form>
        <article v-for="item in policies" :key="item.id" class="resource-card">
          <div><b>{{ item.name }}</b><span>{{ item.matchType }}: {{ item.matchValue || '*' }} -> {{ item.strategy }}</span></div>
          <em>{{ item.sticky ? 'sticky' : 'stateless' }}</em>
          <button class="icon-button danger" type="button" title="删除策略" aria-label="删除策略" @click="removeItem('policy', item.id)"><Trash2 :size="16" /></button>
        </article>
      </section>

      <section v-if="active === 'servers'" class="panel">
        <div class="panel-head"><h3>被控服务器 Agent</h3><span>先安装 Agent，再由总控下发 Xray / sing-box 任务</span></div>
        <pre class="install-line">sudo ./scripts/install-agent.sh --master-url http://YOUR-MASTER:8080 --token YOUR_AGENT_TOKEN --node-name hk-01</pre>
        <form class="form-grid" @submit.prevent="saveServer">
          <input v-model.trim="serverForm.name" required placeholder="名称，例如 hk-01" />
          <input v-model.trim="serverForm.host" required placeholder="公网 IP 或域名" />
          <input v-model.trim="serverForm.region" placeholder="地区，例如 HK" />
          <input v-model.trim="serverForm.agentVersion" placeholder="Agent 版本" />
          <input v-model="serverTagsText" placeholder="标签，逗号分隔" />
          <button class="primary" type="submit"><Plus :size="17" />手动添加</button>
        </form>
        <article v-for="item in servers" :key="item.id" class="resource-card">
          <div><b>{{ item.name }}</b><span>{{ item.host }} | {{ item.region || '-' }} | agent {{ item.agentVersion || '-' }}</span></div>
          <em :class="{ good: item.status === 'online' }">{{ item.status }}</em>
          <button class="icon-button danger" type="button" title="删除服务器" aria-label="删除服务器" @click="removeItem('server', item.id)"><Trash2 :size="16" /></button>
        </article>
      </section>

      <section v-if="active === 'tasks'" class="panel">
        <div class="panel-head"><h3>执行任务</h3><span>配置同步、核心重载、健康检查都必须可追踪</span></div>
        <form class="form-grid" @submit.prevent="createTask">
          <select v-model="taskForm.type"><option>sync_config</option><option>health_check</option><option>reload_core</option><option>switch_core_version</option></select>
          <select v-model="taskForm.targetType"><option>gateway</option><option>server</option><option>exit</option></select>
          <input v-model.trim="taskForm.targetId" placeholder="目标 ID" />
          <input v-model.trim="taskForm.summary" required placeholder="任务说明" />
          <button class="primary" type="submit"><Plus :size="17" />创建任务</button>
        </form>
        <article v-for="item in tasks" :key="item.id" class="resource-card">
          <div><b>{{ item.summary }}</b><span>{{ item.type }} | {{ item.targetType }} | {{ shortID(item.targetId) }}</span></div>
          <em>{{ item.status }}</em>
          <button class="icon-button" type="button" title="执行任务" aria-label="执行任务" @click="runTask(item.id)"><Play :size="16" /></button>
        </article>
      </section>
    </section>
  </main>
</template>
