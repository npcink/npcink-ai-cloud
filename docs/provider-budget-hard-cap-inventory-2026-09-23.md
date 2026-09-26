# Provider 账户级预算硬上限缺口盘点（2026-09-23）

Status: dated gap inventory（静态只读盘点）。基线：已提交 `origin/master` `28c1e579`
（2026-09-23）。本文只记录该基线上的已提交代码现状，不构成运行时权威，不授权任何
付费 Provider 调用、生产操作或暂缓决定的变更；使用前按 README 证据规则对照当前
`origin/master` 与 ADR-055 实现状态重新核对。

候选实现更新（2026-09-23）：当前开发分支 `codex/provider-budget-closure` 已提交
Provider 账户级预算实现（`61a59227`），并在 M4 candidate 上完成迁移、API 健康检查及
`tests/api/test_service_routes.py` focused 运行验证；该实现尚未合入 `master`，因此不
改写下文对 `origin/master` 的历史盘点结论。实现后的候选证据包括统一 dispatch 前
claim、日/月计数器、幂等 dispatch key、保守未定价成本、80% warning、100% fail-closed，
以及 Provider 连接测试、图像探针、Web Search、Site Knowledge、能力探测等旁路接入与
实际成本回收。

候选状态补充（2026-09-23）：M4 focused 运行又通过
`tests/domain/test_provider_budget.py`（3/3）、`tests/domain/test_web_search_budget.py`
（2/2）和 `tests/api/test_admin_overview_operator_projection.py`（5/5）。Admin 总览现已
把 warning/exceeded 投影为可操作的预算压力项，并保留到 AI 资源页的主动作；这些结果仍
属于当前分支 candidate 证据，不替代合入 `master` 后的 promotion 或操作者真实 smoke。

实现合入更新（2026-09-26）：上述候选已合入 `master`——核心熔断与迁移随 PR #1029，
旁路收敛（能力探针、web search、图像上下文证据、图像投递探针、连接测试、内部 advisor
摘要、site knowledge embedding 与向量档案探针、image prompt 翻译/规划直通路径）、Admin
预算压力投影、warning 阈值测试、dispatch 合同测试与 `execute_provider` 直通路径 claim
随 PR #1031。上文"代码未实现"的历史盘点结论仅对基线 `28c1e579` 有效。截至本更新，
开放前仍待完成的出口：

1. **M4 promotion 证据**：clean `master` 的 `m4:preview:promote` 与 accepted 状态
   （编写本更新时共享 M4 的 candidate 被另一会话占用，按共享运行时纪律让位未执行）。
2. **操作者武装**：迁移 `20260923_0084` 随部署应用后，在 Admin service settings 配置
   `provider_account_spend_budget`（配置形状见
   [provider-account-spend-budget-implementation-v1.md](provider-account-spend-budget-implementation-v1.md)；
   每条 paid 连接需同时给出 `daily_usd` 与 `monthly_usd`，未配置即在 dispatch 时
   fail-closed 返回 `provider.budget_configuration_missing`；`warning_ratio` 默认 0.8），
   并执行操作者 smoke——超限账户 dispatch 被显式 `provider.budget_exceeded` 拒绝、
   80% warning 日志可见、Admin 总览出现预算压力项。金额属操作者决策，会话不得代设。
3. **裸 HTTP 付费路径收敛**：rerank（Jina）与 web search httpx 兜底等不经适配器
   `execute(` 习惯用法的调用尚未纳入 claim，需单独设计接入或写入显式豁免记录；
   `tests/domain/test_provider_dispatch_contract.py` 的结构扫描只约束适配器调用点。

## 1. 缺口定义：三层防线

2026-09-21/22 战略会话确认的缺口是：目前没有统一的 Provider 账户级每日/月度成本
硬上限、预算告警和供应商账户自动停止机制（见
[local-first-validation-stage-2026-09-21.md](local-first-validation-stage-2026-09-21.md)
"Provider 成本"节）。拆成三层：

