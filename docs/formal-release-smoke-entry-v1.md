# 正式 Release Smoke 验收入口 v1

日期：2026-10-19。状态：工具修复；生产真实复验未执行。本规范不授权模型调用或部署。

## 首批3人免费试用与完整正式验收的适用范围

操作者于2026-10-19确认：首批3人、四周免费试用按
[试用计划第0节](trial-stage-commercial-validation-plan-2026-10-06.md#0-2026-10-19首批3人免费试用验收口径)
进行阶段业务验收，外部Trace暂缓，完整正式smoke不作为该阶段启动前置。
复用已有内部健康、真实写作、运行、反馈和费用证据；完整正式smoke保持not_passed，
不能将阶段业务证据写成正式验收通过。

下文仍是完整正式smoke的操作入口，脚本和HTTPS外部Trace断言不变。当前不重复
已知会因Trace缺失失败的预检，不请求OTP、不制造模型调用。扩员、收费、公开开放
或新生产发布时，重新确认现行门禁和执行授权；本阶段安排不豁免发布要求。

## 访问边界与版本证据

`deploy/release-smoke.sh` 仍是唯一完整验收入口；SSH包装器只提供传输和版本核对。
公网站点、TLS、Portal/Admin登录、签名catalog/runtime/结果/用量检查仍走 `BASE_URL`。
ready、operational-ready与内部observability使用 `NPCINK_CLOUD_INTERNAL_BASE_URL`。
单独指定的内部地址必须是带端口的 `http://127.0.0.1` origin，禁止远程主机、用户信息、路径、query或fragment。
公网内部接口的401/403是拒绝访问证据；私网不带token仍必须401，带token必须200。
内部loopback请求显式绕过调用方HTTP代理，避免把内部token交给代理。
通过SSH转发时，内部请求的Host、X-Forwarded-Host和X-Forwarded-Proto取自公网base origin，
保留受信任的Host/HTTPS语义；仅内部目标加这些头，公网请求不覆盖。拒绝URL用户信息、控制字符或额外路径进入头值。
worker、cadence、Provider freshness、callback压力及HTTPS外部trace断言保留。

`deploy/with-smoke-internal-tunnel.sh` 使用现有生产SSH账号/身份和预先固定的known_hosts，
启用BatchMode、IdentitiesOnly、StrictHostKeyChecking、ExitOnForwardFailure。
它临时将调用方 `127.0.0.1:18011` 转发到生产主机 `127.0.0.1:8010`；不修改监听、防火墙或Nginx。
缺少身份/固定host key、认证失败、端口冲突或通道失败均停止，不降级为公网内部访问。
调用成功、失败或正常信号退出都关闭control master并清理临时目录；清理失败不记通过。
不用生产secret作为SSH参数；SSH子进程环境去掉runtime/admin/邮箱凭据。

每次调用必须给出完整 `NPCINK_CLOUD_EXPECTED_DEPLOYED_SHA`。
包装器通过SSH只读解析 `current/release-bundle-manifest.json` 的 `source.revision`，执行前后均须匹配。
workflow还须查到同一目标SHA的成功Deploy Production；`tool_sha` 和被验收的 `production_sha` 分别记录。
工具可晚于应用，不把工具更新冒充服务器更新；也不把一个历史成功deploy当成当前仍安装该版本的充分证据。

## 下一次最省操作的验收顺序

由维护方代办命令和证据核对，操作员只处理短期验证码和真实执行授权。
本次PR仅合并master，不提升production、不部署、不执行真实smoke。
合并后原production分支仍可能是旧工具，**不要直接再次点击旧workflow重跑**。
优先从干净、已合并的工具版本，在操作员发起的受控SSH路径执行以下步骤；无需为工具修改生产应用或配置。
如果改用Actions，先另行评审隔离的production工具候选；当前合并master不等于production工作流已更新。

1. 维护方记录工具SHA、目标应用完整SHA及对应成功deploy URL，确认当前安装清单仍匹配。
   上次目标为 `b8cc6049da7d1c33cbfffc9f8e5521f332a1adb5`；下次必须重新只读核对，不能永久照抄。
   确认既有账号/站点、Provider预算、受保护凭据和known_hosts，不将值写入聊天、参数或回执。
2. **先只预检，不请求验证码**：检查公网边界、SSH、实际安装版本、内部ready/worker/cadence等。
   `--preflight-only` 在runtime生成和所有认证POST之前退出，不发送邮件、不消费OTP、不调用模型。
   输出必须包含 `NOT a formal smoke pass`；即使CI绿，也只能记预检通过。
3. 预检通过、维护方确认剩余预算和本次工作流调用边界后，再取得一次完整执行授权。
   操作员在受保护输入页保存一枚新OTP，不在Portal手动消费，不发到聊天或日志。
   每次真实执行沿用现有内部回退，不能承诺一次workflow等于一次Provider请求。
4. 去掉 `--preflight-only`，只运行一次完整canonical入口；失败即停，不自动重跑。
   完整门禁全部成功且执行后安装SHA相同，才记正式通过。
5. 保存工具/应用SHA、workflow或本地执行回执、北京时间、run/trace、Provider/模型/回退、token、积分增量。
   登录失败可能发生在模型执行之后，先核对账本再考虑新的执行授权；不复用旧OTP。

## 操作员发起的命令模板

以下环境文件必须在仓库外或忽略目录，0600，仅含受保护的正式验收凭据，参照
`deploy/release-smoke.env.example`。不要把admin key复制到生产 `.env.deploy`。
SSH变量是既有主机、账号、身份文件路径、known_hosts路径；不是新建凭据或扩大权限。
非默认proxy端口须先只读确认，再设置 `NPCINK_CLOUD_SMOKE_REMOTE_PORT`，不要猜测生产端口。

```bash
export NPCINK_CLOUD_DEPLOY_SSH_HOST=<existing-production-host>
export NPCINK_CLOUD_DEPLOY_SSH_USER=<existing-production-user>
export NPCINK_CLOUD_DEPLOY_IDENTITY_FILE=<existing-private-key-path>
export NPCINK_CLOUD_DEPLOY_KNOWN_HOSTS_FILE=<existing-pinned-known-hosts-path>
export NPCINK_CLOUD_EXPECTED_DEPLOYED_SHA=<verified-full-installed-application-sha>
export NPCINK_CLOUD_ENV_FILE=<protected-smoke-env-file>

bash deploy/with-smoke-internal-tunnel.sh -- \
  bash deploy/small-customer-trial-preflight.sh \
    --base-url https://cloud.npc.ink \
    --require-smoke-env --require-alipay-enabled \
    --run-release-smoke --preflight-only
```

上面的零模型预检**只要求内部认证token**；不要求管理员密钥、邮箱、站点/key ID、HMAC或OTP，
不声称这些未使用的正式凭据已验证有效。完整模式仍严格要求原有登录与签名runtime凭据。
零模型预检不触碰持久Portal cookie jar。
仅在另获真实执行授权及新OTP就绪后去掉最后的 `--preflight-only`。
完整入口不允许缺失凭据后跳过登录。Windows/macOS/Linux本地命令不是第二个部署入口。

GitHub Release Smoke使用相同包装器和canonical脚本，默认 `preflight_only=true`；
正式执行须明确false。沿用production Environment的既有 `PROD_SSH_KEY`、`PROD_SSH_HOST`、
`PROD_SSH_USER`、`PROD_SSH_PORT`、`PROD_SSH_KNOWN_HOSTS`、`PROD_REMOTE_DIR`，
不自动新建secret、获取host key或在运行中修改保护规则。SSH身份放在runner临时0700目录、0600文件并always清理。

## 零付费回归、证据与回退

聚焦测试使用假的curl与SSH，不连接生产或Provider。覆盖公网403/私网200、私网认证要求、
私网故障在生成前停止、全流程恰好一次合成runtime请求、预检无OTP/模型请求、
内部地址拒绝重定向或远程origin、版本不符/中途变化、SSH失败、退出与清理、secret不进argv/日志。
新增真实生产来源校验中间件测试：原始loopback转发来源被400拒绝，脚本实际生成的规范头通过；
同时验证仅内部token可预检、完整模式缺凭据在请求前停止、不安全公网origin不能注入头，
以及缺少外部trace配置时仍失败。本轮不重新运行生产smoke。
历史真实标题、人工保存回读及一次正式smoke失败见
[2026-10-19验收记录](history/production/2026/deepseek-title-production-acceptance-2026-10-19.md)。

当前限制：本地mock与正式CI不能证明真实生产SSH转发许可、受保护secret值或后续模型质量。
这些留给上述下一次零模型预检/有界真实执行；本轮不制造这些证据。
回退通过独立revert PR撤销工具修复；不改数据库、Provider配置、Nginx ACL或生产应用。


## 独立后续：外部 trace

2026-10-19只读生产预检确认：API及核心worker检查正常，但OTLP exporter和trace query未配置。
这是独立运维后续；本轮不配置、不放宽现有trace断言，也不将零模型预检或标题成功记成完整正式smoke通过。
请求头与凭据要求修复后，缺少trace的环境仍会如实停在trace门禁。

## 正文润色闭环：最简人工验收

以下为后续人工验收，点击AI会使用实际预算；本轮没有执行。此前通过的邮箱与站点连接不用重复验证。

1. 在 `https://test.getimg.net/` 打开一篇测试草稿，保留原文；能看到积分时记一下当前值。
2. 选一段正文，只点一次现有的润色/改写操作，要求“保留原意和事实，只改善表达”。预期返回可采用的正文，不夹带推理说明。
3. 人工检查并采用，点击保存草稿，再刷新页面。预期润色内容保留，文章仍是草稿，其他正文没有意外改变。
4. 回复“通过/失败＋北京时间”，附结果或错误截图、可见的积分前后值即可。运行/模型/token由维护方只读代查；失败先停止，不连续重试，不需要贴全文或密钥。
