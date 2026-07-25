import { FormEvent, useState } from 'react';
import { Clipboard, Play } from 'lucide-react';
import { api } from '../api';
import type { AgentInstallRequest } from '../types';
import { Field } from './ui';

type CopyText = (zh: string, en: string) => string;

type AgentAutoOnlineProps = {
  copyText: CopyText;
  installCommand: string;
  onCopied: () => void;
  onInstalled: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

const defaultInstallForm: AgentInstallRequest = {
  sshHost: '',
  sshPort: 22,
  sshUser: 'root',
  authMethod: 'agent',
  sshPassword: '',
  privateKey: '',
  masterUrl: 'http://YOUR-MASTER:8080',
  agentToken: '',
  nodeName: '',
  region: '',
  nodeHost: '',
};

export function AgentAutoOnline({ copyText, installCommand, onCopied, onInstalled, onNotice, onError }: AgentAutoOnlineProps) {
  const [form, setForm] = useState<AgentInstallRequest>(defaultInstallForm);
  const [installing, setInstalling] = useState(false);
  const update = (patch: Partial<AgentInstallRequest>) => setForm((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setInstalling(true);
    onError('');
    try {
      await api.installAgent({ ...form, nodeName: form.nodeName || form.sshHost });
      update({ sshPassword: '', privateKey: '' });
      onNotice(copyText('安装任务已创建，后台正在 SSH 安装，等待 Agent 心跳上线', 'Install task created; SSH install is running in the background'));
      await onInstalled();
    } catch (err) {
      onError(err instanceof Error ? err.message : copyText('安装失败', 'Install failed'));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <section className="auto-online">
      <div className="auto-head">
        <strong>{copyText('一键安装被控', 'One-click Agent Install')}</strong>
        <span>{copyText('填 SSH 信息后由总控连接 VPS、执行安装脚本、等待心跳自动上线。', 'The master connects over SSH, runs the installer, and waits for heartbeat.')}</span>
      </div>
      <form className="control-form install-agent-form" onSubmit={submit}>
        <div className="form-row three">
          <Field label={copyText('服务器 IP', 'Server IP')}><input value={form.sshHost} onChange={(event) => update({ sshHost: event.target.value })} required placeholder="203.0.113.10" /></Field>
          <Field label={copyText('SSH 端口', 'SSH Port')}><input value={form.sshPort} onChange={(event) => update({ sshPort: numberValue(event.target.value) })} required type="number" min="1" /></Field>
          <Field label={copyText('SSH 用户', 'SSH User')}><input value={form.sshUser} onChange={(event) => update({ sshUser: event.target.value })} required placeholder="root" /></Field>
        </div>
        <div className="form-row">
          <Field label={copyText('节点名称', 'Node Name')}><input value={form.nodeName} onChange={(event) => update({ nodeName: event.target.value })} placeholder={copyText('留空使用服务器 IP', 'Blank uses server IP')} /></Field>
          <Field label={copyText('地区', 'Region')}><input value={form.region} onChange={(event) => update({ region: event.target.value })} placeholder="HK" /></Field>
        </div>
        <div className="form-row">
          <Field label={copyText('总控地址', 'Master URL')}><input value={form.masterUrl} onChange={(event) => update({ masterUrl: event.target.value })} required placeholder="http://master.example.com:8080" /></Field>
          <Field label={copyText('Agent Token', 'Agent Token')}><input value={form.agentToken} onChange={(event) => update({ agentToken: event.target.value })} required type="password" placeholder={copyText('后端 PROXY_CONTROL_AGENT_TOKEN', 'Backend PROXY_CONTROL_AGENT_TOKEN')} /></Field>
        </div>
        <div className="form-row">
          <Field label={copyText('认证方式', 'Auth Method')}>
            <select value={form.authMethod} onChange={(event) => update({ authMethod: event.target.value as AgentInstallRequest['authMethod'], sshPassword: '', privateKey: '' })}>
              <option value="agent">{copyText('使用总控 SSH Key / ssh-agent', 'Use master SSH key / ssh-agent')}</option>
              <option value="private_key">{copyText('粘贴私钥，本次使用', 'Paste private key for this run')}</option>
              <option value="password">{copyText('SSH 密码，本次使用', 'SSH password for this run')}</option>
            </select>
          </Field>
          <Field label={copyText('上报地址', 'Reported Host')}><input value={form.nodeHost} onChange={(event) => update({ nodeHost: event.target.value })} placeholder={copyText('留空自动探测公网 IP', 'Blank auto-detects public IP')} /></Field>
        </div>
        {form.authMethod === 'password' && (
          <Field label={copyText('SSH 密码', 'SSH Password')}><input value={form.sshPassword} onChange={(event) => update({ sshPassword: event.target.value })} required type="password" /></Field>
        )}
        {form.authMethod === 'private_key' && (
          <Field label={copyText('SSH 私钥', 'SSH Private Key')}><textarea value={form.privateKey} onChange={(event) => update({ privateKey: event.target.value })} required placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" /></Field>
        )}
        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={installing}><Play size={16} />{installing ? copyText('安装中', 'Installing') : copyText('一键安装', 'Install')}</button>
          <button className="secondary-button" type="button" onClick={() => setForm(defaultInstallForm)}>{copyText('清空', 'Reset')}</button>
        </div>
      </form>
      <div className="auto-steps">
        <StepItem index="1" title={copyText('SSH 连接', 'SSH Connect')} text={copyText('总控连接目标 VPS', 'Master connects to the VPS')} />
        <StepItem index="2" title={copyText('执行脚本', 'Run Installer')} text={copyText('脚本写入 systemd 并启动 Agent', 'Installer creates systemd service and starts agent')} />
        <StepItem index="3" title={copyText('自动上线', 'Auto Online')} text={copyText('Agent 心跳后出现在列表', 'Agent appears after heartbeat')} />
      </div>
      <details className="fallback-install">
        <summary>{copyText('备用：手动安装命令', 'Fallback: manual install command')}</summary>
        <code>{installCommand}</code>
        <button className="secondary-button full" type="button" onClick={onCopied}><Clipboard size={16} />{copyText('复制备用命令', 'Copy fallback command')}</button>
      </details>
      <div className="auto-fields">
        <InfoItem label={copyText('不会落库', 'Not Stored')} value={copyText('SSH 密码和私钥只用于本次请求', 'SSH password and private key are only used for this request')} />
        <InfoItem label={copyText('自动获取', 'Auto Collected')} value={copyText('公网 IP、在线状态、Agent 版本、内存占用', 'Public IP, online status, agent version, memory usage')} />
        <InfoItem label={copyText('安装结果', 'Install Result')} value={copyText('成功或失败会写入操作记录', 'Success or failure is written to task logs')} />
        <InfoItem label={copyText('要求', 'Requirement')} value={copyText('目标服务器需要 curl、git、go、systemd、sudo', 'Target needs curl, git, go, systemd, and sudo')} />
      </div>
    </section>
  );
}

function StepItem({ index, title, text }: { index: string; title: string; text: string }) {
  return <article className="step-item"><b>{index}</b><strong>{title}</strong><span>{text}</span></article>;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <div className="info-item"><span>{label}</span><strong>{value}</strong></div>;
}

function numberValue(value: string) {
  return Number.parseInt(value, 10) || 0;
}
