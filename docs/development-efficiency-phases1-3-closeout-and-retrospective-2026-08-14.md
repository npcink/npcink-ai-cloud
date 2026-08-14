# Development Efficiency Phases 1–3 Closeout and Retrospective — 2026-08-14

Status: dated evidence and retrospective; not current release, M4, or production authorization.

## Context and outcome

本轮从“为什么系统性整改耗时较长”出发，没有直接削减 required checks，而是先检查现有工程能力，再补齐实际缺口。阶段 1–3 已合并到 `master`：精确验证证据复用、环境前置诊断和自然样本观察计划。当前工作进入观察期，不继续改造 CI shard/cache。

| 阶段 | PR | merge revision | 结果 |
| --- | --- | --- | --- |
| 1. Evidence identity and runtime lane | #711 | `27241cf3efd4f93194b03de02eb211b2e6cc2f75` | merged |
| 2. Environment doctor | #712 | `9179f7372b200ffbe312e9fa2c2dc9964983e26c` | merged |
| 3. Observation plan | #713 | `f4e0fe0815f926b3e2c424a13dee34e6ebdb47d6` | merged |

## What changed

阶段 1 为 `check:changed` 增加机器可读的 `runtime_lane`，并为 AI task verification 增加显式 `--reuse-current-evidence`。只有 base revision、source fingerprint 和 exact command plan 一致，且操作者确认环境与风险问题未变化时才复用；复用事件写入 ignored envelope。

阶段 2 增加 `pnpm run check:changed -- --doctor`。它在 gate 前只读检查实际计划所需的 Python、pnpm/frontend dependencies、Node，以及 advisory M4/GitHub 前置；不安装依赖、不启动 Docker、不读取 secret 值、不执行外部操作。

阶段 3 记录最低 10 个、目标 20 个可比较自然任务样本的观察方案。样本不足前不修改 CI shard/cache，也不制造 Provider、M4 或生产流量来证明优化。

## Verification evidence

- PR #711 focused contract：`31 passed`；changed-file Ruff 和 release policy 通过；同一源码指纹/命令计划的 reuse 路径实际执行成功。
- PR #712 初次 focused contract：`23 passed`；review 修正后为 `24 passed`；Ruff、release policy、engineering command inventory 均通过，inventory 为 155/155 active。
- Environment doctor：缺失 Python 时退出 1；可用解释器时退出 0；inventory-only 且 PATH 无 `python3` 时退出 1。
- PR #713 documentation-only：`check:changed --doctor`、`check:changed`、diff 和 release policy 通过。
- 三个 PR 的 GitHub required checks 通过并自动合并。
- 三个阶段均为 `github-actions` 或 `none` runtime lane；Provider calls、image builds 和 M4/shared-runtime operations 均为 0。

## Review corrections and lessons

PR #711 暴露了一条既有测试假设：pnpm separator 测试依赖当前分支必须被任务守卫拒绝，在合法 `codex/*` 分支并不成立。修正方式是隔离测试参数解析，不削弱工作树安全守卫。

PR #712 的 P2 review 指出，inventory-only diff 虽然没有 Python 文件，实际计划仍执行 `python3 scripts/check_engineering_command_inventory.py`。最初 doctor 只看文件分类，会错误报告 Python not required。最终改为同时检查实际 planned commands。这个修正形成长期原则：前置诊断必须从执行计划推导，不能仅根据文件后缀猜测。

## Why the work still took time

实现代码量有限，主要时间仍在 GitHub CodeQL、frontend、backend targeted shards、自动 review 和合并等待。`pr:wait` 让等待变成状态驱动，并在 P2 review 出现时提前退出，避免了持续 `gh pr checks --watch` 和无意义重跑。review 修正触发一次新的 CI revision，这是必要证据成本，不应计作重复失败。

本地验证还发现新辅助工作树没有 `.venv`、系统 Python 没有 pytest。使用已有共享开发 `.venv` 完成 focused gate，同时保留缺环境证据；这直接证明了 environment doctor 的实际价值。没有为获得更漂亮的结果执行 bootstrap、Docker 或 M4。

## Development principles established

1. **先审计再建设**：项目已有 `check:changed`、AI task envelope/receipt、`pr:wait` 和 M4 fingerprint，新增能力应扩展现有 owner，而不是建立第二套工具。
2. **把 lane 提前机器化**：在执行前明确 `none`、`github-actions`、M4 sync 或 deploy，避免到收尾才发现验证路径错误。
3. **复用必须绑定身份**：复用是显式操作，不是因为 commit 没变就默认跳过。
4. **前置来自实际命令**：文件分类用于路由，planned commands 才是环境需求的最终依据。
5. **等待与编码分开计时**：CI queue、review、merge authority 是交付时间，但不是编码时间；等待期间可以做只读调查和文档准备。
6. **先观察再做结构性优化**：没有可比较样本时不调整 shard、cache 或 required-check 拓扑。

## Current stop point and restart condition

当前只有机制验证，尚无足够自然任务证明整体交付时间下降。下一步按 [Phase 3 Observation Plan](development-efficiency-phase3-observation-plan-v1.md) 收集 receipt。达到最低 10 个可比较样本、目标 20 个，或同类环境问题重复出现 3 次后，再形成日期化分析并决定是否进入阶段 4。

## Repository and rollback receipt

所有实现均通过独立主题分支、标准 PR publisher、protected checks 和 squash auto-merge。辅助工作树在各 PR 合并并确认干净后解锁删除；主工作树历史 ahead commits 未被 reset、stash 或覆盖。阶段 1/2 可分别 revert 对应 merge revision；阶段 3 文档可单独 revert，不影响运行时。
