# Phase 1 Scope (Cloud)

Status: active product-focus pointer for agents.

## Value-first development decision (2026-10-27)

Status: operator-approved development priority and expansion freeze, confirmed
on 2026-10-27 (Asia/Shanghai). This section is the maintained scope list for
this decision; related standards link here instead of maintaining parallel lists.
It schedules no production operation, Provider call, site restart or feature
availability change.

### 判断依据与当前问题

核心目标是让 WordPress 编辑者更省事地得到准确、值得保留的内容。以
“节省时间减去等待、核对返工、配置维护负担及使用成本”作定性判断；
它不是把不同单位直接相减的财务公式。功能数、测试数和后台完整度不能
代替这个结果。

当前主要矛盾是功能与工程体系扩张超过真实编辑价值的验证进度，属于阶段
和资源分配问题。保留 Cloud 托管运行与 WordPress 审阅写入的核心方向，
先收缩新增开发范围，再由真实任务中的问题决定下一项投入。

| 当前问题 | 已知事实与证据边界 | 开发处理 |
| --- | --- | --- |
| 用户价值尚未充分证明 | 2026-10-27 收尾已有调用、显式保存、用量和反馈闭环证据；自动化接受与少量样例不能证明真实编辑者省时、留存或付费意愿，也不能据此断言项目没有真实用户。 | 优先复用自然编辑任务和既有观察渠道；不为凑样本制造模型调用。 |
| 输出质量仍有风险 | 2026-10-27 的本地 Ollama 中文改写样例把“好像无法保存”加强为确定故障；此前标题样例也出现语义偏移。这是有限样本的代理审阅，不是全模型质量结论或人工采纳。 | 检查事实、原意、不确定性及修改负担；保留审阅后采用，不在 Cloud 接管 WordPress 提示词。 |
| 产品选择过宽 | 编辑、素材成稿、内链、图片、知识库和外部客户端治理并存；存在实现不等于本阶段应继续扩展。 | 标题、摘要、选中文本改写作为近期改进主线；保留其他已有通用能力及必要维护。 |
| 后台维护面偏大 | 多类配置、观测、质量和经营页面增加持续维护成本。 | 修复阻断操作、误导信息和实际排障缺口；低频布局与美化集中低优先级处理。 |
| 交付批次容易膨胀 | 供应商、导航、预算、文案、截图和镜像维护进入同批收尾会扩大审查面；安全门禁与真实缺陷修复仍是必要工作。 | 按一个用户问题或一个风险拆分后续批次；选择检查范围，保留强制 CI 门禁。 |
| 商业假设需要对齐 | 历史试用 H3 成本判据引用过每月 CNY 50–70 的价格假设；现行 Plus/Pro 默认价为 CNY 15/29。这个差异本身不证明盈利或亏损。 | 使用现行价格和真实成本解释利润空间；历史 H1/H2/H3 仍由操作者裁决，AI 不擅改判据或价格。 |

### 继续投入与维护

1. 连接、生成、取消、重试、故障恢复、审阅和显式保存的可靠性。
2. 标题、摘要、选中文本改写的语义与事实保留，减少人工核对返工。
3. 最少的运行成功/错误、实际模型、用量/费用和采用保存证据；未知费用
   保持未知，保留预算、幂等、租户隔离、隐私和写入边界。
4. 已有商业、检索、图片/ALT、历史读取、备份恢复、保留清理与必要支持的
   正常运行。安全、数据正确性和核心路径阻断不因扩张冻结而搁置。

### 冻结新增开发的清单

