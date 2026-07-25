import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function StatusBadge({ value, good = false }: { value: string; good?: boolean }) {
  const tone = good || value === 'online' || value === 'healthy' || value === 'succeeded' ? 'good' : value === 'failed' || value === 'offline' ? 'bad' : 'neutral';
  return <em className={`status-badge ${tone}`}>{value}</em>;
}
