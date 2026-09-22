# AI 开发 changed-code coverage 收尾复盘（2026-08-08）

Status: time-bounded closeout and retrospective evidence.

目的：记录 changed-code coverage 从问题识别、初版落地、真实 CI 纠偏到规范固化的完整证据，提炼适合本仓库 AI 开发的质量闭环。本文不是新的 CI 阈值、产品边界、M4 或 Production 授权；当前代码、测试、活动标准和 GitHub required checks 优先于本文。

## 1. 原定目标

此前复盘确认，仓库已有较强的全量 backend 测试和一次性 coverage 基线，但缺少对“本次修改的 Python 代码是否真的被测试执行”的持续反馈。目标是补一个低成本、可解释的 changed-code coverage 观察层：

- 复用现有三个 backend pytest 分片，不新增第四次测试执行；
- 只观察 PR 中 `app/**/*.py` 的 changed executable lines 和 changed branch arcs；
- 低覆盖只提供评审信号，不设置百分比合并门禁；
- 证据缺失、损坏或结构异常时失败关闭，避免发布误导性百分比；
- 不引入外部 coverage 平台、长期项目依赖、M4、Provider 或新的运行控制面；
- 先用自然 PR 样本判断收益与成本，再决定是否保留、调整或撤销。

## 2. 完成情况

### 2.1 已完成实现

