# Systematic Remediation Delivery Standard v1

Status: active engineering standard.

## Purpose and scope

本标准用于指导 Cloud 项目的系统性检查、分阶段整改、验证、合并、运行观察和收尾。它适用于跨模块但仍可拆分为独立变更的质量、正确性、数据生命周期、CI、依赖和运行证据问题。

本标准不授权扩大产品边界，不替代 Cloud boundary、发布政策、M4 接受协议或 GitHub required checks。

## 核心原则

1. 先建立事实基线，再做判断；现行代码、测试、运行证据和保护性政策优先于历史文档。
2. 一次只推进一个主矛盾；将问题按边界、正确性、生命周期、交付、依赖和证据分类，避免并行改动互相污染。
3. 每个变更都要有明确的 change envelope：目标、非目标、公共契约、预期文件、验证、回滚和资源预算。
4. 候选状态不等于接受状态。M4 必须以合并后的 `master`、干净当前源、`m4:preview:promote` 和状态证据闭环。
5. 已通过的子门禁是有效证据；后续无关失败不得导致重复执行或扩大范围。
6. 运行观察应诚实标注流量、时间窗口和限制；不得用零样本、零 orphan 或单次成功夸大稳定性。

## 标准阶段模型

| 阶段 | 输出 | 完成条件 |
| --- | --- | --- |
| 1. Inventory | 仓库、分支、文档、测试和运行基线 | `git status`、README、边界文档和验证模型已读；事实可复核 |
| 2. Contradiction / prioritization | 问题分类、主矛盾、优先级和非目标 | 每项问题有影响、证据、风险和停止条件 |
| 3. Focused implementation | 一个模块/契约的最小变更 | 只改预期文件，兼容性和边界不漂移 |
| 4. Narrow verification | 最窄有效测试/静态/合同门禁 | 记录命令、修订、通过或失败原因 |
| 5. Review and merge | PR、review thread、required checks | unresolved thread 清零，PR 合并到受保护分支 |
| 6. M4 acceptance | candidate、promotion、status 和相关 smoke | `acceptance_state=accepted`，源分支/修订/dirty 状态一致 |
| 7. Observation | cadence、清理、错误、流量和限制 | 证据带时间窗口；不为制造数据调用付费 Provider |
| 8. Audit and closeout | 复盘、规范、遗留观察项、回滚触发器 | 文档可检索，工作树干净，提交和 push 可追溯 |

## 问题分类与处理要点

- **产品边界**：先确认 Cloud 是否只是运行时增强层；不得引入第二个 WordPress 控制面、workflow registry、prompt/router/preset 真源或 WordPress 写入所有权。
- **正确性**：认证失败必须区分 401/403 与 503/网络错误；异步筛选必须使用 abort 与 sequence guard，防止旧响应覆盖新状态。
- **数据生命周期**：清理必须有序、限量、可观测；同时报告 `retention_remaining_due_runs`、`retention_partial`、worker/API/audit evidence。orphan reconciliation 与 destructive deletion 必须分开。
- **CI 与合同**：workflow 的工具版本、依赖安装和条件计数都是公共合同；改动其一必须同步合同测试。
- **依赖安全**：依赖修复应独立成 PR，锁文件、audit 和安装方式一致；不得手工削弱 Dependabot 合同。
- **运行证据**：区分 candidate、promoted、accepted；明确样本量、流量和观察窗口。
- **仓库卫生**：worktree 只能按生命周期标准处置；年龄、名称或 audit candidate 不是删除授权。

## CI 失败分类与重试规则

先判断失败属于代码、合同、环境、runner/cache 或外部传输。两次同一 external-transfer signature 后停止自动重试，保留证据并切换记录过的 recovery lane。若 broad gate 前置子门禁已通过，只重跑失败 seam，不重复安装、构建、Provider 调用或全量扫描。

PR 合并前先检查 unresolved review threads，再等待 required checks。CI queue 等待期间可做只读调查，但不得把等待时间误报为编码时间。

## 资源预算和收尾收据

在执行付费 Provider、完整 gate、镜像构建、共享运行时或 M4 操作前声明预算。收尾至少记录：变更范围、验证命令及结果、合并 PR、源修订、M4 状态、观察窗口、限制、回滚路径、遗留问题和 push 状态。未知值写 `not measured`，不存在写 `not occurred`。

## Stop conditions

遇到边界授权缺失、需要外部协调、同一外部传输失败两次、生产/共享运行时风险不可控、或证据不足以支持结论时停止扩大操作，保留现状和证据并报告阻塞点。

## 最小 closeout checklist

- [ ] `git status --short --branch` 与 `git diff --stat` 已检查。
- [ ] 只 stage 当前任务文件；已检查 cached stat/name-only。
- [ ] 运行最窄有效门禁，并说明未运行的更宽门禁及原因。
- [ ] PR review thread、required checks、合并修订已记录。
- [ ] 若使用 M4，已完成 promote/status 并满足 accepted 条件。
- [ ] 运行观察包含样本限制和非目标声明。
- [ ] 文档索引已更新，提交、push 和回滚路径可追溯。
