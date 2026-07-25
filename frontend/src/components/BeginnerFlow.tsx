type BeginnerFlowProps = {
  copyText: (zh: string, en: string) => string;
  onlineServers: number;
  exitCount: number;
  onOpenServers: () => void;
  onOpenNodes: () => void;
  onOpenTasks: () => void;
};

export function BeginnerFlow({
  copyText,
  onlineServers,
  exitCount,
  onOpenServers,
  onOpenNodes,
  onOpenTasks,
}: BeginnerFlowProps) {
  return (
    <section className="beginner-flow">
      <div className="flow-title">
        <strong>{copyText('上线流程', 'Launch Flow')}</strong>
        <span>{copyText('接入 Agent 后部署协议，任务全程可追踪。', 'Enroll an agent, deploy a protocol, and audit every task.')}</span>
      </div>
      <div className="flow-cards">
        <article className={onlineServers > 0 ? 'flow-card done' : 'flow-card'}>
          <b>1</b>
          <div>
            <strong>{copyText('接入 Agent', 'Enroll Agent')}</strong>
            <span>{onlineServers > 0 ? copyText(`${onlineServers} 台在线`, `${onlineServers} online`) : copyText('SSH 自动安装', 'Install over SSH')}</span>
          </div>
          <button className="secondary-button compact" type="button" onClick={onOpenServers}>
            {onlineServers > 0 ? copyText('查看', 'View') : copyText('安装', 'Install')}
          </button>
        </article>
        <article className={exitCount > 0 ? 'flow-card done' : 'flow-card'}>
          <b>2</b>
          <div>
            <strong>{copyText('部署协议', 'Deploy Protocol')}</strong>
            <span>{onlineServers > 0 ? copyText('选择模板并下发', 'Select template and deploy') : copyText('等待 Agent 在线', 'Wait for agent online')}</span>
          </div>
          <button className="secondary-button compact" type="button" onClick={onlineServers > 0 ? onOpenNodes : onOpenServers}>
            {onlineServers > 0 ? copyText('创建', 'Create') : copyText('去上线', 'Install')}
          </button>
        </article>
        <article className="flow-card">
          <b>3</b>
          <div>
            <strong>{copyText('审计任务', 'Audit Tasks')}</strong>
            <span>{copyText('查看安装和部署结果', 'Review install and deploy results')}</span>
          </div>
          <button className="secondary-button compact" type="button" onClick={onOpenTasks}>{copyText('查看', 'Open')}</button>
        </article>
      </div>
    </section>
  );
}
