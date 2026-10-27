# Npcink AI Cloud Documentation Index

- [SEO Specialist Runtime Pause](seo-specialist-pause-v1.md) — temporary runtime availability and v3 inspection scores; history retained. Cross-repo对照: [Reversible Feature Pauses](reversible-feature-pauses-v1.md#cross-repo对照-parallel-lists).

Status: active repository index.

Purpose: provide one maintained entry point for current Cloud authority while
preserving dated implementation and validation evidence without presenting it
as current truth.

## 按当前任务找文档

| 现在要做什么 | 从这里开始 |
| --- | --- |
| 所有 AI 代理开工前读统一约束 | 根目录 [AGENTS.md](../AGENTS.md) — 工具无关；细则见 [engineering/](engineering/)（DoD、验证命令、Phase 1、PR 契约指针） |
| 判断是否走偏、哪些开发应暂停、何时恢复 | [Phase 1 编辑价值优先决定（2026-10-27）](engineering/phase-1-scope.md#value-first-development-decision-2026-10-27) — 当前问题、继续维护、新增开发冻结清单与恢复条件；保留既有销售/试用例外，不改变运行可用性 |
| 确认当前设备范围、选择前端检查，避免每次改外观跑全量 | [前端 PC 范围与选择检查](frontend-pc-scope-and-selective-verification-v1.md) — 当前仅 PC；移动/平板暂不适配验收；按改动选择页面、宽度、主题与交互，保留强制 CI 门禁 |
| 接续 10-23 规划讨论收口与发布前联调待办 | [规划讨论会话收口 — 2026-10-23](history/engineering/2026/planning-discussion-session-closeout-2026-10-23.md) — 已合 #1163/#1164、AGENTS；未完成 Deploy/自动验收/真生成/编辑器收据；含执行任务书摘要与 IT-* 用例表；关规划会话≠第一阶段完成 |
| 跑通第一阶段编辑器闭环（Deploy/smoke/真写作验收单） | [Phase 1 closed-loop runbook — 2026-10-19](engineering/phase-1-closed-loop-runbook-2026-10-19.md) — 逐步命令与人工点击；不授权 Deploy；联调详情见上条收口文 |
| 接续产品头脑风暴、阶段1试用与推荐观察三个旧会话 | [三会话综合纪要与接续清单 — 2026-10-19](history/strategy/2026/three-chat-synthesis-and-continuation-2026-10-19.md) — 140轮历史；第11节列完整未完事项，区分当前试用、推荐优化暂缓、工具小修、商业候选及已完成旧项 |
| 接续首批3人免费试用（Trace暂缓/起步验收/周报） | [阶段 1 试用交接与待办](trial-stage-handoff-2026-10-06.md) — 复用运行、反馈和费用记录；四周计划第0节为起步口径，完整正式smoke仍未通过 |
| 查 AI 会话流程经验（docs 任务、子代理、门禁坑） | [开发会话操作经验记录](development-session-notes-2026-09-22.md) |
| 查测试与 CI 治理诊断经验（flaky 判定、选择盲点、空洞绿） | [开发会话操作经验记录](development-session-notes-2026-09-23.md) |
| 查 e2e 基线重扫与过期断言判定经验（继承失败数字是负债、过期断言 vs 产品 bug、定向选择盲区、视觉基线不随手重生成） | [开发会话操作经验记录 — 2026-10-23](development-session-notes-2026-10-23.md) |
| 收口可恢复暂停、音频播放与 M4 状态 | [可恢复暂停最终收口与清理 — 2026-10-19](history/engineering/2026/reversible-pauses-final-closeout-and-cleanup-2026-10-19.md) — 合并链、M4 accepted、历史音频播放、分支/worktree 清理与下一阶段建议 |
| 查三仓 pause 对照（任务 id / runtime 键 / 错误码 / 冒烟行归属） | [可恢复功能暂停 v1 — Cross-repo对照](reversible-feature-pauses-v1.md#cross-repo对照-parallel-lists) — Cloud `PAUSED_*`；互链 Addon [PR #309](https://github.com/npcink/npcink-cloud-addon/pull/309) / `docs/reversible-feature-pauses-v1.md` 与 Toolbox 同名文档；**不解冻** |
| 查预算收口会话经验（squash 丢提交回收、门禁死锁、Row 变参、共享 M4 让位判定） | [开发会话操作经验记录](development-session-notes-2026-09-26.md) |
| 查 Portal 会话登记边界及分批启用条件 | [Portal session registry v1](portal-session-registry-v1.md) — B1 仅休眠存储，不改变现有登录；B2/B3 切换、撤销和回滚契约 |
| 查 Portal TOTP 休眠存储与加密库存 | [Portal TOTP storage v1](portal-totp-v1.md) — T1 无启用/认证入口；状态约束、历史 schema 与重加密门禁 |
| 接续普通站长 Portal 整改、验收和上线后待办 | [Portal 收尾与开发复盘](history/portal/2026/portal-stationmaster-closeout-2026-10-08.md) — 三项已合并 PR、验证边界、原生反馈缺口及保留工作区；不是生产验收证明 |
| 回顾用户中心相关三个会话、确认当前进度和下一步 | [三会话综合纪要 — 2026-10-17](history/portal/2026/portal-three-session-synthesis-and-next-stage-2026-10-17.md) — UX、积分/预算、发布、异步状态与验证前移；补正旧摘要并区分方案与交付 |
| 接续10月18日冻结生产发布、回退与未完成验收 | [生产部署收尾与开发复盘](history/production/2026/frozen-cloud-release-closeout-and-retrospective-2026-10-18.md) — 精确4a版本已部署、Qwen目录降级、归档恢复边界、操作者验收台账及旧会话归档条件 |
| 在生产人工验证邮箱、连接与草稿保存 | [生产验收步骤（2026-10-17 更新）](portal-production-validation-runbook-2026-10-16.md) — 操作者走正常流程，开发侧核对 run/预算/反馈；不是部署授权 |
| 验收运行配置隔离、预算选择与 Addon 引导 | [运行配置与写作验收跟进 — 2026-10-17](runtime-configuration-acceptance-2026-10-17.md) — 候选行为、生产只读故障证据、零付费回归与后续人工验收；不是上线或真实调用恢复证明 |
| 发布前跑零付费 Provider/Portal 关键回归 | [关键流程回归 v1](local-critical-regression-v1.md) — `verify:local -- --critical`、固定测试清单、隔离与逐步回执；不操作 M4/生产 |
| 查合规工作底稿方法（四列结构、来源分级、触发线分离） | [开发会话操作经验记录](development-session-notes-compliance-2026-09-26.md) |
| 跑通 WordPress AI 三点链路（当前主线） | [链路验证清单](wordpress-ai-loop-verification-checklist-2026-09-22.md) — 六条 Done 标准与三步走 |
| 查本地 WordPress 草稿闭环证据 | [本地草稿闭环验证记录](history/engineering/2026/local-wordpress-draft-closed-loop-validation-2026-09-23.md) — fake Provider、预览/插入/显式保存、回读一致性与精确清理；不是商业或用户验收证据 |
| 查战略会话的讨论脉络与决定去向 | [战略会话综合纪要](strategy-session-synthesis-2026-09-22.md) — 时间线、七仓库总览、问题清单摘要 |
| 落实下一阶段计划（含新会话提示词 P1-P5） | [下一阶段执行计划](next-stage-plan-2026-09-22.md) — 含 2026-09-23 增补的开放前必做项 |
| 查 Provider 账户级预算硬上限缺口（开放前必做） | [Provider 预算硬上限缺口盘点](provider-budget-hard-cap-inventory-2026-09-23.md) — 三层防线已合入 master（PR #1029/#1031）；剩余出口：M4 promotion、操作者武装与 smoke、裸 HTTP 付费路径收敛（见"实现合入更新"节） |
| 查 Provider 账户预算实现与零成本验证边界 | [Provider 预算实现说明](provider-account-spend-budget-implementation-v1.md) — 记录单点 dispatch 闸门、日/月 claim、阈值、未知结果保留和本地验证边界 |
| 修改 Provider 等待与数据库事务边界 | [Provider 事务边界](runtime-provider-transaction-boundary-v1.md) — 出网前持久化准入与额度预留、释放连接，保留幂等、计量、回调及未知结果恢复语义 |
| 优化用量汇总批量统计 | [Usage Rollup 批量统计](usage-rollup-batch-statistics-v1.md) — 按站点和窗口聚合，保留统计、计量和回调语义 |
| 优化商业准入和扣费读取 | [商业运行时轻量读取](commercial-runtime-light-reads-v1.md) — 字段投影、事务可见性与舍入约束，保留完整明细读取和计量、回调语义 |
| 查 Cloud/Addon/Toolbox 最低配与发版地板（内测） | [最低配兼容表](compatibility-matrix.md) — 内测文档台账；契约精确匹配仍是唯一硬门；发版改一行；不做运行时硬拒（见 ADR-053） |
| 查 WordPress AI 能力兼容矩阵与验证状态 | [WordPress AI 能力兼容矩阵](wordpress-ai-capability-compatibility-matrix-v1.md) — 官方 Ability、Cloud task、Addon 投影、M4 与自动验收状态 |
| 查 WordPress AI Provider 合同边界 | [WordPress AI Provider 合同边界](wordpress-ai-provider-contract-boundary-v1.md) — Toolkit、WordPress Abilities API、Addon、Cloud 与 Eval Lab 的合同来源和验证边界 |
| 查支付与境内就绪度现状 | [支付与境内就绪度状态记录](payment-and-domestic-readiness-note-2026-09-22.md) — 操作者口头事实，证据待补 |
| 逐项确认境内合规待办（生成式AI、标识、收款、数据） | [境内合规确认清单](compliance-confirmation-checklist-2026-09-23.md) — 工作底稿，非法律意见 |
| 接续兼容稳定性、预算与支付会话的未完事项 | [兼容稳定性、预算与支付后续交接清单](compat-stability-payment-follow-up-handoff-2026-09-22.md) — 台账记行节奏、required 决策门槛、ADR-055 实现前置、退款两项裁决、观察窗口与提交门治理 |
| 复用该会话的执行与验证经验 | [会话复盘](compat-budget-payment-session-retrospective-2026-09-22.md) — 分阶段执行模式、文档/发布/清理的机械经验、测试分层与稳定性证据方法 |
| 查境内访问延迟观测 | [境内访问延迟观测](domestic-latency-observation-2026-09-22.md) — 本机 P95≈90ms，同步端点成立；含服务器自解析失败发现 |
| 查延迟观测第二观测点补充 | [延迟观测补充](domestic-latency-observation-supplement-2026-09-22.md) — 跨云 ECS P95≈138ms，结论不变 |
| 查推荐质量试批与第二性能窗口结论 | [推荐试批与观察窗口记录](history/trials/2026/recommendation-trial-batch-and-second-observation-window-2026-09-22.md) — 8 篇 93 候选有用率 51.6%；锚点修复无回归；正式优化延后至真实使用反馈 |
| 查退款能力缺口 | [退款能力缺口盘点](refund-gap-inventory-2026-09-22.md) — 静态盘点：网关/状态机/幂等已实现未验证；回调、对账、失败终态、运营入口未实现 |
| 一个人先把本地流程用起来，暂缓商业化投入 | [本地优先阶段总结与行动计划](local-first-validation-stage-2026-09-21.md) — 当前个人试用计划，非验收通过证明 |
| 用真实文章试用，判断是否有帮助 | [标题试用与人工记录](title-quality-observation-2026-09.md) |
| 理解产品三层定位与数据互联方向 | [战略定位 v1](strategy-positioning-v1-2026-09-21.md) |
| 盘点 Site Knowledge 现状与跨平台耦合点 | [Site Knowledge 现状盘点](site-knowledge-inventory-2026-09-21.md) |
| 理解运行诊断、使用统计和插件上报 | [工作台操作与开发指南](runtime-observation-workbench-operator-guidelines-v1.md) |
| 修改运行观测页面 | [运行观测 UI 开发规范](cloud-admin-runtime-observation-ui-development-standard-v1.md) |
| 规划运行观测工作台改造 | [工作台改造计划](runtime-observation-workbench-improvement-plan-v1.md) |
| 在真实环境验收运行观测工作台 | [真实场景验收记录](runtime-observation-workbench-real-scenario-acceptance-v1.md) |
| 评审后台版式和信息层级 | [视觉与信息架构评审规范](cloud-admin-visual-information-architecture-review-standard-v1.md) |
| 修改代码并选择验证方式 | [开发与验证工作模型](development-validation-operating-model-v1.md) |
| 查工程债与暂缓清理队列 | [工程跟进队列](engineering-follow-up-queue-v1.md) — 低收益项的触发条件与已完成整改索引 |
| 判断一个大文件是否值得拆 | [结构整改启动条件](structural-remediation-delivery-standard-v1.md) |
| 找遗漏文档或查看本轮整理结果 | [文档补充清单与结构调查](history/repository-hygiene/2026/document-navigation-and-hotspot-review-2026-09-11.md) |

## How to Read This Repository

Use documentation in this order:

1. current code, tests, runtime evidence, and protected repository policy;
2. active product boundaries and accepted ADRs;
3. active engineering standards and operator runbooks;
4. current plans and handoffs;
5. dated acceptance, closeout, validation, trial, and retrospective evidence;
6. superseded, retired, and legacy snapshots.

A document being checked into Git does not make it current authority. A dated
record proves only the evidence state, revision, environment, and scope that it
explicitly names.

## Lifecycle Classes

| Class | Meaning | Expected handling |
| --- | --- | --- |
| Active boundary or standard | Current normative product or engineering rule | Keep discoverable; update deliberately with affected contracts |
| Active runbook | Current operator procedure | Verify commands and environment before use |
| Current plan | Proposed or approved future work | Recheck baseline before implementation; do not treat as completion proof |
| Time-bounded evidence | Acceptance, closeout, validation, trial, audit, or retrospective receipt | Preserve for traceability; never use as automatic present truth |
| Superseded | Replaced by a named current document | Keep the replacement link and historical context |
| Retired negative guard | Removed capability or forbidden direction | Keep when it prevents reintroduction of old behavior |
| Legacy snapshot | Imported reference from an older repository or architecture | Reference only; never use as current implementation authority |

New or materially revised documents should place a clear `Status:` line near
the top. When replacing a normative document, name its successor instead of
deleting the old decision history.

- [SEO Specialist Runtime Pause](seo-specialist-pause-v1.md) — reversible task availability and new inspection score semantics; no data migration; points to cross-repo对照 in reversible-feature-pauses-v1.md.

## Product Boundaries

- [AGENTS.md](../AGENTS.md) — tool-agnostic agent entry.
- [engineering/definition-of-done.md](engineering/definition-of-done.md) — agent Definition of Done.
- [engineering/phase-1-scope.md](engineering/phase-1-scope.md) — Phase 1 WP editor loop scope and pauses.
- [engineering/verification-commands.md](engineering/verification-commands.md) — real package/Make verification entry points.
- [engineering/pr-contract.md](engineering/pr-contract.md) — PR Scope/Boundary/Verification/Risk pointer.
- [engineering/agents-session-protocol-detail.md](engineering/agents-session-protocol-detail.md) — long session/M4/lane procedures.

- [Reversible Feature Pauses](reversible-feature-pauses-v1.md) — paused entrypoints, retained data and implementation, restoration and verification receipts; **cross-repo对照** (Cloud `PAUSED_*` / Addon `is_task_paused` + `$paused_runtime_features` / Toolbox faces), error codes, publish order Cloud→Addon→Toolbox, smoke matrix rows D7–D8 / C6 / A5 / M5.
- [Generation Context Evidence](generation-context-evidence-v1.md) — validated Cloud-owned snapshot, storage and compatibility semantics.
- [Background Evidence and Cron Handoff](background-evidence-and-cron-handoff-2026-09-09.md) — reused acceptance, candidate identity and pending natural upload observation.

- [WordPress AI Unified Plan](wordpress-ai-unified-delivery-plan-2026-09-07.md) - current disposition followed by historical proposals; no automatic model calls.
- [WordPress Formatting History](history/wordpress-content-formatting-summary-2026-09-08.md) - requirements, open-source lessons, implementation tradeoffs and paused research.
- [WordPress AI Engineering Closeout](history/wordpress-ai-engineering-closeout-2026-09-08.md) - phase-1 source integration, verification and remaining decisions.
- [WordPress AI Entry-to-Feedback Flow](current-wordpress-ai-entry-to-feedback-flow-v1.md) — current implementation boundary check for the WordPress入口, Addon, Cloud runtime/context, local review/write ownership, and metadata feedback loop.
- [WordPress AI Request Path Map](wordpress-ai-request-path-map-v1.md) — end-to-end call chain from the editor button to the feedback events, with the code location of each step; visual companion to the flow document above, not a separate authority.
- [DeepSeek 标题输出额度与推理兼容性](deepseek-title-output-compatibility-v1.md) — bounded endpoint-specific title policy, zero-paid reproduction, deployed fix, and linked real-title/operator acceptance; formal smoke blocked by the public/internal health access mismatch; fallback remains unverified.
- [正式 Release Smoke 验收入口](formal-release-smoke-entry-v1.md) — 公网与内部SSH路径分离、精确安装SHA核对、零模型预检及下一次有界验收步骤。
- [DeepSeek 标题生产人工验收与正式 smoke 交接 — 2026-10-19](history/production/2026/deepseek-title-production-acceptance-2026-10-19.md) — DeepSeek主路径真实成功、901/14/0 token、辅助向量与3积分分项、人工保存回读确认、正式smoke一次403失败及零调用/零积分增量、后续受控入口建议；时点证据，不是长期稳定或回退成功证明.
- [最低配兼容表（内测）](compatibility-matrix.md) — single source of truth for recommended Cloud/Addon/Toolbox floors during closed beta; docs only; exact contract-string match remains the only hard gate; related to [ADR-053](decisions/053-defer-bounded-contract-compatibility-until-public-ecosystem-distribution.md) (文档先行，暂不引入 `minimum_supported_connector_version`)
- [ADR-053: Defer Bounded Contract Compatibility Until Public Ecosystem Distribution](decisions/053-defer-bounded-contract-compatibility-until-public-ecosystem-distribution.md) — accepted; keeps `ONE_ACTIVE_CONTRACT_VERSION` pre-public and pre-declares the trigger that switches to a bounded compatibility window with `upgrade_required` semantics
- [ADR-054: Responses Output Boundary and No Silent Endpoint Downgrade](decisions/054-responses-output-boundary-and-no-silent-downgrade.md) — accepted; keeps upstream Responses parsing endpoint-specific, fail-closed, and explicit about model evidence
- [ADR-055: Provider Account-Level Spend Budget Kill Switch](decisions/055-provider-account-level-spend-budget.md) — accepted design record; single dispatch choke point reusing existing cost estimates, atomic per-account daily/monthly claims, warn at 80 percent, fail closed at 100 percent; implementation and paid-provider authorization remain separate operator decisions
- [ADR-057: Keep WordPress AI Quality Evidence Payload-Free](decisions/057-wordpress-ai-quality-evidence.md) — accepted; keeps structure-sensitive output diagnostics bounded and payload-free while preserving the official WordPress AI result and write boundaries

- [Site Knowledge Recommendation Development Record](site-knowledge-recommendation-development-record-v1.md) — cross-repository lessons for vector evidence, coverage comparison, consumer debugging, and validation; implementation authority remains with the active runtime and connector contracts.
- [Site Knowledge Recommendation Quality Improvement Standard](site-knowledge-recommendation-quality-improvement-standard-v1.md) — consolidated quality loop for bounded hybrid ranking, natural-anchor safety, metadata-only behavior feedback, multi-AI offline review, open-source references, and single-operator evidence gates.
- [Internal-link Context Preview](internal-link-context-preview-v1.md) — development-only source/target evidence projection and frozen replay; [October 27 results](internal-link-context-preview-2026-10-27.md). Not a runtime filter or Apply authority.
- [Site Knowledge Recommendation History Synthesis — 2026-08-26](history/engineering/2026/site-knowledge-recommendation-history-synthesis-2026-08-26.md) — dated plain-language summary of the internal-link/related-content distinction, UI simplification lessons, bounded vector-quality improvements, phased evidence gates, and deferred model expansion; not runtime or release authority.
- [WordPress AI Recommendation Development Standard](wordpress-ai-recommendation-development-standard-v1.md) — consolidated WordPress-first product boundary, phased delivery, editor UX, validation, observation, and single-operator rules.
- [WordPress Editor Readiness Runbook](wordpress-editor-readiness-runbook-v1.md) — read-only prerequisites for local editor acceptance; Cloud-unavailable results are blocked, not recommendation evidence.
- [WordPress Editor Acceptance Observation — 2026-08-24](history/engineering/2026/wordpress-editor-acceptance-observation-2026-08-24.md) — five-sample latency and evidence baseline; observation only, not a performance SLA.

- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
- [Cloud Task Pack Boundary](cloud-task-pack-boundary-v1.md) — retired negative
  guard; retained to prevent Task Pack surfaces from returning
- [Cloud AI Data Handling Standard](cloud-ai-data-handling-standard-v1.md)
- [Cloud Media Delivery Boundary](cloud-media-delivery-boundary-v1.md)
- [Media Runtime Boundary](media-runtime-boundary-v1.md)
- [Cloud Media Governance Standard](cloud-media-governance-standard-v1.md)
- [Site Media Recommendation Development Standard v2](site-media-recommendation-development-standard-v2.md) — active implementation, validation, and staged-quality rules for external image-source recommendations; implementation companion to the [Site Media Recommendation Engineering Standard v1](site-media-recommendation-engineering-standard-v1.md), which governs site-inventory media recommendations
- [Cloud Media Governance Product and Development Retrospective — 2026-09-02](history/media/2026/cloud-media-governance-product-development-retrospective-2026-09-02.md) — dated synthesis of the production exercise, product-boundary decisions, reversible MVP, recovery posture, evidence states and implementation stop lines; not implementation or runtime acceptance evidence
- [Cloud Open Callback Boundary](cloud-open-callback-boundary-v1.md)
- [Multi-platform Connector Boundary](multi-platform-connector-boundary-v1.md)
- [Strategy Positioning v1 — 2026-09-21](strategy-positioning-v1-2026-09-21.md) — operator-directed product direction: three-layer structure (features, connectors, data interconnection), boundary hard lines, and roadmap discipline; direction record, not release authority
- [Site Knowledge Static Inventory — 2026-09-21](site-knowledge-inventory-2026-09-21.md) — static code inventory of storage, ingestion, retrieval, operations, WordPress coupling, and gaps; evidence record, not runtime authority
- [Cloud Agent Positioning](cloud-agent-positioning-v1.md)
- [Cloud Agent Workflow Metadata Projection](cloud-agent-workflow-metadata-projection-v1.md)
- [Cloud Agent Feedback Contract](cloud-agent-feedback-contract-v1.md)
- [Cloud Agent Feedback Quality Gate](cloud-agent-feedback-quality-gate-v1.md)
- [Internal AI Advisor](internal-ai-advisor-v1.md) — advisory read layer over Cloud service evidence; allowed and forbidden internal AI usage

- [七会话 Phase 1 收口与协作经验 — 2026-10-24](history/engineering/2026/seven-chat-phase1-closeout-2026-10-24.md) — 七个会话的职责、证据分层、T2/M4 收口和可复用协作经验；不替代生产授权或 Phase 2 计划。
- [七会话历史义务与资源处置：阶段检查点 — 2026-10-26](history/repository-hygiene/2026/seven-chat-historical-obligations-and-resource-disposition-2026-10-26.md) — 具名历史义务、恢复范围、保留资源与协作纠偏；记录当前阻塞和缺证，不是全历史清零或生产授权。
- [Frontend security dependency reconciliation — 2026-10-25](history/engineering/2026/frontend-security-dependency-reconciliation-2026-10-25.md) — Next.js acceptance, Vite override and Vitest peer alignment, remaining audit debt, and dependency closeout lessons.
- [FastAPI telemetry compatibility review — 2026-10-25](history/engineering/2026/fastapi-telemetry-compatibility-review-2026-10-25.md) — native telemetry ownership, callback redaction, query-default compatibility, and exporter-backed regression evidence.

## Engineering and Delivery Standards

- [Background Lightweight Mode](background-lightweight-mode-v1.md) — hourly optional diagnostics, manual quality analysis and unchanged cleanup/usage/callback responsibilities; runtime validation and release remain separate.

- [Runtime Resource Baseline](runtime-resource-baseline-v1.md) — bounded GET-only sampling; begin with 15 minutes, inspect completeness and runtime identity, then explicitly extend the window. No automatic workload or runtime operation.
- [CPU 分配对照与性能专项收尾 — 2026-10-19](history/engineering/2026/cpu-allocation-performance-closeout-2026-10-19.md) — 校正采样后的18格对照；业务收益未稳定达10%，回调部分退化，不采用新分配并结束本次性能专项。
- [回调签名与空队列退避验证 — 2026-10-19](history/engineering/2026/callback-dispatch-idle-backoff-validation-2026-10-19.md) — 同为2核预算、callback0.25核及连接池2+1的三轮对照；回调P95、CPU、空闲成本与冷空闲限制。
- [资源采样恢复与会话收尾经验 — 2026-10-17](history/engineering/2026/resource-sampling-and-session-closeout-retrospective-2026-10-17.md) — stash recovery, historical resource evidence and remaining acceptance gaps; sampler validation, localization, OCR and safe closeout lessons.

- [本地 WordPress 功能验收 — 2026-10-06](history/engineering/2026/wordpress-local-functional-acceptance-2026-10-06.md) — 五项编辑器替身场景和 272 项契约断言通过；一例真实本地标题保存/扣额已关联，第三方、云端反馈及文生图仍待补证据，保留首轮阻塞历史。
- [Free 试用前生产发布准备 — 2026-10-06](production-release-readiness-plan-2026-10-06.md) — 两处旧测试修复候选、累计部署范围、五项迁移与回滚条件；不是生产发布授权。
- [阶段 1 免费试用商业验证计划 — 2026-10-06](trial-stage-commercial-validation-plan-2026-10-06.md) — 10月19日更新首批3人起步验收，外部Trace暂缓，复用Free及现有证据；配套[账户与额度机制盘点](trial-account-and-quota-mechanism-2026-10-06.md)，操作者安排正常注册使用，实际T+0尚未记录。
- [ADR-058: Registration-Verified Account Free Entitlement](decisions/058-registration-verified-account-free-entitlement.md) — verified registration grants account-owned Free; Addon still owns proof of site connection, with legacy fallback preserved.
- [ADR-059: Existing-Catalog Provider Refresh Is Advisory During Release](decisions/059-provider-refresh-advisory-release.md) — production cutovers may retain a historical provider catalog when an individual upstream credential is unavailable; bootstrap, persistence, routing, health, and runtime provider failures remain fail-closed.
- [Free Trial Development Candidate — 2026-10-06](history/engineering/2026/trial-free-entitlement-development-candidate-2026-10-06.md) — local backend evidence and retained implementation; frontend dependency and M4 relay blockers, not merge or deployment evidence.

- [Performance and Security Remediation Closeout and Standard](performance-security-remediation-closeout-and-standard-v1.md) — September 2026 performance/security findings, merged/M4 evidence, rollback, and reusable review gates.

- [Early Product Validation and Minimal Telemetry Standard](early-product-validation-and-minimal-telemetry-standard-v1.md)
  — active stop rules, minimum non-author trial loop, privacy-safe journey
  evidence, defect priority, and commercial-proof reopening triggers
- [Single-Operator AI Development Standard](single-operator-ai-development-standard-v1.md)
- [AI Assisted Development Four Perspective Synthesis — 2026-09-07](ai-assisted-development-four-perspective-synthesis-2026-09-07.md) — dated synthesis of the solo-development, release, user-experience, and platform-administration conversations; preserves reusable rules and explicit deferrals without replacing current runtime or release authority
- [Single-Operator Pre-User Development Closeout and Next-Stage Guide — 2026-08-18](history/engineering/2026/single-operator-pre-user-development-closeout-and-next-stage-2026-08-18.md) — dated synthesis of the solo-AI pre-user phase, user-experience remediation, privacy-safe observation, delivery-time lessons, workflow lanes, and the next ordinary-development stop point; not production or human-value authority
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [Single-Operator AI Development, M4 Validation, and Production Release Playbook](single-operator-ai-development-and-release-playbook-v1.md)
- [Local-First Validation and Risk-Tiered CI](decisions/049-local-first-validation-and-risk-tiered-ci.md)
- [Historical Issue Closure and Release Evidence Standard](historical-issue-closure-and-release-evidence-standard-v1.md)
- [Historical Problems Closeout and Next-Stage Plan — 2026-08-22](history/engineering/2026/historical-problems-closeout-and-next-stage-plan-2026-08-22.md) — dated synthesis of the referenced Portal, diagnostics, administrator-observation, release-efficiency, and editor-monitoring discussions; records remaining work, reasons, phased next steps, and reusable development rules; not runtime, M4, production, or human-value authority
- [Single-Operator AI Release Workflow Standard](single-operator-ai-release-workflow-standard-v1.md) — operator-facing bug-fix to production flow, Environment wait handling, timing, evidence, and rollback
- [Pre-production Release Pause and User-experience Consolidation Closeout — 2026-08-21](history/production/2026/pre-production-release-pause-and-user-experience-consolidation-closeout-2026-08-21.md)
  — dated history from issue synthesis and privacy-safe observation through the
  OpenSSL exception review chain, Docker-capable gate split, retired production
  promotions, and the current Portal-first consolidation handoff; not
  production or human-value authority
- [Multi-Session Development Observation Synthesis and Next-Stage Plan — 2026-08-15](history/engineering/2026/multi-session-development-observation-synthesis-and-next-stage-plan-2026-08-15.md) — dated four-track evidence matrix, cross-session problem triage, phased execution plan, and observation stop lines; not runtime, production, or human-value authority
- [Development Efficiency Phase 3 Observation Plan](development-efficiency-phase3-observation-plan-v1.md) — current plan for collecting comparable delivery samples before further CI/shard/cache optimization
- [Development Efficiency Phases 1–3 Closeout and Retrospective](history/engineering/2026/development-efficiency-phases1-3-closeout-and-retrospective-2026-08-14.md) — dated evidence for PRs `#711`–`#713`, review corrections, validation receipts, and the current observation stop point
- [Development and Delivery Efficiency Closeout and Retrospective](history/engineering/2026/development-delivery-efficiency-closeout-and-retrospective-2026-08-11.md) — dated evidence for PRs `#620`–`#635`, measured baselines, corrections, and still-pending natural after-samples; not current release authorization
- [Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md) — bounded timing, evidence reuse, retry budgets, and local acceptance measurement rules
- [Production Release Feedback Loop Closeout and Standard — 2026-08-13](history/production/2026/production-release-feedback-loop-closeout-and-standard-2026-08-13.md) — dated release-identity/readiness/CI closeout plus the reusable early-failure, promotion, exact-SHA preflight, and timing discipline; current release authority remains the production policy
- [Production Release Efficiency Phase 1-2 Closeout and Development Retrospective — 2026-08-23](history/production/2026/production-release-efficiency-phase1-closeout-and-development-retrospective-2026-08-23.md) — PR #851 merge, clean-master M4 acceptance, root causes of delay, reusable evidence rules, and deferred next steps; not production authorization
- [Single-Session Workflow Standard](single-session-ai-workflow-standard-v1.md)
- [Merge-Lane Operations Runbook](merge-lane-operations-runbook-v1.md) — active runbook for driving PRs through the protected master lane: strict-freshness cascades, advisory review thread resolution, dependabot revival protocol, CI failure modes, and the weekly CVE recheck window renewal
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md)
- [Cloud OpenCodeReview Usage Policy](ocr-review-usage-policy-v1.md) — repository-local advisory review cadence, quota controls, provider configuration, and 429 recovery rules
- [Managed Private Source Relay](decisions/051-managed-private-source-relay-service.md) — accepted refinement that keeps the Tailscale-only Nginx service available while source bundles and locks remain per-operation and transient
- [Pgy Primary M4 Access](decisions/052-pgy-primary-m4-access.md) — accepted default-path decision for Pgy SSH/direct transfer with LAN and Tailscale fallback
- [LAN-first M4 Operation Routing](decisions/060-lan-first-m4-operation-routing.md) — current operator priority: office LAN, then Pgy, then Tailscale; select and pin the SSH host before each operation while keeping direct/relay transfer mode separate
- [M4 Remote Development and Overlay Network Standard](m4-remote-development-and-overlay-network-standard-v1.md) — active operating standard for M5 authoring, M4 Docker/Ollama runtime, overlay routing, mobile SSH, evidence, and recovery
- [Managed Source Relay Closeout and Development Retrospective — 2026-09-04](history/m4/2026/managed-source-relay-closeout-and-development-retrospective-2026-09-04.md) — dated evidence for PRs `#891` and `#892`, relay failure diagnosis, bounded retry corrections, M4 promotion, and reusable development lessons; not current runtime or release authority
- [Preview sync ≠ deploy session closeout — 2026-10-23](history/m4/2026/preview-sync-ne-deploy-session-closeout-2026-10-23.md) — dated #1200 / sync≠deploy lesson, natural Cron & quota evidence index, #1183 promote gate, portal §1.10 fold-in; not runtime or release authority
- [Internal New-User Readiness Gate](internal-new-user-readiness-gate-v1.md)
- [Internal Readiness Final Handoff — 2026-08-18](history/engineering/2026/internal-readiness-final-handoff-2026-08-18.md) — dated final handoff summarizing the five-stage delivery chain, development lessons, evidence states, and the bounded next action
- [Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md)
- [Repository Stage-Transition Cleanup Standard](repository-stage-transition-cleanup-standard-v1.md)
- [Repository Stage-Transition Worktree and Branch Cleanup Retrospective](history/repository-hygiene/2026/repository-stage-transition-worktree-and-branch-cleanup-retrospective-2026-08-08.md) — dated evidence for the 2026-08-08 consolidation; re-inventory current state before any future cleanup
- [Repository Hygiene Final Closeout and Development Lessons — 2026-08-18](history/repository-hygiene/2026/repository-hygiene-final-closeout-and-development-lessons-2026-08-18.md) — dated final topology, preservation layers, branch/worktree policy, and reusable cleanup lessons; not future deletion authority
- [Repository Documentation Consolidation Closeout and Lessons — 2026-08-22](history/repository-hygiene/2026/repository-documentation-consolidation-closeout-and-lessons-2026-08-22.md) — dated evidence for PRs `#836`–`#842`, branch recovery, documentation classification and archival, corrections, stopping decision, and reusable cleanup method; not future deletion authority
- [Single-Session AI Development Closeout and Retrospective](history/engineering/2026/single-session-ai-development-closeout-and-retrospective-2026-08-04.md)
- [Seven-Session Development Synthesis and Open-Issue Triage](history/engineering/2026/seven-session-development-synthesis-and-open-issues-2026-08-04.md) — dated synthesis of recent Cloud sessions; recheck current source before acting
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [M4 Preview Target Alignment Standard](m4-preview-target-alignment-standard-v1.md) — keep 18010 tunnel and candidate sync targets aligned, with version confirmation and recovery steps
- [M4 Preview Development Workflow](m4-preview-development-v1.md)
- [Engineering Command Inventory Standard](engineering-command-inventory-standard-v1.md)
- [Engineering Command Inventory M4 Source Bundle Closeout and Retrospective](history/engineering/2026/engineering-command-inventory-m4-source-bundle-closeout-and-retrospective-2026-08-04.md)
- [Structural Remediation Delivery Standard](structural-remediation-delivery-standard-v1.md)
- [Repository Hygiene and Documentation Lifecycle Standard](repository-hygiene-and-documentation-lifecycle-standard-v1.md)
- [Systematic Remediation Delivery Standard](systematic-remediation-delivery-standard-v1.md)
- [Systematic Remediation Closeout and Retrospective — 2026-08-14](history/engineering/2026/systematic-remediation-closeout-and-retrospective-2026-08-14.md) — dated evidence for the staged remediation sequence, validation chain, runtime observations, and development lessons
- [Repository Hygiene Cleanup Closeout and Retrospective](history/repository-hygiene/2026/repository-hygiene-cleanup-closeout-and-development-retrospective-2026-08-03.md)
- [AI Development Stage Closeout and Production Readiness Retrospective](history/engineering/2026/ai-development-stage-closeout-and-production-readiness-retrospective-2026-08-02.md)
- [PR and Dependency Update Policy](pr-and-dependency-update-policy.md)
- [CI Pytest Sharding](ci-pytest-sharding-v1.md)
- [AI Development Changed-Code Coverage Closeout and Retrospective](history/engineering/2026/ai-development-changed-code-coverage-retrospective-2026-08-08.md) — dated implementation, CI cost-correction, and observation-cycle evidence; the active policy remains in CI Pytest Sharding
- [Python Type Checking Standard](python-type-checking-standard.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Production-host Localhost Candidate Canary Standard](production-host-localhost-candidate-canary-standard-v1.md)

## Architecture and Refactor

- [Refactor Master Plan](refactor-master-plan-v1.md)
- [Refactor Deletion Inventory](refactor-deletion-inventory-v1.md)
- [Deferred Engineering Triggers](deferred-engineering-triggers-v1.md) — 2026-09-18 trigger-gated deferrals with pre-declared trigger conditions: three architecture directions (Addon contract registry, capability-surface gap, quality-driven routing), the request-log identity deviation, the Addon hosted-profile literal, the 2026-09-19 M4 preview sync/deploy marker finding, the 2026-09-20 decision that production promotion remains paused indefinitely until an operator chooses to resume, and the 2026-10-21 inline run orphan whose root cause was never proved (its lockout symptom is already mitigated by the inline admission lease, PR #1171); not an authorization for early work
- [Hosted Runtime Profiles](cloud-hosted-runtime-profiles-v1.md)
- [First-install Contract](cloud-first-install-contract-v1.md)
- [AI Task Runtime Contract](ai-task-runtime-contract-v1.md)
- [Text Hosted Routing Profile](text-ai-hosted-routing-profile-v1.md)
- [Source Extraction Preview](source-extraction-preview-v1.md)
- [Site Knowledge Runtime Contract](site-knowledge-runtime-contract-v1.md)
- [Site Knowledge Search Architecture Standard](site-knowledge-search-architecture-standard-v1.md) — lexical, vector, and hybrid retrieval selection, Meilisearch admission gate, evaluation, and Cloud ownership rules
- [Site Operations Cloud Analysis Runtime](site-ops-cloud-analysis-runtime-v1.md)
- [Commercial Repository Decomposition Plan](commercial-repository-decomposition-plan-v1.md)
- [Commercial Repository Decomposition Closeout and Retrospective](history/engineering/2026/commercial-repository-decomposition-closeout-and-development-retrospective-2026-08-03.md)

Commercial repository decomposition is paused after Phase 7I. The plan remains
the implementation history and restart contract; the closeout records the
current measured state and why further structural work is not the default next
priority. Neither document is reclassified or moved by this cleanup batch.

## Admin, Portal, Identity, and Commercial

- [Cloud personal data copy v1](portal-personal-data-copy-v1.md) — bounded own-profile/support/notification JSON download with dedicated email reauthentication; excludes commercial and WordPress data
- [主 checkout 九篇历史文档对账与开发经验 — 2026-10-25](history/engineering/2026/primary-checkout-intent-reconciliation-2026-10-25.md) — 旧意图的现行承接、纠偏与未完成边界，不是发布授权
- [Provider-model 历史方案原件与当前处置 — 2026-10-26](history/engineering/2026/provider-model-management-plan-disposition-2026-10-26.md) — 原始 plan 按字节保留，P0 已由 #1206 承接；§6 后续建议不因归档而自动实施。

- [Cloud Portal Customer Workspace UI Standard](cloud-portal-customer-workspace-ui-standard-v1.md)
- [Cloud Portal Site Detail Status Display Standard](cloud-portal-site-detail-status-display-standard-v1.md) — 站点详情页状态归属、告警分类、自动更新文案、操作收敛和回归测试规则
- [Account Site Knowledge usage breakdown v1](portal-site-knowledge-usage-contract-v1.md) — Portal account usage detail `source_type` filter contract (text/media/video/pdf); read-only; not a metering redesign
- [Site Monitoring Observability](site-monitoring-observability-v1.md) — implemented read-only Cloud health telemetry for Portal site owners and Admin cross-site aggregation
- [Portal Customer Workspace UI Closeout and Retrospective — 2026-08-14 to 2026-08-15](history/portal/2026/portal-customer-workspace-ui-closeout-and-retrospective-2026-08-14.md)
  — dated PC-first Portal information architecture, account/site ownership,
  all-sites filtering, browser validation, and M4 candidate evidence; not
  merge, production, or customer acceptance authority
- [Portal Phase 2 e2e Assertion Batches Retrospective — 2026-10-22](history/portal/2026/portal-phase2-e2e-assertion-batches-retrospective-2026-10-22.md) — dated batch-merge closeout for assertion debt (#1189–#1196), support table width note, and deferred screenshot baselines; not full-suite green or Phase 3 authority
- [Cloud WordPress Connector State and Diagnostics Standard](cloud-wordpress-connector-state-and-diagnostics-standard-v1.md)
- [Cloud Connector Recovery Contract](cloud-connector-recovery-contract-v1.md)
- [Site-Inactive Recovery Closeout — 2026-08-13](history/engineering/2026/site-inactive-recovery-closeout-2026-08-13.md) — dated cross-repository implementation, validation, and development-learning record
- [WordPress–Cloud Integration Diagnostics Retrospective — 2026-08-13](history/engineering/2026/wordpress-cloud-integration-diagnostics-retrospective-2026-08-13.md) — dated synthesis of featured-image scene compatibility, Site Knowledge retrieval acceptance, QQ OAuth projection, site lifecycle, Portal proxy, and timeout diagnostics; not current deployment or production evidence
- [Admin Information Architecture](cloud-admin-information-architecture-v2.md)
- [Admin UI Standard](cloud-admin-ui-standard-v1.md)
- [Admin Diagnostics Density Tier Session Retrospective — 2026-09-22](history/admin/2026/records/admin-diagnostics-density-tier-retrospective-2026-09-22.md) — closed session record for the compact density tier rollout (PR #1012): decisions, lessons for future AI sessions, and the densification backlog
- [Runtime Diagnostics, Navigation and Validation Retrospective — 2026-10-08](history/admin/2026/records/runtime-diagnostics-navigation-and-validation-retrospective-2026-10-08.md) — dated interface and navigation decisions, regression controls, evidence limits and the unresolved historical Portal read failure; current merge/M4 acceptance remains separate
- [Provider Budget Settings Closeout Retrospective — 2026-10-11](history/admin/2026/records/provider-budget-settings-closeout-retrospective-2026-10-11.md) — PR #1092 delivery record with the reusable Linux-golden regeneration recipe (loopback-origin container render + footprint calibration), M4 host recovery over 蒲公英, and protected-merge mechanics for bot-reviewed PRs; the guard ships disabled
- [Admin Validation Maintenance Closeout — 2026-10-08](history/admin/2026/records/admin-validation-maintenance-closeout-2026-10-08.md) — fixture identity/audit consistency, non-pilot visual selection, enlarged-text help containment, and historical preservation lessons
- [Admin Frontend Engineering Standard](cloud-admin-frontend-engineering-standard-v1.md)
- [Admin UI Review and Delivery Playbook](cloud-admin-ui-review-and-delivery-playbook-v1.md)
- [Admin Customer Operations Workspace Standard](cloud-admin-customer-operations-workspace-standard-v1.md)
- [Customer Account and Identity Stage Standard](customer-account-identity-stage-standard-v1.md)
- [ADR-031: Require Principal-Owned Portal Site Authorization](decisions/031-principal-owned-portal-site-authorization.md) — accepted; decision 6 superseded by ADR-034
- [ADR-034: Keep Existing Sites Unbound During Ownership Bootstrap](decisions/034-fail-closed-principal-site-ownership-bootstrap.md) — accepted; supersedes decision 6 of ADR-031
- [User Identity, Membership, and Site Authorization Closeout — 2026-07-27](history/engineering/2026/user-identity-membership-site-authorization-closeout-and-development-retrospective-2026-07-27.md) — dated evidence; production deployment and real-user acceptance remain outside its scope
- [Billing Entitlement Contract](cloud-billing-entitlement-v1.md)
- [Payment Entitlement Contract](cloud-payment-entitlement-v1.md)
- [Payment Gateway Contract](payment-gateway-contract-v1.md)
- [AI Credit Charge Contract](ai-credit-charge-contract-v1.md)
- [Public Plan Catalog and Homepage Display](public-plan-catalog-and-homepage-display-v1.md)

## Providers, Media, and Quality

- [Site Media Recommendation Engineering Standard](site-media-recommendation-engineering-standard-v1.md) — active WordPress-first product and engineering rules for one-click media preparation, bounded recognition proxies, cross-modal retrieval evaluation, structured visual evidence, deduplication, abstention, incremental lifecycle, administrator-controlled background execution windows, and recommendation quality
- [Media Fingerprints, Visual Evidence, and Article ALT Development Standard](media-alt-and-visual-evidence-development-standard-v1.md) — active reference for article ALT, exact-fingerprint evidence reuse, explicit recognition consent, and Toolbox/Addon/Cloud ownership
- [Site Media Recognition Closeout and Development Retrospective — 2026-08-31](history/media/2026/site-media-recognition-closeout-and-development-retrospective-2026-08-31.md) — dated Cloud/Add-on/local acceptance record for one-click sequential batching, package capacity, daily pacing, idempotent recovery, progress semantics, and the final `70 / 70` eligible-image result; not current deployment or production authority
- [Cloud Model Capability Discovery and Verification Standard](cloud-model-capability-discovery-and-verification-standard-v1.md) — external metadata discovery, capability-specific configuration probes, evidence states, route-fingerprint caching, and rollout rules for text, vision, embeddings, image, audio, and video generation
- [Model Capability Verification Development Retrospective — 2026-08-26](history/engineering/2026/model-capability-verification-development-retrospective-2026-08-26.md) — dated synthesis of the model/Provider/route distinction, capability reliability versus output quality, low-cost single-operator observation, 30-day evidence freshness, runtime fail-closed behavior, and deferred video integration; not merge, M4 acceptance, production, or quality authority
- [Provider Connection Production Runbook](provider-connection-production-runbook-2026-06-30.md)
- [Cloud Web Search Provider Integration Standard](cloud-web-search-provider-integration-standard-v1.md) — active investigation, adapter, secret-handling, verification, M4, merge, and rollout rules for managed search providers
- [AnySearch Web Search Provider Integration Closeout — 2026-08-18](history/engineering/2026/anysearch-web-search-provider-integration-closeout-2026-08-18.md) — dated evidence for PR `#793`, the stale-branch migration correction, M4 acceptance, bounded real-upstream validation, and extracted development lessons; not production or human acceptance authority
- [Operator-initiated Provider Image Delivery Probe](decisions/042-operator-initiated-provider-image-delivery-probe.md)
- [Model Reference Metadata](model-reference-metadata-v1.md)
- [Cloud Web Search Runtime Contract](cloud-web-search-runtime-contract-v1.md)
- [Cloud Image Context Evidence Runtime Contract](cloud-image-context-evidence-runtime-contract-v1.md)
- [Image Source AI Generation Handoff](image-source-ai-generation-handoff-v1.md)
- [Media Derivative Operations Runbook](media-derivative-operations-runbook-v1.md)
- [Editor Assist Quality Flywheel](editor-assist-quality-flywheel-v1.md)
- [WordPress AI Runtime Validation Rollout Plan](wordpress-ai-runtime-validation-rollout-plan-v1.md)
- [WordPress AI Runtime Continuous Observation — 2026-09-21](wordpress-ai-runtime-observation-2026-09-21.md) — active observation record for the post-implementation natural-traffic, semantic-review, gateway, compatibility-gate, and production-pause boundaries
- [Default Branch Dependency High-Alert Closeout — 2026-09-21](history/dependency-high-alerts-closeout-2026-09-21.md) — merged `js-yaml` and `sharp` security fix, local/native verification, M4 acceptance, alert refresh, and reusable dependency-update rules
- [Customer Journey Metadata](customer-journey-metadata-v1.md) — active
  metadata-only WordPress and Portal event, consent, retention, summary, and
  release-evidence contract
- [Real Editor Cohort Operations](real-editor-cohort-operations-v1.md)
- [Pre-user Customer Journey Observability Closeout and Development Retrospective — 2026-08-17](history/engineering/2026/pre-user-customer-journey-observability-closeout-and-development-retrospective-2026-08-17.md)
  — dated Cloud/Add-on/Portal/M4/local evidence, privacy decision, lean
  single-operator method, and formal-release/human-cohort handoff; not
  production or recruitment authorization
- [Real Editor Technical Monitoring Closeout and Development Retrospective — 2026-08-15](history/engineering/2026/real-editor-technical-monitoring-closeout-and-development-retrospective-2026-08-15.md)
  — dated two-site Provider, AI-credit, metadata-only quality, Addon PR `#97`,
  correction, and remaining-observation evidence; not production or human-value
  acceptance authority
- [Editor Assist Quality JSON Export Production Closeout — 2026-08-07](history/engineering/2026/editor-assist-quality-json-export-production-closeout-2026-08-07.md)
  — dated evidence for the restrained metadata-only export, focused validation,
  production release, time costs, and explicit non-commercial conclusions
- [Feedback Data Operations](feedback-data-operations-v1.md)
- [Hosted WordPress Text Generation Validation Standard](hosted-wordpress-text-generation-closed-loop-validation-standard-v1.md)

## Operations and Release

- [Operations Playbook](../deploy/OPS_PLAYBOOK.md)
- [Production Host DNS and Certificate Recovery — 2026-10-07](history/production/2026/production-host-dns-and-certificate-recovery-2026-10-07.md) — dated host recovery evidence; original application version remains deployed, not Free trial release approval
- [Release Checklist](../deploy/RELEASE_CHECKLIST.md)
- [Production Release Optimization and Formal Smoke Handoff](production-release-optimization-and-formal-smoke-handoff-v1.md)
- [Production Release Historical Issues Closeout and Retrospective — 2026-08-14](history/production/2026/production-release-historical-issues-closeout-and-retrospective-2026-08-14.md)
  — dated evidence for the 2026-08-08 handoff ledger, bounded production
  promotion, Addon release, consumer paths, and review corrections; not future
  production authorization
- [First-install PostgreSQL 18 Runbook](cloud-first-install-rds-pg18-runbook.md)
- [Production WordPress Connector Smoke](production-wordpress-ai-connector-smoke-runbook-v1.md)
- [Issue #406 Production Validation Preparation Retrospective](history/engineering/2026/issue-406-controlled-production-validation-preparation-retrospective-2026-08-04.md)
  — dated evidence; canary/browser completion is not production validation
- [Production WordPress Round-Trip Validation Runbook](production-wordpress-roundtrip-validation-runbook-v1.md)
- [Production Internal-Validation Active-Soak Evidence — 2026-08-05](history/production/2026/production-internal-validation-active-soak-evidence-2026-08-05.md)
- [Python 3.14.6 Controlled-Validation Operator Worksheet — 2026-08-05](history/production/2026/python-3-14-6-controlled-validation-operator-worksheet-2026-08-05.md)
  — one-operator, one-budget production evidence, exact quota/ledger assertions,
  WordPress-write boundaries, and fixture cleanup
- [Production WordPress Image Round-Trip Evidence — 2026-08-05](history/production/2026/production-wordpress-image-roundtrip-evidence-2026-08-05.md)
  — dated one-operator SiliconFlow lifecycle evidence, cleanup receipt,
  alt-text diagnosis, timing lesson, and remaining first-install blockers
- [Production Release and WordPress Text Round-Trip Closeout — 2026-08-07](history/production/2026/production-release-and-wordpress-text-roundtrip-closeout-2026-08-07.md)
  — dated deployment/recovery retrospective plus one-operator text adoption,
  autosave recovery, quota/ledger, and cleanup evidence
- [Frontend Public/Portal Release Checklist](frontend-public-portal-release-checklist-v1.md)
- [P5 Local Backup/Restore Drill](p5-b5-local-backup-restore-drill-v1.md)
- [Runtime Stability and Performance Evidence Plan](runtime-stability-performance-evidence-v1.md)
- [Small-customer Trial Readiness](small-customer-trial-commercial-readiness-v1.md)
- [Nightly Intelligence / Morning Brief](nightly-site-inspection-morning-brief-v1.md) — active planning contract for off-hours site inspection, content quality scoring, and morning editorial readiness; WordPress remains the content and write owner
- [ADR-046: Use a Read-Only Production Ownership Inventory](decisions/046-read-only-production-ownership-inventory.md) — accepted; prerequisite before migrating an existing user/site dataset
- [CNA evidence re-verification — 2026-09-16](history/production/2026/cve-authority-reverification-2026-09-16.md) — dated verification record; not production release approval

Production approval, deployment, production validation, and GA remain separate
states. A historical production or M4 receipt never authorizes a new release.

## Architecture Decisions

Accepted and superseded architectural decisions live under
[`docs/decisions/`](decisions/). ADRs are append-only decision history:

- do not delete an ADR because implementation changed;
- add or update the successor relationship when a decision is replaced;
- verify duplicate numbering and ambiguous status before adding a new ADR;
- use the current implementation and newest accepted successor when an older
  ADR conflicts with present source.

Numbering status: 044 is unassigned (the sequence skips from 043 to 045);
the 2026-07-28 `ai_credits` meter decision was renumbered from ADR-028 to
[ADR-056](decisions/056-ai-credit-commercial-meter-contract.md) on 2026-09-22
to resolve a duplicate numbering collision. Documentation structural checks
verify this sequence.

## Evidence and Historical Material

The following naming patterns normally identify evidence rather than active
authority:

- `*-acceptance-*`
- `*-closeout-*`
- `*-retrospective-*`
- `*-validation-*`
- `*-trial-*`
- `*-audit-*`
- `*-history-*`
- date-stamped implementation summaries and handoffs

These files remain valuable for revisions, commands, failures, measured
results, rollback evidence, and prior decisions. Keep them searchable, but do
not place their complete list in the root README.

Special retained evidence areas:

- [`docs/history/`](history/) contains material already moved into an explicit
  history namespace;
- [`docs/legacy-contracts/`](legacy-contracts/magick-ai-root/README.md) contains reference-only
  snapshots imported from the former repository layout;
- [`docs/superpowers/`](superpowers/) contains historical planning artifacts
  and is excluded from routine documentation governance.

Historical migrations under `migrations/` are schema evidence and are not
documentation cleanup targets.

## Initial Cleanup Review Queue

The 2026-08-03 baseline contained 309 tracked Markdown documents: 250 had an
early status marker and 59 did not. These counts are an inventory snapshot, not
a deletion quota.

Apply the
[Repository Hygiene and Documentation Lifecycle Standard](repository-hygiene-and-documentation-lifecycle-standard-v1.md)
to every batch in this queue. The
[first cleanup retrospective](history/repository-hygiene/2026/repository-hygiene-cleanup-closeout-and-development-retrospective-2026-08-03.md)
records the evidence and corrections that produced that standard.

Review in bounded batches:

1. Admin Phase C-H and pilot acceptance records from 2026-07-12: retain as
   evidence, verify links to the current Admin standards, then consider moving
   them under a history namespace in a separate PR.
2. June external/internal trial records: verify whether their operator
   procedures remain active before changing status or location.
3. Dated refactor, P5, provider, frontend, and release closeouts: retain the
   evidence chain and remove only duplicate navigation from current entry
   points.
4. Superseded and retired contracts: require a named replacement or explicit
   negative-guard purpose; do not delete solely because runtime code no longer
   implements the old surface.
5. Files without an early status marker: classify from current consumers,
   owning standards, Git history, and executable contracts before moving or
   deleting them.

## Change Rules

When changing documentation structure:

1. preserve active boundaries, ADR history, migrations, release evidence, and
   negative guards;
2. update inbound links in the same change when moving a file;
3. run a repository Markdown-link check or an equivalent tracked-file link
   scan;
4. verify `git diff --check`;
5. run the narrowest policy/contract gate covering the changed entry points;
6. keep documentation-only work out of M4 unless a runtime-specific risk
   explicitly requires it;
7. report local, PR, merged, M4, production, and human evidence separately;
8. move a task's dated records into `docs/history/<topic>/` when the task
   merges; a dated record stays at the `docs/` root only with an entry under
   [Dated Active-document Review](#dated-active-document-review), and
   `check_doc_reachability.py` fails on unlisted dated root records older
   than the current month.

An unreferenced basename, old date, large file, or `retired` label is a review
signal, not deletion authority.

## Dated Active-document Review

The 2026 dated-document review classifies current authority explicitly without
moving or rewriting historical evidence.

Retained active authority:

- [AI Provider Env Config Retirement](ai-provider-env-config-retirement-2026-06-26.md) - retired negative guard;
- [External Trial Operator Runbook](external-trial-operator-runbook-2026-06-11.md) - bounded operator procedure;
- [Image Processing FC/OSS Readiness](image-processing-fc-oss-readiness-2026-07-20.md) - current deferred migration decision;
- [Naming Residual Allowlist](naming-residual-allowlist-2026-06-24.md) - cross-repository naming guard;
- [P5 B8 Final Engineering Closeout](p5-b8-final-engineering-closeout-2026-07-19.md) - pinned at the root by `check-release-policy.sh`;
- [Provider Connection Production Runbook](provider-connection-production-runbook-2026-06-30.md) - current provider operations procedure;
- [Python 3.14.6 Controlled Production Validation Risk Decision](python-3-14-6-controlled-production-validation-risk-decision-2026-07-21.md) - pinned at the root by `check-release-policy.sh`;
- [Release CI Open-source Patterns](release-ci-open-source-patterns-2026-07.md) - current CI selection and evidence-reuse guidance.

Historical evidence retained in place:

- [Admin Account Governance Lightweight](admin-account-governance-lightweight-2026-06-12.md);
- [AI Assisted Development Four Perspective Synthesis — 2026-09-07](ai-assisted-development-four-perspective-synthesis-2026-09-07.md);
- [Background Evidence and Cron Handoff — 2026-09-09](background-evidence-and-cron-handoff-2026-09-09.md);
- [Compat Budget Payment Session Retrospective — 2026-09-22](compat-budget-payment-session-retrospective-2026-09-22.md);
- [Compat Stability Payment Follow-up Handoff — 2026-09-22](compat-stability-payment-follow-up-handoff-2026-09-22.md);
- [Compliance Confirmation Checklist — 2026-09-23](compliance-confirmation-checklist-2026-09-23.md);
- [Cloud Production Deployment History](cloud-production-deployment-history-2026-06-24.md);
- [Development Session Notes — 2026-09-22](development-session-notes-2026-09-22.md);
- [Development Session Notes — 2026-09-23](development-session-notes-2026-09-23.md);
- [Development Session Notes — 2026-09-26](development-session-notes-2026-09-26.md);
- [Development Session Notes Compliance — 2026-09-26](development-session-notes-compliance-2026-09-26.md);
- [Development Session Notes — 2026-10-23](development-session-notes-2026-10-23.md);
- [Domestic Latency Observation — 2026-09-22](domestic-latency-observation-2026-09-22.md);
- [Domestic Latency Observation Supplement — 2026-09-22](domestic-latency-observation-supplement-2026-09-22.md);
- [External Trial Capability Note](external-trial-capability-note-2026-06-10.md);
- [External Trial Copy and Log](external-trial-copy-and-log-2026-06-11.md);
- [External Trial Handoff Summary](external-trial-handoff-summary-2026-06-15.md);
- [External Trial Readiness Checklist](external-trial-readiness-checklist-2026-06-10.md);
- [Local-first Validation Stage — 2026-09-21](local-first-validation-stage-2026-09-21.md);
- [M4 Compiled Preview and Login Retrospective — 2026-09-08](m4-compiled-preview-and-login-retrospective-2026-09-08.md);
- [Next Stage Plan — 2026-09-22](next-stage-plan-2026-09-22.md);
- [Payment and Domestic Readiness Note — 2026-09-22](payment-and-domestic-readiness-note-2026-09-22.md);
- [Provider Budget Hard Cap Inventory — 2026-09-23](provider-budget-hard-cap-inventory-2026-09-23.md);
- [Pre-release Legacy Debt and Development History](pre-release-legacy-debt-and-development-history-2026-07-10.md);
- [Refund Gap Inventory — 2026-09-22](refund-gap-inventory-2026-09-22.md);
- [Service Settings Projection Remediation — 2026-09-09](service-settings-projection-remediation-2026-09-09.md);
- [Site Knowledge Inventory — 2026-09-21](site-knowledge-inventory-2026-09-21.md);
- [Site-Owner AI Product Commercial Brainstorm — 2026-10-08](history/strategy/2026/site-owner-ai-product-commercial-brainstorm-2026-10-08.md);
- [Strategy Positioning v1 — 2026-09-21](strategy-positioning-v1-2026-09-21.md);
- [Strategy Session Synthesis — 2026-09-22](strategy-session-synthesis-2026-09-22.md);
- [Title Quality Observation — 2026-09](title-quality-observation-2026-09.md);
- [WordPress AI Loop Verification Checklist — 2026-09-22](wordpress-ai-loop-verification-checklist-2026-09-22.md);
- [WordPress AI Runtime Observation — 2026-09-21](wordpress-ai-runtime-observation-2026-09-21.md);
- [WordPress AI Unified Delivery Plan — 2026-09-07](wordpress-ai-unified-delivery-plan-2026-09-07.md).

Run `python3 scripts/report-maintainability-inventory.py` for the advisory,
read-only large-file trend, source-text-contract, behavior-test, and document
lifecycle inventory. Its counts are navigation signals, not quality targets or
merge gates.

- [Site Knowledge reading-task abstention v2](site-knowledge-reading-task-abstention-v2.md): independently versioned evidence qualification and successful empty recommendations.

- [Read-only Admin economics contract](engineering/admin-economics-readonly-contract.md)
