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

  return (
    <section className="protocol-builder">
      <div className="builder-head">
        <div>
          <span>{copyText('创建节点', 'Create Node')}</span>
          <strong>{copyText('只选服务器和协议，其他先用默认值', 'Pick server and protocol; defaults handle the rest')}</strong>
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
            onClick={() => update({ ...preset })}
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
          <Field label={copyText('节点名称', 'Node Name')}><input value={form.name} onChange={(event) => update({ name: event.target.value })} required placeholder="hk-vless-01" /></Field>
        </div>
        <div className="form-row">
          <Field label={copyText('端口', 'Port')}><input value={form.port} onChange={(event) => update({ port: numberValue(event.target.value) })} type="number" min="1" required /></Field>
          <Field label={copyText('域名，没有就留空', 'Domain, Optional')}><input value={form.domain} onChange={(event) => update({ domain: event.target.value })} placeholder={copyText('留空自动使用服务器 IP', 'Blank uses server IP')} /></Field>
        </div>

        <details className="advanced-box">
          <summary>{copyText('高级参数，不懂就别改', 'Advanced settings')}</summary>
          <div className="form-row three">
            <Field label={copyText('核心', 'Core')}><select value={form.core} onChange={(event) => update({ core: event.target.value })}><option>xray</option><option>sing-box</option></select></Field>
            <Field label={copyText('传输', 'Transport')}><select value={form.transport} onChange={(event) => update({ transport: event.target.value })}><option>tcp</option><option>ws</option><option>grpc</option><option>httpupgrade</option></select></Field>
            <Field label={copyText('TLS / Reality', 'TLS / Reality')}><select value={form.security} onChange={(event) => update({ security: event.target.value })}><option>reality</option><option>tls</option><option>none</option></select></Field>
          </div>
          <div className="form-row three">
            <Field label="SNI"><input value={form.sni} onChange={(event) => update({ sni: event.target.value })} placeholder="www.cloudflare.com" /></Field>
            <Field label={copyText('路径', 'Path')}><input value={form.path} onChange={(event) => update({ path: event.target.value })} placeholder="/proxy" /></Field>
            <Field label={copyText('UUID / 密码', 'UUID / Password')}><input value={form.credential} onChange={(event) => update({ credential: event.target.value })} placeholder={copyText('留空由 Agent 生成', 'Blank lets agent generate')} /></Field>
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

function numberValue(value: string) {
  return Number.parseInt(value, 10) || 0;
}