| 层 | 定义 | 判定标准 |
| --- | --- | --- |
| 1. 账户级日/月硬上限 | 每个 Provider 账户对 UTC 日与日历月的累计 USD 花费上限；任何 hosted provider 调用发出前必须原子 claim 预算，超限不得发出 | dispatch 前存在金额检查并原子记账 |
| 2. 预算告警 | 接近上限（如 80%）时经既有告警通道发射警告，并在 Admin 面可见 | 阈值告警发射 + 运营可见面 |
| 3. 超限自动停用 | 达到 100% 时新 dispatch fail-closed（显式错误类别），不依赖人工关连接 | 自动拒绝/停用，无需人工介入 |

[ADR-055](decisions/055-provider-account-level-spend-budget.md)（2026-09-22 经 PR
#1007 合入）已按此三层给出设计：单一 dispatch 扼点、按账户 × UTC 日/月历月的原子
claim、80% 告警 / 100% 停用、account_class 分级校验。对本文 `origin/master` 基线而言，
设计已接受、代码未实现；当前候选分支已有实现，仍等待合并后才能更新正式基线。

## 2. 背景与文档链

- 缺口确认：[local-first-validation-stage-2026-09-21.md](local-first-validation-stage-2026-09-21.md)
  "Provider 成本"节（2026-09-21/22 战略会话）。
- 计划遗漏：[next-stage-plan-2026-09-22.md](next-stage-plan-2026-09-22.md) 的任何
  任务条目均未包含该缺口；本盘点同批将其补录为"开放前必做项"（见该文档第 8 节）。
- 设计依据：[ADR-055](decisions/055-provider-account-level-spend-budget.md)
  （accepted，"implementation and paid-provider authorization remain separate
  operator decisions"）。
- 待办跟踪：[compat-stability-payment-follow-up-handoff-2026-09-22.md](compat-stability-payment-follow-up-handoff-2026-09-22.md)
  待办 #3——ADR-055 实现 PR 先于任何付费 Provider 调用授权。
- 历史防线：本地 Provider call ledger
  （[provider-call-ledger-and-next-stage-deferral-2026-07-25.md](history/engineering/2026/provider-call-ledger-and-next-stage-deferral-2026-07-25.md)）——
  操作者实验工具，按设计不在生产 dispatch 路径（见第 3 节第 8 项）。

## 3. 现状盘点：已有防线

以下机制在已提交代码中存在，逐项标注与账户级硬上限的关系：

| # | 机制 | 位置 | 作用 | 与三层缺口的关系 |
| --- | --- | --- | --- | --- |
| 1 | 单一 dispatch 扼点 | `app/domain/runtime/provider_execution.py:292-322`（`execute_candidate_chain` → `provider.execute()`），上游入口 `app/domain/runtime/service.py:2557` 起 | 所有 hosted 模型 run 的统一发送点 | 扼点**已有**；扼点上的金额预算检查**缺失**——这是实现硬上限的天然挂载点 |
| 2 | Token 上下文预检 | `app/domain/runtime/provider_execution.py:173-176` `enforce_context_budget` → `app/adapters/providers/compatibility.py:318` `assess_context_budget` | 超出上下文窗口即拒绝（`provider.context_overflow`） | 限 token，不限金额 |
| 3 | 成本估算 | `app/adapters/providers/compatibility.py:187-244` `estimate_token_cost`（`unpriced`/`partial_rates`/`conservative_input_rate` 等模式）；模式随调用记录于 `app/adapters/providers/base.py:146-148` | 用 `model_reference` 价格（`usd_per_1m_tokens`，`app/domain/model_references.py:17-19,108`；同步入口 `app/api/routes/service.py:5616`）算单次 USD 估算 | 定价数据**已有**，可直接复用；ADR-055 明确不建第二条定价路径 |
| 4 | 事后成本计量 | `provider_call_records`（`app/core/models.py:1607` 起，USD `cost` 列）；`usage_meter_events` 的 `cost`（USD）与 `cost_cny`（ADR-033 快照，`app/domain/commercial/mixins/_runtime_mixin.py:780-793`） | 每次调用的成本证据，事后写入 | 只记录、不执行；不是事前上限 |
| 5 | 客户侧限制 | AI credits fail-closed：`authorize_runtime_request`（`app/domain/commercial/mixins/_runtime_mixin.py:180`；调用点 `app/domain/runtime/service.py:521-535`）；套餐 budgets：`max_runs_per_period`/`max_tokens_per_period`/`max_cost_cny_per_period`（`app/domain/commercial/plan_catalog.py:16-22` 等） | 按客户限制可消耗量，额度不足即拒绝 | 全部**按客户**计；对"所有客户 + 非客户 dispatch 之和"的账户总额无约束 |
| 6 | provider_connections 手动开关 | `enabled` 列（`app/core/models.py:1493`）；Admin 手动停用 `PATCH /admin/provider-connections/{id}`（`app/api/routes/service.py:5198`；写回 `app/domain/provider_connections/service.py:205`） | 人工启停某条 Provider 连接 | 手动、事后；无花费触发 |
| 7 | 可复用告警/巡检通道 | ops cadence 定时任务（`app/workers/ops_cadence.py:238` 起）；provider degradation 告警批次（`app/domain/usage/rollup.py:602` 起）；读取面 `app/api/routes/stats.py:522` | 既有定时巡检 + 告警存储/展示模式 | 预算告警（层 2）可复用该模式；现有告警只覆盖错误率/延迟，无金额维度 |
| 8 | 本地实验 ledger | `scripts/provider_call_ledger.py`（原子 claim、按实验 `max_calls`）；grep 确认 `app/`、`deploy/`、`config/`、`docker-compose.prod.yml` 无引用 | 限制操作者实验的真实调用次数 | **已有**但按设计是本地开发工具，不在生产 dispatch 路径，不构成账户级防线 |
| 9 | Provider 健康巡检 | `scan_provider_health`（`app/domain/catalog/service.py:298` 起） | 只读 `ProviderCallRecord` 历史，不产生付费调用 | 无花费控制作用，仅说明现有巡检不含预算 |

