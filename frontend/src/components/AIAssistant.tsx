import { FormEvent, useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { AIChatResponse } from '../types';

interface AIAssistantProps {
  copyText: (zh: string, en: string) => string;
  onError: (message: string) => void;
}

export function AIAssistant({ copyText, onError }: AIAssistantProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIChatResponse | null>(null);

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

  return (
    <div className="ai-assistant">
      <section className="ai-compose">
        <div className="task-guide">
          <strong>{copyText('AI 运维助手', 'AI Operations Assistant')}</strong>
          <span>{copyText('它会读取总控当前状态，给出排查、部署和调度建议；真正执行仍需要你在面板里确认。', 'It reads control-plane state and proposes operations; actual execution still needs panel confirmation.')}</span>
        </div>
        <form className="control-form" onSubmit={submit}>
          <label className="field">
            <span>{copyText('告诉 AI 你想做什么', 'Ask AI what to do')}</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={4000}
              placeholder={copyText('例如：帮我检查为什么香港节点不可用，并给出下一步处理。', 'Example: Check why the HK node is unavailable and suggest next steps.')}
              required
            />
          </label>
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={loading}><Send size={16} />{loading ? copyText('分析中', 'Analyzing') : copyText('发送', 'Send')}</button>
          </div>
        </form>
      </section>

      <section className="ai-result">
        <div className="ai-result-head">
          <Bot size={18} />
          <div>
            <strong>{copyText('回复', 'Response')}</strong>
            <span>{response?.configured === false ? copyText('后台 AI 未配置', 'Backend AI not configured') : copyText('建议先确认再执行', 'Confirm before executing')}</span>
          </div>
        </div>
        {response ? (
          <>
            <p>{response.reply}</p>
            <div className="ai-plan">
              <span><Sparkles size={14} />{copyText('建议步骤', 'Suggested Steps')}</span>
              {response.plan.map((item) => <b key={item}>{item}</b>)}
            </div>
          </>
        ) : (
          <div className="empty-state"><Bot size={20} /><strong>{copyText('等待你的问题', 'Waiting for your question')}</strong></div>
        )}
      </section>
    </div>
  );
}
