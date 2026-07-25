import { FormEvent } from 'react';
import { Zap } from 'lucide-react';
import type { ProtocolForm, ServerNode } from '../types';
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
  installCommand: string;
  presets: ProtocolPreset[];
  servers: ServerNode[];
  summary: string;
  onChange: (next: ProtocolForm) => void;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
};

export function ProtocolBuilder({
  copyText,
  form,
  installCommand,
  presets,
  servers,
  summary,
  onChange,
  onSubmit,
  onReset,
}: ProtocolBuilderProps) {
  const update = (patch: Partial<ProtocolForm>) => onChange({ ...form, ...patch });
  const hasServer = servers.length > 0;
  const isDokodemo = form.protocol === 'dokodemo-door';

  function applyPreset(preset: ProtocolPreset) {
    update({
      ...preset,
      name: form.name === '' || form.name.includes(form.protocol) ? `hk-${preset.protocol}-01` : form.name,
      targetPort: preset.protocol === 'dokodemo-door' ? form.targetPort || 80 : form.targetPort,
      network: preset.protocol === 'dokodemo-door' ? 'tcp+udp' : form.network,
      sniffing: preset.protocol !== 'dokodemo-door',
      tls: preset.security === 'tls',
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
          <span>{copyText('添加入站', 'Add Inbound')}</span>
          <strong>{copyText('按 x-ui 的入站字段创建协议节点', 'Create protocol nodes with x-ui style inbound fields')}</strong>
        </div>
        <StatusBadge value={hasServer ? copyText('可创建', 'ready') : copyText('先上线服务器', 'install first')} good={hasServer} />
      </div>

      <div className="simple-path">
        <span className={hasServer ? 'done' : ''}>{copyText('1 服务器在线', '1 Agent online')}</span>
        <span>{copyText('2 选协议', '2 Pick protocol')}</span>
        <span>{copyText('3 创建任务', '3 Queue deploy')}</span>
      </div>

      <div className="preset-grid">
        {presets.map((preset) => (
          <button
            key={`${preset.protocol}-${preset.core}-${preset.security}`}
            className={form.protocol === preset.protocol && form.core === preset.core && form.security === preset.security ? 'preset active' : 'preset'}
            type="button"
            onClick={() => applyPreset(preset)}
          >
            <strong>{preset.label}</strong>
            <span>{copyText(preset.hint, preset.hint)} · {preset.core}</span>
          </button>
        ))}
      </div>

      <form className="control-form" onSubmit={onSubmit}>
        {!hasServer && (
          <div className="inline-warning">
            <strong>{copyText('还没有在线服务器', 'No online agent yet')}</strong>
            <span>{copyText('先去“服务器上线”复制安装命令，跑完脚本后这里会自动出现服务器。', 'Copy the installer under Agents first; the server appears here after heartbeat.')}</span>
          </div>
        )}
        <div className="form-row">
          <Field label={copyText('要装在哪台服务器', 'Install On')}>
            <select value={form.serverId} onChange={(event) => update({ serverId: event.target.value })}>
              <option value="">{copyText('先选择 Agent，没有就先安装', 'Choose an agent, install one first if empty')}</option>
              {servers.map((server) => <option key={server.id} value={server.id}>{server.name} / {server.host}</option>)}
            </select>
          </Field>
          <ToggleField label={copyText('启用', 'Enabled')} checked={form.enabled} onChange={(enabled) => update({ enabled })} />
        </div>
        <div className="form-row three">
          <Field label={copyText('备注', 'Remark')}><input value={form.name} onChange={(event) => update({ name: event.target.value })} required placeholder="hk-vless-01" /></Field>
          <Field label={copyText('协议', 'Protocol')}>
            <select value={form.protocol} onChange={(event) => updateProtocol(event.target.value)}>
              {presets.map((preset) => <option key={preset.protocol} value={preset.protocol}>{preset.protocol}</option>)}
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
            <div className="form-row three">
              <Field label={copyText('目标地址', 'Target Address')}><input value={form.targetAddress} onChange={(event) => update({ targetAddress: event.target.value })} required placeholder="127.0.0.1" /></Field>
              <Field label={copyText('目标端口', 'Target Port')}><input value={form.targetPort || ''} onChange={(event) => update({ targetPort: numberValue(event.target.value) })} type="number" min="1" required placeholder="80" /></Field>
              <Field label={copyText('网络', 'Network')}><select value={form.network} onChange={(event) => update({ network: event.target.value })}><option>tcp+udp</option><option>tcp</option><option>udp</option></select></Field>
            </div>
          </section>
        ) : (
          <section className="inbound-section">
            <div className="form-row three">
              <Field label="ID"><input value={form.credential} onChange={(event) => update({ credential: event.target.value })} placeholder={copyText('留空由 Agent 生成', 'Blank lets agent generate')} /></Field>
              <Field label={copyText('额外 ID', 'Alter ID')}><input value={form.extraId} onChange={(event) => update({ extraId: numberValue(event.target.value) })} type="number" min="0" /></Field>
              <Field label={copyText('传输', 'Transport')}><select value={form.transport} onChange={(event) => update({ transport: event.target.value })}><option>tcp</option><option>ws</option><option>grpc</option><option>httpupgrade</option></select></Field>
            </div>
            <div className="toggle-grid">
              <ToggleField label={copyText('禁用不安全加密', 'Disable Insecure Encryption')} checked={form.disableInsecureEncryption} onChange={(disableInsecureEncryption) => update({ disableInsecureEncryption })} />
              <ToggleField label={copyText('HTTP 伪装', 'HTTP Obfuscation')} checked={form.httpObfuscation} onChange={(httpObfuscation) => update({ httpObfuscation })} />
              <ToggleField label="TLS" checked={form.tls} onChange={(tls) => update({ tls, security: tls ? 'tls' : form.security === 'tls' ? 'none' : form.security })} />
              <ToggleField label="Sniffing" checked={form.sniffing} onChange={(sniffing) => update({ sniffing })} />
            </div>
          </section>
        )}

        <details className="advanced-box">
          <summary>{copyText('更多高级参数', 'More advanced settings')}</summary>
          <div className="form-row three">
            <Field label={copyText('TLS / Reality', 'TLS / Reality')}><select value={form.security} onChange={(event) => update({ security: event.target.value })}><option>reality</option><option>tls</option><option>none</option></select></Field>
            <Field label="SNI"><input value={form.sni} onChange={(event) => update({ sni: event.target.value })} placeholder="www.cloudflare.com" /></Field>
            <Field label={copyText('路径', 'Path')}><input value={form.path} onChange={(event) => update({ path: event.target.value })} placeholder="/proxy" /></Field>
          </div>
          <div className="form-row">
            <Field label={copyText('域名或出口地址', 'Domain / Exit Address')}><input value={form.domain} onChange={(event) => update({ domain: event.target.value })} placeholder={copyText('留空自动使用服务器 IP', 'Blank uses server IP')} /></Field>
          </div>
        </details>

        <div className="deploy-preview">
          <span>{copyText('将创建部署任务', 'Deploy task preview')}</span>
          <strong>{summary}</strong>
          {!hasServer && <code>{installCommand}</code>}
        </div>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={!hasServer}><Zap size={17} />{copyText('创建节点', 'Create Node')}</button>
          <button className="secondary-button" type="button" onClick={onReset}>{copyText('恢复默认', 'Reset')}</button>
        </div>
      </form>
    </section>
  );
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
