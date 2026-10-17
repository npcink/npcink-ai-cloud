# 用户中心优化历史归纳与下一阶段建议 — 2026-10-16

Status: dated conversation synthesis and handoff; not current runtime authority,
production authorization, or human-user acceptance evidence.

2026-10-17 校正：本稿从本地提交 `867ebcb4` 恢复，原稿未合入当前 master。
原归纳漏读了引用会话中 10 月 15 日部署成功及 10 月 16 日异步状态改造的后续，
误将“等待生产授权”写为会话最终状态。下述旧判断已加历史限定，最新综合结论见
[三会话综合纪要](portal-three-session-synthesis-and-next-stage-2026-10-17.md)。
已确认 #1116 与 #1118 的 Deploy Production 工作流成功；这不补足真人验收。

本文根据“用户中心优化”原始会话、其后续交接会话，以及当前
`origin/master` 的代码和文档状态整理。它回答两个问题：原会话实际走到哪一
步，以及现在应该把工作重心放在哪里。历史证据保留原来的时间、版本和边界；
当前状态以重新核对的代码、分支和活动标准为准。

## 1. 结论先行

用户中心的主要界面整改已经完成了工程交付阶段：面向普通站长的 Portal 信息
架构、账户/站点边界、状态表达、错误恢复、支持请求和用量展示已经通过受保护
PR 合入 `master`，并在当时的 M4 环境完成接受。原始会话没有停在“想法”或
“截图评审”阶段。

当前工作已经进入“目标环境与真实使用证据”阶段，而不是继续大范围重做 Portal
版式。仍未被真实证据关闭的事项是：真实 SMTP 注册/登录、生产环境注册即 Free
的人工核验、配置并武装 Provider 账户预算、一次真实 WordPress 生成—审阅—保存
闭环、自然产生的 `agent.feedback` 以及 3 位普通站长的受控试用。

引用会话的发布准备段进入了发布治理：Production PR #1116 已合并到
`production` 分支，精确 SHA 的 release preflight 已报告 `ready`。这个准备
检查点不是会话最终状态：后续已经获得授权并记录 10 月 15 日部署成功。
10 月 16 日 #1118 也已完成部署工作流；正式登录人工验收和阶段 1 试用仍缺回执。

因此下一阶段应按“发布边界确认 → 目标环境基础验收 → 一次内部真实链路 → 3 人
试用观察”推进。除非真实用户发现阻塞问题，暂不继续扩展 Portal 页面或建设新的
分析后台。

## 2. 10 月 16 日原稿核对的历史基线

原稿在独立、干净的 `origin/master` 工作树中核对，避免覆盖当时主工作区的
Admin/provider-refresh 未提交改动；以下是当时快照，今天的基线见三会话纪要：

| 项目 | 原稿核对结果（历史快照） |
| --- | --- |
| Cloud `origin/master` | `0bb4d1fc` — `fix(release): make provider refresh advisory with historical catalog (#1115)` |
| Cloud `origin/production` | `982b132d` — `release: promote provider refresh advisory to production (#1116)` |
| 当前主工作区 | `codex/provider-refresh-advisory` 有未提交的 Admin/provider-refresh 文件；不属于本次用户中心文档，也未被修改 |
| Portal 当前权威规范 | [Cloud Portal Customer Workspace UI Standard](../../../cloud-portal-customer-workspace-ui-standard-v1.md) |
| 试用当前口径 | [阶段 1 试用交接与待办](../../../trial-stage-handoff-2026-10-06.md) 与 [阶段 1 试用计划](../../../trial-stage-commercial-validation-plan-2026-10-06.md) |

分支指针证明源代码历史，不证明生产主机当前运行内容。生产主机切换、健康检查、
真实邮件和正式用户验收仍需各自的运行证据。

## 3. 会话推进时间线

### 3.1 目标定义：给普通站长一个简单、直观的工作区

原始“用户中心优化”会话把 Portal 定位为普通站长的客户工作区，重点是：

- 先看懂当前套餐、积分、容量和站点状态；
- 找到一个明确的下一步操作；
- 把诊断、支持标识和危险操作放入低频入口；
- 保持 Cloud 只提供运行时和证据投影，WordPress 继续拥有能力、工作流、审阅、
  批准和最终写入。

这与当前 Portal 标准的扫描顺序一致：身份和当前状态 → 一个主要问题/操作 →
紧凑证据 → 当前任务记录 → 低频或破坏性操作。

### 3.2 先恢复已经设计过、但没有进入保护分支的界面

2026-08 的恢复工作通过 PR #865 把简化后的账户/站点工作区重新合入保护分支。
这一步解决了“本地提交、截图和 M4 预览存在，但没有成为 `master` 真相”的问题，
并修复了搜索状态不可清除、行操作错误依赖选中站点、桌面操作菜单被表格滚动容器
裁切等缺陷。它建立了后续所有 Portal 工作都必须遵循的交付链：当前
`master` → 合同和浏览器证据 → PR → 合入 → 干净 `master` 的 M4 接受。

### 3.3 试用开户规则与 Portal 说明收口

