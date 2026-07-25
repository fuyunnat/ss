import { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { Gateway, ProtocolListener } from '../types';
import { Field } from './ui';

export const gatewayProtocolDefaults: ProtocolListener[] = [
  { protocol: 'vless', port: 443, enabled: true },
  { protocol: 'vmess', port: 8443, enabled: true },
  { protocol: 'trojan', port: 9443, enabled: true },
  { protocol: 'shadowsocks', port: 8388, enabled: true },
  { protocol: 'socks5', port: 1080, enabled: true },
  { protocol: 'http', port: 8081, enabled: true },
];

type GatewayBuilderProps = {
  copyText: (zh: string, en: string) => string;
  form: Gateway;
  onChange: (next: Gateway) => void;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
};

export function GatewayBuilder({ copyText, form, onChange, onSubmit, onReset }: GatewayBuilderProps) {
  const protocols = normalizeGatewayProtocols(form);
  const enabledCount = protocols.filter((item) => item.enabled).length;
  const isEditing = Boolean(form.id);

  function update(patch: Partial<Gateway>) {
    onChange({ ...form, ...patch });
  }

  function updateProtocol(protocol: string, patch: Partial<ProtocolListener>) {
    const nextProtocols = protocols.map((item) => item.protocol === protocol ? { ...item, ...patch } : item);
    const next = withLegacyPorts({ ...form, protocols: nextProtocols });
    onChange(next);
  }

  return (
    <form className="control-form gateway-builder" onSubmit={onSubmit}>
      <div className="task-guide">
        <strong>{isEditing ? copyText('编辑主控入口', 'Edit master entry') : copyText('创建主控入口', 'Create master entry')}</strong>
        <span>{copyText('客户端连接主控入口，主控再按分流规则选择出口服务器。', 'Clients connect to the master entry; routing policies choose exit servers.')}</span>
        <small>{copyText(`已启用 ${enabledCount} 个入口协议`, `${enabledCount} entry protocols enabled`)}</small>
      </div>

      <div className="form-row">
        <Field label={copyText('入口名称', 'Entry Name')}><input value={form.name} onChange={(event) => update({ name: event.target.value })} required placeholder="main-entry" /></Field>
        <Field label={copyText('监听地址', 'Listen Host')}><input value={form.listenHost} onChange={(event) => update({ listenHost: event.target.value })} required placeholder="0.0.0.0" /></Field>
      </div>

      <Field label={copyText('承载主控服务器 ID，可选', 'Master Server ID, optional')}><input value={form.serverId} onChange={(event) => update({ serverId: event.target.value })} placeholder={copyText('留空表示当前主控', 'Blank means current master')} /></Field>

      <section className="entry-protocols">
        <div className="entry-protocols-head">
          <span>{copyText('主入口协议', 'Entry Protocols')}</span>
          <strong>{copyText('用户可使用这些协议连接主控', 'Clients can connect to the master with these protocols')}</strong>
        </div>
        <div className="entry-protocol-grid">
          {protocols.map((item) => (
            <div className={item.enabled ? 'entry-protocol active' : 'entry-protocol'} key={item.protocol}>
              <label className="entry-check">
                <input type="checkbox" checked={item.enabled} onChange={(event) => updateProtocol(item.protocol, { enabled: event.target.checked })} />
                <strong>{protocolLabel(item.protocol)}</strong>
              </label>
              <input value={item.port || ''} onChange={(event) => updateProtocol(item.protocol, { port: numberValue(event.target.value) })} type="number" min="1" disabled={!item.enabled} aria-label={`${protocolLabel(item.protocol)} ${copyText('端口', 'port')}`} />
            </div>
          ))}
        </div>
      </section>

      <div className="deploy-preview">
        <span>{copyText('入口预览', 'Entry Preview')}</span>
        <strong>{entrySummary({ ...form, protocols }, copyText)}</strong>
      </div>

      <div className="form-actions">
        <button className="primary-button" type="submit"><Plus size={17} />{isEditing ? copyText('更新入口', 'Update Entry') : copyText('新增入口', 'Add Entry')}</button>
        <button className="secondary-button" type="button" onClick={onReset}>{copyText('清空', 'Reset')}</button>
      </div>
    </form>
  );
}

export function normalizeGatewayProtocols(gateway: Gateway): ProtocolListener[] {
  const hasProtocols = (gateway.protocols ?? []).length > 0;
  const existing = new Map((gateway.protocols ?? []).map((item) => [item.protocol, item]));
  return gatewayProtocolDefaults.map((item) => {
    const current = existing.get(item.protocol);
    if (current) return { ...item, ...current };
    if (item.protocol === 'socks5' && gateway.socksPort > 0) return { ...item, port: gateway.socksPort, enabled: true };
    if (item.protocol === 'http' && gateway.httpPort > 0) return { ...item, port: gateway.httpPort, enabled: true };
    return hasProtocols ? item : { ...item, enabled: false };
  });
}

export function withLegacyPorts(gateway: Gateway): Gateway {
  const protocols = normalizeGatewayProtocols(gateway);
  const socks = protocols.find((item) => item.protocol === 'socks5');
  const http = protocols.find((item) => item.protocol === 'http');
  return {
    ...gateway,
    protocols,
    socksPort: socks?.enabled ? socks.port : 0,
    httpPort: http?.enabled ? http.port : 0,
  };
}

export function entrySummary(gateway: Gateway, copyText: (zh: string, en: string) => string) {
  const enabled = normalizeGatewayProtocols(gateway).filter((item) => item.enabled && item.port > 0);
  if (enabled.length === 0) return copyText('未启用入口协议', 'No entry protocol enabled');
  return enabled.map((item) => `${protocolLabel(item.protocol)} ${item.port}`).join(' / ');
}

function protocolLabel(protocol: string) {
  if (protocol === 'socks5') return 'SOCKS5';
  if (protocol === 'http') return 'HTTP';
  return protocol.toUpperCase();
}

function numberValue(value: string) {
  return Number.parseInt(value, 10) || 0;
}
