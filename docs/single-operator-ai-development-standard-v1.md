# 单人 AI 开发规范 v1

Status: active engineering standard.

Date: 2026-08-13.

Purpose: 将本项目由单个操作者、主要依靠 AI 完成开发时积累的经验，整理为可重复执行的开发、验证、发布、收尾和复盘规范。

## 1. 适用范围与总原则

本规范适用于默认的单会话、单操作者模式。只有操作者明确声明多会话队列时，才启用 [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md)。

总原则：先确认事实，再做最小改变；先证明风险，再扩大验证；把工具当作政策代码，把每个“完成”拆成可审计的证据状态。

AI 的价值是降低搜索、实现、测试和文档整理成本，不是替代边界判断。最终的边界、合并、M4 接受、生产发布和人工采用仍由对应受保护流程决定。

## 2. 历史问题与修正

### 2.1 开发入口不稳定

脏工作树、已发布分支、detached checkout 或陈旧基线会造成不可复现、任务分支复用和“本地通过但托管失败”。现在任务规划要求专用 `codex/*` 分支、当前基线是 `HEAD` 的祖先，并拒绝跟踪其他发布分支；脏主工作树使用新的锁定 worktree 隔离。

### 2.2 验证层级曾被低估

只要 diff 混入后端、脚本、策略、迁移或运行时文件，任务就不能按纯前端 L1 处理。变更按最高风险 seam 分类；只有全部变更都在 `frontend/**` 且满足条件时，才允许前端默认层级。

### 2.3 过程优化缺少可比证据

排队、人工等待、构建、传输、迁移、切换和健康检查不能混成一个“发布耗时”；不同 CI job 集合也不能直接比较。必须记录阶段耗时、工作流身份、revision、执行 job 集合和证据状态；不兼容样本 fail closed，不得声称速度提升。

### 2.4 Worktree/PR 生命周期不清晰

路径年龄、目录存在、分支已 push 或状态干净，都不能单独授权删除。`pnpm run worktree:audit` 只读盘点 Git/PR 证据，输出 `retain` 或 `manual_review`；解锁、移除、prune 和分支删除必须另行证明精确目标、归属、无独有提交、无开放 PR 和非保护角色。

### 2.5 本地聚焦测试被过度信任

聚焦测试是快速反馈，不替代 GitHub required checks。断言应针对行为契约，不依赖分支名称、工作目录或本地 checkout 形态。

## 3. 标准工作流

```text
事实盘点 -> 任务准入与变更信封 -> 专用 worktree/锁定 -> 风险分级
  -> 最窄验证 -> 一个聚焦提交 -> PR 与托管检查 -> 合并后验收（需要时）
  -> 精确收尾与复盘
```

### 3.1 会话启动

1. 执行 `git status --short --branch`；
2. 阅读 `README.md`、`AGENTS.md`、开发验证标准和相关边界文档；
3. 需要当前基线时执行 `git fetch origin master`；
4. 检查用户脏改动、活动 PR、锁定 worktree 和共享运行时操作；
5. 报告 focused module、边界影响和验证门。

默认只承认一个活动 AI 会话，不因多个想法自动开启并行队列。

### 3.2 变更信封

编辑前写出：focused module、intended outcome、explicit non-goals、public contracts touched、expected files、verification and rollback。涉及外部系统、Provider 付费调用、M4、生产或禁止文件时，再声明预算、权限、回滚和证据要求。

### 3.3 Worktree 准入

- 当前工作树只有在干净、基线新鲜且确实属于任务时才复用；
- 否则从当前 `origin/master` 创建一个 `codex/*` worktree；
- 创建后立即执行 `git worktree lock --reason "codex:<task-id>"` 并核验；
- 一个会话最多保留一个辅助 AI worktree；
- 不用 `reset --hard`、`checkout -- .`、广泛 stash 或覆盖用户改动制造干净树。

任务结束、PR 合并确认且 worktree 干净后，才可以解锁并移除这个精确路径。分支删除是独立动作，默认不做。

### 3.4 风险分级与门禁

| 层级 | 典型变化 | 首个门 | 收尾门 |
| --- | --- | --- | --- |
| 文档 | 文档、索引、历史归纳 | 链接/格式/文档合约 | required checks |
| L0 | 不改变几何、动作、状态的外观或短文案 | 精确静态检查 | 相关合约与 PR |
| L1 | 路由布局、筛选、折叠、列顺序、局部交互 | 路由合约/PC 浏览器 | Admin/UI 门与 PR |
| L2 | API、认证、凭据、共享 primitive、迁移、worker、CI、Docker、部署 | 精确源码/合约检查 | 完整相关链、PR；运行时变化时再做 M4 |

任何第二路由、共享 primitive、状态所有权、API、凭据、破坏性动作、依赖或部署输入出现时，立即向上重新分级。

