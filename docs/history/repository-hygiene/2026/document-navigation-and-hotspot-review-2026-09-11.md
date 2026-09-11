# 文档入口、遗漏清单与结构热点调查（2026-09-11）

Status: dated read-only inventory and documentation candidate; not a full code audit, runtime validation, or human-value result.

## 本轮结论

真实试用是主线；文档先修导航与现行／历史权威混淆，结构先调查再按实际问题启动。
本轮只修改文档，未删除原始记录、搬迁 ADR、拆运行代码、新建遥测或调用模型。

基线为 `01b4889d16aa9f3ef25fd8acfeb78fe26a6d7a1a`，检查时已刷新 origin/master，
干净主目录与其一致；仅一个开发会话，M4 运维 worktree 保留，无相关开放 PR。
本轮分支 `codex/docs-and-trial-review`；development lane，documentation-only，
45 分钟候选预算，零 Provider 调用／构建／M4 操作。没有借本次整理批准发布或合并。

## 文档发现和处理

- `docs/` 有 432 份已跟踪 Markdown，其中 256 份在根层；沿 README 链接可达 344，未到达 88。
- 方法：检查已跟踪 Markdown 普通链接与引用式链接，跳过代码围栏；目录仅在存在 README 时继续遍历；不检查外网可用性及标题锚点。未到达不代表没有代码、脚本、外部引用或目录浏览入口。
- 总入口中 2 个模型复盘链接没有目标文件；工作区和可见 Git 历史没有找到对应记录，因此移除无效入口，不能编造或替换成另一份模型结论。原目标名保留如下供后续找到来源时追查。
- 同一列表的入口到反馈闭环、交付效率标准各重复一次，已去重；跨章节有不同用途的重复链接保留。
- 总入口新增按试用、观测、开发、结构调查定位的快捷入口；本页收录遗漏路径以便复核。链接可达改善不等于所有内容已审定为现行规范。
- 纳入本候选的新调查页后，433 份文档在上述链接算法下均可到达；非 legacy 文件路径断链为零。该结果包括经本页待复核清单到达的文档，不是全仓语义审查通过。
- 旧本地集成指南将 Adapter 写成直接 Cloud 传输 owner；已标历史并指向当前 Addon 路径。旧 alpha 执行计划的模型和阶段假设也改标历史，保留原文，不重新解释过去结论。
- legacy 快照存在 17 处文件路径断链（含重复引用）；保留原始证据，不把不存在的旧合同伪装为现行合同。现行入口不再指向不存在的文件；legacy 通过其迁移说明阅读。

原缺失目标：`docs/history/models/2026/wemm-embedding-and-bge-m3-evaluation-retrospective-2026-09-02.md`、
`docs/history/models/2026/siliconflow-vlm-and-m4-image-recognition-development-retrospective-2026-09-02.md`。

## 结构热点：证据与处理决定

下表行数取当前文件；提交数来自 `git log --since=2026-08-12 --until=2026-09-12 -- <path>`，
仅为 Git 历史活跃度，不是故障次数、独立需求数或耗时测量。相比 9 月 7 日记录，
重启判断需要新证据，不能复用旧结论当作实时 backlog。

| 热点 | 行数 | 期间提交数 | 决定与重启条件 |
| --- | ---: | ---: | --- |
| `frontend/src/lib/i18n.ts` | 12327 | 30 | 优先关注文案修改与测试期望协同；#935/#936 的旧标题断言确有遗漏。先在下一次文案修改时查相关消费者，不证明拆整份词典能解决问题。 |
| `app/api/routes/service.py` | 6510 | 16 | 已通过 #907/#913 拆出站点合规和订阅路由；本次新增参数只需有界接线。等具体需求跨多个职责或发生重复规则再选纯读投影。 |
| `app/domain/runtime/service.py` | 6528 | 14 | 本次用独立 usage_statistics/failure_evidence 模块接线；不改计量、队列、事务。只有故障、隔离困难或测量到的交付阻碍才再拆。 |
| `frontend/src/app/admin/accounts/[accountId]/page.tsx` | 2897 | 1 | 两项客户页额外浏览器断言尚待核对；先判断真实界面问题还是旧测试预期，再决定是否需要状态域抽取。 |
| `app/domain/commercial/mixins/_admin_mixin.py` | 3558 | 2 | 没有新增结构阻塞证据；保留，遇授权／额度具体需求时重新核对隐式依赖。 |
| `tests/api/test_portal_routes.py` | 8022 | 10 | 活跃但没有测得单文件长度引发的瓶颈；随具体场景修改评估 fixture 隔离，不为行数拆测试。 |
| `scripts/m4-preview.sh` | 3586 | 8 | 近期有真实预览构建修复；没有证据表明文件拆分能改善传输或构建耗时，保持运维边界稳定。 |

