type CopyText = (zh: string, en: string) => string;

export function AgentAutoOnline({ copyText }: { copyText: CopyText }) {
  return (
    <section className="auto-online">
      <div className="auto-head">
        <strong>{copyText('安装后自动上线', 'Auto Online After Install')}</strong>
        <span>{copyText('不需要在面板手动新增被控服务器', 'No manual agent creation is needed in the panel')}</span>
      </div>
      <div className="auto-steps">
        <StepItem index="1" title={copyText('执行脚本', 'Run Installer')} text={copyText('脚本写入 systemd 并启动 Agent', 'Installer creates systemd service and starts agent')} />
        <StepItem index="2" title={copyText('心跳注册', 'Heartbeat')} text={copyText('Agent 每 30 秒向总控上报一次', 'Agent reports to master every 30 seconds')} />
        <StepItem index="3" title={copyText('自动入库', 'Auto Register')} text={copyText('总控按名称和地址更新节点记录', 'Master upserts node by name and host')} />
      </div>
      <div className="auto-fields">
        <InfoItem label={copyText('安装时填写', 'Installer Inputs')} value={copyText('节点名称、地区、总控地址、Token', 'Node name, region, master URL, token')} />
        <InfoItem label={copyText('自动获取', 'Auto Collected')} value={copyText('公网 IP、在线状态、Agent 版本、内存占用', 'Public IP, online status, agent version, memory usage')} />
        <InfoItem label={copyText('版本规则', 'Version Rule')} value={copyText('Agent 版本写在程序里，每次更新递增并随心跳上报', 'Agent version is compiled, bumped every update, and reported by heartbeat')} />
        <InfoItem label={copyText('标签', 'Tags')} value={copyText('系统内部自动标记，不再让你手动填写', 'Internal system tags are automatic and hidden from manual input')} />
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
