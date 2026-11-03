# 第五批组 3：订阅读取证据本地交接（2026-11-02）

状态：builder 已实现，供独立审核；严格浏览器仍有失败，未准入。
整合会话为“系统检查管理后台问题”。本记录不授予 PR、CI、M4 或生产操作权限。

## Scope

基线 `1d52c8d192dba6b5ad83968acbdf270bfdd18760`，
分支 `codex/admin-subscription-evidence`，复用原 worktree/lifecycle lock。
仅 B5-05 订阅队列部分、B5-09、B5-10。队列验证后才采用集合、分页、风险及范围；
详情验证路由/关联和指标，坏站点局部隔离，合法 nullable、稀疏用量及当前 live version
保留。错误与陈旧直接可见，依赖操作禁用，局部 GET 可恢复。

## Boundary

Cloud 服务证据读取正确性维护。未改后端价格/默认额度/生命周期/账务/套餐实时策略，
未动共享组件、预取、错误分类器或豁免。S03 未知 rebuild/new-key/persistence 不在范围。
POST 仍走既有端点/幂等协议；只增加当前目标/有效证据保护，成功后坏读回保持待确认，
一个 Retry 只 GET，不重发 POST。已验证客户范围的审计 summary/trail 不叠加首站点，
原查看记录入口保留；没有验证范围就不挂载面板。

