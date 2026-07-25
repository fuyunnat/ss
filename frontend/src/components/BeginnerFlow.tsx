type BeginnerFlowProps = {
  copyText: (zh: string, en: string) => string;
  installCommand: string;
  onlineServers: number;
  exitCount: number;
  onCopy: () => void;
  onOpenServers: () => void;
  onOpenNodes: () => void;
  onOpenTasks: () => void;
};

export function BeginnerFlow({
  copyText,
  installCommand,
  onlineServers,
  exitCount,
  onCopy,
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
            <strong>{copyText('复制命令到 VPS 执行', 'Run installer on VPS')}</strong>
            <span>{onlineServers > 0 ? copyText(`已有 ${onlineServers} 台在线`, `${onlineServers} online`) : copyText('跑完脚本会自动上线', 'Agent appears automatically')}</span>
          </div>
          <button className="secondary-button compact" type="button" onClick={onlineServers > 0 ? onOpenServers : onCopy}>
            {onlineServers > 0 ? copyText('查看', 'View') : copyText('复制', 'Copy')}
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
      <code>{installCommand}</code>
    </section>
  );
}