PR #1073 把“验证注册后获得账户级 Free”落实到当前路径，并同步了注册、登录和
Portal 文案及测试。阶段 1 的操作者口径随后固定为：

- 300 AI credits / 30 天；
- 1 个站点；
- 首批 3 位真实写文章的站长；
- 4 周观察，H1 采纳率、H2 两周留存、H3 单活跃用户月成本；
- 免费试用阶段不启用支付，开始日期以准备完成后的实际邀请日为 T+0。

这些是试用判据和计划，不是已经开始试用的证明。

### 3.4 2026-10-08 的普通站长 Portal 整改收尾

三项 Portal PR 已合入 `master`：

| PR | 结果 |
| --- | --- |
| #1079 | 将客户活动查询限制在最新 200 条授权记录，同窗口汇总并修复失败恢复 |
| #1080 | 简化首页、站点操作、积分详情、套餐确认、账户登录方式和工单空/错状态 |
| #1081 | 统一支持请求状态，减少重复“需关注”操作，完成文案和回归断言对齐 |

当时的最终接受证据是 `source_revision=07f7605b`、`merged_pr=1081`、
`acceptance_state=accepted`。Portal 生产模式 Playwright 最终 33 项通过，另有
隔离 PostgreSQL 写入/并发场景 8 项通过。该证据证明当时的 M4/测试环境行为，
不等于今天的生产运行或真实用户价值。

### 3.5 收尾后的耐久性修复与预算实现

在 #1081 之后，Portal 继续完成了几项针对性修复：

- #1083 让最近活动在账户导航中的归属稳定；
- #1084 修复运行用量覆盖的测量边界；
- #1090 让活动读取失败可追踪、可重试，并区分代理请求引用和后端 trace；
- #1092 将 Provider 账户级日/月 USD 预算、预警比例、缺配置熔断和只读周期投影
  接入 Admin 设置与运行时闸门。

这些改动已经在当前 `origin/master` 的历史中。预算实现已经存在不等于目标环境已
填入数值；付费 Provider 仍应在配置覆盖和操作者 smoke 完成前保持关闭。

Addon 侧的原生 `agent.feedback` 生产者也已在会话后续记录中合入，但真实用户写作
时的自然投递、关联、去重和隐私边界仍需在一次真实链路中重新核对，不能用模拟事件
或编辑器保存观察代替。

### 3.6 发布准备检查点与之后的部署

后续会话处理了命令清单、发布检查和 Provider 刷新策略，最后形成 Production PR
#1116。会话中的精确 preflight 结果包括：

- production SHA：`982b132d630bf263cedb4f5b1716a7541c1dd251`；
- `release_preflight=ready`；
- 回滚版本：`70ea56a7ecd75ae8433f37af30f8f8c19fba9635`；
- 预计部署：30–60 分钟；
- formal smoke 所需的 `NPCINK_CLOUD_ADMIN_KEY` 和
  `NPCINK_CLOUD_PORTAL_LOGIN_CODE` 当时未配置；
