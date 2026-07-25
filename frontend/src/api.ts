import type { AgentInstallRequest, AIChatRequest, AIChatResponse, AuthSession, ExitNode, Gateway, Policy, ServerNode, Summary, Task } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const SESSION_KEY = 'proxy-control-session';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function getAuthSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    return session.token && session.username ? session : null;
  } catch {
    return null;
  }
}

export function setAuthSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getAuthSession();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.token) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearAuthSession();
      throw new AuthError(body.error ?? '登录已失效，请重新登录');
    }
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: (payload: { username: string; password: string }) => request<AuthSession>('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request<{ username: string }>('/api/auth/me'),

  summary: () => request<Summary>('/api/summary'),
  servers: () => request<ServerNode[]>('/api/servers'),
  saveServer: (payload: ServerNode) => request<ServerNode>('/api/servers', { method: payload.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }),
  deleteServer: (id: string) => request<{ deleted: boolean }>(`/api/servers/${id}`, { method: 'DELETE' }),

  gateways: () => request<Gateway[]>('/api/gateways'),
  saveGateway: (payload: Gateway) => request<Gateway>('/api/gateways', { method: payload.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }),
  deleteGateway: (id: string) => request<{ deleted: boolean }>(`/api/gateways/${id}`, { method: 'DELETE' }),

  exits: () => request<ExitNode[]>('/api/exits'),
  saveExit: (payload: ExitNode) => request<ExitNode>('/api/exits', { method: payload.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }),
  deleteExit: (id: string) => request<{ deleted: boolean }>(`/api/exits/${id}`, { method: 'DELETE' }),

  policies: () => request<Policy[]>('/api/policies'),
  savePolicy: (payload: Policy) => request<Policy>('/api/policies', { method: payload.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }),
  deletePolicy: (id: string) => request<{ deleted: boolean }>(`/api/policies/${id}`, { method: 'DELETE' }),

  tasks: () => request<Task[]>('/api/tasks'),
  createTask: (payload: Task) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  runTask: (id: string) => request<Task>(`/api/tasks/${id}/run`, { method: 'POST' }),

  installAgent: (payload: AgentInstallRequest) => request<Task>('/api/agent/install', { method: 'POST', body: JSON.stringify(payload) }),
  aiChat: (payload: AIChatRequest) => request<AIChatResponse>('/api/ai/chat', { method: 'POST', body: JSON.stringify(payload) }),
};
