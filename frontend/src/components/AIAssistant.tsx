import { FormEvent, useEffect, useState } from 'react';
import { Bot, Play, Send, ServerCog, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { AgentInstallRequest, AIAction, AIChatResponse, SystemSettings } from '../types';
import { CustomSelect, Field } from './ui';

interface AIAssistantProps {
  copyText: (zh: string, en: string) => string;
  settings: SystemSettings | null;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onRefresh: () => Promise<void>;
}

function createBatchDefaults(settings?: SystemSettings | null): AgentInstallRequest {
  return {
    sshHost: '',
    sshPort: 22,
    sshUser: 'root',
    authMethod: 'agent',
    sshPassword: '',
    privateKey: '',
    masterUrl: settings?.agentMasterUrl || '',
    agentToken: '',
    nodeName: '',
    region: '',
    nodeHost: '',
  };
}

export function AIAssistant({ copyText, settings, onError, onNotice, onRefresh }: AIAssistantProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [response, setResponse] = useState<AIChatResponse | null>(null);
  const [batchDefaults, setBatchDefaults] = useState<AgentInstallRequest>(() => createBatchDefaults(settings));
  const updateDefaults = (patch: Partial<AgentInstallRequest>) => setBatchDefaults((current) => ({ ...current, ...patch }));

  useEffect(() => {
    if (!settings?.agentMasterUrl) return;
    setBatchDefaults((current) => ({ ...current, masterUrl: current.masterUrl || settings.agentMasterUrl }));
  }, [settings?.agentMasterUrl]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = message.trim();
    if (!input) return;
    setLoading(true);
    setResponse(null);
    try {
      setResponse(await api.aiChat({ message: input }));
    } catch (err) {
      onError(err instanceof Error ? err.message : copyText('AI 请求失败', 'AI request failed'));
    } finally {
      setLoading(false);
    }
  }

  async function executeInstallActions() {
    const actions = response?.actions.filter((item) => item.type === 'install_agent') ?? [];
    if (actions.length === 0) return;
    if (!batchDefaults.masterUrl || !settings?.agentTokenConfigured) {
      onError(copyText('先到系统设置保存总控地址和 Agent Token，才能批量安装', 'Save the master URL and agent token in system settings before batch install'));
      return;
    }
    setExecuting(true);
    onError('');
    try {
      let success = 0;
      for (const action of actions) {
        await api.installAgent(buildInstallPayload(action, batchDefaults));
        success += 1;
      }
      onNotice(copyText(`已创建 ${success} 个安装任务，等待 Agent 心跳上线`, `${success} install tasks created; waiting for heartbeat`));
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : copyText('批量安装失败', 'Batch install failed'));
    } finally {
      setExecuting(false);
    }
  }

  const installActions = response?.actions.filter((item) => item.type === 'install_agent') ?? [];

  return (
    <div className="ai-assistant">
      <section className="ai-compose">
        <div className="task-guide">
          <strong>{copyText('AI 批量运维 Agent', 'AI Batch Operations Agent')}</strong>
          <span>{copyText('粘贴服务器清单或直接说“帮我安装这些机器”，AI 会生成可确认执行的安装任务草案。', 'Paste server lists or ask for installs; AI will generate confirmable install task drafts.')}</span>
        </div>
        <form className="control-form" onSubmit={submit}>
          <label className="field">
            <span>{copyText('要 AI 帮你做什么', 'What should AI do')}</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={4000}
              placeholder={copyText('例如：帮我把这些服务器安装成被控端：\n1.2.3.4 HK hk-01\nroot@5.6.7.8:22 JP jp-01', 'Example: Install these servers as agents:\n1.2.3.4 HK hk-01\nroot@5.6.7.8:22 JP jp-01')}
              required
            />
          </label>
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={loading}><Send size={16} />{loading ? copyText('分析中', 'Analyzing') : copyText('生成任务草案', 'Draft Tasks')}</button>
          </div>
        </form>

        <section className="batch-defaults">
          <div className="sub-panel-head">
            <strong>{copyText('批量安装默认参数', 'Batch Install Defaults')}</strong>
            <span>{copyText('多台服务器共用这些参数；每台的 IP、名称、地区由 AI 从清单识别。', 'Shared across servers; IP, name, and region are inferred from the list.')}</span>
          </div>
          <div className="form-row">
            <Field label={copyText('总控地址', 'Master URL')}><input value={batchDefaults.masterUrl} onChange={(event) => updateDefaults({ masterUrl: event.target.value })} placeholder="http://master.example.com:8080" /></Field>
            <Field label={copyText('接入 Token', 'Access Token')}><input value={settings?.agentTokenConfigured ? copyText('已在系统设置配置，执行时自动使用', 'Configured in system settings and used automatically') : copyText('未配置，请到系统设置保存 Token', 'Missing; save token in system settings')} readOnly disabled /></Field>
          </div>
          <div className="form-row three">
            <Field label={copyText('默认 SSH 用户', 'Default SSH User')}><input value={batchDefaults.sshUser} onChange={(event) => updateDefaults({ sshUser: event.target.value })} /></Field>
            <Field label={copyText('默认 SSH 端口', 'Default SSH Port')}><input value={batchDefaults.sshPort} onChange={(event) => updateDefaults({ sshPort: numberValue(event.target.value) })} type="number" min="1" /></Field>
            <Field label={copyText('默认地区', 'Default Region')}><input value={batchDefaults.region} onChange={(event) => updateDefaults({ region: event.target.value })} placeholder="HK" /></Field>
          </div>
          <Field label={copyText('认证方式', 'Auth Method')}>
            <CustomSelect
              ariaLabel={copyText('认证方式', 'Auth Method')}
              value={batchDefaults.authMethod}
              options={[
                { value: 'agent', label: copyText('使用总控 SSH Key / ssh-agent', 'Use master SSH key / ssh-agent') },
                { value: 'private_key', label: copyText('粘贴私钥，本次批量使用', 'Paste private key for this batch') },
                { value: 'password', label: copyText('SSH 密码，本次批量使用', 'SSH password for this batch') },
              ]}
              onChange={(value) => updateDefaults({ authMethod: value as AgentInstallRequest['authMethod'], sshPassword: '', privateKey: '' })}
            />
          </Field>
          {batchDefaults.authMethod === 'password' && (
            <Field label={copyText('SSH 密码', 'SSH Password')}><input value={batchDefaults.sshPassword} onChange={(event) => updateDefaults({ sshPassword: event.target.value })} type="password" /></Field>
          )}
          {batchDefaults.authMethod === 'private_key' && (
            <Field label={copyText('SSH 私钥', 'SSH Private Key')}><textarea value={batchDefaults.privateKey} onChange={(event) => updateDefaults({ privateKey: event.target.value })} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" /></Field>
          )}
        </section>
      </section>

      <section className="ai-result">
        <div className="ai-result-head">
          <Bot size={18} />
          <div>
            <strong>{copyText('任务草案', 'Task Drafts')}</strong>
            <span>{response?.configured === false ? copyText('未配置 AI 时也能识别服务器清单', 'Server lists still work without AI config') : copyText('确认后才会执行', 'Executes only after confirmation')}</span>
          </div>
        </div>
        {response ? (
          <>
            <p>{response.reply}</p>
            {installActions.length > 0 && (
              <div className="ai-actions">
                <span><ServerCog size={14} />{copyText('待确认安装任务', 'Install Actions')}</span>
                {installActions.map((item) => (
                  <article key={item.id}>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </article>
                ))}
                <button className="primary-button full" type="button" disabled={executing} onClick={executeInstallActions}>
                  <Play size={16} />{executing ? copyText('正在创建任务', 'Creating tasks') : copyText(`确认批量安装 ${installActions.length} 台`, `Confirm install ${installActions.length}`)}
                </button>
              </div>
            )}
            <div className="ai-plan">
              <span><Sparkles size={14} />{copyText('建议步骤', 'Suggested Steps')}</span>
              {response.plan.map((item) => <b key={item}>{item}</b>)}
            </div>
          </>
        ) : (
          <div className="empty-state"><Bot size={20} /><strong>{copyText('等待服务器清单或操作指令', 'Waiting for server list or operation request')}</strong></div>
        )}
      </section>
    </div>
  );
}

function buildInstallPayload(action: AIAction, defaults: AgentInstallRequest): AgentInstallRequest {
  const payload = action.payload;
  return {
    sshHost: String(payload.sshHost ?? ''),
    sshPort: numberValue(String(payload.sshPort ?? defaults.sshPort)),
    sshUser: String(payload.sshUser ?? defaults.sshUser),
    authMethod: defaults.authMethod,
    sshPassword: defaults.sshPassword,
    privateKey: defaults.privateKey,
    masterUrl: defaults.masterUrl,
    agentToken: defaults.agentToken,
    nodeName: String(payload.nodeName ?? payload.sshHost ?? ''),
    region: String(payload.region ?? defaults.region),
    nodeHost: String(payload.nodeHost ?? ''),
  };
}

function numberValue(value: string) {
  return Number.parseInt(value, 10) || 0;
}