四级内容清单、布局选择及逐项处置在[落实台账](../../../admin-information-hierarchy-implementation-ledger.md#第五批组-3订阅读取证据2026-11-02本地待审核)。
消费语义在[商业一致性契约](../../../admin-commercial-consistency-contract-v1.md#订阅读取证据第五批组-3)。

## Verification

全部本地产物位于：
`/Users/muze/.codex/visualizations/2026/11/02/01a1929f-2271-7550-b73e-07abd2a0a629/admin-subscription-evidence/`。
`source-manifest.json`、`validation-receipt.json`、`coverage-matrix.md`、`SHA256.json`
分别绑定源码、实际命令结果、有效场景和原始产物；不累计重复运行作覆盖数。

- 单元 55 项通过：必需字段、坏集合/目标/分页/风险、合法空/0/nullable/live version、
  稀疏 meter、历史订阅快照、archived 统计差异、坏站点隔离及受支持 action。
- 真实 internal API serializer 的 5 个响应在合成 SQLite 中导出并通过前端探针。
  覆盖普通/越界空页/风险空页及正常/nullable 详情；当前发布版本不同于存储版本、
  archived 站点不计入 billing、稀疏 meter 可用。该 GET 观测段只有 33 条 SELECT；
  建库/种子写入排除在观测外，不代表 live 客户数据库全链零写。
- 类型、定向 lint、4 个静态契约、i18n completeness、Admin UI 治理通过。
  development/L1 planner 要求的 gates 分别执行，未将 plan 当作实际 verify 成功。
- `browser-1` 原有队列 16 项通过。`browser-3` 原有详情 6 项通过；专项 22 项
  业务断言全部完成，但其严格 afterEach 为 3 通过/19 失败。该轮总计 9 通过/19 失败，
  不能称为全过。失败均保留 partial-header RSC response200→ERR_ABORTED，
  unexpected pageerror/console/HTTP 为 0；刻意 old-target 503 独立按原规则分类。
- 后续只重查受影响场景：`browser-4-pc-height` 2 项业务完成，严格 1/1；
  `browser-5-copy` 6 项业务完成，严格 1 通过/5 失败；
  `browser-6-stale-stable` 1 项业务完成，严格失败。均为同类 RSC 残余，未抹去前轮失败。
  最后一次等待成功通知消失后取稳定失败读回截图，POST 总数仍为 1，失败及恢复
  Retry 各增加一个目标 GET，待确认在失败 Retry 后保持。
- PC1440×1050、1056×1050 正常/混合站点/错误目标、坏队列保留、nullable、失败
  读回证据已代理目检。几何无横向溢出，单页标题及主要工作区可见。无新主题样式，
  未机械扩大至全后台/移动端，未更新 golden；人工视觉仍 pending。

### 迭代失败与修正

初次 lint 拒绝 render 中写 ref，改为 layout effect。旧静态契约匹配未验证的
payload.summary，更新为显式验证后的 summary，风险/全局汇总断言保留。
首轮新 spec 的全局空 alert 选择器歧义改为限定错误内容；中文 retained 文案正则
按现有译文修正。实际源码修正了审计范围/查看记录入口与失败读回重复 Retry。
截图目检发现新增文案插值使用单花括号，按既有双花括号规则修正，并验证实际数量/序号。
临时真实 API exporter 初次因测试环境尚未初始化在 import 处失败；调整测试 conftest
导入顺序后运行成功，未访问 live 数据库。首轮原始日志/trace 与后续补查分别保留。

## Risk

严格浏览器仍失败；同签名在 `de896438` clean archive 已有最小反例，但导航序列、
业务 fixture 与时序不同，不能据此自动豁免新组或宣称根因/生产影响已查明。
签名、请求来源、终态和业务动作时间线在 `prefetch-comparison.json`。
整合会话须独立决定剩余失败是否允许 admission，builder 不代作决定。

前端消费校验不能替代后端鉴权或 serializer 承诺；未来消费字段契约变化需同步验证。
浏览器业务接口全部为隔离 mock，未制造真实客户、支付或 Provider 操作。
CI/PR/push/M4 candidate/M4 accepted/合并/production 均未执行；人工验收未完成。
不将本地构建或通过的业务断言表述为生产证明。

回退按独立组 3 commit 整体 revert，再跑订阅窄门禁；不得重置混合 worktree。
交还后 builder 冻结，等待独立审核的明确派单。


## 独立审核第一轮返修 R1–R4

审核对象 `7b2ab0eb` 未准入。正式返修仅复用原分支/worktree/lock；以下是增量证据，
不替代前述失败。证据目录为上述根目录的 `review-1/`。

- R1：页长按 `min(limit, max(total-offset, 0))` 验证。新增的空首页 total1、有行 total0
  和不足页反例在旧实现均失败；浏览器两种坏刷新保留行、范围和原成功时间，GET 恢复后更新。
- R2：billing items 从 unknown 改为消费字段结构，拒绝 null/重复/错 snapshot 站点、
  三类计数或聚合矛盾、不满足条件的 action。完整 covered 集合才检查 eligible 站点与
  latest snapshot 会员关系；archived/released、历史账户/订阅/版本及坏站点局部隔离保留。
  四种损坏账单浏览器均不 stable、零 rebuild／全局审计，并由一个 GET 恢复。
- R3：空快照、部分站点缺失、稀疏 cost 不再归一化为0；显式 cost:0 保留。
  `frontend/tests/fixtures/admin-subscription-serializer-queue.json` 为原5响应中首个完整
  合成 SQLite 队列响应的原值，测试不再依赖本机证据路径/环境变量；实际检查器验证未知与 ¥0。
- 13个 R1/R2 新反例先在旧实现全部复现失败；最终单元70通过。真实隔离API的5份响应
  在修正版重新通过（已有导出，不访问/写入 live DB，不重复制造观测数据）。
- 局部浏览器9种业务断言全部有完成证据，effective strict仍1通过/8失败。初轮9项为
  strict1/8，其中R1两项因全局空alert断言、R3因刷新后未等待列表替换而提前失败；修正
  这些测试等待后仅补3项，业务3完成、strict0/3。测试fixture改为仓内后初次JSON导入
  因Node缺type属性未运行测试，按现有模式加属性后只补R3，原失败日志保留；均不累计为新覆盖。
- R4：clean parent `1d52c8d192db` 由 git archive 导出到普通外部目录；运行源码逐字节
  对Git证明，依赖APFS克隆；仅测试文件做同字节overlay。匹配完整fixture、当前collector、
  PC尺寸和导航 queue→A→一次mock rebuild及GET读回→queue→B，parent与candidate业务均完成。
  parent strict4次、candidate5次unexpected，均为缺segment的同源RSC GET200→ERR_ABORTED；
  pageerror/console/HTTP均0。parent包含queue→A/B与accountA/site，candidate另有accountB。
  详见 `matched-source.json`、`matched-comparison-receipt.json`、双边comparison.json/trace。

该匹配对照说明同签名在直接parent及相同业务导航存在，不足以证明精确触发器、频率或
逐一归因原19项。**严格浏览器仍为交付阻塞，整合会话决定下一边界；builder不授予准入。**
没有再次重跑匹配对照挑绿，没有变更共享预取、collector、分类/断言豁免。
PC1440坏元组保留及真实费用未知、PC1056错账单目标、混合站点与nullable图像由代理目检；
常显判断事实和恢复入口保留，无横向溢出，人工产品/视觉验收仍待做。

类型、定向lint、4静态契约及Admin治理通过；最终planner因JSON fixture归为L2 development/local，
对应release-policy轻门禁也通过。M4由正式返修范围明确不授权；不机械重跑全43/全后台视觉。
源码与artifact增量manifest、命令原文/结果及五轴自审在 `review-1/`。业务API均mock，
一次rebuild写入仅为隔离测试。PR/push/CI/M4 candidate/M4 accepted/merge/production均未操作。
交新干净提交后冻结；不创建额外Git worktree、会话或子代理，不变更既有商业与S03边界。


## 第二轮返修 R2b

正式handback对象f5f846fb仍未准入；本轮只解除原branch/worktree/lock冻结修正R2b。
服务的两份快照投影来自同一map，之前仅验证各自结构与站点会员关系，未核对互相一致。
新增按site的map验证：非空billing snapshot与latest的ID、订阅、消费totals须相同，
missing对应不存在；fresh还必须属于当前订阅。totals按键值比较，不依赖JSON键顺序。
该内部检查不使用covered集合；仅covered会员关系仍以完整站点集合为条件，保留坏站点
局部隔离、历史stale账户/订阅/版本、稀疏totals及archived/released排除，不重算账务规则。

JSON往返将HTTP两份对象拆开后，7个矛盾反例在旧提交全部复现失败，修正后单元80通过。
另5份既有合成SQLite真实serializer响应通过；没有重新导出/访问真实数据库。
一个PC1440浏览器反例验证矛盾快照不建立stable、不显示rebuild、不发全局审计，
一次目标GET后恢复有效详情；业务体完成（GET2/POST0），严格afterEach仍失败，
保留account/site两次部分header RSC200→ERR_ABORTED，pageerror/console/HTTP为0。
结果、PC图、实际命令与增量manifest保存在 `review-2/`；不将业务完成写成strict通过。
本轮L2 development/local的类型、定向lint、Admin治理及release-policy门禁通过。
原失败与review-1产物不覆盖，不累加重复场景或门禁数量。没有新增内容层级或移走入口，
仅沿用常显不可用/陈旧原因与既有GETRetry；人工产品和视觉验收仍待做。

R4严格浏览器阻塞由整合会话保留调查；本轮不重跑匹配对照或原失败来挑绿，
不改变预取、collector、分类/断言豁免。仅本地验证与新干净提交后冻结，
PR/push/CI/M4/merge/accepted/production、真实客户/支付/Provider写入或花费均未操作。
价格/额度/生命周期/账务/实时套餐与S03未知提交/new-key边界保持。