### 3.5 三层工作流与时间盒

每个任务默认只进入 `development` 通道。changed paths 只判断风险和运行时需求，不能自行授权 PR、合并或生产操作：

| 通道 | 目标 | 目标时间 | 结束条件 |
| --- | --- | --- | --- |
| `development` | 形成可验证候选 | 45 分钟 | 最窄有效门通过；需要时取得候选 M4/浏览器反馈 |
| `merge` | 将已选候选合入 `master` | 90 分钟 | PR、required checks、merge；运行时变更再做 clean-master M4 接受 |
| `release` | 完成单独批准的生产发布 | 120 分钟 | 生产策略、操作者授权、精确发布计划和健康证据 |

时间盒只触发拆分和汇报，不降低验证。超过目标时，报告主要耗时来源，并把任务缩成一个仍有独立价值的切片；若必须扩大预算，明确请求操作者决定。出现第二个独立阻断时，停止继续扩张当前任务，把无关发现写入后续清单。

只有操作者要求提交或合并时才进入 `merge`；只有操作者明确要求生产结果时才进入 `release`。review 或 CI 发现的无关问题默认进入 backlog，除非它直接阻塞当前通道的安全或正确性。

```bash
pnpm run check:changed -- --plan --workflow-lane development
pnpm run check:changed -- --plan --workflow-lane merge
pnpm run check:changed -- --plan --workflow-lane release
```

### 3.6 内循环验证

先选能回答当前风险的最窄命令：

```bash
pnpm run check:changed -- --plan
pnpm run check:changed
```

随后按 seam 运行聚焦 pytest、Ruff、mypy、TypeScript、Admin 或 perimeter 检查。`check:fast` 不是所有小改动的默认首选；只有在集成收尾或真实风险需要时使用。不要为了“更安心”重复同一 broad gate。

### 3.7 提交与发布

#### 验证入口与证据覆盖

- 执行前检查 `package.json` 和被调用脚本，确认命令使用本机解释器、
  本机 Docker 还是 M4。名称相近不代表运行环境或覆盖范围相同。
- 本机源码检查使用仓库已有解释器；例如 `.venv/bin/python -m pytest`，
  先确认可用，不反复尝试缺少 pytest 的系统 Python。
- M4 开发模式下，本机根目录没有 `.env` 不构成产品缺陷，也不是默认
  需要操作者补齐的环境债务。误选本机 Docker 命令时应修正验证入口，
  不为通过命令而复制生产配置、猜测凭据或启动本机运行时。
- 命令在配置加载或进程启动前退出，应记录为“未执行测试”，不能记为
  测试通过或产品行为失败。报告精确原因和仍缺失的覆盖。
- 声称 CI 或 M4 替代某个门禁前，逐项核对原命令的配置检查、测试集合、
  运行环境和 revision；绿色状态本身不是覆盖映射。例如订阅聚焦测试
  不证明完整 API 套件、生产 Compose 配置和 health 契约均已通过。
- 使用同一 Next 构建目录的 Playwright 命令串行执行，避免构建锁冲突。
  只因提交改变 SHA、源码内容未变时，不应声称代码变化并重复验证；
  按运行时规则区分内容证据复用和合并后 promotion。


提交前检查：

```bash
git status --short --branch
git diff --stat
git diff --cached --stat
git diff --cached --name-only
```

只暂存当前任务文件，不使用 `git add -A`。PR 从 `.github/pull_request_template.md` 开始填写 Scope、Boundary、Verification、Risk 和 rollback：

```bash
pnpm run pr:publish -- --title "<title>" --body-file <path>
pnpm run pr:wait -- --pr <number>
```

失败时先读取失败签名再修复；相同外部传输签名连续失败两次后停止盲目重试，保存证据并进入记录的恢复路径。

### 3.8 合并、验收与收尾

区分：`local verified` → `PR verified` → `merged into master` → `candidate validated` → `accepted on M4` → `production validated` → `human accepted`。只报告实际达到的最高状态。

合并后 fetch 当前 `origin/master`，确认 PR 已合并、task worktree clean，并验证提交或文件已被当前 master 表示；随后仅解锁并移除本任务的精确 worktree，默认保留分支。

## 4. 外部资源与边界

paid Provider calls、M4、production mutation、full CI、image build/scan/transfer、shared runtime lock 和跨仓库质量矩阵都必须先声明预算和用途。

Cloud 仍是 hosted runtime enhancement layer，不得变成第二套 WordPress 控制面、Ability/Workflow registry、审批/预检/最终审计真相或 WordPress 写入者。AI 输出默认是 suggestion/draft/analysis；最终写入仍由本地 WordPress/Core 治理链负责。

## 5. 证据与复盘

### 5.1 四类历史审查的统一入口

