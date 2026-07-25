import type { ProtocolPreset } from './components/ProtocolBuilder';
import type { ProtocolForm } from './types';

export const protocolPresets: ProtocolPreset[] = [
  { protocol: 'vless', core: 'xray', security: 'reality', transport: 'tcp', port: 443, label: 'VLESS Reality', hint: '推荐' },
  { protocol: 'vmess', core: 'xray', security: 'tls', transport: 'ws', port: 443, label: 'VMess WS TLS', hint: '兼容' },
  { protocol: 'trojan', core: 'xray', security: 'tls', transport: 'tcp', port: 443, label: 'Trojan TLS', hint: '稳定' },
  { protocol: 'shadowsocks', core: 'sing-box', security: 'none', transport: 'tcp', port: 8388, label: 'Shadowsocks', hint: '轻量' },
  { protocol: 'socks5', core: 'sing-box', security: 'none', transport: 'tcp', port: 1080, label: 'SOCKS5', hint: '内网' },
  { protocol: 'dokodemo-door', core: 'xray', security: 'none', transport: 'tcp+udp', port: 50580, label: 'Dokodemo Door', hint: '转发' },
];

export function createProtocolForm(): ProtocolForm {
  return {
    exitId: '',
    name: 'hk-vless-01',
    serverId: '',
    core: 'xray',
    protocol: 'vless',
    listenIp: '',
    transport: 'tcp',
    security: 'reality',
    port: 443,
    enabled: true,
    totalGb: 0,
    expiryDate: '',
    domain: '',
    sni: 'www.cloudflare.com',
    path: '/',
    credential: defaultCredential(),
    extraId: 0,
    disableInsecureEncryption: false,
    httpObfuscation: false,
    tls: false,
    sniffing: true,
    targetAddress: '',
    targetPort: 0,
    network: 'tcp+udp',
  };
}

function defaultCredential() {
  return globalThis.crypto?.randomUUID?.() ?? '00000000-0000-4000-8000-000000000000';
}
