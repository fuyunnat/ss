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
        <strong>{copyText('新手就按这 3 步走', 'Beginner path')}</strong>
        <span>{copyText('不用先理解 Gateway、策略、任务这些概念，先把服务器上线，再创建一个节点。', 'Get an agent online first, then create one usable node.')}</span>
      </div>
      <div className="flow-cards">
        <article className={onlineServers > 0 ? 'flow-card done' : 'flow-card'}>
          <b>1</b>
          <div>
            <strong>{copyText('面板一键安装被控', 'One-click agent install')}</strong>
            <span>{onlineServers > 0 ? copyText(`已有 ${onlineServers} 台在线`, `${onlineServers} online`) : copyText('填写 SSH 信息后自动安装', 'Enter SSH info and install automatically')}</span>
          </div>
          <button className="secondary-button compact" type="button" onClick={onOpenServers}>
            {onlineServers > 0 ? copyText('查看', 'View') : copyText('安装', 'Install')}
          </button>
        </article>
        <article className={exitCount > 0 ? 'flow-card done' : 'flow-card'}>
          <b>2</b>
          <div>
            <strong>{copyText('选择协议创建节点', 'Create protocol node')}</strong>
            <span>{onlineServers > 0 ? copyText('点进去选 VLESS / VMess / Trojan', 'Pick VLESS / VMess / Trojan') : copyText('服务器在线后再创建', 'Enabled after agent online')}</span>
          </div>
          <button className="secondary-button compact" type="button" onClick={onlineServers > 0 ? onOpenNodes : onOpenServers}>
            {onlineServers > 0 ? copyText('创建', 'Create') : copyText('去上线', 'Install')}
          </button>
        </article>
        <article className="flow-card">
          <b>3</b>
          <div>
            <strong>{copyText('看任务结果', 'Check result')}</strong>
            <span>{copyText('部署、重载、检查都在这里留记录', 'Deploy and reload results stay here')}</span>
          </div>
          <button className="secondary-button compact" type="button" onClick={onOpenTasks}>{copyText('查看', 'Open')}</button>
        </article>
      </div>
    </section>
  );
}
