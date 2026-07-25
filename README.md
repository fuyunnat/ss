# fyss

多服务器代理总控面板。

主控作为统一入口，被控服务器作为出口节点。面板用于上线被控服务器、创建协议节点、配置主入口、分流到不同出口，并查看安装和部署任务记录。

## 安装主控

在主控服务器执行：

```bash
curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-master.sh | sudo bash
```

这个命令不是现场编译。服务器不需要 Go、Node、npm。

脚本会从 GitHub Release 下载已经编译好的 Linux 安装包，然后安装：

```text
Go 主控二进制 -> /opt/proxy-control/bin/proxy-control
前端静态文件 -> /opt/proxy-control/frontend/dist
配置文件     -> /etc/proxy-control/master.env
数据目录     -> /var/lib/proxy-control
系统服务     -> proxy-control.service
管理命令     -> /usr/bin/fyss
```

需要指定版本时：

```bash
curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-master.sh \
  | sudo env PROXY_CONTROL_VERSION=v0.1.0 bash
```

安装完成后打开：

```text
http://服务器IP:8080
```

默认登录：

```text
账号：admin
密码：admin
```

安装后请进入服务器执行：

```bash
fyss
```

常用命令：

```bash
fyss              # 打开管理菜单
fyss status       # 查看状态
fyss restart      # 重启主控
fyss log          # 查看日志
fyss config       # 修改端口、账号密码、Agent Token
fyss update       # 更新主控
fyss uninstall    # 卸载主控
```

## 安装被控端

推荐在主控面板里使用“服务器上线”，填写 VPS 的 SSH 信息后一键安装，被控端安装成功后会自动上线。

如果需要手动安装被控端，在被控服务器执行：

```bash
curl -fsSL https://raw.githubusercontent.com/fuyunnat/ss/feature/proxy-control-mvp/install-agent.sh \
  | sudo bash -s -- \
    --master-url http://主控IP:8080 \
    --token 主控_AGENT_TOKEN \
    --node-name hk-01 \
    --region HK
```

被控端也不需要 Go 环境。脚本会下载已经编译好的 Agent 安装包，并安装为系统服务：

```text
Agent 二进制 -> /opt/proxy-control-agent/proxy-control-agent
配置文件     -> /etc/proxy-control/agent.env
系统服务     -> proxy-control-agent.service
管理命令     -> /usr/bin/fyss
```

二进制安装包由 GitHub Actions 在发布 tag 时生成：

```text
fyss-master-linux-amd64.tar.gz
fyss-master-linux-arm64.tar.gz
fyss-agent-linux-amd64.tar.gz
fyss-agent-linux-arm64.tar.gz
```

被控端管理命令：

```bash
fyss              # 打开管理菜单
fyss status       # 查看状态
fyss restart      # 重启被控端
fyss log          # 查看日志
fyss config       # 修改主控地址、Token、节点名称、地区
fyss update       # 更新被控端
fyss uninstall    # 卸载被控端
```

`Agent Token` 在主控安装完成时会打印出来，也可以在主控服务器执行 `fyss config` 查看或修改。
