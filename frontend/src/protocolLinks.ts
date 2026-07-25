import type { ProtocolForm, ProtocolNodeSettings, ServerNode } from './types';

export type ProtocolShareInfo = {
  link: string;
  label: string;
  rows: Array<{ label: string; value: string }>;
  canCopy: boolean;
};

export function protocolSettingsFromForm(form: ProtocolForm): ProtocolNodeSettings {
  return {
    core: form.core,
    protocol: form.protocol,
    listenIp: form.listenIp,
    transport: form.transport,
    security: form.security,
    totalGb: form.totalGb,
    expiryDate: form.expiryDate,
    domain: form.domain,
    sni: form.sni,
    path: form.path,
    credential: form.credential,
    extraId: form.extraId,
    method: form.method,
    authUser: form.authUser,
    password: form.password,
    authEnabled: form.authEnabled,
    udp: form.udp,
    flow: form.flow,
    realityPublicKey: form.realityPublicKey,
    realityShortId: form.realityShortId,
    fingerprint: form.fingerprint,
    disableInsecureEncryption: form.disableInsecureEncryption,
    httpObfuscation: form.httpObfuscation,
    tls: form.tls,
    sniffing: form.sniffing,
    targetAddress: form.targetAddress,
    targetPort: form.targetPort,
    network: form.network,
  };
}

export function applyProtocolSettings(form: ProtocolForm, settings?: Partial<ProtocolNodeSettings>): ProtocolForm {
  if (!settings) return form;
  return {
    ...form,
    ...settings,
    exitId: form.exitId,
    name: form.name,
    serverId: form.serverId,
    port: form.port,
    enabled: form.enabled,
  };
}

