import { FormEvent } from 'react';
import { Copy, Plus } from 'lucide-react';
import type { Gateway, ProtocolListener } from '../types';
import { Field } from './ui';

const protocolTemplates: ProtocolListener[] = [
  { protocol: 'vless', port: 30000, enabled: true },
  { protocol: 'vmess', port: 30001, enabled: true },
  { protocol: 'trojan', port: 30002, enabled: true },
  { protocol: 'shadowsocks', port: 30003, enabled: true },
  { protocol: 'socks5', port: 30004, enabled: true },
  { protocol: 'http', port: 30005, enabled: true },
];

const legacyPorts: Record<string, number> = {
  vless: 443,
  vmess: 8443,
  trojan: 9443,
  shadowsocks: 8388,
  socks5: 1080,
  http: 8081,
};

type GatewayBuilderProps = {
  copyText: (zh: string, en: string) => string;
  form: Gateway;
  clientHost: string;
  onChange: (next: Gateway) => void;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
  onCopyLink: (text: string) => void;
};

export function createGatewayProtocols(): ProtocolListener[] {
  return protocolTemplates.map((item) => withConnectionDefaults(item));
}

export function GatewayBuilder({ copyText, form, clientHost, onChange, onSubmit, onReset, onCopyLink }: GatewayBuilderProps) {
  const protocols = normalizeGatewayProtocols(form);
  const enabledCount = protocols.filter((item) => item.enabled).length;
  const isEditing = Boolean(form.id);
  const connections = buildEntryConnections({ ...form, protocols }, copyText, clientHost);

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

      <section className="entry-links entry-links-priority">
        <div className="link-preview-head">
          <div>
            <span>{copyText('客户端连接信息', 'Client Connection Info')}</span>
            <strong>{copyText('入口保存后直接复制给用户连接主控', 'Copy these links to clients after saving the entry')}</strong>
          </div>
        </div>
        {connections.length === 0 ? (
          <div className="empty-state"><strong>{copyText('未启用入口协议', 'No entry protocol enabled')}</strong></div>
        ) : connections.map((item) => (
          <article className="entry-link-card" key={item.protocol}>
            <div className="entry-link-head">
              <strong>{item.label}</strong>
              <button className="secondary-button compact" type="button" disabled={!item.canCopy} onClick={() => onCopyLink(item.link)}><Copy size={15} />{copyText('复制', 'Copy')}</button>
            </div>
            <div className="link-row-grid">
              {item.rows.map((row) => <span key={row.label}><b>{row.label}</b><i>{row.value}</i></span>)}
            </div>
            <code>{item.link || copyText('缺少连接参数', 'Missing connection parameters')}</code>
          </article>
        ))}
      </section>

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
  return protocolTemplates.map((item) => {
    const current = existing.get(item.protocol);
    if (current) return withConnectionDefaults({ ...item, ...current });
    if (item.protocol === 'socks5' && gateway.socksPort > 0) return { ...item, port: gateway.socksPort, enabled: true };
    if (item.protocol === 'http' && gateway.httpPort > 0) return { ...item, port: gateway.httpPort, enabled: true };
    return hasProtocols ? withConnectionDefaults(item) : { ...withConnectionDefaults(item), enabled: false };
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
  if (protocol === 'vless') return 'VLESS';
  if (protocol === 'vmess') return 'VMess';
  if (protocol === 'trojan') return 'Trojan';
  if (protocol === 'shadowsocks') return 'Shadowsocks';
  if (protocol === 'socks5') return 'SOCKS5';
  if (protocol === 'http') return 'HTTP';
  return protocol;
}

function withConnectionDefaults(item: ProtocolListener): ProtocolListener {
  const template = protocolTemplates.find((candidate) => candidate.protocol === item.protocol);
  const port = item.port === legacyPorts[item.protocol] ? template?.port ?? item.port : item.port;
  const next = { ...item, port };
  if ((next.protocol === 'vless' || next.protocol === 'vmess') && !next.credential) {
    next.credential = randomUUID();
  }
  if (next.protocol === 'trojan' && !next.password) {
    next.password = randomToken(16);
  }
  if (next.protocol === 'shadowsocks') {
    next.method = next.method || 'chacha20-ietf-poly1305';
    next.password = next.password || randomToken(16);
    next.network = next.network || 'tcp+udp';
  }
  if ((next.protocol === 'socks5' || next.protocol === 'http')) {
    next.authUser = next.authUser || 'fyss';
    next.password = next.password || randomToken(12);
  }
  return next;
}

function buildEntryConnections(gateway: Gateway, copyText: (zh: string, en: string) => string, detectedHost: string) {
  const host = clientHost(gateway.listenHost, detectedHost);
  return normalizeGatewayProtocols(gateway)
    .filter((item) => item.enabled && item.port > 0)
    .map((item) => {
      const name = encodeURIComponent(`${gateway.name || 'fyss-entry'}-${item.protocol}`);
      const commonRows = [
        { label: copyText('协议', 'Protocol'), value: protocolLabel(item.protocol) },
        { label: copyText('地址', 'Host'), value: host },
        { label: copyText('端口', 'Port'), value: String(item.port) },
      ];

      if (item.protocol === 'vless') {
        const link = `vless://${item.credential}@${host}:${item.port}?encryption=none&type=tcp&security=none#${name}`;
        return { protocol: item.protocol, label: 'VLESS', link, canCopy: Boolean(item.credential), rows: [...commonRows, { label: 'UUID', value: item.credential || '-' }] };
      }
      if (item.protocol === 'vmess') {
        const payload = {
          v: '2',
          ps: `${gateway.name || 'fyss-entry'}-vmess`,
          add: host,
          port: String(item.port),
          id: item.credential || '',
          aid: '0',
          scy: 'auto',
          net: 'tcp',
          type: 'none',
          host: '',
          path: '',
          tls: '',
          sni: '',
        };
        return { protocol: item.protocol, label: 'VMess', link: `vmess://${base64(JSON.stringify(payload))}`, canCopy: Boolean(item.credential), rows: [...commonRows, { label: 'UUID', value: item.credential || '-' }] };
      }
      if (item.protocol === 'trojan') {
        const link = `trojan://${encodeURIComponent(item.password || '')}@${host}:${item.port}?security=none&type=tcp#${name}`;
        return { protocol: item.protocol, label: 'Trojan', link, canCopy: Boolean(item.password), rows: [...commonRows, { label: copyText('密码', 'Password'), value: item.password || '-' }] };
      }
      if (item.protocol === 'shadowsocks') {
        const userInfo = base64(`${item.method}:${item.password}`);
        const link = `ss://${userInfo}@${host}:${item.port}#${name}`;
        return { protocol: item.protocol, label: 'Shadowsocks', link, canCopy: Boolean(item.method && item.password), rows: [...commonRows, { label: copyText('加密', 'Method'), value: item.method || '-' }, { label: copyText('密码', 'Password'), value: item.password || '-' }] };
      }
      if (item.protocol === 'socks5') {
        const auth = item.authUser || item.password ? `${encodeURIComponent(item.authUser || '')}:${encodeURIComponent(item.password || '')}@` : '';
        return { protocol: item.protocol, label: 'SOCKS5', link: `socks5://${auth}${host}:${item.port}#${name}`, canCopy: Boolean(item.authUser && item.password), rows: [...commonRows, { label: copyText('用户名', 'Username'), value: item.authUser || '-' }, { label: copyText('密码', 'Password'), value: item.password || '-' }] };
      }
      const auth = item.authUser || item.password ? `${encodeURIComponent(item.authUser || '')}:${encodeURIComponent(item.password || '')}@` : '';
      return { protocol: item.protocol, label: 'HTTP', link: `http://${auth}${host}:${item.port}#${name}`, canCopy: Boolean(item.authUser && item.password), rows: [...commonRows, { label: copyText('用户名', 'Username'), value: item.authUser || '-' }, { label: copyText('密码', 'Password'), value: item.password || '-' }] };
    });
}

function clientHost(value: string, detectedHost: string) {
  const host = value.trim();
  if (!host || host === '0.0.0.0' || host === '::') return normalizeHost(detectedHost) || 'localhost';
  return normalizeHost(host) || host;
}

function normalizeHost(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `http://${raw}`).hostname;
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0];
  }
}

function numberValue(value: string) {
  return Number.parseInt(value, 10) || 0;
}

function randomUUID() {
  return globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
    const next = Math.floor(Math.random() * 16);
    const value = part === 'x' ? next : (next & 0x3) | 0x8;
    return value.toString(16);
  });
}

function randomToken(length: number) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function base64(value: string) {
  return btoa(unescape(encodeURIComponent(value)));
}
