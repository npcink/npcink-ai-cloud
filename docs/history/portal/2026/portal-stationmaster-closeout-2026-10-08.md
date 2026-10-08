# 普通站长 Portal 整改收尾与开发复盘 — 2026-10-08

Status: dated development/M4 acceptance evidence and follow-up handoff;
not production acceptance or present runtime authority.

本记录收口本轮用户中心整改与新用户就绪度检查。结论是：声明范围内的
Portal 整改已经合并并在 M4 接受；真实邮件、付费模型、用户试用和生产发布
仍未完成，原生反馈另有源代码缺口。其他任务的未提交工作继续保留。
本会话可在交接后结束，不能据此宣称全仓库、生产或全部历史待办已清零。

## 1. 目标与范围

Portal 面向大部分普通站长，当前以 PC 浏览器为验收目标。每页先帮助用户
理解当前状态和下一步操作，再展示记录与低频细节。整改集中在首页、站点、
用量、套餐、账户、支持工单及其 Cloud 客户证据查询。

Cloud 保留托管运行增强层的职责；WordPress 继续拥有能力、工作流、提示词、
审批和最终保存。没有为 Portal 增加第二套控制面。本轮没有生产变更，
没有发送真实邮件，也没有调用付费云端 Provider。

当前规范见 [Portal UI Standard](../../../cloud-portal-customer-workspace-ui-standard-v1.md)，
开发及验收状态定义见
[Development and Validation Operating Model](../../../development-validation-operating-model-v1.md)。

## 2. 已完成与合并证据