## 4. 差距清单：三层各自缺什么

### 层 1：账户级日/月硬上限 — 缺失

- 在 `app/` 与 `migrations/` 全量 grep `provider_account_spend_budget`、`daily_usd`、
  `monthly_usd`、`budget_exceeded`、`account_class`：**零命中**（基线 `28c1e579`）。
- `provider_connections` 表（`app/core/models.py:1487-1516`）没有 account_class、
  没有任何花费/预算列；付费账户与测试账户的分离仅靠流程约定。
- dispatch 前现有检查只有客户侧 entitlement/AI credits 与 token 上下文预检，
  没有任何 USD 金额上限。
- 所有既有 "budget" 命中均为：客户套餐 `budgets_json`、token/上下文预算、
  超时预算或模型 cost-tier 标签，无一作用于账户总额。

### 层 2：预算告警 — 缺失

- 无任何花费阈值告警发射；`usage_rollup` 告警批次只评估错误率/延迟。
- Admin 无预算横幅或预算警告面（最接近的既有模式是 FX 兜底提示与 AI 披露横幅，
  均与预算无关）。

### 层 3：超限自动停用 — 缺失

- 无 fail-closed 拒绝：超限场景下不存在显式错误类别（如
  `provider.budget_exceeded`）。
- 无预算触发的连接停用；代码中唯一的"自动停用"
  `_disable_competing_runtime_connections`（`app/domain/provider_connections/service.py:1890`
  起）是运行槽位互斥机制，与花费无关。
- 唯一兜底是人工 `PATCH enabled=false`（手动、事后，见第 3 节第 6 项）。

### 附加缺口：绕过扼点的付费调用与放大器

实现硬上限时必须一并收敛，否则上限不闭合：

- **图像投递探针**：`test_image_delivery` 执行真实计费图像生成
  （`app/domain/provider_connections/service.py:552` `adapter.execute(request)`），
  绕过 run 扼点，且不写 `provider_call_records`/usage meter——运营触发的付费调用
  完全在预算视野外。
- **重试/兜底放大**：扼点默认 `max_retries=0`、`allow_fallback=True`
  （`app/domain/runtime/provider_execution.py:250-251`），但调用方可调高
  `retry_max`（`app/domain/runtime/service.py:6085-6086`）；每次重试/兜底都是新的
  计费尝试，无账户级累计上限。
- **独立 dispatch 家族**：web search、site-knowledge embedding 等不经 hosted 模型
  扼点；admin 连接测试/目录预览也会发起真实上游调用（多为免费模型清单 API，
  仍无预算约束）。