- 该准备回合请求了精确 SHA 授权；后续回合已确认生产部署成功，
  [工作流 38682212540](https://github.com/npcink/npcink-ai-cloud/actions/runs/38682212540)
  为 success，不能把准备回合当成会话最终状态。

当前远端 `production` 指针与该合并 SHA 一致，但仍不能把分支合并当成服务器已
切换或用户已验收。

## 4. 已完成、已具备但未武装、仍未完成

### 已完成并进入源代码真相

- Portal 首页、站点、用量、套餐、账户、支持和活动查询的主要信息架构与状态语义；
- 账户级商业事实与站点级运行事实的分离；
- 空、加载、失败、重试、过滤、确认和低频危险操作的回归保护；
- 活动读取的有界窗口、请求关联和恢复路径；
- 验证注册后的账户级 Free 实现及相应测试；
- Provider 账户级预算实现、Admin 配置面和运行时 pre-dispatch 闸门；
- Portal UI 标准、试用判据和开发/验证证据分层文档。

### 已实现但仍需目标环境武装或人工核对

- SMTP 模板渲染已经验证，真实 SMTP 投递尚未以收件箱证据关闭；
- Provider 预算逻辑和设置界面已经合入，但目标环境的 Provider 分类、日/月限额、
  80% 预警和 100% 拒绝仍需操作者配置并 smoke；
- Free 账号规则已进入源代码，但目标环境的正常邮箱/QQ 注册、登录、无站点状态和
  300 credits/30 天显示仍需人工验收；
- Production 分支与部署成功已有后续记录；当前真人登录、收件箱和写作验收仍需
  操作者回传，不能由工作流 success 代替。

### 仍未完成的产品/用户证据

- 一次真实 WordPress 生成 → 人工审阅 → 显式保存的闭环；
- 该闭环中实际 Provider、Cloud run、积分扣减、成本归因和保存边界的对应关系；
- 自然产生的原生 `agent.feedback` 事件及其去重/隐私核对；
- 首批 3 位普通站长的 4 周受控试用、每周事实记录和 T+4 go/no-go；
- H1 采纳率、H2 两周留存、H3 单活跃用户月成本的数据。

## 5. 下一阶段建议

### 阶段 A：核对已部署版本与尚未发布的后续修复

原稿建议针对 `982b132d` 继续申请部署的判断已被后续成功部署替代。
接续时核对最新 production、成功部署工作流及本次人工测试的实际环境；
不要重新部署旧 SHA。新的 master 修复仍须按现行发布策略另行评估。

完成条件：记录服务器实际运行 SHA、健康结果、数据库迁移/回滚证据和一次人工
Portal 登录路径结果；否则只记录为“预发布就绪”。

### 阶段 B：目标环境基础验收，仍不启用付费 Provider

在生产或操作者指定的等价目标环境，用真实但不付费的路径核对：

1. 邮箱注册请求、收件、验证、登录和邮箱更换；
2. 注册后账户级 Free、300 credits/30 天、无站点状态和 Portal 首页展示；
3. 一个站点的连接/断开恢复、账户级与站点级信息边界；
4. 失败提示、重试和支持入口是否足以让普通站长继续下一步。

这一步的证据应按“真实邮件、真实目标环境、真实账户状态”单列，不用模板预览、
E2E fixture 或历史 Free 账户余额替代。

### 阶段 C：一次受控内部真实链路

在 Provider 预算已配置、覆盖关系已核对、付费调用额度明确为有限数值后，只做一次
最小真实写作任务：

- 先核对预算配置和缺配置 fail-closed 行为；
- 记录实际命中的 Provider/模型、run、credits、耗时和错误；
- 在 WordPress 中人工审阅后显式保存；
- 核对 Cloud run、用量、成本和 Addon 反馈事件的关联、去重和隐私；
- 不通过重复调用制造数据，不把本地 Fake Provider 或旧观察记录当作真实链路。

若预算或反馈在这一步出现第二个独立阻塞，停止扩展范围，分别开拥有者明确的
修复任务。

### 阶段 D：开始 3 人阶段 1 试用

只有 A、B、C 全部完成后，才邀请 S1–S3，并在实际邀请日记录 T+0。每周只记录
事实、分母、估算方法和一个主要阻碍；不要求用户提供日志或开发诊断。第 4 周再
按 H1/H2/H3 给出 `go`、`modify`、`hold` 或 `stop`，不因小样本漂亮的百分比提前
扩到 5 人或进入收费。

### 阶段 E：只修真实证据暴露的最小缺陷

继续沿用 P0/P1/P2/P3 顺序：安全、权限、数据丢失或无法连接/生成/恢复/保存的
问题先修；重复困惑和重试再修；纯视觉细节只有在反复出现或成本很低时才批处理。
不要在这一步新增用户行为分析平台、全新 Portal 仪表板、自动提示词/模型调优或
新的 Cloud 控制面。

## 6. 明确不建议现在做的事

- 不基于一次 M4 截图继续全面重做 Portal；
- 不把历史测试账户的余额或超限状态“修正”为新 Free 套餐；
- 不在预算数值和覆盖关系未配置前启用付费 Provider；
- 不把模板渲染、E2E fixture、编辑器保存观察或模拟反馈合并成“真实采纳率”；
- 不把 `origin/production` 的分支合并记录写成服务器已部署；
- 不因取数不便就先建设通用分析仓库或客户画像。

## 7. 交接时需要操作者确认的三件事

1. 本次人工验证所用的实际生产版本；旧 `982b132d` 的部署授权问题已被成功部署替代；
2. 目标环境的 SMTP 是否已由操作者配置，并准备哪个测试收件人；
3. 首次真实链路使用哪个 Provider、预算上限是多少、谁负责保存 3 位试用者的
   受控匿名映射。

在这三项没有明确之前，下一次开发会话最有价值的工作是补齐检查清单和证据模板，
不是继续改 Portal 视觉。

## 8. 主要依据

- [普通站长 Portal 整改收尾与开发复盘 — 2026-10-08](portal-stationmaster-closeout-2026-10-08.md)
- [Cloud Portal Customer Workspace UI Standard](../../../cloud-portal-customer-workspace-ui-standard-v1.md)
- [阶段 1 试用交接与待办](../../../trial-stage-handoff-2026-10-06.md)
- [阶段 1 免费试用商业验证计划](../../../trial-stage-commercial-validation-plan-2026-10-06.md)
- [Provider/account spend budget implementation](../../../provider-account-spend-budget-implementation-v1.md)
- [WordPress AI 链路验证清单](../../../wordpress-ai-loop-verification-checklist-2026-09-22.md)
- [Early Product Validation and Minimal Telemetry Standard](../../../early-product-validation-and-minimal-telemetry-standard-v1.md)
- [Development and Validation Operating Model](../../../development-validation-operating-model-v1.md)

## 9. 回退与状态更新规则

本文是 dated synthesis，不修改 Portal 运行代码，也不覆盖既有标准或历史证据。
若后续真实环境、生产切换或试用观察改变结论，应新增更晚的 dated record，保留
本文的历史状态；只有在新的架构决策出现时才新增 ADR。
