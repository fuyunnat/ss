import type { AgentInstallRequest, ExitNode, Gateway, Policy, ServerNode, Summary, Task } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
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
};