责任与节奏：下一次修改对应模块的实现者负责补充复现、修改范围或耗时证据，操作者决定
它与真实试用缺陷的优先级；一次只启动一个职责。没有证据时保持暂停，不能把暂停写成完成。
本轮未确认需要立即实施的结构重构，运行性能收益亦未测量。

## 真实价值验证：已准备，尚未发生

沿用[标题观察记录](../../../title-quality-observation-2026-09.md)，补入参与者类别、
实际总耗时、人工修改耗时、收益和是否愿意再次使用。本地空白记录放在
`.tmp/docs-trial-review/T01-local.md`，不将文章地址、正文或生成内容入仓。

- 操作者选真实需要处理的文章并正常操作，自己决定采用、保存和质量。
- 实现者记录匿名结果、关联现有证据，出现问题只修一个有依据的阻塞。
- 开发者本人试用与非开发者目标用户结果分开；前者不能证明市场、留存或付费价值。
- 本轮新增文章场景 0、人工评审 0；没有人为制造流量，当前仍不能判断实际收益。
- 首批 5 个正常场景后小结，最多 10 个有意义场景；不等凑齐才处理真实阻塞。

## 未到达文档补充清单

这是基线 88 个路径的导航清单，不是新增 active 清单或删除清单。ADR 保留决策状态，
历史材料保留原时间语境；其余需在下一次使用时核对消费者、后继文档和当前代码。
没有通读全部 432 份文档作语义审计，不宣称全仓文档治理已完结。

### 架构决策（保留原状态）

- [ADR 001: Payment-backed credits and package pricing](../../../../docs/decisions/001-payment-backed-credit-grants-and-package-pricing.md)
- [ADR-007: Artifact-referenced media resources](../../../../docs/decisions/007-artifact-referenced-media-resources.md)
- [ADR-008: Artifact-only image generation results](../../../../docs/decisions/008-artifact-only-image-generation-results.md)
- [ADR-009: Artifact-referenced alt-text vision input](../../../../docs/decisions/009-artifact-referenced-alt-text-vision-input.md)
- [ADR-010: Project Current MediaArtifact Lifecycle At Public Result Boundaries](../../../../docs/decisions/010-dynamic-media-artifact-lifecycle-projection.md)
- [ADR-012: Track Artifact Publication Against the Owning DB Transaction](../../../../docs/decisions/012-transaction-tracked-artifact-publication.md)
- [ADR-013: Fence Media Artifact Purge Against Delivery Completion And ACK](../../../../docs/decisions/013-fenced-media-artifact-purge-delivery-coordination.md)
- [ADR-014: Read-only Media Artifact Inventory Reconciliation](../../../../docs/decisions/014-read-only-media-artifact-inventory-reconciliation.md)
- [ADR-015: Persistent Fenced Media Artifact Orphan Cleanup](../../../../docs/decisions/015-persistent-fenced-media-artifact-orphan-cleanup.md)
- [ADR-016: Fail Closed At Portal Account And Admin Browser Boundaries](../../../../docs/decisions/016-fail-closed-portal-admin-service-boundaries.md)
- [ADR-017: Durable Portal Mutation Idempotency](../../../../docs/decisions/017-durable-portal-mutation-idempotency.md)
- [ADR-018: Contract Admin Around Hosted Runtime Profiles](../../../../docs/decisions/018-cloud-hosted-runtime-profile-admin-surface.md)
- [ADR-028: Use `ai_credits` as the canonical commercial meter](../../../../docs/decisions/028-ai-credit-commercial-meter-contract.md)
- [ADR-032: Defer Provider Credential Delegation And Text Streaming](../../../../docs/decisions/032-defer-provider-credential-delegation-and-text-streaming.md)
- [ADR-033: CNY Accounting And Provider Cost Evidence](../../../../docs/decisions/033-cny-accounting-and-provider-cost-evidence.md)
- [ADR-040: Reuse Tree-Bound Production PR CI Evidence](../../../../docs/decisions/040-production-pr-ci-evidence-reuse.md)
- [ADR-041: Bind provider image host approval to persisted runtime evidence](../../../../docs/decisions/041-evidence-bound-provider-image-host-approval.md)
- [ADR-043: Structured Site-Lifecycle Recovery Between Cloud and Addon](../../../../docs/decisions/043-structured-site-lifecycle-recovery-between-cloud-and-addon.md)
- [ADR-048: 将正式用户观测授权放入连接验证完成流程](../../../../docs/decisions/048-production-observability-consent-and-site-support.md)

