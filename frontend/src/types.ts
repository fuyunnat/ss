export interface Summary {
  serverCount: number;
  gatewayCount: number;
  exitCount: number;
  policyCount: number;
  taskCount: number;
  healthyExits: number;
}

export interface ServerNode {
  id?: string;
  name: string;
  host: string;
  region: string;
  tags: string[];
  agentVersion: string;
  status: string;
  cpuPercent: number;
  memoryMb: number;
}

export interface Gateway {
  id?: string;
  name: string;
  serverId: string;
  listenHost: string;
  socksPort: number;
  httpPort: number;
  protocols: ProtocolListener[];
  status: string;
}

export interface ProtocolListener {
  protocol: string;
  port: number;
  enabled: boolean;
  credential?: string;
  method?: string;
  authUser?: string;
  password?: string;
  network?: string;
}

export interface ExitNode {
  id?: string;
  name: string;
  type: string;
  serverId: string;
  address: string;
  port: number;
  username: string;
  shareLink?: string;
  settings?: ProtocolNodeSettings;
  region: string;
  weight: number;
  enabled: boolean;
  health: string;
  latencyMs: number;
  failureRate: number;
}

export interface ProtocolNodeSettings {
  core: string;
  protocol: string;
  listenIp: string;
  transport: string;
  security: string;
  totalGb: number;
  expiryDate: string;
  domain: string;
  sni: string;
  path: string;
  credential: string;
  extraId: number;
  method: string;
  authUser: string;
  password: string;
  authEnabled: boolean;
  udp: boolean;
  flow: string;
  realityPublicKey: string;
  realityShortId: string;
  fingerprint: string;
  disableInsecureEncryption: boolean;
  httpObfuscation: boolean;
  tls: boolean;
  sniffing: boolean;
  targetAddress: string;
  targetPort: number;
  network: string;
}

export interface Policy {
  id?: string;
  name: string;
  matchType: string;
  matchValue: string;
  strategy: string;
  exitIds: string[];
  sticky: boolean;
  enabled: boolean;
}

export interface TaskLog {
  at: string;
  level: string;
  message: string;
}

export interface Task {
  id?: string;
  type: string;
  status: string;
  targetType: string;
  targetId: string;
  summary: string;
  logs: TaskLog[];
}

export interface AgentInstallRequest {
  sshHost: string;
  sshPort: number;
  sshUser: string;
  authMethod: 'agent' | 'password' | 'private_key';
  sshPassword: string;
  privateKey: string;
  masterUrl: string;
  agentToken: string;
  nodeName: string;
  region: string;
  nodeHost: string;
}

export interface AuthSession {
  token: string;
  username: string;
}

export interface SystemSettings {
  httpAddr: string;
  corsAllowOrigin: string;
  dataDir: string;
  frontendDir: string;
  frontendEnabled: boolean;
  adminUsername: string;
  defaultAdminPassword: boolean;
  agentTokenConfigured: boolean;
  agentMasterUrl: string;
  aiConfigured: boolean;
  aiBaseUrl: string;
  aiApiKeyConfigured: boolean;
  aiModel: string;
  sessionSecretCustom: boolean;
  masterConfigCommand: string;
  agentConfigCommand: string;
  masterServiceName: string;
  agentServiceName: string;
}

export interface AdminCredentialsUpdate {
  username: string;
  currentPassword: string;
  newPassword: string;
}

export interface ConsoleSettingsUpdate {
  httpAddr: string;
  corsAllowOrigin: string;
  frontendDir: string;
}

export interface AISettingsUpdate {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AgentSettingsUpdate {
  masterUrl: string;
  agentToken: string;
  masterServiceName: string;
  agentServiceName: string;
}

export interface AIChatRequest {
  message: string;
}

export interface AIChatResponse {
  configured: boolean;
  reply: string;
  plan: string[];
  actions: AIAction[];
}

export interface AIAction {
  id: string;
  type: 'install_agent' | string;
  title: string;
  description: string;
  payload: Partial<AgentInstallRequest> & Record<string, unknown>;
  missingFields: string[];
  requiresConfirmation: boolean;
}

export interface ProtocolForm {
  exitId: string;
  name: string;
  serverId: string;
  core: string;
  protocol: string;
  listenIp: string;
  transport: string;
  security: string;
  port: number;
  enabled: boolean;
  totalGb: number;
  expiryDate: string;
  domain: string;
  sni: string;
  path: string;
  credential: string;
  extraId: number;
  method: string;
  authUser: string;
  password: string;
  authEnabled: boolean;
  udp: boolean;
  flow: string;
  realityPublicKey: string;
  realityShortId: string;
  fingerprint: string;
  disableInsecureEncryption: boolean;
  httpObfuscation: boolean;
  tls: boolean;
  sniffing: boolean;
  targetAddress: string;
  targetPort: number;
  network: string;
}
