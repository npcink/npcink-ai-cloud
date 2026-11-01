# 审查问题落实记录 — 2026-11-01

状态：13 项修复已通过 [PR #1340](https://github.com/npcink/npcink-ai-cloud/pull/1340) 合入 master，并在 M4 接受。本文保留 development 阶段证据，合并后的结果见末节；不构成生产部署、真实支付、退款或付费 Provider 调用授权。

目标仓库为 `npcink-ai-cloud`；从最新 `origin/master` 的 `190d2e2e` 创建隔离分支 `codex/audit-correctness-remediation`。原审查工作区和其中的未跟踪文件未改动。保留当前暂停入口、商业价格和 WordPress 最终写入边界，没有增加基础设施或数据库迁移。

## 逐项处置

| 编号 | 原问题 | 本次处置与代码 | 文档契约 | 验证证据 |
| --- | --- | --- | --- | --- |
| 01 | 未续费月包到期后继续延长权益 | [账户协调](../../../../app/domain/commercial/mixins/_account_mixin.py)先激活已结算排期，再取消未覆盖的到期付费订阅；[运行时周期处理](../../../../app/domain/commercial/mixins/_billing_mixin.py)不再续延付费周期，复用 Free 回退 | [支付权益](../../../cloud-payment-entitlement-v1.md) | [订阅用例](../../../../tests/domain/test_subscription_commerce.py)：到期瞬间、31/61/365 天、直接运行时读取/先管理读取、已支付续期 |
| 02 | 退款网关等待期间积分仍能消费 | [积分仓储](../../../../app/adapters/repositories/commercial_credit_repository.py)以 requested/unknown 退款冻结对应 grant；取得 grant 行锁后独立查询退款状态，避免等待前的数据库快照漏读 | [网关契约](../../../payment-gateway-contract-v1.md) | [退款安全](../../../../tests/domain/test_payment_refund_safety.py)；[PostgreSQL 竞争](../../../../tests/integration/test_portal_postgres_acceptance.py)验证真实锁等待和 requested/unknown/failed 三种结果 |
| 03 | 无法验真的退款被标为 failed | [退款服务](../../../../app/domain/commercial/mixins/_payment_mixin.py)只将明确的、已验签业务拒绝类型标为 failed；其他错误保持 unknown；成功状态不能被迟到错误降级 | [网关契约](../../../payment-gateway-contract-v1.md) | 真实 adapter 到服务状态的参数化用例，覆盖缺签、坏签、缺字段、不匹配、系统错误及明确拒绝 |
| 04 | 缺订单号或金额仍视为退款成功 | [Alipay adapter](../../../../app/domain/commercial/payment_gateways.py)要求匹配订单号及有限、正数、精确相等的 Decimal 金额 | [网关契约](../../../payment-gateway-contract-v1.md) | 缺金额/订单、错金额/订单、额外小数、NaN 反例，不变更权益 |
| 05 | 重新序列化 JSON 导致原文验签错误 | 同 adapter 从顶层 JSON 提取精确原文片段；拒绝重复键及无效信封；退款和关单都使用此路径 | [网关契约](../../../payment-gateway-contract-v1.md) | [网关用例](../../../../tests/domain/test_payment_gateways.py)与退款安全用例覆盖空格、中文、转义、嵌套键及篡改；[HTTP 回调用例](../../../../tests/api/test_open_payment_notify_routes.py)使用真实响应正文 |
| 06 | 幂等指纹漏掉执行控制参数 | [生命周期](../../../../app/domain/runtime/run_lifecycle.py)标准执行身份 v2 包含 storage/TTL/timeout/retry/task backend/callback/canonical run ID | [运行时事务边界](../../../runtime-provider-transaction-boundary-v1.md) | [真实 execute 用例](../../../../tests/domain/test_runtime_provider_transactions.py)改变参数返回冲突，只有一次 Provider 调用和扣费 |
| 07 | 路由健康/价格变化造成假幂等冲突 | [execute](../../../../app/domain/runtime/service.py)先校验站点及 connector 绑定、查持久化重放，再解析当前路由；路由证据不进入客户端身份 | [运行时事务边界](../../../runtime-provider-transaction-boundary-v1.md) | 当前路由解析不可用时仍重放；有证据的旧指纹用原路由快照验证并升级 |
| 08 | 完整 CI 未包含 core/workers | [CI](../../../../.github/workflows/ci.yml)及[后端门禁](../../../../scripts/check-pr-backend-gate.sh)纳入五个测试目录；[选择器](../../../../scripts/select-pr-backend-tests.py)映射 core/worker 源码和测试变更 | [CI 分片](../../../ci-pytest-sharding-v1.md) | [行为契约](../../../../tests/contract/test_ci_efficiency_contract.py)实际收集 pytest 节点并验证分片并集、无重复及选择器输出；GitHub Actions 尚未运行 |
| 09 | 超过 2,000 条明细静默截断 | [用量弹窗](../../../../frontend/src/components/portal/PortalSiteUsageDialog.tsx)改为每页 20 条服务端分页；全天曲线由服务端聚合，汇总不依赖当前页。既有[聚合接口](../../../../app/api/routes/portal.py)增加可选成对时间边界；明细和聚合统一半开区间 | [Portal 规范](../../../portal-ui-spec.md) | [2,001 条真实账本](../../../../tests/domain/test_portal_day_usage_bounds.py)验证总量和第 2,001 条可读；API 用例覆盖范围和错误；PC 浏览器验证分页后总量不变 |
| 10 | DST 回拨日丢失第 25 小时 | [自然日曲线](../../../../frontend/src/lib/portal-day-usage.ts)按服务器边界补空桶；重复小时的图表标签带 UTC 偏移 | [Portal 规范](../../../portal-ui-spec.md) | [行为单测](../../../../frontend/tests/vitest/portal-day-usage.test.ts)覆盖 23/24/25 小时及非整点时区；PC 浏览器验证最后 23:00 桶和 GMT-4/GMT-5 |
| 11 | 跨月日期文档门禁失败 | 最新 master 已在[文档保留清单](../../../README.md#dated-active-document-review)明确保留原 7 份材料；本次不重复迁移、不放宽门禁 | 同一清单保留当前权威/历史证据分类 | [日期切换回归](../../../../tests/contract/test_document_month_rollover.py)固定检查 10/31→11/1 所属月份；另造未评审旧文档证明仍会失败 |
| 12 | 前 50 条饱和媒体任务遮蔽后续工作 | [任务领取](../../../../app/adapters/repositories/runtime_repository.py)先在 SQL 排除饱和站点，再选择最早可运行任务，保留状态和 eligibility 原子检查 | [运行时事务边界](../../../runtime-provider-transaction-boundary-v1.md) | [队列用例](../../../../tests/domain/test_runtime_run_lifecycle.py)覆盖 1/50/101 条饱和前缀；未恢复媒体入口 |
| 13 | Portal 主正文与附录规则冲突 | 将同 Modal 下钻、前 3 项服务、分页和返回规则并入[主正文](../../../portal-ui-spec.md)，旧附录只指向主正文 | 单一行为口径 | 布局契约及真实 PC 浏览器行为测试 |

## 验证状态

- 本地 Python：锁定 Python 3.12.10 环境；ruff、mypy（356 个文件）、changed Python quality（12 个源码文件）通过。五目录完整回归耗时 989.76 秒，结果为 5,059 passed、32 skipped、2 failed、8 subtests passed。两项失败位于支付通知 API 测试，旧 HTTP 替身只有 `.json()`、没有验签现在必须读取的原始响应正文；改为真实 `httpx.Response` 后，该文件 9 项及自然日范围 1 项复测通过，完整回归结束后的 `pytest -q --lf` 再次确认 2 passed。本次证据为完整回归加修复后定向复验，32 项跳过不计入已验证覆盖。
- 本地前端：752 项 Vitest 通过；完整静态契约通过。静态契约首次被系统旧 Python 的 `zip(strict=True)` 支持问题阻断，改用锁定环境后通过；未放宽断言。PC Playwright 两项通过：1280×800 的分页/等待/失败重试/DST，以及 1280×640 的原日期分页/滚动恢复。截图已检查，无截图基线更新。
- 文档可达性、anti-drift、release-policy、TypeScript、定向 ESLint 通过。
- M4：首轮候选 77 项测试通过，包含三项真实 PostgreSQL 行锁竞争测试；最后应用修改同步后，再跑当天用量与支付 HTTP 回调文件，10 项通过。状态检查为 `candidate`、无 promotion PR，API/前端/数据库/Redis/代理均 healthy，三个 worker 进程 running；首页与存活探针均返回 200，迁移保持 `20261024_0091`。全部支付和 Provider 为测试替身，无真实交易或付费请求。
- M4 证据绑定：最后应用包在提交前打包，基线 `190d2e2e`、本任务分支、dirty 40 paths；bundle SHA256 为 `b3e06627fbb879f47e9200f71c51cd5cc150f07b6138f9d359f43da3ed407b8b`，worker source SHA256 为 `527f992a920e093c198be050af8e43725aedd6d885d806800c3b6594909736d0`，frontend source SHA256 为 `43e2f22b0583ad765e0c1d879b6a5648f4c716bad53fc4180175749e77b4b670`。其后仅按相同内容形成本地修复提交并完善本文，不把候选包标为 clean-master accepted。
- CI：未发布分支，未运行 GitHub Actions；本地分片选择测试不等于 CI 编排结果。
- 生产、人类验收：未部署、未执行真实交易，未声明生产问题已消除。

完整后端命令为 `python -m pytest -q tests/core tests/api tests/domain tests/workers tests/contract`。
后端本地与 M4 运行均保留现有 Starlette TestClient 的 httpx 弃用警告；本次未改依赖版本。

## 本地提交与复验入口

| 提交 | 范围 |
| --- | --- |
| `3f1d67e5` | 01–05：月包到期、退款冻结、未知状态、完整字段与原文验签 |
| `705ed530` | 06–07、12：幂等身份、旧记录重放、可运行队列领取 |
| `bd8889c7` | 08、11：完整 CI 集合、真实分片收集与跨月文档门禁回归 |
| `99bf01e1` | 09–10、13：服务端分页、自然日聚合、DST 与统一 Portal 规范 |

锁定项目 Python 环境后，可复跑本次关键反例：

```bash
python -m pytest -q tests/domain/test_subscription_commerce.py \
  tests/domain/test_payment_refund_safety.py \
  tests/domain/test_runtime_provider_transactions.py \
  tests/domain/test_runtime_run_lifecycle.py \
  tests/domain/test_portal_day_usage_bounds.py
python -m pytest -q tests/contract/test_ci_efficiency_contract.py \
  tests/contract/test_document_month_rollover.py
```

真实 PostgreSQL 竞争用例通过既有隔离库 runner 执行，不使用共享业务库：

```bash
pnpm run m4:preview:test -- --focused \
  tests/integration/test_portal_postgres_acceptance.py::test_credit_consumption_rechecks_refund_after_grant_lock_on_postgres
```

浏览器证据对应 `portal-workspace-path.spec.ts` 中的
`site usage server pagination preserves full 25-hour summary through wait, retry and return`
及 `site usage day drill-down back restores the exact day-table scroll position`。
前者使用受控 API 响应验证真实组件交互；2,001 条真实账本与范围聚合由后端领域测试验证。

## 保留的限制与回滚

标准 hosted execute 的旧记录只有在持久化执行契约、保存的路由证据和当前 profile 默认值足够证明原始指纹时才允许升级；证据不足、默认值改变或提供旧 callback URL 时保守返回既有 409，不重新派发。特殊非标准运行路径保留原身份契约。

部分退款在 requested/unknown 期间保守冻结整个积分包，明确失败后恢复剩余额度。此修复不自动修补历史上已经发生的消费/退款不一致数据。

本次无 schema 迁移；代码回滚按本分支的独立提交逆向撤销。回滚不会撤销已经发生的支付或退款事实，不能通过恢复数据库旧快照覆盖这些事实。

## 开发复盘与规范归属

本次经验已并入[历史问题关闭与发布证据规范 §13](../../../historical-issue-closure-and-release-evidence-standard-v1.md#13-turn-audit-findings-into-executable-regressions)，并从[交付检查表](../../../engineering/definition-of-done.md)引用；详细产品行为仍以本记录表格中的支付、权益、运行时、Portal、CI 契约为准。

| 经验 | 本次取舍及原因 |
| --- | --- |
| 先复现边界，再修逻辑 | 用 31/61/365 天迟到读取、2,001 条账本和 101 条饱和队列击穿原假设；用可执行断言证明修复，不能依赖源码包含某个字符串。 |
| 并发取决于数据库快照与 ORM 状态 | PostgreSQL 测试证明消费方确实阻塞后再提交退款；取锁后独立读取退款并刷新已加载实体，避免只在 SQLite 假设下成立。 |
| 外部未知不等于失败 | 无法验真的结果继续冻结；只有已验签明确拒绝才释放冻结。不能通过错误码字符串猜测终态，也不能用重新编码的 JSON 替代签名原文。 |
| 身份与执行证据分开 | 客户端执行控制属于身份，当前路由属于证据；旧数据不能证明时保守冲突，避免迁移过程偷偷重发和重复扣费。 |
| 汇总与明细独立 | 用服务端全天聚合加每页 20 条明细代替取全；真实自然日边界消除 24 小时假设，返回与滚动单独验证。 |
| 对文档和测试门禁也构造失败输入 | 除验证本仓材料通过，还注入未评审旧文档，实际收集 pytest 并比较分片与选择器，避免门禁自证。 |
| 环境与证据必须可追溯 | 锁定 Python，遇浏览器端口属于其他工作区时改用独立端口；完整回归的失败与后续复测分别记载，不重写历史结果。 |

## 会话停止点与保留成果回执

本节保留首次 development 停止点；操作者随后授权发布、合并与本任务清理，后续结果见「合并与 M4 接受回执」。

本回执只覆盖本次 13 项，不证明仓库其他历史审查、生产数据或其他任务已经清零。

- 工作区：`/Users/muze/.codex/worktrees/cloud-audit-remediation/npcink-ai-cloud`。
- 分支：`codex/audit-correctness-remediation`；锁：`codex:audit-correctness-remediation`。负责人为本任务，成果保存在该分支提交中。
- 本次收尾核对前的 HEAD 为 `bbdb3cb1`；其后仅追加本节、经验规范及交付检查表。最终文档提交通过分支日志确定，避免文档自引用提交哈希。
- 已 fetch/prune origin；当次 `origin/master` 仍为 `190d2e2e`。按分支精确查询 GitHub，无对应 PR；`git ls-remote --heads` 无本任务远端分支。当前是本地提交与 M4 candidate 状态，未推送、未合并、未生产部署。
- `worktree:audit -- --format json --require-locked` 检查通过锁纪律，共登记 8 个工作区；其他工作区含未提交内容、独有提交和两个目录缺失但仍锁定的登记。本任务未修改其他工作区、分支或登记。
- 全局 PR 审计达到既有 1,000 条查询上限，不能据此判定其他分支无 PR；本任务已用独立按 head 查询补证。此处只记录证据缺口，不扩大本轮为全仓清理或修改审计脚本。
- 可以安全关闭会话并稍后从本分支接续；这不等于合并收尾。保留当前锁和工作区，不删除未合并成果。
- 清理条件：获得明确发布/合并指令后，走受保护 PR、完成实际检查与合并、按适用规范完成 clean-master M4 接受，再核对任务成果已纳入且工作区干净；之后仅清理本任务分支和工作区，其他任务独立核验。

## 合并与 M4 接受回执

- 操作者明确确认发布、合并、M4 接受及本任务分支/worktree 清理；生产不在授权范围。
- [PR #1340](https://github.com/npcink/npcink-ai-cloud/pull/1340) 于 `2026-11-01T10:44:43Z` squash 合并，master 为 `4a8363dd1a74e7716a4c6cecfddbd6ecca786398`；合并树与本任务六个提交的最终树完全相同。
- [Cloud CI](https://github.com/npcink/npcink-ai-cloud/actions/runs/41297849764) 四个后端分片分别通过 1,303 / 1,219 / 1,213 / 1,326 项，合计 **5,061 passed、32 skipped、8 subtests passed**；backend 汇总、后端静态、前端、镜像冒烟、PostgreSQL 回归及 CI observability 均通过。core 与 workers 在 CI 日志中有实际执行记录。
- 前端 CI 通过 752 项 Vitest、50 + 4 + 9 项浏览器检查及 52 项编译后 BFF 检查；[CodeQL](https://github.com/npcink/npcink-ai-cloud/actions/runs/41297849713)、密钥扫描和 PR 正文契约通过，未遗留审查线程。
- 既有 OCR 工作流经 Actions API 确认是 `disabled_manually`，本次未启用、未运行，也不声明自动模型审查通过。
- 从干净 master 操作目录执行 `m4:preview:promote -- --pr 1340` 后，状态为 `acceptance_state=accepted`、`promotion_pr=1340`、`source_branch=master`、`source_dirty=false`、`source_revision=4a8363dd1a74e7716a4c6cecfddbd6ecca786398`。首页与 `/health/live` 返回 200，探针返回同一修订；服务健康、worker 运行、迁移仍为 `20261024_0091`，端口保持 loopback。
- 接受后的真实 PostgreSQL 退款/消费锁竞争三项再次通过。本次无真实支付、退款或付费 Provider 调用。
- 远端修复分支已由 GitHub 合并后自动删除；本地六个原提交另存为经 `git bundle verify` 验证的任务备份。后续仅文档收尾，沿用本任务锁与工作区；清理仍以精确 PR、分支、干净状态和已保存证据为条件，其他任务保持原状。

本轮操作复盘：更新操作目录时曾误将 fetch 与 pull 并行启动，造成引用竞争；首次 promotion 因 HEAD 落后于 origin/master 被门禁拦截，未开始远端同步。改为等待 fetch 完整退出、显式 fast-forward、核对树与修订后成功。Git 取回/更新是依赖步骤，工具返回 session ID 只表示仍在运行，不能作为完成证据；不得在前一步未结束或退出非零时继续后续变更。