下表冻结新增范围，不停用已存在的服务、不删除代码或历史记录，也不把
修复既有安全/正确性缺陷算作功能扩张。现有运行暂停另按下文
[Paused (do not expand)](#paused-do-not-expand) 的所属契约执行。

| 方向 | 当前冻结的新增范围 | 重新评估的实际触发 |
| --- | --- | --- |
| 外部 AI 客户端与跨平台生态 | OpenClaw/其他客户端的新渠道、新执行类型、模板/站点操作扩展，以及第二 CMS。 | 具体、重复的真实客户端需求，或既有客户端路径的阻断；审批与权限防线继续维护。 |
| Toolbox 工作流 | 新工具家族、通用自动化编排和批量操作入口。 | 核心任务已有重复使用，用户自然提出相邻需求，且现有能力不能满足。 |
| 自动质量路由 | 按采纳率自动换模型、改提示词或调整候选顺序，以及自动评估调度。 | 可靠、可排除夹具的自然样本和明确产品决策；继续遵守既有质量门槛与手动分析契约，达到样本阈值不自动授权写入。 |
| 大型模型测试平台 | 排行榜、批量跑分、无需求的全供应商适配和自动择优。 | 现有显式单模型诊断不能回答一个具体采购或故障问题。账户目录真实性、参考新鲜度和已有适配缺陷仍需维护。 |
| 知识库高级扩展 | 新向量后端、无实证的复杂排序实验及更多数据类型；PDF/视频继续延期。 | 当前文字/图片检索存在可复现、影响任务完成的问题；优先修现有路径。 |
| 观测与分析平台 | 新大屏、自动缺陷排名、外部 Trace 扩张、通用分析平台和新增自动分析调度。 | 既有运行记录、元数据反馈和简单查询无法支持具名决策。 |
| 商业扩张 | 新套餐体系、营销增长、客户通知扩张和复杂经营分析。 | 真实购买、续费或支持需求形成具体缺口，并单独安排范围；现有销售与共享试用授权保留。 |
| 工程平台与外观扩张 | 新并行调度体系、通用注册中心、无实际痛点的重构和全站反复美化。手机/平板继续不纳入当前开发验收。 | 可测量的瓶颈或反复阻断；优先复用现有工具及 PC 选择检查规则。 |

已有多仓职责边界继续保留；本决定不安排合仓、重写七仓、建立新的暂停
控制台或另造规范体系。涉及 Addon、Toolbox、Core、Adapter、Toolkit、Eval
的实施仍由其所属仓库按当前契约与授权交付；本次文档记录不声称已修改
这些仓库或其安装包。

### 恢复与停止条件

- 恢复前说明具名用户问题、实际证据、现有最小路径为何不足、预期改变的
  决策及停止条件。没有新线索的历史追索、清零待办和单纯“还能完善”不
  构成新增开发理由。
- 触发条件只是重新评估入口。须在所属仓库明确本批范围并经过审核；
  既有暂停能力的恢复仍需其契约要求的源变更与当前消费者验证。
- 不把技术闭环、一次 CI 全绿或一个阶段标签当作全量推进旧台账的许可。
  安全与正确性缺陷优先；其余依据自然使用中的阻断和重复困惑排序。
- 既有 Plus/Pro 月包、积分包和共享 14 天试用继续按
  [商业例外契约](commercial-development-next-stage-v1.md) 运作，三人 Free
  验证不成为销售准入门槛。生产、真实交易、付费观察调用和暂停站点恢复
  的授权边界不变。
- 模型质量、响应速度或成本一旦成为真实任务的主要瓶颈，先修该瓶颈；
  不机械坚持美化、扩功能或补报表的旧顺序。

## In scope

- Make the normal WordPress editor assist path usable and comfortable:
  title / excerpt / summary / translation / slug / ALT and related general
  runtime through official WordPress AI + Cloud Addon + Cloud runtime.
- Collect bounded Outcome / feedback evidence (no prompts or article bodies in
  telemetry). See
  [early-product-validation-and-minimal-telemetry-standard-v1.md](../early-product-validation-and-minimal-telemetry-standard-v1.md).
- Keep ordinary blog users simple; SEO users get stronger **general** editorial
  help in this phase — not the paused SEO/AEO/GEO specialist pack.

## Site Knowledge source scope

The operator decision on 2026-10-25 limits current Site Knowledge work to
text and images. PDF and video support is explicitly deferred, not delivered;
this supersedes the earlier same-day selection of PDF page text and existing
video captions. Reserved source types or empty usage buckets do not enable
those capabilities.

Preserve the existing extension seams while developing text/image behavior;
follow the [runtime contract's extension discipline](../site-knowledge-runtime-contract-v1.md#current-scope-and-extension-discipline).
Do not build PDF/video producers, extraction, indexing or Quiet/usage features
in this stage. Reopening them needs a new explicit scope decision.

## Audience split

| Audience | Phase 1 meaning |
| --- | --- |
| Ordinary blog | One-click / low-friction generate → review → save |
| SEO-oriented | More control within general tasks; specialist SEO/AEO/GEO remains paused |

## Paused (do not expand)

Link, do not re-list every ability marker here:

- [reversible-feature-pauses-v1.md](../reversible-feature-pauses-v1.md)
- [seo-specialist-pause-v1.md](../seo-specialist-pause-v1.md)

Includes Operations Advisor, nightly inspection / site-ops analysis, article
audio generation, advanced media batch / governance entrypoints, and SEO/AEO/GEO
specialist tasks. Code is retained; restoration needs a reviewed source change.

## Out of scope for Phase 1

- Second CMS platforms (Typecho / Hexo / Astro) and broad multi-platform runtime
- Broad Admin governance / alert-ranking unrelated to demonstrated operator needs
- Production Deploy without explicit human authorization
- Manufacturing paid Provider traffic only for dashboards

## Commercial development alongside Phase 1

Commercial expansion remains frozen outside the bounded existing-sales and
shared-trial exception in
[commercial-development-next-stage-v1.md](commercial-development-next-stage-v1.md).
Customer notification and broad Admin expansion remain deferred. This exception
neither completes the editor loop nor authorizes production sales activation,
real transactions, or specialist restoration.

The operator approved all eligible normal accounts for existing Plus/Pro
monthly purchases, credit packs, and the shared 14-day Plus/Pro trial. The
three-user Free validation proceeds independently and is not an access gate.
Keep current pricing, shared trial limits and the separate production gate.

## Loop checklist

[wordpress-ai-loop-verification-checklist-2026-09-22.md](../wordpress-ai-loop-verification-checklist-2026-09-22.md)