## 5. 建议实现位置与验证门槛（L2，需 M4 证据）

对齐 ADR-055（设计已接受；具体存储形状由实现 PR 定稿）：

| 事项 | 建议位置 |
| --- | --- |
| 执行点 | `app/domain/runtime/provider_execution.py` `execute_candidate_chain`，在 `provider.execute()` 之前 claim——新 dispatch 路径默认继承检查 |
| 预算状态 | 按 provider connection × UTC 日 / 日历月的计数器族，事务行锁原子 claim；运营经 `service_settings` 配置阈值（`warning_ratio`、日/月上限、`conservative_unpriced_cost`） |
| 定价复用 | 直接复用 `model_reference` 价格与 `estimate_token_cost` 保守回退；不新增第二条定价路径、不运行时拉取外部价格 |
| 告警（层 2） | 80% 阈值经既有 ops cadence/alert-rollup 通道发射，并在 Admin 增加可见面 |
| 停用（层 3） | 100% 时新 claim 失败并返回显式错误类别；在途请求不强杀；`account_class=paid` 的连接未配置预算即拒绝 dispatch |
| 旁路收敛 | 图像投递探针等运营触发的计费调用同样必须 claim，且补写调用证据 |

验证门槛（L2：迁移 + worker/运行时行为）：

1. focused pytest：原子 claim 并发不超限、同 dispatch key 重放不重复扣减、耗尽
   fail-closed、未定价模型保守回退；
2. 合同测试：所有 provider dispatch 路径（含旁路）都过扼点；
3. M4 focused 运行时证据（迁移与 worker/运行时行为）；
4. 操作者 smoke：超限账户被显式错误类别拒绝、80% 告警可见——与 ADR-055
   Verification 节一致。

## 6. 列为开放前必做的理由

1. **付费授权的既定前置**：ADR-055 原文要求任何付费 Provider 调用授权前
   worst-case spend 必须是已知有界数字；交接清单待办 #3 已把实现 PR 列为付费
   授权前置。开放（外部试用者、阶段 B 公共内容 API、正式收费）必然伴随付费
   调用授权，因此该实现是开放前必做项。
2. **损失场景是配置驱动而非对抗驱动**：最贵模型路由、重试风暴、测试配置指向
   付费账户——单操作者 + 多 AI 会话并行的仓库形态下，自动熔断比人工巡检可靠。
3. **客户侧限制不约束账户总额**：AI credits 与套餐 budgets 全部按客户计；
   开放后"所有客户 + 健康检查 + 重试 + 定时任务"之和没有任何云内强制上限。
4. **防计划遗漏二次发生**：2026-09-21 战略文档已确认该缺口"需要保留"，但仍未
   进入 2026-09-22 执行计划；本盘点把它显式钉进开放前必做清单。

## 7. 使用说明与边界

- 本盘点只反映已提交 master（`28c1e579`）。ADR-055 实现是否已合入以当前
  `origin/master` 与交接清单待办 #3 为准；实现 PR 合入后应更新或归档本文。
- 不改变任何暂缓决定：local-first 文档明确"操作者本人使用正式模型"不属于暂缓
  事项；本必做项约束的是 Cloud 自动化 dispatch 与开放后的账户级熔断，不是个人
  使用的开发前置。
- 非目标：不实现代码、不改 Provider 配置、不动生产。

## 8. 验证与回退

docs-only（L0 管理）：相对链接逐一核验、`git diff --check`、
`bash scripts/check-release-policy.sh`、`pnpm run check:changed -- --plan`。
回退：revert 单个合并提交，无数据或运行时影响。

## 9. 当前候选实现的剩余验证

候选实现已经覆盖代码与 M4 focused 验证，但仍有三项证据不能由自动测试替代：

1. 合入 `master` 后在干净 `origin/master` 上重新执行 promotion/acceptance 链；
2. 操作者在 M4 Admin 或受控调用面观察一次 80% warning 与 100% 拒绝的可见结果；
3. 在允许的 Provider 账户上完成一次真实但有界的 smoke，记录实际成本回收与预算状态。

这些步骤不授权生产或无界付费调用；在完成前，公共内容 API 仍是 development candidate。
