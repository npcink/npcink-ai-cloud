# Release Smoke 验收入口 v1

更新：2026-11-12。状态：开发期默认轻量检查；完整验收按需执行。
本规范不授权生产部署、配置修改或模型调用。

## 开发期默认口径

操作者于2026-11-12确认：项目仍在开发期，使用简单、必要的 smoke，
暂缓外部 Trace / Grafana 接入，不作为当前必需待办。
`deploy/release-smoke.sh --lightweight` 是同一个 canonical 入口的只读模式，
目标2–3分钟，不发验证码、不建立登录会话、不重连站点、不调用模型、不测试支付。
缺少内部 token 或既有测试站点 site/key/secret 时直接失败，不创建新凭据或静默跳过。

普通 runtime 发布默认执行轻量模式；显式选择 `run_formal_release_smoke=true`
时改跑完整模式，不再重复跑轻量模式。static / no_deploy 保持原有范围验证；
首次安装仍按现有独立安装验收与 finalize 流程，不由本决策自动豁免。

| 默认检查 | 通过条件 |
| --- | --- |
| 安装版本与发布终态 | SSH只读核对 installed manifest 完整SHA，执行前后相同；无部署锁、失败标记或全局one-off锁 |
| 公共/内部健康 | public live 200；public ready拒绝；private ready无token 401、带token 200 |
| 必要worker | private operational-ready 200，required_workers非空 |
| 页面 | 首页、Portal登录页、Admin登录页200；匿名Admin设置页跳到登录 |
| 站点认证 | unsigned catalog读被拒绝；现有测试站点HMAC签名catalog读200且目录非空 |

部署工具已完成的切换健康、worker等待和终态证据直接复用；轻量脚本只即时采样，
不再等待cadence，不查询observability/Trace，不重复运行模型。
每个HTTP请求连接超时3秒、总超时10秒；默认Actions步骤上限3分钟，失败即停。
本地执行同样使用逐请求超时，SSH保持现有连接/保活超时；2–3分钟是目标，不是所有网络故障的保证。

版本/发布包身份、完整性、安全扫描、数据库安全和生产授权门禁不变。
轻量通过记作 `lightweight_passed`；未运行的完整验收仍记 `not_run`，不能写成正式通过。

## 何时补专项或完整验收

| 改动范围/触发 | 补验 |
| --- | --- |
| 登录、权限、站点连接/密钥 | 对应真实登录、拒绝访问或重连流程 |
| 模型执行、Provider、摘要/改写 | 另获有界模型授权后，真实稿对应操作及采用/保存回读 |
| 支付、试用、额度发放 | 现有商业预检及另获授权的真实交易/账本验收 |
| 数据库/schema | 原候选迁移、备份/恢复与一致性门禁 |
| 正式完整验收、Trace集成或扩大上线范围 | 重新确认所需外部服务、预算与授权，使用保留的完整入口 |

完整模式的HTTPS外部OTLP/query、worker/cadence、Provider freshness、callback、
真实登录、签名runtime/结果/用量断言保持严格。`--preflight-only` 仍是完整模式预检，
包含Trace门禁；它不是轻量模式。当前已知未配置Trace，不重复跑此预检或请求OTP。
需要完整验收时，先只预检；通过后取得新OTP与真实执行授权，再去掉预检参数执行一次。
失败先核对账本，不能假定一次workflow仅有一次Provider请求或自动重试。

## 访问边界与版本证据

公网TLS、页面及签名catalog/runtime仍走 `BASE_URL`；内部健康/observability走
`NPCINK_CLOUD_INTERNAL_BASE_URL`。不同内部origin必须是带端口的HTTP IPv4 loopback，
不能有userinfo/path/query/fragment。内部请求绕过HTTP代理，并按公网origin生成
Host / X-Forwarded-Host / X-Forwarded-Proto；不把内部token交给公网代理或任意远程地址。

`deploy/with-smoke-internal-tunnel.sh` 使用既有SSH身份和预先固定的known_hosts，
启用BatchMode、IdentitiesOnly、StrictHostKeyChecking、ExitOnForwardFailure，
临时转发 `127.0.0.1:18011` 到主机 `127.0.0.1:8010`。不修改服务监听、防火墙或Nginx。
执行前后均只读核对 installed SHA与发布终态；身份/端口/版本/终态错误即停。
成功、失败或正常信号退出均清理通道和临时凭据；清理失败不计通过。
SSH子进程不接收runtime/admin/邮箱凭据；秘密只经受保护环境或0600凭据文件进入脚本，禁止argv。

## 操作模板

以下由维护方执行，环境文件置于忽略目录或仓库外、0600。
轻量模式只填写 `NPCINK_CLOUD_INTERNAL_AUTH_TOKEN`、`NPCINK_CLOUD_RELEASE_SITE_ID`、
`NPCINK_CLOUD_RELEASE_KEY_ID`、`NPCINK_CLOUD_RELEASE_KEY_SECRET`；使用已有验收站点，
不复制admin key到生产 `.env.deploy`。参考 `deploy/release-smoke.env.example`。

```bash
export NPCINK_CLOUD_DEPLOY_SSH_HOST=<existing-production-host>
export NPCINK_CLOUD_DEPLOY_SSH_USER=<existing-production-user>
export NPCINK_CLOUD_DEPLOY_IDENTITY_FILE=<existing-private-key-path>
export NPCINK_CLOUD_DEPLOY_KNOWN_HOSTS_FILE=<existing-pinned-known-hosts-path>
export NPCINK_CLOUD_EXPECTED_DEPLOYED_SHA=<verified-full-installed-application-sha>
export NPCINK_CLOUD_ENV_FILE=<protected-smoke-env-file>

bash deploy/with-smoke-internal-tunnel.sh -- \
  bash deploy/release-smoke.sh --lightweight --base-url https://cloud.npc.ink
```

完整验收仍用同一命令去掉 `--lightweight`；预检改为 `--preflight-only`，两者不能混用。
独立Actions `Release Smoke` 保留完整模式与 exact-SHA成功Deploy绑定，默认
`preflight_only=true`；只有另获授权才设false。完整模式仍要求admin、邮箱、有效OTP、
签名runtime凭据及外部Trace；商业专项仍可使用 `small-customer-trial-preflight.sh`。
已合并master的工具不代表production workflow已更新，发布需精确候选及独立授权。

## 验证与记录

聚焦回归使用假curl/SSH和真实HMAC校验，不连接生产或Provider。
覆盖零POST/零模型、缺凭据早停、认证拒绝、签名失败、页面/worker异常、超时参数、
无Trace环境轻量通过而完整预检失败、SHA/终态变化、敏感值不进argv/日志及临时文件清理。
本地/CI、合并、生产和人工证据分别记账；mock通过不证明真实生产凭据、网络或编辑质量。

保留工具SHA、应用SHA、执行时间、部署/检查回执与失败位置即可，不新增监控平台。
历史配置与提速实测见[2026-11-12记录](history/production/2026/release-smoke-and-transfer-2026-11-12.md)。
回退通过独立revert撤销工具/工作流变更，不修改数据库或业务配置。
