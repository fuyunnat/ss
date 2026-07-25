import { Bot, CheckCircle2, Clipboard, KeyRound, LockKeyhole, ServerCog, Settings, ShieldAlert, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SystemSettings } from '../types';

interface SystemSettingsPanelProps {
  copyText: (zh: string, en: string) => string;
  installCommand: string;
  settings: SystemSettings | null;
  onNotice: (message: string) => void;
}

export function SystemSettingsPanel({ copyText, installCommand, settings, onNotice }: SystemSettingsPanelProps) {
  const loaded = Boolean(settings);

  async function copy(text: string) {
    await navigator.clipboard?.writeText(text);
    onNotice(copyText('已复制', 'Copied'));
  }

  const masterCommand = settings?.masterConfigCommand || 'proxy-control config';
  const agentCommand = settings?.agentConfigCommand || 'proxy-control-agent config';

  return (
    <div className="settings-page">
      <section className="settings-grid">
        <SettingCard
          icon={Settings}
          title={copyText('控制台配置', 'Console Config')}
          status={settings ? copyText('已读取', 'Loaded') : copyText('读取中', 'Loading')}
          good={Boolean(settings)}
          rows={[
            [copyText('监听地址', 'Listen Address'), settings?.httpAddr || '-'],
            [copyText('跨域来源', 'CORS Origin'), settings?.corsAllowOrigin || '-'],
            [copyText('数据目录', 'Data Directory'), settings?.dataDir || '-'],
            [copyText('前端托管', 'Frontend Hosting'), !loaded ? '-' : settings?.frontendEnabled ? copyText('已启用', 'Enabled') : copyText('未启用', 'Disabled')],
          ]}
        />
        <SettingCard
          icon={LockKeyhole}
          title={copyText('登录安全', 'Login Security')}
          status={!loaded ? copyText('读取中', 'Loading') : settings?.defaultAdminPassword ? copyText('需修改', 'Action needed') : copyText('正常', 'OK')}
          good={loaded && !settings?.defaultAdminPassword}
          rows={[
            [copyText('管理员账号', 'Admin User'), settings?.adminUsername || '-'],
            [copyText('默认密码', 'Default Password'), !loaded ? '-' : settings?.defaultAdminPassword ? copyText('仍是 admin/admin', 'Still admin/admin') : copyText('已修改', 'Changed')],
            [copyText('会话密钥', 'Session Secret'), !loaded ? '-' : settings?.sessionSecretCustom ? copyText('已单独配置', 'Custom') : copyText('跟随默认生成', 'Default derived')],
          ]}
        />
        <SettingCard
          icon={KeyRound}
          title={copyText('被控接入', 'Agent Access')}
          status={!loaded ? copyText('读取中', 'Loading') : settings?.agentTokenConfigured ? copyText('Token 已配置', 'Token configured') : copyText('未配置 Token', 'Token missing')}
          good={loaded && settings?.agentTokenConfigured}
          rows={[
            ['Agent Token', settings?.agentTokenConfigured ? copyText('已配置，不回显密钥', 'Configured, secret hidden') : copyText('未配置', 'Missing')],
            [copyText('主控服务', 'Master Service'), settings?.masterServiceName || 'proxy-control'],
            [copyText('被控服务', 'Agent Service'), settings?.agentServiceName || 'proxy-control-agent'],
          ]}
        />
        <SettingCard
          icon={Bot}
          title={copyText('AI 接口', 'AI API')}
          status={!loaded ? copyText('读取中', 'Loading') : settings?.aiConfigured ? copyText('已启用', 'Enabled') : copyText('未启用', 'Disabled')}
          good={loaded && settings?.aiConfigured}
          rows={[
            [copyText('接口地址', 'Base URL'), settings?.aiBaseUrl || copyText('未配置', 'Not configured')],
            ['API Key', settings?.aiApiKeyConfigured ? copyText('已配置，不回显密钥', 'Configured, secret hidden') : copyText('未配置', 'Missing')],
            [copyText('模型', 'Model'), settings?.aiModel || '-'],
          ]}
        />
      </section>

      <section className="settings-actions">
        <div className="sub-panel-head">
          <div>
            <strong>{copyText('运维命令', 'Operations Commands')}</strong>
            <span>{copyText('系统级配置通过主控服务器命令修改，保存后服务会按脚本重启。', 'System config is changed on the master server; scripts restart services after saving.')}</span>
          </div>
        </div>
        <CommandRow
          icon={Terminal}
          label={copyText('修改主控配置', 'Edit master config')}
          command={masterCommand}
          copyLabel={copyText('复制', 'Copy')}
          onCopy={() => copy(masterCommand)}
        />
        <CommandRow
          icon={ServerCog}
          label={copyText('修改被控配置', 'Edit agent config')}
          command={agentCommand}
          copyLabel={copyText('复制', 'Copy')}
          onCopy={() => copy(agentCommand)}
        />
        <CommandRow
          icon={Clipboard}
          label={copyText('被控安装命令模板', 'Agent install template')}
          command={installCommand}
          copyLabel={copyText('复制', 'Copy')}
          onCopy={() => copy(installCommand)}
        />
      </section>

      <section className="settings-note">
        <ShieldAlert size={18} />
        <div>
          <strong>{copyText('安全说明', 'Security Note')}</strong>
          <span>{copyText('密码、Agent Token、AI Key 不会从后端回传到浏览器；这里只显示是否已配置。', 'Passwords, agent tokens, and AI keys are never returned to the browser; this page only shows configured status.')}</span>
        </div>
      </section>
    </div>
  );
}

function SettingCard({ icon: Icon, title, status, good, rows }: { icon: LucideIcon; title: string; status: string; good?: boolean; rows: Array<[string, string]> }) {
  return (
    <article className="setting-card">
      <div className="setting-card-head">
        <Icon size={17} />
        <strong>{title}</strong>
        <em className={good ? 'good' : 'warn'}>{good ? <CheckCircle2 size={13} /> : <ShieldAlert size={13} />}{status}</em>
      </div>
      <div className="setting-rows">
        {rows.map(([label, value]) => (
          <div className="setting-row" key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function CommandRow({ icon: Icon, label, command, copyLabel, onCopy }: { icon: LucideIcon; label: string; command: string; copyLabel: string; onCopy: () => void }) {
  return (
    <div className="command-row">
      <Icon size={16} />
      <span>{label}</span>
      <code>{command}</code>
      <button className="secondary-button compact" type="button" onClick={onCopy}><Clipboard size={14} />{copyLabel}</button>
    </div>
  );
}
