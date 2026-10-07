# 生产主机访问、DNS 与证书恢复记录（2026-10-07）

Status: dated host-maintenance evidence. 网站访问、主机解析和证书续期已恢复；
应用仍运行原版本，本文不是新版本部署、全部功能验收或试用启动声明。

本记录将本会话已授权的主机恢复操作回补 Git。它不修改应用源码、公共 API、
数据库、支付配置、Free 额度或 H1/H2/H3；不新增运维守护程序或自动发布。
权限和下一步仍以 [生产发布策略](../../../cloud-production-release-policy-v1.md)
与操作者对最终版本的授权为准。

## 1. 现场事实与原因

2026-10-07 直接 SSH 连接操作者提供的生产 IP 成功。主机可连接，不代表
主机能解析外部域名，也不代表网站的 443 端口正在服务。

| 检查 | 结果与解释 |
| --- | --- |
| 当前托管 release | `release-97bae233cba6c396-20260823164630-2404`；源码仍为 `b9d6f02d47fc2d393584d00309ff51dd72957ebd` |
| NGINX | failed，80/443 未监听；应用 127.0.0.1:8010 仍监听 |
| NGINX 失败日志 | 10 月 4 日开机时，私有 relay 所绑定的 Tailscale 地址尚不可用，`bind() ... Cannot assign requested address` 导致启动失败 |
| 当日配置检查 | Tailscale 地址就绪后 `nginx -t` 通过；检查通过本身不证明服务已运行 |
| Certbot 定时任务 | 已启用且 active，有下次执行时间；有效 ExecStart 直接调用现有 Certbot renew，未发现 pre/post 钩子停止 NGINX |
| 最近续期失败 | 日志显示无法解析 `acme-v02.api.letsencrypt.org`，还未进入有效续期 |
| 主机 DNS | `100.100.2.136`、`100.100.2.138` 的有界查询超时；`223.5.5.5`、`223.6.6.6` 能返回生产/演练 ACME 的有效答案 |
| Tailscale 规则 | ts-input 丢弃非 tailscale0 接口上源自 `100.64.0.0/10` 的流量；两个原 DNS 地址均在此范围；一次查询窗口内该 DROP 计数增加 5 |
| RDS | 两个公共 DNS 均将当前 RDS 域名解析为一个私有 IPv4；使用实际应用配置的新连接、只读 SELECT 1 通过，未输出域名、地址或凭据 |
| 原证书 | 到期时间 `2026-10-20 16:26:33 UTC`，尚未过期，但已不满足发布要求的至少 30 天剩余有效期 |

