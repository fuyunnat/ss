import { FormEvent } from 'react';
import { Copy, Server, Zap } from 'lucide-react';
import type { ProtocolForm, ServerNode } from '../types';
import { buildProtocolShareInfo } from '../protocolLinks';
import { Field, StatusBadge } from './ui';

export type ProtocolPreset = {
  protocol: string;
  core: string;
  security: string;
  transport: string;
  port: number;
  label: string;
  hint: string;
};

type ProtocolBuilderProps = {
  copyText: (zh: string, en: string) => string;
  form: ProtocolForm;
  presets: ProtocolPreset[];
  servers: ServerNode[];
  summary: string;
  onChange: (next: ProtocolForm) => void;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
  onCopyLink: (text: string) => void;
};

export function ProtocolBuilder({
  copyText,
  form,
  presets,
  servers,
  summary,
  onChange,
  onSubmit,
  onReset,
  onCopyLink,
}: ProtocolBuilderProps) {
  const update = (patch: Partial<ProtocolForm>) => onChange({ ...form, ...patch });
  const hasServer = servers.length > 0;
  const isDokodemo = form.protocol === 'dokodemo-door';
  const isVless = form.protocol === 'vless';
  const isVmess = form.protocol === 'vmess';
  const isTrojan = form.protocol === 'trojan';
  const isSS = form.protocol === 'shadowsocks';
  const isSocks = form.protocol === 'socks5';
  const isHTTP = form.protocol === 'http';
  const canUseStream = isVless || isVmess || isTrojan;
  const showSni = canUseStream && form.security !== 'none';
  const showPath = canUseStream && ['ws', 'grpc', 'httpupgrade'].includes(form.transport);
  const showReality = isVless && form.security === 'reality';
  const selectedServer = servers.find((server) => server.id === form.serverId);
  const isEditing = Boolean(form.exitId);
  const shareInfo = buildProtocolShareInfo(form, selectedServer);

  function applyPreset(preset: ProtocolPreset) {
    update({
      ...preset,
      name: form.name === '' || form.name.includes(form.protocol) ? `hk-${preset.protocol}-01` : form.name,
      targetPort: preset.protocol === 'dokodemo-door' ? form.targetPort || 80 : form.targetPort,
      network: preset.protocol === 'dokodemo-door' ? 'tcp+udp' : form.network,
      sniffing: preset.protocol !== 'dokodemo-door',
      tls: preset.security === 'tls',
      authEnabled: preset.protocol === 'socks5' ? form.authEnabled : true,
      method: preset.protocol === 'shadowsocks' ? form.method || 'aes-128-gcm' : form.method,
    });
  }

  function updateProtocol(protocol: string) {
    const preset = presets.find((item) => item.protocol === protocol);
    if (preset) {
      applyPreset(preset);
      return;
    }
    update({ protocol });
  }

  return (
    <section className="protocol-builder">
      <div className="builder-head">
        <div>
          <span>{isEditing ? copyText('编辑出口节点', 'Edit Exit Node') : copyText('创建出口节点', 'Create Exit Node')}</span>
          <strong>{copyText('先选被控服务器，再选择主控可调度的出口协议', 'Pick a controlled server, then create an exit protocol for routing')}</strong>
        </div>
        <StatusBadge value={hasServer ? copyText('可创建', 'ready') : copyText('先上线服务器', 'install first')} good={hasServer} />
      </div>

      <div className="simple-path">
        <span className={hasServer ? 'done' : ''}>{copyText('1 被控服务器在线', '1 Agent online')}</span>
        <span className={form.serverId ? 'done' : ''}>{copyText('2 选择出口服务器', '2 Pick exit server')}</span>
        <span>{copyText('3 创建出口协议', '3 Create exit protocol')}</span>
      </div>

      <form className="control-form" onSubmit={onSubmit}>
        {!hasServer && (
          <div className="inline-warning">
            <strong>{copyText('还没有在线服务器', 'No online agent yet')}</strong>
            <span>{copyText('先去“服务器上线”一键安装被控，心跳后这里会自动出现服务器。', 'Use one-click Agent install first; the server appears here after heartbeat.')}</span>
          </div>
        )}
        <section className="server-picker">
          <div className="server-picker-head">
            <div>
              <span>{copyText('出口服务器', 'Exit Server')}</span>
              <strong>{selectedServer ? `${selectedServer.name} / ${selectedServer.host}` : copyText('请选择要作为出口的被控服务器', 'Choose the controlled server used as exit')}</strong>
            </div>
            <ToggleField label={copyText('启用出口', 'Enable Exit')} checked={form.enabled} onChange={(enabled) => update({ enabled })} />
          </div>
          <div className="server-option-grid">
            {servers.map((server) => (
              <button
                key={server.id}
                className={form.serverId === server.id ? 'server-option active' : 'server-option'}
                type="button"
                onClick={() => update({ serverId: server.id ?? '' })}
              >
                <Server size={15} />
                <span>
                  <strong>{server.name}</strong>
                  <small>{server.host} / {server.region || '-'}</small>
                </span>
                <StatusBadge value={server.status || 'unknown'} good={server.status === 'online'} />
              </button>
            ))}
          </div>
        </section>
        <div className="form-row three">
          <Field label={copyText('节点名称', 'Node Name')}><input value={form.name} onChange={(event) => update({ name: event.target.value })} required placeholder="hk-vless-01" /></Field>
          <Field label={copyText('协议', 'Protocol')}>
            <select value={form.protocol} onChange={(event) => updateProtocol(event.target.value)}>
              {presets.map((preset) => <option key={`${preset.protocol}-${preset.core}-${preset.security}`} value={preset.protocol}>{preset.label}</option>)}
            </select>
          </Field>
          <Field label={copyText('核心', 'Core')}><select value={form.core} onChange={(event) => update({ core: event.target.value })}><option>xray</option><option>sing-box</option></select></Field>
        </div>
        <div className="form-row three">
          <Field label={copyText('监听 IP', 'Listen IP')}><input value={form.listenIp} onChange={(event) => update({ listenIp: event.target.value })} placeholder={copyText('留空监听所有地址', 'Blank listens on all addresses')} /></Field>
          <Field label={copyText('端口', 'Port')}><input value={form.port} onChange={(event) => update({ port: numberValue(event.target.value) })} type="number" min="1" required /></Field>
          <Field label={copyText('总流量(GB)', 'Total Traffic (GB)')}><input value={form.totalGb} onChange={(event) => update({ totalGb: numberValue(event.target.value) })} type="number" min="0" /></Field>
        </div>
        <Field label={copyText('到期时间', 'Expiry Date')}><input value={form.expiryDate} onChange={(event) => update({ expiryDate: event.target.value })} type="date" /></Field>

        {isDokodemo ? (
          <section className="inbound-section">
            <ProtocolSectionTitle title="Dokodemo Door" desc={copyText('固定端口转发，只需要目标地址、目标端口和网络类型。', 'Fixed port forwarding only needs target address, target port, and network.')} />
            <div className="form-row three">
              <Field label={copyText('目标地址', 'Target Address')}><input value={form.targetAddress} onChange={(event) => update({ targetAddress: event.target.value })} required placeholder="127.0.0.1" /></Field>
              <Field label={copyText('目标端口', 'Target Port')}><input value={form.targetPort || ''} onChange={(event) => update({ targetPort: numberValue(event.target.value) })} type="number" min="1" required placeholder="80" /></Field>
              <Field label={copyText('网络', 'Network')}><select value={form.network} onChange={(event) => update({ network: event.target.value })}><option>tcp+udp</option><option>tcp</option><option>udp</option></select></Field>
            </div>
          </section>
        ) : isSS ? (
          <section className="inbound-section">
            <ProtocolSectionTitle title="Shadowsocks" desc={copyText('配置加密方式、密码和 TCP/UDP 网络。', 'Configure method, password, and TCP/UDP network.')} />
            <div className="form-row three">
              <Field label={copyText('加密方式', 'Method')}>
                <select value={form.method} onChange={(event) => update({ method: event.target.value })}>
                  {ssMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </Field>
              <Field label={copyText('密码', 'Password')}><input value={form.password} onChange={(event) => update({ password: event.target.value })} required type="password" /></Field>
              <Field label={copyText('网络', 'Network')}><select value={form.network} onChange={(event) => update({ network: event.target.value })}><option>tcp+udp</option><option>tcp</option><option>udp</option></select></Field>
            </div>
          </section>
        ) : isSocks ? (
          <section className="inbound-section">
            <ProtocolSectionTitle title="SOCKS5" desc={copyText('和 x-ui 一样，只保留密码认证、账号、密码、UDP。', 'Same as x-ui: auth switch, username, password, and UDP only.')} />
            <div className="toggle-grid two">
              <ToggleField label={copyText('密码认证', 'Password Auth')} checked={form.authEnabled} onChange={(authEnabled) => update({ authEnabled })} />
              <ToggleField label={copyText('启用 UDP', 'Enable UDP')} checked={form.udp} onChange={(udp) => update({ udp, network: udp ? 'tcp+udp' : 'tcp' })} />
            </div>
            {form.authEnabled && (
              <div className="form-row">
                <Field label={copyText('用户名', 'Username')}><input value={form.authUser} onChange={(event) => update({ authUser: event.target.value })} required /></Field>
                <Field label={copyText('密码', 'Password')}><input value={form.password} onChange={(event) => update({ password: event.target.value })} required type="password" /></Field>
              </div>
            )}
          </section>
        ) : isHTTP ? (
          <section className="inbound-section">
            <ProtocolSectionTitle title="HTTP" desc={copyText('配置 HTTP 代理用户名和密码。', 'Configure HTTP proxy username and password.')} />
            <div className="form-row">
              <Field label={copyText('用户名', 'Username')}><input value={form.authUser} onChange={(event) => update({ authUser: event.target.value })} required /></Field>
              <Field label={copyText('密码', 'Password')}><input value={form.password} onChange={(event) => update({ password: event.target.value })} required type="password" /></Field>
            </div>
          </section>
        ) : (
          <section className="inbound-section">
            <ProtocolSectionTitle
              title={protocolLabel(form.protocol)}
              desc={isVmess ? copyText('VMess 保留 UUID、AlterID 和禁用不安全加密。', 'VMess keeps UUID, AlterID, and insecure encryption switch.')
                : isVless ? copyText('VLESS 保留 UUID；Reality 时补充 Public Key、Short ID、Fingerprint。', 'VLESS keeps UUID; Reality adds public key, short ID, and fingerprint.')
                  : copyText('Trojan 配置密码认证和传输安全参数。', 'Trojan configures password auth and transport security.')}
            />
            <div className="form-row three">
              {(isVless || isVmess) && <Field label="UUID"><input value={form.credential} onChange={(event) => update({ credential: event.target.value })} required placeholder={copyText('留空由 Agent 生成', 'Blank lets agent generate')} /></Field>}
              {isTrojan && <Field label={copyText('密码', 'Password')}><input value={form.password} onChange={(event) => update({ password: event.target.value })} required type="password" /></Field>}
              {isVmess && <Field label={copyText('额外 ID', 'Alter ID')}><input value={form.extraId} onChange={(event) => update({ extraId: numberValue(event.target.value) })} type="number" min="0" /></Field>}
              {canUseStream && <Field label={copyText('传输', 'Transport')}><select value={form.transport} onChange={(event) => update({ transport: event.target.value })}>{transportOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>}
              {canUseStream && <Field label={copyText('安全', 'Security')}><select value={form.security} onChange={(event) => update({ security: event.target.value, tls: event.target.value === 'tls' })}>{securityOptions(form.protocol).map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>}
            </div>
            {showReality && (
              <div className="form-row three">
                <Field label="Public Key"><input value={form.realityPublicKey} onChange={(event) => update({ realityPublicKey: event.target.value })} placeholder={copyText('Agent 生成后回填', 'Filled after agent generates')} /></Field>
                <Field label="Short ID"><input value={form.realityShortId} onChange={(event) => update({ realityShortId: event.target.value })} placeholder="0123456789abcdef" /></Field>
                <Field label="Fingerprint"><select value={form.fingerprint} onChange={(event) => update({ fingerprint: event.target.value })}><option>chrome</option><option>firefox</option><option>safari</option><option>randomized</option></select></Field>
              </div>
            )}
            {(showSni || showPath || isVless) && (
              <div className="form-row three">
                {showSni && <Field label="SNI"><input value={form.sni} onChange={(event) => update({ sni: event.target.value })} placeholder="www.cloudflare.com" /></Field>}
                {showPath && <Field label={form.transport === 'grpc' ? 'ServiceName' : copyText('路径', 'Path')}><input value={form.path} onChange={(event) => update({ path: event.target.value })} placeholder={form.transport === 'grpc' ? 'grpc-service' : '/proxy'} /></Field>}
                {isVless && <Field label="Flow"><select value={form.flow} onChange={(event) => update({ flow: event.target.value })}><option value="">{copyText('无', 'None')}</option><option value="xtls-rprx-vision">xtls-rprx-vision</option></select></Field>}
              </div>
            )}
            <div className="toggle-grid two">
              {isVmess && <ToggleField label={copyText('禁用不安全加密', 'Disable Insecure Encryption')} checked={form.disableInsecureEncryption} onChange={(disableInsecureEncryption) => update({ disableInsecureEncryption })} />}
              {isVmess && <ToggleField label={copyText('HTTP 伪装', 'HTTP Obfuscation')} checked={form.httpObfuscation} onChange={(httpObfuscation) => update({ httpObfuscation })} />}
              {canUseStream && <ToggleField label="Sniffing" checked={form.sniffing} onChange={(sniffing) => update({ sniffing })} />}
            </div>
          </section>
        )}

        <details className="advanced-box">
          <summary>{copyText('高级：地址和限额', 'Advanced: address and limits')}</summary>
          <div className="form-row">
            <Field label={copyText('域名或出口地址', 'Domain / Exit Address')}><input value={form.domain} onChange={(event) => update({ domain: event.target.value })} placeholder={copyText('留空自动使用服务器 IP', 'Blank uses server IP')} /></Field>
          </div>
        </details>

        <section className="link-preview">
          <div className="link-preview-head">
            <div>
              <span>{shareInfo.label}</span>
              <strong>{shareInfo.canCopy ? copyText('创建后列表也可一键复制', 'Can also copy from the list after creation') : copyText('参数补齐后可复制', 'Fill required fields to copy')}</strong>
            </div>
            <button className="secondary-button compact" type="button" disabled={!shareInfo.canCopy} onClick={() => onCopyLink(shareInfo.link)}><Copy size={15} />{copyText('复制', 'Copy')}</button>
          </div>
          <div className="link-row-grid">
            {shareInfo.rows.map((row) => <span key={row.label}><b>{row.label}</b>{row.value}</span>)}
          </div>
          <code>{shareInfo.link || copyText('等待服务器地址、端口和认证参数', 'Waiting for address, port, and auth parameters')}</code>
        </section>

        <div className="deploy-preview">
          <span>{copyText('将创建出口部署任务', 'Exit deploy task preview')}</span>
          <strong>{selectedServer ? `${selectedServer.name} -> ${summary}` : summary}</strong>
        </div>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={!hasServer}><Zap size={17} />{isEditing ? copyText('更新节点', 'Update Node') : copyText('创建节点', 'Create Node')}</button>
          <button className="secondary-button" type="button" onClick={onReset}>{copyText('恢复默认', 'Reset')}</button>
        </div>
      </form>
    </section>
  );
}

function ProtocolSectionTitle({ title, desc }: { title: string; desc: string }) {
  return <div className="protocol-section-title"><strong>{title}</strong><span>{desc}</span></div>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-field">
      <span>{label}</span>
      <button className={checked ? 'switch on' : 'switch'} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
        <i />
      </button>
    </label>
  );
}

function numberValue(value: string) {
  return Number.parseInt(value, 10) || 0;
}

const ssMethods = ['aes-128-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305', 'xchacha20-ietf-poly1305'];
const transportOptions = ['tcp', 'ws', 'grpc', 'httpupgrade'];

function securityOptions(protocol: string) {
  if (protocol === 'vless') return ['reality', 'tls', 'none'];
  if (protocol === 'vmess') return ['tls', 'none'];
  return ['tls', 'none'];
}

function protocolLabel(protocol: string) {
  if (protocol === 'vless') return 'VLESS';
  if (protocol === 'vmess') return 'VMess';
  if (protocol === 'trojan') return 'Trojan';
  if (protocol === 'shadowsocks') return 'Shadowsocks';
  if (protocol === 'socks5') return 'SOCKS5';
  if (protocol === 'http') return 'HTTP';
  if (protocol === 'dokodemo-door') return 'Dokodemo Door';
  return protocol;
}
