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