### 迁移与旧计划快照（参考入口）

- [Magick AI Root Legacy Contracts](../../../../docs/legacy-contracts/magick-ai-root/README.md)
- [Cloud Addon UI Ownership Matrix v1](../../../../docs/legacy-contracts/magick-ai-root/ai/docs/contracts/cloud-addon-ui-ownership-matrix-v1.md)
- [Channel Delivery Matrix Contract v1](../../../../docs/legacy-contracts/magick-ai-root/magick-ai/docs/contracts/channel-delivery-matrix-v1.md)
- [Local Product Surface Layering Contract v1](../../../../docs/legacy-contracts/magick-ai-root/magick-ai/docs/contracts/local-product-surface-layering-v1.md)
- [Media Derivative Processing Service — Implementation Plan](../../../../docs/superpowers/plans/2026-06-02-media-derivative-processing.md)
- [Media Derivative Processing Service — Design Spec](../../../../docs/superpowers/specs/2026-06-02-media-derivative-processing-design.md)

### 其他历史／合同／待复核文档

- [AI-Assisted Development Tooling and Parallel Session Closeout](../../../../docs/ai-assisted-development-tooling-and-parallel-session-closeout-2026-08-01.md)
- [AI Credit Ledger Detail Summary - 2026-06-13](../../../../docs/ai-credit-ledger-detail-summary-2026-06-13.md)
- [AI Credit Unification, Addon Recovery, and Development Retrospective — 2026-07-28](../../../../docs/ai-credit-unification-addon-recovery-and-development-retrospective-2026-07-28.md)
- [AI Image Generation Implementation Summary - 2026-06](../../../../docs/ai-image-generation-implementation-summary-2026-06.md)
- [AI Provider Connections 与本地前端依赖稳定性历史总结](../../../../docs/ai-provider-connections-and-dev-frontend-history-2026-06-26.md)
- [Alipay Payment and Portal Entry Hardening - 2026-07-11](../../../../docs/alipay-payment-and-portal-entry-hardening-2026-07-11.md)
- [Article Audio Generation Stage Summary - 2026-06-29](../../../../docs/article-audio-generation-stage-summary-2026-06-29.md)
- [Backend Core Coverage Baseline — 2026-07-29](../../../../docs/backend-core-coverage-baseline-2026-07-29.md)
- [Cloud Ability-Model Routing v1](../../../../docs/cloud-ability-model-routing-v1.md)
- [Cloud Adapter Analysis Contract](../../../../docs/cloud-adapter-analysis-contract.md)
- [Cloud Compliance And Security Positioning](../../../../docs/cloud-compliance-security-positioning.md)
- [云基础设施、平台战略与下一阶段收尾 — 2026-07-25](../../../../docs/cloud-infrastructure-platform-strategy-and-next-stage-closeout-2026-07-25.md)
- [Cloud Local Integration And Rebuild Guidance](../../../../docs/cloud-local-integration-and-rebuild-guidance.md)
- [Cloud Site Connection Closeout History - 2026-06-29](../../../../docs/cloud-site-connection-closeout-history-2026-06-29.md)
- [CNY Budget Contract Cutover Closeout And Development Retrospective — 2026-07-28](../../../../docs/cny-budget-contract-cutover-closeout-and-development-retrospective-2026-07-28.md)
- [Commercial Billing and Payment Stage Summary](../../../../docs/commercial-billing-payment-stage-summary-2026-06-23.md)
- [Content Formatting Candidate v1](../../../../docs/content-formatting-candidate-v1.md)
- [Deploy And Quality Hardening History - 2026-06-13](../../../../docs/deploy-hardening-history-2026-06-13.md)
- [豆包搜索与外部服务凭据入口收口及开发复盘 — 2026-07-29](../../../../docs/doubao-search-and-external-service-credential-links-closeout-and-development-retrospective-2026-07-29.md)
- [External Trial User Briefing Copy - zh - 2026-06-10](../../../../docs/external-trial-user-briefing-copy-zh-2026-06-10.md)
- [反馈数据飞轮、串行交付与生产交接阶段复盘 — 2026-07-30](../../../../docs/feedback-flywheel-serial-delivery-and-production-handoff-closeout-2026-07-30.md)
- [Frontend i18n Completion Summary - 2026-07-02](../../../../docs/frontend-i18n-completion-summary-2026-07-02.md)
- [Credit Entitlement Closeout - 2026-07-06](../../../../docs/history/credit-entitlement-closeout-2026-07-06.md)
- [Internal Alpha Agent/Workflow Runtime Closeout](../../../../docs/internal-alpha-agent-workflow-runtime-closeout-2026-06-09.md)
- [Internal Alpha Baseline - 2026-05-28](../../../../docs/internal-alpha-baseline-2026-05-28.md)
- [Internal Alpha Execution Plan](../../../../docs/internal-alpha-execution-plan.md)
- [Internal Alpha Onboarding Smoke Runbook](../../../../docs/internal-alpha-onboarding-smoke-runbook.md)
- [Internal Alpha Operator Checklist](../../../../docs/internal-alpha-operator-checklist.md)
- [Live Site Addon Setup Plan: npcink.local](../../../../docs/live-site-addon-setup-plan-npcink-2026-06-20.md)
- [Live Site Addon Write Action Checklist: npcink.local](../../../../docs/live-site-addon-write-action-checklist-npcink-2026-06-20.md)
- [Live Site Preflight Package: wp.local / npcink.local / dbd.local](../../../../docs/live-site-preflight-wp-npcink-dbd-2026-06-20.md)
- [Magick AI Root Harvest Inventory](../../../../docs/magick-ai-root-harvest-inventory-2026-06-24.md)
- [Cloud Mixins 缺失方法修复记录](../../../../docs/mixin-missing-methods-fix.md)
- [Mypy Debt Baseline](../../../../docs/mypy-debt-baseline.md)
- [Nightly Inspection Cloud/Core Handoff v1](../../../../docs/nightly-inspection-cloud-core-handoff-v1.md)
- [Nightly Inspection Real-Site Operator Trial - 2026-06-17](../../../../docs/nightly-inspection-real-site-operator-trial-2026-06-17.md)
- [Npcink Cloud Local Docker Closeout - 2026-06-24](../../../../docs/npcink-cloud-local-docker-closeout-2026-06-24.md)
- [Npcink Naming Reset Closeout - 2026-06-24](../../../../docs/npcink-naming-reset-closeout-2026-06-24.md)
- [Npcink Workspace History Summary - 2026-06-24](../../../../docs/npcink-workspace-history-summary-2026-06-24.md)
- [P5-B5 Exact Release Bundle v1](../../../../docs/p5-b5-exact-release-bundle-v1.md)
- [Plugin Observability Dedupe Smoke 2026-06-03](../../../../docs/plugin-observability-dedupe-smoke-2026-06-03.md)
- [Plugin Observability E2E Acceptance](../../../../docs/plugin-observability-e2e-acceptance.md)
- [Plugin Observability Emitter Examples](../../../../docs/plugin-observability-emitter-examples.md)
- [Plugin Observability Event Catalog](../../../../docs/plugin-observability-event-catalog.md)
- [Plugin Observability Implementation Summary](../../../../docs/plugin-observability-implementation-summary.md)
- [Plugin Observability Plugin-Side Handoff](../../../../docs/plugin-observability-plugin-side-handoff.md)
- [Plugin Observability v1](../../../../docs/plugin-observability-v1.md)
- [Pro Cloud Batch Runtime v1](../../../../docs/pro-cloud-batch-runtime-v1.md)
- [Public Homepage Navigation And Responsive Typography Retrospective — 2026-07-29](../../../../docs/public-homepage-navigation-and-responsive-typography-retrospective-2026-07-29.md)
- [Release Readiness Cleanup Closeout 2026-07-07](../../../../docs/release-readiness-cleanup-closeout-2026-07-07.md)
- [Release Readiness History - 2026-07-06](../../../../docs/release-readiness-history-2026-07-06.md)
- [Release Readiness Legacy Cleanup Closeout - 2026-07-02](../../../../docs/release-readiness-legacy-cleanup-closeout-2026-07-02.md)
- [运行诊断信息密度优化收口与开发复盘 — 2026-07-31](../../../../docs/runtime-diagnostics-information-density-closeout-and-development-retrospective-2026-07-31.md)
- [Runtime Stability Observation - 2026-07-09](../../../../docs/runtime-stability-observation-2026-07-09.md)
- [Service settings projection remediation — 2026-09-09](../../../../docs/service-settings-projection-remediation-2026-09-09.md)
- [Site Diagnostic Advisor Closeout - 2026-06-24](../../../../docs/site-diagnostic-advisor-closeout-2026-06-24.md)
- [Site Monitoring Discussion Summary](../../../../docs/site-monitoring-discussion-summary-2026-06.md)
- [WordPress AI Alt Text Vision Contract Feasibility v1](../../../../docs/wordpress-ai-alt-text-vision-contract-feasibility-v1.md)
- [WordPress AI Capability Readiness v1](../../../../docs/wordpress-ai-capability-readiness-v1.md)
- [WordPress AI Connector Ability-Model Routing Stage Summary](../../../../docs/wordpress-ai-connector-ability-model-routing-stage-summary-2026-06-29.md)
- [WordPress AI Editor Runtime Closeout - 2026-07-07](../../../../docs/wordpress-ai-editor-runtime-closeout-2026-07-07.md)
- [WordPress AI 生成参考阶段收口](../../../../docs/wordpress-ai-generation-reference-stage-closeout-2026-07-12.md)
- [Writing Assistance Evidence Loop History - June 2026](../../../../docs/writing-assistance-evidence-history-2026-06.md)

## 剩余复核队列与出口

1. **真实试用**：操作者提供文章和人工判断后更新现有记录；当前是必要的外部输入，不是权限待批。
2. **客户页断言**：在独立客户页问题任务中核对链接和编号显示；本轮没有以文档修复替代功能修复。
3. **旧合同自称 active 的部分**：本页仅提供索引；涉及 Adapter、批运行和 alpha 操作流程时先核对当前源代码，不批量变更状态。
4. **Legacy 断链**：如果具体迁移问题需要它，恢复真实来源；不批量造后继内容。
5. **结构**：维护摩擦可复现或可测量后再启动，优先守住真实用户的编辑闭环。

候选验收：`pnpm run verify:local`（documentation-only）通过，维护策略检查通过，
交付效率及维护策略现有契约 7 项通过（0.71 秒），`git diff --check` 通过。
链接路径扫描结果如上；原始本地报告位于 `.tmp/docs-trial-review/`。
回滚可逐文件恢复本次文档差异；原文件路径、历史正文与 Git 历史均保留。
PR／合并未执行，运行和生产未改变，人工试用尚待输入。
