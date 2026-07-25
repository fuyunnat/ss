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
  status: string;
}

export interface ExitNode {
  id?: string;
  name: string;
  type: string;
  serverId: string;
  address: string;
  port: number;
  username: string;
  region: string;
  weight: number;
  enabled: boolean;
  health: string;
  latencyMs: number;
  failureRate: number;
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

export interface ProtocolForm {
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
  disableInsecureEncryption: boolean;
  httpObfuscation: boolean;
  tls: boolean;
  sniffing: boolean;
  targetAddress: string;
  targetPort: number;
  network: string;
}
