# Systematic Remediation Closeout and Retrospective — 2026-08-14

Status: dated evidence and retrospective; not current release authorization.

## 背景与范围

本轮承接了前序“系统检查—阶段整改—阶段 7—收尾”工作，目标是把已合并的工程修复、CI/依赖治理、M4 验收和运行观察整理为可复用规范。本文只记录已发生的事实，不替代当前代码、边界文档或发布政策。

## 已完成变更

| PR | 主题 | 结果 |
| --- | --- | --- |
| #701 | 自动 Web Search 显式计费 | merged；M4 accepted |
| #702 | nested connector test selection | merged；CI-only |
| #703 | session/request race 与认证错误语义 | merged；M4 accepted |
| #704 | 错误的 transport fail-closed 候选 | closed；正确语义已在 #703 |
| #705 | bounded runtime retention cleanup | merged；M4 accepted |
| #706 | 商业套餐目录单一真源 | merged；M4 accepted |
| #707 | pin `pnpm/action-setup` 版本 | merged |
| #708 | backend-owned frontend contracts 安装 pnpm 与合同计数 | merged |
| #709 | 修复 4 个 high 前端依赖告警 | merged；M4 deploy accepted |

关键结果包括：401/403 才跳 Admin login，503/网络错误保留当前页面；旧请求通过 abort + sequence guard 隔离；retention cleanup 有序限量并暴露剩余量与 partial 状态；套餐目录统一由 `app/domain/commercial/plan_catalog.py` 提供；CI 显式固定 pnpm 版本并保持合同计数；高风险依赖已升级，当前 GitHub open Dependabot alerts 为 0。

## 验证与接受证据

- anti-drift、provider env retirement、runtime stability plan、release policy、frontend lock sync：通过。
- 合同/refactor 测试：`38 passed`。
- retention：`8 passed`。
- orphan：`40 passed, 1 skipped`；观察中 515 次 completed pass，busy/abandoned/orphan 均为 0，且 destructive cleanup 仍为 `deletion_enabled=false`。
- #709 本地 frozen install、frontend type-check、lint、Next build、audit high：通过。
- GitHub required checks：首次 targeted static 失败源于 post-job cache 路径不存在，重跑后全绿；不是业务代码失败。
- 最终 M4：`acceptance_state=accepted`，promotion PR `#709`，`source_branch=master`，`source_dirty=false`，源修订 `025924c4769e3ed83b2bd7939ad2b447968f1786`，Alembic `20260801_0078`。

本地 M4 ops worktree 因缺少 `.env` 未完成 `check:perimeter`；该项应标记为环境前置缺失，不能写成通过。artifact 当前流量为 0，因此不能据此证明高负载稳定性。

## 运行观察

retention cadence 共 516 次，累计 purged 468；最近 `retention_remaining_due_runs=0`、`retention_partial=false`。数据库 `retention_due_unpurged=0`、`retention_due_with_result=0`。orphan candidate 表为空，但目前仍是低流量、非破坏性观察，后续需要真实流量窗口和明确的删除授权后再评估。

## 为什么耗时较长

编码量不是主要成本。时间主要消耗在 CI queue/shards、PR 依赖阻塞（#706 等待 #708）、review thread、CI rerun、clean-master M4 promotion、依赖变更触发的 deploy rebuild，以及运行时数据库证据查询。多次 `gh pr checks --watch` 也放大了轮询等待。

改进方式：等待时转做只读调查；先检查 review thread 和 deploy fingerprint；用 waiter/汇总状态替代高频轮询；复用已通过子门禁；按失败 signature 分类外部 runner/cache 问题；将每个 PR 的边界和验证证据提前写入变更包。

## 做得好的与需要改进的

做得好的：把错误语义、请求竞态、生命周期清理、商业目录真源、CI 合同和依赖安全拆成可审查的独立 PR；没有为制造观察数据调用付费 Provider；没有把 candidate 当 accepted；没有把 `orphan=0` 夸大为高流量结论。

需要改进：更早建立阶段验收矩阵和时间预算；将环境前置检查移到门禁之前；减少重复的 broad gate；把“代码失败”和“外部传输/缓存失败”在首条状态中分开；在收尾时同步更新规范和历史索引，而不是事后补文档。

## 当前剩余观察项与触发器

1. 继续以非破坏性方式观察 retention/orphan，在获得真实 artifact 流量后再评估高负载与删除策略。
2. `check:perimeter` 需要具备完整 `.env` 的受控环境复核；不得用缺环境的本地结果替代。
3. 任何新的 Cloud/WordPress ownership、workflow registry、prompt/router/preset 或生产发布判断，必须重新阅读 boundary 与 release policy，并建立新的 change envelope。

## 非目标与回滚

本轮未直接修改生产服务器、未 push/deploy 到 Gitee、未改变 WordPress 写入所有权、未启用 destructive orphan deletion，也未因文档整理删除历史 worktree 或证据。若后续实现引入回归，按各 PR 的独立回滚/反向提交处理；本次文档提交可单独 revert，不影响运行时代码。
