# 正式 smoke 前置核对与发布传输提速 — 2026-11-12

本记录接续[本次维护发布](connection-maintenance-release-2026-11-12.md)，
仅处理正式 smoke 的当前条件和发布包传输，不开启新的产品功能。

> 后续决策（2026-11-12）：操作者确认开发期采用零模型轻量 smoke，暂缓外部
> Trace / Grafana 接入。下文保留此前调查和提案；当前执行口径以
> [验收入口](../../../formal-release-smoke-entry-v1.md)为准，不继续将Trace列为必需待办。

## 正式 smoke 当前状态

只读核对 installed manifest：生产应用仍为
`6ef9e100b62ce591855c15d5eb3db56b922f2cce`，对应
[成功 Deploy 43171431374](https://github.com/npcink/npcink-ai-cloud/actions/runs/43171431374)。
2026-11-12 通过运行中 API 容器的 `get_settings()` 读取两项布尔事实：
`otlp_configured=false`、`trace_query_configured=false`。
这是应用实际读取的配置事实，不由 Docker 环境变量缺失推断结构化配置也为空。

完整正式 smoke 仍会在外部 Trace 门禁停止。本轮没有重跑已知会失败的预检，
没有请求/消费 OTP、执行模型或把既有编辑验收改写成 formal smoke 通过。
正式入口与门禁继续遵守[正式验收入口](../../../formal-release-smoke-entry-v1.md)。

最小后续沿用[既有 Trace 接入方案](../../trials/2026/trial-preflight-and-trace-minimum-plan-2026-10-19.md#实际需要准备的三项)：
优先复用兼容 OTLP/HTTP 的外部服务；若无现成服务，再选择托管候选，核对地域、
额度、数据范围及保留周期。不恢复生产 Compose 中已退役的 Collector/Jaeger，
不扩建指标平台或采集正文。实际需准备 Trace 接收 URL、受登录保护的查询 URL、
必要的专用写入凭据，并核对受保护配置的认证头注入路径；不能声称只填两个 URL
即可完成接入。启用需要受控配置与进程重建，另行授权。先以零模型 GET 的新
trace ID 证明外部可回读，再运行一次零模型预检，最后准备新 OTP 与有界模型预算，
只跑一次完整 canonical smoke。

操作者本轮确认目前没有外部 Trace 服务，先要最小方案。建议以 Grafana Cloud
Traces 为托管候选，先核对可用地域及当前额度，不先购买或开通账户。准备一个
仅可写入 traces 的专用凭据、完整 OTLP/HTTP 接收地址及私有查询页；若当前受管
配置无法安全传递认证头，只做认证注入和隐私/失败回归这一项 L2 修改。模型、
WordPress 和监控同意边界保持原状。接入失败时恢复原空地址配置，并以同一受控
方式重建受影响进程；不以移除正式 smoke 断言作为回退。本轮没有启用该服务。

## 传输瓶颈和实现

上次完整包上传耗时 2,826 秒，远端发布序列 244 秒；上传期间旧版本仍服务。
四个镜像的 portable Config 身份均与前版不同。对应精确 CI 日志也证明前后端
输入缓存未命中，Nginx/Redis 重新构建；拒绝仅按 tag 名称复用是正确行为。
本轮不放宽镜像身份，不为减少传输而重建或重扫旧包。

当镜像不能选择性复用时，新增由主机直接读取同一份 Actions HTTPS artifact 的
传输路径；选择性传输优先，工作站及 stage-only 仍走 SCP。客户端核对精确 CI
run/source SHA/production 分支与唯一 artifact；短期下载 URL 仅经固定主机身份
的 SSH stdin 传递，GitHub token 不交给生产。下载限可信 Actions blob origin，
禁止重定向，验证外层 ZIP digest/size、精确成员集合、内层包 digest/size/checksum，
随后仍运行原完整包/扫描/源码校验门禁。空间不足或下载失败清理临时文件，回退
原 SCP 路径一次；不自行重跑发布。下载最多 2 GiB、十分钟，额外磁盘峰值约为
外层 ZIP 加完整包，下载前检查空间。

### 同一精确包的网络实验

原 [CI 43169993011](https://github.com/npcink/npcink-ai-cloud/actions/runs/43169993011)
artifact `13921841937`，外层 ZIP 为 242,522,120 bytes，digest
`501dd2e151305f273de911fb21dae437d4253a810e0e4dd85abccf6034c0eae6`。
生产主机直接读取 HTTPS blob，分块计算摘要后丢弃：北京时间 2026-11-12
17:08:50 完成，544.115 秒、445,719 bytes/s，字节数和摘要均匹配。
相较原 2,826 秒上传，这次完整网络读取约快 5.2 倍、减少约 81% 时间。
这是不同时刻的实际路径对比，不是配对网络基准，也不承诺后续恒定速度。
此前 4 MiB 小样本为 2.812 秒，明显高估全量吞吐；最终判断采用完整包结果。

实验只做一次完整读取，零生产文件写入、零解包/安装、零模型调用。
实际下载落盘、ZIP 提取和现有校验还会增加耗时，未冒充新工具的完整生产发布
验收。受限原始回执见本地 `editor-release-closeout-20261111/` 证据目录中的
`release-transfer-full-stream-benchmark-20261112.json`；不保存短期下载 URL。

## 验证范围

本地测试覆盖下载完整性、截断/超量/超时、错误 checksum、额外/重复/链接 ZIP
成员、输出链接保护、空间不足、origin 限制、凭据不进日志、实际部署脚本的成功/
回退/选择性优先/stage-only 分流，以及传输时间分类。构建 fixture 只补齐新增
随包工具，没有弱化镜像缓存选择断言。

应用源码、数据库、WordPress 和 M4 均无改动；本机 Docker 保持退出。
传输工具的本地测试、生产只读网络实验、master 合并及生产工具晋级分别记账。
网络读取成功不等于新的生产部署成功，正式 smoke 仍为未通过。

## 开发期轻量 smoke 合并与真实验收（2026-11-12）

操作者批准按“合并工具 → 真实零模型检查 → 回执与资源清理”收尾。
[PR #1432](https://github.com/npcink/npcink-ai-cloud/pull/1432) 已合入 master，
工具合并版本为 `f340303dc8b0e48222cb93ec84c4dd2c9a77c40e`。
本次没有晋级 production、部署应用、修改服务配置或调用模型。

| 证据层 | 最终结果 |
| --- | --- |
| 本地 | `verify:local` 通过，发布配置与 smoke/凭据测试共 115 项通过；发布规范、Bash、Python 质量及文档可达检查通过 |
| 初次 CI | [43196765971](https://github.com/npcink/npcink-ai-cloud/actions/runs/43196765971) 失败：一条旧契约仍要求默认支付预检；已本地复现并更新为批准的“默认轻量、支付专项”契约，原失败保留 |
| 最终 PR CI | [43197909318](https://github.com/npcink/npcink-ai-cloud/actions/runs/43197909318) 及 [CodeQL 43197909169](https://github.com/npcink/npcink-ai-cloud/actions/runs/43197909169) 通过，必需检查通过后合并 |
| M4 | 本次为发布工具/文档，runtime lane none；不把未执行的 M4 检查记成通过 |
| 实际生产安装 | 执行前后 installed manifest 均为 `6ef9e100b62ce591855c15d5eb3db56b922f2cce`，与此前成功 Deploy 一致；部署锁、失败标记及全局 one-off 锁均不存在 |
| 真实轻量 smoke | 北京时间 2026-11-12 18:17，用已合并工具、严格固定指纹 SSH 和现有 device 加密凭据执行；`lightweight_passed`，含本地定位/凭据准备共 20.57 秒 |
| 验证范围 | 公共 live、公共内部接口拒绝、私网无 token 拒绝/带 token 就绪、必要 worker、首页与 Portal/Admin 登录页、匿名 Admin 跳转、unsigned catalog 拒绝及签名 catalog 读取通过 |
| 操作边界 | 验证码请求 0、模型调用 0、支付 0、部署 0；未重连站点或修改文章；临时凭据目录已删除，SSH 通道清理成功 |
| 完整正式 smoke | `not_run`；轻量成功不证明完整登录、模型质量或外部 Trace 集成通过。Trace/Grafana 依操作者决定继续暂缓 |

执行前曾遇到本机旧目标配置与全局 SSH 记录不适用；复用此前独立核验过的
专用生产 SSH 配置及固定指纹后，确认实际安装身份。没有覆盖全局 known_hosts、
接受新扫描指纹或放宽 StrictHostKeyChecking。
凭据准备脚本还曾因本地文件接口用法错误，在 canonical smoke 前停止；修正后
实际执行的一次轻量 smoke 通过。该准备失败及清理结果单独保留，不改写为成功。

本轮补充的经验：

1. 改默认发布策略时，同步检查整个发布配置契约；按测试名选取的局部测试可能漏掉旧断言。
2. 读取本地 WordPress 凭据时明确站点路径，跳过插件/主题加载，直接解密已有 envelope；避免调用可能顺带迁移设置的读取封装。
3. 工具版本与生产应用版本分开记录；已合并的新工具可以只读验收现有应用，无需为检查而部署。
4. 先验证主机身份与发布终态，秘密只经受保护文件/进程传递；清理成功才关闭验收。

受限本地证据继续保存在 `~/.codex/task-evidence/editor-release-closeout-20261111/`：
`pr1432-merged-20261112.json`、`lightweight-smoke-production-20261112.json`、
已脱敏执行日志及准备失败回执。记录不包含正文、站点签名秘密、内部 token 或真实 SSH 目标。
主机直取传输提速仍只合入 master，随下次另获授权的正常发布启用；本轮不额外部署。
磁盘根因定时排查与数据库安排仍由原负责人接续，不转为本会话新增待办。