Tailscale 官方说明其默认防伪造规则会丢弃上述外部 CGNAT 流量，现场规则与
地址冲突解释了主机解析超时；本轮保留该安全规则。
[Tailscale netfilter modes](https://tailscale.com/docs/reference/netfilter-modes)
阿里文档区分 VPC 内网 DNS 与公共 DNS 的用途，因此只以当前 RDS 实测为
兼容证据，不推断所有阿里私有域名都能经公共 DNS 解析。
[阿里 ECS 自定义 DNS](https://www.alibabacloud.com/help/en/ecs/how-do-i-customize-the-dns-settings-of-a-linux-instance)

## 2. 已完成操作与验证

操作者确认证书维护，随后同意继续诊断和恢复。所有操作均绑定上述已有
release，使用现有 `.deploy-lock`，只释放本任务取得的锁。

1. 核对 Tailscale 地址已存在、现有 NGINX 配置有效，启动原 NGINX 服务。
   本机 HTTPS 和从 Mac 经生产公网 IP、正确 SNI 的 HTTPS `/health/live`
   均通过，返回 production / `b9d6f02d47fc` / source_dirty=false。
2. 将原 DNS 设置与解析文件保存在主机 root 管理的
   `/var/lib/npcink-ai-cloud/edge/dns-recovery-2026-10-07.*` 目录。
   首次 NetworkManager 更新后的实际解析验证超时，自动恢复原设置；只读
   核对原配置、解析文件哈希、NGINX active 及锁释放均通过。
3. 第二次更新 eth0 的持久 DNS 为 `223.5.5.5,223.6.6.6`、
   ipv4.ignore-auto-dns=yes，使用现有 `nmcli device reapply eth0` 在线应用。
   同时核对并同步系统实际解析文件，保留原其他行与 root:root/0644；没有
   down/up 网卡、修改 IP/网关、重启主机或 Docker。实际 getent、ACME HTTPS
   信任检查、新建只读数据库连接和原 HTTPS 健康均通过，才保留此变更。
4. 使用原 Certbot 账户、webroot 和持久 deploy hook，对同一 cloud.npc.ink
   lineage 做一次 dry-run 和一次真实 renew，均通过。没有 force-renew、
   更换 authenticator、复制 TLS 密钥或降低权限/有效期要求。
5. 新证书有效期为 `2026-10-07 01:17:37 UTC` 至
   `2027-01-05 01:17:36 UTC`；至少 30 天有效期、NGINX active 和 HTTPS 健康
   通过。notBefore 是证书字段，不用于推算实际操作起止时刻。
6. 运行既有 [正式证书就绪刷新工作流](https://github.com/npcink/npcink-ai-cloud/actions/runs/37561276295)，
   结论 success。它重新演练、执行持久钩子并核验证书/密钥/NGINX 绑定及实际
   served leaf，生成 root 保护的正式 receipt；日志为 age_seconds=0。
7. 对未改源码的生产包装候选 `1a3c7e583bef73ee7f8411d33c7c2b981ea388fc`
   重跑 official promotion preflight，local_gates=passed、deploy_secrets_ready=true、
   promotion_preflight=ready；脚本记录 34.756 秒。
   绑定的 [只读证书检查](https://github.com/npcink/npcink-ai-cloud/actions/runs/37561363399)
   通过。该候选树等于 master `b5cf4cf6137b7876e6c7e0089769eaf517e131ff`；
   之后如改变候选或 base，必须重新绑定证据。

早先 [刷新失败记录](https://github.com/npcink/npcink-ai-cloud/actions/runs/37555413558)
是剩余有效期不足 30 天，未进入 dry-run/reload；失败的 generate 已撤销旧
stale receipt，不能借旧记录放行。一次只读诊断使用了不适合 Certbot 顶层
配置格式的解析器，另一次 ACME curl 等待未被采集脚本捕获；这些采集错误
不是新增服务器故障。日志保留，按操作者两次错误即停的要求分轮恢复；
没有因观察超时重复启动已在执行的维护任务。

## 3. 恢复与遗留边界

- DNS 原状态：ipv4.dns 为空、ipv4.ignore-auto-dns=no；回退时恢复持久配置、
  在线应用并回读备份解析文件。回退只撤销本次改动，可能恢复原来的解析故障，
  不能视为自动恢复健康；必须再核验主机解析、数据库和 HTTPS。
- 证书已经成功轮换，不自动换回旧证书；原 lineage/archive 和 Certbot 续期
  机制保留，私钥、ACME 账户、完整日志和 protected configuration 不进入 Git。
- NetworkManager 持久配置已回读确认；未实际重启主机或网卡。NGINX 与私有
  Tailscale relay 的开机依赖顺序仍待独立修正/重启验收；当前启动成功不能
  声称未来重启也已验收。记录为后续运维任务，不在本轮扩大到新后台机制。
- 主机恢复不是 Free 新版本上线。当前运行版本、数据库迁移和试用状态仍按
  [生产准备记录](../../../production-release-readiness-plan-2026-10-06.md)与
  [发布检查清单](../../../../deploy/RELEASE_CHECKLIST.md)逐项核对。
- 镜像构建/扫描、精确 bundle、候选数据库预检、匹配快照/回滚点、付费 Provider
  日/月硬上限、最终应用部署授权及操作者真实生产使用验收仍未由本记录证明。
  参考图编辑暂缓、图像可用性与原生 agent_feedback 缺口保持独立；T+0 未指定。

## 4. 本轮资源与结果

NGINX 启动 1 次；DNS 修复 2 次（首轮回滚、第二轮验证后保留）；有界原生
Certbot dry-run 1 次、真实 renew 1 次；正式 refresh 工作流 2 次（首轮在
演练前失败、第二轮成功并另做 dry-run）；成功后只读 preflight 1 次。
付费 Provider 调用 0，应用部署 0，数据库迁移 0。

原始证据保存在本任务忽略的 `.runtime/local-acceptance/` 与主机受保护的
`/var/lib/npcink-ai-cloud/edge/`。整体人工等待、恢复总耗时未测量；不以
SSH 命令耗时、证书字段或异步轮询间隔代替人的时间。记录文档自身按
docs-only 标准路径收口；不需要 M4 sync/deploy 或重复未变的应用测试。