单人 AI 开发中，用户体验、平台管理、正式发布和仓库治理问题经常在
同一会话中同时出现。不要把它们合并成一个“大修复”或用一个绿色检查
代替所有结论。先分别回答：

1. 用户在异常状态下是否知道下一步；
2. 操作者是否能看见实际生效对象、影响范围和审计身份；
3. 当前 revision 是否有完整、冻结、可回滚的发布证据；
4. 当前任务是否有清晰 owner、边界、worktree 和独立审查。

四类问题的历史综合、已完成项和明确延期项见
[AI Assisted Development Four Perspective Synthesis — 2026-09-07](ai-assisted-development-four-perspective-synthesis-2026-09-07.md)。
该文档是 dated synthesis，不替代当前代码、M4、生产和用户价值证据。

统一执行顺序固定为：

```text
事实基线 -> 状态/所有权建模 -> 一个问题切片 -> 行为/消费者证据
  -> 独立复审 -> PR/运行时验收 -> 精确收尾 -> 记录延期项
```

如果同一任务同时触及用户路径、Admin 状态、release 输入或结构债务，
按最高风险重新分级并拆成独立 PR；不要因为它们来自同一历史会话就共用
一个提交或一个验收结论。

最终报告至少包含：任务 worktree、分支、HEAD、锁状态、clean 状态、changed files、风险层级、精确 gates 及结果、省略 gates 及原因、最高证据状态、M4/生产/Provider 是否涉及、rollback，以及未收尾时的缺失证据、owner 和释放条件。

复盘回答三件事：哪个事实与初始假设不同？哪个门禁捕获或未捕获差异？下一次只改变哪个最小环节？

不要用历史文档、截图、HTTP 200、已 push、已 merge、M4 candidate 或生产部署互相替代。日期化记录是证据，不是当前授权。

### 5.2 分阶段交付与拆分复盘

- 保留操作者已确认的范围、顺序和延期项；阶段编号保持稳定。新增发现
  先判断是否阻塞当前目标，不能把所有历史议题重新展开成大任务。
- 搜索行为先明确匹配字段、身份归属、大小写和字面匹配语义，再验证
  总数、去重、分页、旧链接兼容、刷新及失败恢复。不要把账户名称和
  个人姓名、任一有效 membership 和主身份混称为同一个契约。
- 路由拆分的目标是降低维护复杂度。比较整体重复代码、依赖方向和
  契约所有权，不能只报告原文件减少行数。复制审计、错误和回执辅助
  函数可能制造新的漂移点，应在独立审查中明确裁决。
- 拆分验证应覆盖路径/方法/参数、OpenAPI 元数据、认证、幂等要求、
  成功和失败 envelope、审计身份及回执；列表成功测试不能替代写操作
  和失败路径验证。自查或 CI 不应被称为新上下文独立审查。
- “不部署生产”是操作授权边界，不等于 release planner 的 `no_deploy`
  分类。未运行 planner 时记录未分类，不能凭没有部署勾选 `no_deploy`。
- 收尾分开列出功能合并、验证完成、M4 接受、生产、用户验收、分支和
  worktree 状态。worktree 审计不替代远程分支和 PR 核对；两目录应准确
  描述为主工作目录与 M4 运维目录，不能统称两个 M4 worktree。
- 对未测量的持续稳定窗口、502 数量和耗时写 `not measured`；未看到
  报错不能推出稳定窗口内错误数为零。

## 6. 停止条件

开发效率基础设施已经覆盖任务准入、风险分级、聚焦验证、发布时序和 worktree/PR 对账。除非出现自然证据，否则不要继续制造流程 PR：

- 同类误选、漏检、重复 gate、预算超支或 worktree 生命周期故障自然重复至少三次；
- 单次问题直接阻塞安全、合并或发布，且现有恢复路径无法处理；
- 当前 CI 结构下的普通后端 PR 或同类 `full/runtime` 生产发布提供了可比较的新证据。

没有这些证据时，优先真实产品闭环、用户观察和缺陷修复，而不是扩张治理平台。

## 7. 快速检查清单

### 开始前

- [ ] status、README、AGENTS、相关边界已读；
- [ ] 单会话模式确认；
- [ ] 变更信封已写；
- [ ] worktree、锁和基线已核验；
- [ ] 风险层级和门禁已声明。

### 发布后

- [ ] 只暂存当前任务文件；
- [ ] PR template 完整；
- [ ] required checks 通过；
- [ ] 合并后 master 证据已确认；
- [ ] 精确 worktree 已收尾；
- [ ] 最终报告只声称已证明的状态。

## 8. 相关文档

- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md)
- [Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md)
- [Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md)
- [Development and Delivery Efficiency Closeout](development-delivery-efficiency-closeout-and-retrospective-2026-08-11.md)