export function buildProtocolShareInfo(form: ProtocolForm, server?: ServerNode): ProtocolShareInfo {
  const host = cleanHost(form.domain || server?.host || '');
  const port = form.port || 0;
  const name = encodeURIComponent(form.name || `${form.protocol}-${port}`);
  const commonRows = [
    { label: '协议', value: form.protocol },
    { label: '地址', value: host || '创建后由服务器地址生成' },
    { label: '端口', value: port ? String(port) : '-' },
  ];

  if (!host || !port) {
    return { label: '链接预览', link: '', rows: commonRows, canCopy: false };
  }

  if (form.protocol === 'vless') {
    const hasRealityParams = form.security !== 'reality' || Boolean(form.realityPublicKey && form.realityShortId);
    const params = compactParams({
      encryption: 'none',
      type: form.transport || 'tcp',
      security: form.security || 'none',
      sni: form.sni,
      flow: form.flow,
      fp: form.fingerprint,
      pbk: form.realityPublicKey,
      sid: form.realityShortId,
      path: needsPath(form.transport) ? form.path : '',
    });
    return {
      label: 'VLESS 链接',
      link: `vless://${form.credential}@${host}:${port}?${params}#${name}`,
      rows: [
        ...commonRows,
        { label: 'UUID', value: form.credential || '-' },
        { label: '传输', value: form.transport },
        { label: '安全', value: form.security },
        ...(form.security === 'reality' ? [
          { label: 'Reality Public Key', value: form.realityPublicKey || '等待 Agent 回填' },
          { label: 'Short ID', value: form.realityShortId || '等待 Agent 回填' },
        ] : []),
      ],
      canCopy: Boolean(form.credential && hasRealityParams),
    };
  }

  if (form.protocol === 'vmess') {
    const payload = {
      v: '2',
      ps: form.name,
      add: host,
      port: String(port),
      id: form.credential,
      aid: String(form.extraId || 0),
      scy: form.disableInsecureEncryption ? 'auto' : 'none',
      net: form.transport || 'tcp',
      type: form.httpObfuscation ? 'http' : 'none',
      host: form.sni || '',
      path: needsPath(form.transport) ? form.path : '',
      tls: form.security === 'tls' ? 'tls' : '',
      sni: form.sni || '',
    };
    return {
      label: 'VMess 链接',
      link: `vmess://${base64(JSON.stringify(payload))}`,
      rows: [
        ...commonRows,
        { label: 'UUID', value: form.credential || '-' },
        { label: 'AlterID', value: String(form.extraId || 0) },
        { label: '传输', value: form.transport },
        { label: 'TLS', value: form.security === 'tls' ? '开启' : '关闭' },
      ],
      canCopy: Boolean(form.credential),
    };
  }

  if (form.protocol === 'trojan') {
    const params = compactParams({
      type: form.transport || 'tcp',
      security: form.security || 'tls',
      sni: form.sni,
      path: needsPath(form.transport) ? form.path : '',
    });
    return {
      label: 'Trojan 链接',
      link: `trojan://${encodeURIComponent(form.password)}@${host}:${port}?${params}#${name}`,
      rows: [...commonRows, { label: '密码', value: mask(form.password) }, { label: '传输', value: form.transport }, { label: '安全', value: form.security }],
      canCopy: Boolean(form.password),
    };
  }

  if (form.protocol === 'shadowsocks') {
    const userInfo = base64(`${form.method}:${form.password}`);
    return {
      label: 'Shadowsocks 链接',
      link: `ss://${userInfo}@${host}:${port}#${name}`,
      rows: [...commonRows, { label: '加密', value: form.method }, { label: '密码', value: mask(form.password) }, { label: '网络', value: form.network }],
      canCopy: Boolean(form.method && form.password),
    };
  }

  if (form.protocol === 'socks5') {
    const auth = form.authEnabled ? `${encodeURIComponent(form.authUser)}:${encodeURIComponent(form.password)}@` : '';
    return {
      label: 'SOCKS5 链接',
      link: `socks5://${auth}${host}:${port}#${name}`,
      rows: [
        ...commonRows,
        { label: '认证', value: form.authEnabled ? '账号密码' : '无认证' },
        ...(form.authEnabled ? [{ label: '用户名', value: form.authUser || '-' }, { label: '密码', value: mask(form.password) }] : []),
        { label: 'UDP', value: form.udp ? '开启' : '关闭' },
      ],
      canCopy: !form.authEnabled || Boolean(form.authUser && form.password),
    };
  }

  if (form.protocol === 'http') {
    const auth = form.authUser || form.password ? `${encodeURIComponent(form.authUser)}:${encodeURIComponent(form.password)}@` : '';
    return {
      label: 'HTTP 代理链接',
      link: `http://${auth}${host}:${port}#${name}`,
      rows: [...commonRows, { label: '用户名', value: form.authUser || '-' }, { label: '密码', value: mask(form.password) }],
      canCopy: Boolean(form.authUser && form.password),
    };
  }

  if (form.protocol === 'dokodemo-door') {
    const payload = {
      protocol: 'dokodemo-door',
      listen: form.listenIp || '0.0.0.0',
      port,
      target: `${form.targetAddress}:${form.targetPort}`,
      network: form.network,
    };
    return {
      label: 'Dokodemo 转发配置',
      link: JSON.stringify(payload, null, 2),
      rows: [...commonRows, { label: '目标地址', value: form.targetAddress || '-' }, { label: '目标端口', value: String(form.targetPort || '-') }, { label: '网络', value: form.network }],
      canCopy: Boolean(form.targetAddress && form.targetPort),
    };
  }

  return { label: '链接预览', link: '', rows: commonRows, canCopy: false };
}

function compactParams(params: Record<string, string | number | boolean | undefined>) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function needsPath(transport: string) {
  return transport === 'ws' || transport === 'httpupgrade' || transport === 'grpc';
}

function cleanHost(value: string) {
  return value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function base64(value: string) {
  return btoa(unescape(encodeURIComponent(value)));
}

function mask(value: string) {
  if (!value) return '-';
  if (value.length <= 6) return '******';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}