PR [#588](https://github.com/npcink/npcink-ai-cloud/pull/588) 首次接入 changed-code coverage，合并提交为 `2276fdf08255c5c04928cc715dd9c7775342a5dd`。PR [#589](https://github.com/npcink/npcink-ai-cloud/pull/589) 根据真实 CI 成本证据收窄插桩范围，合并提交为 `018ddc4a5156741605fd532199b0867760deadf4`。

最终行为是：

- 仅 pull request 进入完整 backend pytest lane 且修改 `app/**/*.py` 时启用 coverage；
- 每个分片只追踪 changed Python files，并加入 `app/__init__.py` 作为轻量 combine sentinel；
- 三个分片上传 coverage.py 数据，由 `CI observability` 合并后与 PR merge candidate diff 对齐；
- 无 `app/**` Python 变化时继续运行原 pytest 命令，不安装、不运行 coverage.py；
- 无变化路径仍生成 Markdown 和 JSON 报告，明确记录本次没有可观察目标；
- 报告 changed executable line coverage 和 changed branch arc coverage；
- `advisory=true`、`threshold=null`，低比例不阻止合并；
- coverage artifact 缺失、损坏、不完整或结构异常时，报告 seam 失败关闭。

### 2.2 已完成验证

本地 focused 验证覆盖报告逻辑、CI 契约和无执行数据 fallback：

- changed-code coverage focused tests：16 passed；
- 额外分片/部署契约：7 passed；
- Ruff、release policy、GitHub Actions YAML 解析通过；
- 完全未执行的 changed module 会被报告为 missing，而不是从 coverage 数据中消失。

真实 GitHub Actions 证据：

| PR | 路径 | backend pytest 三分片 wall time | observability |
| --- | --- | --- | --- |
| #588 | 初版 coverage 路径 | `11m02s`、`9m47s`、`12m53s` | `17s`，通过 |
| #589 | 无 `app/**` Python 变化，不插桩 | `13m08s`、`8m20s`、`9m05s` | `8s`，通过 |

PR #589 的 artifact 已下载检查：JSON totals 均为 `0`，`advisory=true`、`threshold=null`；Markdown 明确写明没有发现 `app/**` changed Python lines。

### 2.3 尚未完成的长期验证

实现与 CI 契约已完成，但 changed-code coverage 的长期价值还不能仅凭这两个实现 PR 宣告完成。仍需等待若干自然发生、确实修改 `app/**/*.py` 的 PR，观察：

- 行和分支报告是否能稳定指出评审者真正关心的缺口；
- diff line mapping 是否准确，是否存在持续误报；
- coverage 插桩的额外成本是否稳定且可接受；
- 维护报告脚本和 artifact 合同的成本是否低于评审收益。

在这些样本出现前，不设置硬百分比阈值，也不为收集样本制造 PR、Provider 调用或完整 CI 运行。

## 3. 发现的问题

| 严重程度 | 具体行为或文件 | 根本原因 | 改进建议 |
| --- | --- | --- | --- |
| 中 | PR #588 初版让进入 coverage 路径的分片追踪整个 `app/**` | 设计阶段先证明了功能正确，但在真实托管 runner 数据出现前，对插桩成本做了偏乐观假设 | 一开始就设计“仅追踪 changed files”和“无目标源码零插桩”的成本边界 |
| 中 | PR #588 自动合并后才完成成本收敛，修正必须另开 PR #589 | 在 auto-merge 活跃期间继续按“原 PR 尚可追加”推进，没有先重新确认 PR 状态 | 修改已发布分支前先检查 PR 是否 open、是否已进入 merge queue、当前 head 是否仍属于该 PR |
| 中 | 单次 CI wall time 容易被解释成 coverage 的净开销 | GitHub runner、分片内容和测试自身存在显著波动，wall time 混合了排队、环境和执行成本 | 同时记录 wall time、JUnit recorded test time、changed-file 数量和是否插桩；使用多个自然样本再判断 |
| 低 | 初版没有把无 `app/**` Python 变化的空路径视为一等契约 | 注意力集中在“有 changed code 时如何计算”，忽略了多数文档/前端 PR 的成本 | 每个观察型 CI 功能都先定义 empty target、missing evidence 和 malformed evidence 三条路径 |
| 低 | coverage 数字容易被误读为测试质量或业务价值 | 执行覆盖率只能证明代码被执行，不能证明断言正确、边界完整或用户任务成功 | 报告保持 advisory，并在评审中结合测试断言、风险分支和用户路径解释 |

没有发现 Cloud/WordPress 所有权漂移、运行时控制面扩张或测试断言被弱化。两个 PR 都只修改 CI 工作流、报告脚本、契约测试和对应文档。

## 4. 做得好的地方

- 没有新跑一套 pytest，而是复用已有三个 backend 分片，保留稳定 required check `backend`。
- 把“低覆盖”和“证据不可信”分开处理：前者 advisory，后者 fail closed。
- 用 merge candidate diff 对齐被测试源码，避免拿 PR head 与实际执行 revision 混算行号。
- 在真实 CI 显示成本疑问后及时收窄方案，没有为了维护初版而忽略运行数据。
- 保留了无变化报告，使“未运行 coverage”成为可审计结果，而不是静默缺失。
- 没有趁机建设 dashboard、外部 SaaS 或全仓阈值，控制住了试点复杂度。
- 本地 fallback 测试证明完全未执行的 changed module 会显示为 missing，避免 coverage 数据天然只包含已导入文件造成假高。

## 5. 固化后的 AI 开发质量闭环

本次工作形成的通用闭环是：

```text
边界与变更信封
  -> 选择最窄本地验证
  -> 发布 PR 并取得真实 CI/消费者证据
  -> 区分功能正确、证据完整和运行成本
  -> 根据事实收窄或纠偏
  -> 把稳定规则写入 active standard
  -> 把过程、失误和限制写入 dated retrospective
```

执行规则：

1. **先定义问题，不先定义平台。** 目标是帮助评审 changed code，不是建设通用质量门户。
2. **把空路径与失败路径和主路径一起设计。** 没有目标文件时应接近零额外成本；证据损坏时不能给出貌似精确的结果。
3. **最窄验证先行。** 报告算法用 focused tests，CI 编排用契约测试，真实 Actions 只回答托管环境问题。
4. **真实运行是纠偏输入，不是为原设计背书。** 发现成本或误报后允许收窄、撤销，不把修改方案视为失败。
5. **一次运行不是趋势。** 对 wall time、覆盖比例、误报和 flaky 行为都使用自然样本，不制造昂贵运行凑数。
6. **完成状态必须分层。** 实现合并不等于长期价值已证明；活动标准和日期化证据承担不同职责。
7. **先设停止条件。** 当维护成本、CI 延迟或误报超过评审收益时，优先收窄或撤销，不升级成更复杂的平台。

## 6. 后续观察与决策

对后续自然 `app/**` Python PR，评审者只需保留轻量观察记录：

| 观察项 | 最小记录 |
| --- | --- |
| 目标规模 | changed Python files、changed executable lines、changed branch arcs |
| 结果价值 | 是否指出一个真实测试缺口、是否改变评审或补测决定 |
| 准确性 | 是否有 line mapping、rename、generated code 或 missing-data 误报 |
| 成本 | 三分片 wall time、JUnit time、observability time，与相近自然运行对比 |
| 维护 | 是否需要人工修复 artifact、combine 或报告逻辑 |

保留现状的条件：报告稳定、成本小、至少偶尔改变补测或评审决定。收窄或撤销的触发条件：

- 多个自然样本显示 PR 反馈持续显著变慢；
- artifact combine 或 diff line mapping 持续误报；
- 报告长期不改变任何评审或测试决定；
- 维护成本超过其提供的风险信号。

触发后按顺序处理：先修正或进一步收窄目标范围；仍无收益则撤销试点。除非另有独立问题和收益证据，不建设 dashboard、数据库或外部 coverage 平台。

## 7. 下次重点关注

- 在首批自然 backend source PR 中优先检查 changed branch arcs，而不是只看 headline line percentage。
- 对新增模块、重命名文件、完全未导入模块和多分片共同执行文件保留回归关注。
- 比较 wall time 时同步查看 JUnit 时间，避免把 hosted runner 波动归因给 coverage。
- 在 auto-merge 或 merge queue 活跃时，任何追加提交前先重新确认 PR 状态和 head ownership。
- 在有足够自然样本前坚持 `threshold=null`；未来若讨论门禁，必须重新形成单独变更信封和证据评审。

## 8. 结论

此前“coverage 缺少持续趋势”的问题已经完成第一阶段闭环：实现已合并、无变化成本已收窄、证据完整性已失败关闭、活动规范已记录。尚未完成的是长期效果评估，而不是实现遗漏。

当前最合适的策略是继续低成本观察，而不是增加阈值或基础设施。这保持了 AI 开发所需的反馈能力，也符合本仓库“证据触发复杂度”的原则。