| 批次 | 最终行为 | 合并证据 |
| --- | --- | --- |
| 客户查询与状态恢复 | 最近活动限定到最新 200 条授权记录；汇总与列表同窗口；账户/站点上下文和失败恢复保持一致；审计索引与重试修复 | [PR #1079](https://github.com/npcink/npcink-ai-cloud/pull/1079)，`df719389c1af9dfc03c4f124c44d5dc9f957dc90` |
| 普通站长操作简化 | 首页聚焦套餐、积分、容量；站点操作分层；积分记录直达详情；套餐确认、账户登录方式、工单列表与空/错状态简化 | [PR #1080](https://github.com/npcink/npcink-ai-cloud/pull/1080)，`121643f1cdda6ce727f638eb726e8e7a081fba98` |
| 最终效果修正 | 已解决工单在列表和详情使用一致状态；需关注操作减少重复；文案和回归断言对齐 | [PR #1081](https://github.com/npcink/npcink-ai-cloud/pull/1081)，`07f7605b68ed046727a8e18c172914b78149f8f4` |

三项 PR 均于 2026-10-08 合并到 `master`。最终 M4 接受记录为：

```text
acceptance_state=accepted
merged_pr=1081
source_branch=master
source_dirty=false
source_revision=07f7605b68ed046727a8e18c172914b78149f8f4
migration_head=0087
```

这是产品整改最后一次运行验收的版本。本次文档收尾不需要 M4 同步或部署；
后续文档提交不使这个历史运行证据自动变成新版本的验收。

## 3. 验证结果及边界

| 证据 | 实际结果 | 证明范围 |
| --- | --- | --- |
| Portal 生产模式 Playwright | 最终 33 项通过，41.2 秒；主批次也通过 33 项 | 页面流程、确认、状态、过滤与恢复；不是生产服务器验收 |
| 实际 PostgreSQL 写入/并发场景 | 8 项通过，使用隔离测试 schema | 积分兑换幂等、站点容量释放与凭据撤销、套餐订单、测试支付回调、邮箱更换、支持队列、并发 Free 授予 |
| 审计索引迁移 | SQLite/PostgreSQL 三次 upgrade/downgrade 保留数据；正确既存索引可重试，错误定义拒绝 | 迁移和恢复；生产仍需目标库 preflight 与回滚准备 |
| 源码检查 | Python Ruff、mypy 314 文件、前端类型/ESLint/契约通过 | 相应源码范围 |
| GitHub required checks | 三项 PR 必需检查通过；#1079 执行了四个完整后端 pytest shard | #1081 跳过后端 lane，不能将该次绿色状态当成新后端验证 |
| 新用户准备聚焦测试 | 12 项预算/分发/模板/事件测试及 2 项反馈隐私/去重测试通过 | 受控测试输入；不能证明线上设置已启用 |
| 后台真实模板预览 | 登录、注册、邮箱更换三种模板渲染成功 | 模板内容；没有证明 SMTP 投递 |
| WordPress 与 Cloud 连通性 | Local WordPress readiness 为 ready，真实 Portal 状态已查看 | 本地消费者和 M4 连接 |
| 实际自然上报 | 已知真实 run 的 4 项用户旅程事件匹配；2 项编辑器展示/精确保存事件关联同一次 generation，正文未上报 | 关闭此前“自然上报/保存关联待确认”的证据缺口 |
| 原生反馈 | 同一真实 run 的 `agent.feedback` 事件数量为 0 | 原生采纳反馈未完成，不能用其他事件替代 |

实测用量汇总由 9.7943 秒降至 0.295 秒，最近活动由 5.8957 秒降至
0.0781 秒；六个实际 HTTP 端点返回 200，耗时 0.151–0.394 秒。
这些是本次样本，不是持续性能承诺。接受后的 235 秒观察窗口有 23 个
非健康请求，未观察到非健康 502；两个 404 属于其他路径。

历史 Free 测试账户仍有 9,624 积分、三个站点，其中两个活动站点超出当前
一个活动站点的容量。它证明界面能准确呈现历史账户事实，不能用来判断
新注册 Free 授予是否为 300 积分/30 天/一个站点。没有重置历史余额以消除
真实超限提示。

本地 OCR 多次受上下文估算限制未完成；最后一次仍为部分结果，不能声称
本地 AI 审查全通过。GitHub advisory review 已逐项分流；真实时间窗口、
四位小数成功率、索引重试等缺陷已修复。建议性类型细节和已解释的误报
保留于 PR 记录。必需 CI 与实际消费者证据仍是对应验收依据。

## 4. 尚未完成的事项与执行顺序

操作者已明确同意：麻烦的真实测试可在其发布到生产后进行。该决定允许延期
相应验收，没有完成配置、实现缺口或生产发布本身。

| 顺序 | 项目与状态 | 责任及前提 | 可观察的完成条件 |
| --- | --- | --- | --- |
| 1 | SMTP 真实投递，未完成；M4 检查时 `configured=false` | 操作者在目标环境的既有邮件设置保存配置、正式 Portal 地址，并指定测试收件人；不在 Git 中记录密码 | 收件箱确认一封邮件；跑通真实注册、登录和邮箱更换；核对链接、失效时间和新账户 Free 权益 |
| 2 | Provider 花费保护武装，未完成；检查时设置行缺失 | 操作者确认付费连接分类及每日/月度 USD 上限；必须先于目标环境的付费分发 | 已启用策略覆盖拟用付费连接；沿用确定性超限/并发/重试证据，不制造真实超支 |
| 3 | 一次真实写作闭环，延期 | 1、2 完成，操作者选定 Provider/模型和有限测试额度 | WordPress 生成、人工审阅/保存，实际模型、run、用量、积分台账和平台成本对应 |
| 4 | 原生 `agent.feedback`，源代码任务未完成 | 单独由 Addon/WordPress 归属模块实现最小上报；Cloud 不从保存观察伪造原生反馈 | 实际 `source_run_id` 关联、事件入库、去重和隐私验证；与旅程/编辑器观察分开验收 |
| 5 | 3–5 位普通站长试用，未开始 | 基础配置和小规模生产验证通过，操作者安排参与者 | 记录任务完成阻力、再次使用及实际费用，再决定后续体验优化 |
| 发布前 | 生产版本和切换，未执行 | 操作者选定最终版本；按现行发布政策冻结范围、完成 CI、镜像/bundle、目标数据库和回滚门禁 | 明确授权该版本切换后，完成生产健康与基础流程检查 |

真实商户支付/对账不能从测试支付 transport 推导；涉及商业上线时，另外执行
现有支付和发布清单。最新目标环境状态必须重新检查，不能沿用本表的 M4
缺省配置为生产事实。

### 后续收尾更新（2026-10-08）

上表保留本记录初次验收时的历史状态，以下更新不能反向改写当时的证据：

- 原生 `agent.feedback` 生产者已通过 Addon
  [PR #243](https://github.com/npcink/npcink-cloud-addon/pull/243) 合并到
  `master`（`ce5208cc`），实现关联、去重键、隐私最小化和有限重试。
  单元、受控 WordPress 验证和中央质量门禁已通过；队列是明确记录的
  best-effort 投递，不保证跨 WordPress 进程的原子交付。真实用户的自然投递
  仍需随写作闭环验证，不能从模拟事件推导。
- Portal 导航归属修复、运行用量覆盖修复和 CI 审查重试模板分别已通过
  [#1083](https://github.com/npcink/npcink-ai-cloud/pull/1083)、
  [#1084](https://github.com/npcink/npcink-ai-cloud/pull/1084) 和
  [#1078](https://github.com/npcink/npcink-ai-cloud/pull/1078) 合并。
- 后台共享界面 [#1086](https://github.com/npcink/npcink-ai-cloud/pull/1086)
  仍未合并；跨平台测试修正已在隔离分支提交，11 张新增 Linux 截图基准
  等待明确人工验收。最终 CI、合并、当前干净 master 的 M4 promotion 和
  Cloud 中央质量门禁仍需完成。
  后续操作者已同意按建议完成 Linux 基准验收、最终 CI、合并及 M4 验收；
  11 张已展示的候选基准经哈希复核后获准纳入，原等待验收状态已被替代。
  此授权不等于最终 CI、合并或生产发布已经完成。
- 16 条 Cloud 历史本地分支和一条 Addon 本地分支已转入可恢复归档，并校验
  私有备份。Addon 已合并功能分支的远端引用已按精确 SHA 清理。Cloud 主
  工作区、M4 运维工作区、未关闭后台工作区和旧发布候选继续保留，不能称为
  全部清理完成。主工作区另有未合并提交 `dc58be21`，原 93 份文件内容均已
  保全，且本任务未覆盖该工作区。
- 生产数据库和归属盘点的两次只读核查通过。付费连接、日/月 USD 上限、
  目标环境、匹配的 RDS 恢复点及服务器备份信息尚待操作者提供；没有执行
  生产部署或付费测试。SMTP、真实写作、真实支付及站长试用由操作者负责。
- F8 的历史读取失败根因仍未证实：缺失原失败响应和请求 ID。当前成功
  读取证明当前行为，不等于补齐历史故障的根因证据。

本会话可在接受未完成项交接后结束；关闭聊天不等于验收完成，也不授权删除
仍保护交付的工作区。建议先完成 #1086 的合并和 M4 验收再按完工关闭。
详细经验及验证边界见
[后台诊断与验证复盘](../../admin/2026/records/runtime-diagnostics-navigation-and-validation-retrospective-2026-10-08.md)。

生产流程见 [Cloud Production Release Policy](../../../cloud-production-release-policy-v1.md)
及 [Release Checklist](../../../../deploy/RELEASE_CHECKLIST.md)。
预算设计和实现见
[Provider Spend Budget Implementation](../../../provider-account-spend-budget-implementation-v1.md)。

## 5. Git、分支与 worktree 收尾快照

2026-10-08 文档收尾前，执行 `git fetch origin --prune`、精确 PR 查询和
只读 `worktree:audit`：

- 本轮三个 Portal 远端分支已经不存在；本地
  `codex/portal-stationmaster-remediation`、`codex/portal-stationmaster-ui`、
  `codex/portal-acceptance-polish` 保留为恢复引用。未删除这些本地分支。
- 本轮原 Portal worktree 已在三个 PR 合并、工作区干净且最终树与 master
  一致后归档，保留可恢复快照。原目录已从活动 worktree 中移除。
- 主工作区 `/Users/muze/gitee/npcink-ai-cloud` 仍有 93 项修改/未跟踪路径，
  包括 Admin、runtime、CI 和旧 Portal 工作；未覆盖、重置或笼统提交。
- `codex/admin-diagnostics-closeout` worktree 干净且锁定，有 11 个
  `origin/master` 未包含的提交；`codex/portal-customer-readiness` worktree
  干净且锁定，有 1 个未包含的提交。提交图差异本身不证明最终补丁缺失，
  必须另外核实归属和 patch equivalence，不能据此删除或盲目再合并。
- 稳定 M4 operations worktree 在本次快照中为干净的 `master`。文档收尾
  使用另一个受锁保护的干净 worktree，不混入主工作区修改。
- 此时唯一未合并 PR 为无关的
  [#1078](https://github.com/npcink/npcink-ai-cloud/pull/1078)（AI review workflow
  timeout 模板同步）；它不属于本轮 Portal 验收完成证明。

`worktree:audit` 的 PR 历史查询触及 1000 行安全上限，因此通用 audit 的
PR 关联结果不完整。本轮三个 PR 的合并状态已通过各 PR 精确查询核实。
清理依据见 [Single-Session Worktree Lifecycle](../../../single-session-worktree-lifecycle-v1.md)。
本记录不授权清除受保护 worktree 或删除其他任务分支。

## 6. 可复用的开发经验与规范落点

| 经验 | 本轮处理 | 后续执行规则 |
| --- | --- | --- |
| 从用户任务判断密度和层级 | 主要状态、操作和记录直接展示，诊断及危险操作退到详情/低频入口 | 每页先定义一个主要任务，避免重复状态与竞争动作；见 Portal 标准 2、6、15 节 |
| 界面简化不能改变事实归属 | 账户权益与站点运行证据分开，积分记录仍遵守 principal/site 边界 | 先确认数据 owner 和筛选含义，再删控件；不靠新增 API fan-out 填补界面 |
| 成功写入与刷新失败必须分开 | 保留成功结果、阻止重复确认、提供恢复 | 浏览器回归应覆盖 busy、失败、空结果和成功后刷新失败 |
| 大历史表的默认客户查询应有界 | 最近 200 条及同窗口汇总，索引、排序和并发重试一起验证 | 不把有限样本汇总标成全历史，不静默改变 operator 审计语义 |
| 时间窗口和精度属于合同 | 24 小时 runtime 不随 1 小时证据窗口改变；比例保持四位小数 | review 必须追踪显示字段的实际生产者，不能只改标签 |
| 测试通过不等于环境已武装 | 模板和预算逻辑通过，实际 SMTP/预算配置仍缺失 | 分列源码、当前配置、实际外部结果和人工验收；不以绿色 CI 代替环境事实 |
| 自然事件必须重新查证，不能沿用旧缺口 | 真实旅程和精确保存关联已找到，原生 feedback 仍为 0 | 使用准确事件常量和同一真实 run；不能从其他观察反推原生采纳 |
| 聚焦反馈后继续完成耐久交付 | 容易丢失的 branch-only 结果通过 PR 合并和 clean-master promotion 固化 | 分开记录 candidate、merged、accepted、production；不能止于截图或同步 |
| 收尾清洁度要按归属报告 | 当前任务归档，其他修改和受锁工作保留 | 只整理本任务交付物；整个开发阶段清理需单独核实保存和归属 |

规范已写入 Portal 标准 15 节，索引已加入本记录。没有新增 ADR：本轮没有
引入新的架构决策，既有产品边界和工程工作模型足以覆盖这些经验。

原始本机证据目录（辅助存档，不作为可移植规范）：

```text
/Users/muze/.codex/visualizations/2026/10/08/portal-acceptance/
  verification.json, worktree-closeout.json, screenshots and passing logs
/Users/muze/.codex/visualizations/2026/10/08/new-user-readiness/
  verification.json, production-follow-up.json, redacted runtime audit,
  WordPress readiness, feedback-focused.log, template preview screenshot
```

原始产品整改观察回执如下，数值属于该次运行，没有为文档收尾重测：

```text
M4_OBSERVATION_RECEIPT date=2026-10-08; route=direct(Pgy); sync=64.73s(sample); focused=3.79s(sample); promotion=74.59s+67.15s; operations=candidate_sync10,candidate_deploy1,promotion2,dirty_guard1; stable_502=0(observed_235s); m4_only=not_observed; coordination=own_probe_cancelled_for_index_wait
```
