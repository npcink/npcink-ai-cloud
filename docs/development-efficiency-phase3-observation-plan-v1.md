# Development Efficiency Phase 3 Observation Plan v1

Status: current plan; observation is not yet complete and this document is not measured efficiency evidence.

## Purpose

阶段 1（PR #711）已经落地验证计划的 runtime lane 与精确证据复用；阶段 2（PR #712）已经落地只读环境前置诊断。阶段 3 的任务不是立即继续增加工具，而是先积累自然样本，判断真正的剩余瓶颈，再决定是否修改 CI shard、缓存或 PR 状态流程。

## Observation boundary

只观察正常开发交付链，不制造 Provider 调用、不触碰生产、不改变 M4 共享运行时、不修改 GitHub required checks。阶段 1/2 的工具是被观察对象和数据来源，不是新的控制平面。

样本应满足：

- 同一 Cloud 仓库、可确认的 source revision、同一类证据链；
- 记录从 focused gate 到 PR、合并和（适用时）M4 promotion 的实际状态；
- 兼容的 CI workflow、executed job set、shard topology 和 lane 才可以直接比较；
- 文档-only、依赖/Docker、生产操作和异常恢复可以纳入，但必须单独标记，不能与普通后端 PR 混算。

最低样本量为 10 个可比较任务，目标为 20 个；不足时只报告观察，不作结构性 CI 优化决策。

## Metrics to collect

| 维度 | 记录内容 | 主要来源 |
| --- | --- | --- |
| Feedback clock | coherent edit 到首次有用 focused feedback 的时间 | task receipt、命令 duration |
| Repeated work | 相同 revision/指纹重复 gate 次数、证据复用次数 | AI task envelope/receipt |
| Preflight value | doctor 提前发现的 missing 项、是否阻止无效 gate | `check:changed --doctor` 输出 |
| CI critical path | queue、setup、selected tests、full tests、最慢 job、shard topology | GitHub Actions check runs |
| PR wait | CI green 到 merge、review thread 或依赖阻塞时间 | `pr:wait`、PR timeline |
| Failure taxonomy | CODE、ENV、RUNNER、TRANSFER、DEPENDENCY、POLICY 分类 | PR checks、日志、receipt |
| Runtime operations | M4 sync/deploy/promotion 次数和耗时（仅实际使用时） | M4 observation receipt |
| Resource cost | full gate、image build、Provider、共享运行时操作次数 | task envelope、M4 receipt |

## Collection rules

1. 每个任务在 closeout receipt 中记录 exact revision、changed paths、tier、runtime lane、gate result 和遗漏门禁。
2. 使用 `pnpm run pr:wait -- --pr <number>` 获取状态快照；不要用高频 `gh pr checks --watch` 代替记录。
3. 失败先标记 failure class，再决定是否重跑；同一 external-transfer signature 连续两次后停止自动重试。
4. 只复用同一 base revision、source fingerprint、command plan 且环境与风险问题未变化的验证证据。
5. 不为获得样本而调用付费 Provider、制造高流量、启动额外 M4 操作或修改生产数据。
6. 不在普通任务中并发编辑共享五日观察表；先保留每任务 receipt，样本到齐后再做一次性汇总。

## Decision gate after the sample window

样本达到最低量后，形成一份日期化 retrospective，回答：

- 主要成本究竟来自编码、等待、重复验证、环境失败、review/依赖阻塞，还是外部 runner variance？
- 阶段 1 的证据复用是否真正减少了重复 gate？
- 阶段 2 的 doctor 是否在 gate 前发现了实际环境问题？
- CI 是否存在稳定、可重复且足以影响关键路径的 shard/cache 瓶颈？

只有在自然样本显示以下任一条件时才启动后续实现：

- 同一 revision 的重复 broad gate 或重复构建持续出现，并且可由本地工具安全消除；
- 环境前置失败至少重复出现 3 次，且 doctor 可以在正式 gate 前稳定识别；
- 兼容 CI 样本显示关键路径有可重复的瓶颈，且预计改善超过约 25% 或 2 分钟；
- PR 状态/依赖等待成为明确的串行瓶颈，并且现有 `pr:wait` 证据不足以定位原因。

如果主要成本来自 GitHub 排队、网络、runner 或偶发外部波动，则保留当前工具和证据链，不为了追求表面时长改造 CI。若误判、维护成本或选择器歧义增加，应停止或回滚优化。

## Current state and next action

当前只有阶段 1/2 的机制验证数据：focused contract tests 分别通过，但尚无足够自然任务样本证明整体交付时长已经下降。下一步仅收集可比较 receipt，不新增 CI shard、缓存、PR 汇总器或 M4 自动化。样本达标后，再由新的 change envelope 决定是否进入阶段 4 实施。

## Rollback and non-goals

本计划本身不改变运行时代码、CI required check 名称、M4 操作权限或生产发布策略。若后续阶段被证明无收益，可单独撤回后续实现；本计划和历史 receipt 继续作为可追溯的观察记录。
