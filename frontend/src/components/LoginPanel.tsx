import { FormEvent, useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { api, setAuthSession } from '../api';
import type { AuthSession } from '../types';

interface LoginPanelProps {
  onLogin: (session: AuthSession) => void;
}

export function LoginPanel({ onLogin }: LoginPanelProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await api.login({ username, password });
      setAuthSession(session);
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-mark"><LockKeyhole size={20} /></div>
        <div className="login-title">
          <span>Proxy Control</span>
          <h1>代理总控登录</h1>
          <p>默认账号 admin，默认密码 admin；生产环境请在后端环境变量修改。</p>
        </div>
        {error && <div className="alert error-alert">{error}</div>}
        <form className="control-form" onSubmit={submit}>
          <label className="field">
            <span>账号</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </label>
          <label className="field">
            <span>密码</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required type="password" />
          </label>
          <button className="primary-button full" type="submit" disabled={loading}>
            <LogIn size={17} />{loading ? '登录中' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}
