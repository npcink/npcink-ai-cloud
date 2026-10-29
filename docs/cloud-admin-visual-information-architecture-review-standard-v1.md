# Cloud Admin Visual and Information Architecture Review Standard v1

Status: active engineering standard for Admin layout changes.

Date: 2026-09-14.

Content-priority clarification: 2026-10-29. Applies to all Admin page models,
including dialogs and drawers. Current device scope and check selection follow
[PC scope and selective verification](frontend-pc-scope-and-selective-verification-v1.md).
This clarification governs future changes; it does not declare existing routes
visually accepted or authorize a cross-route redesign.

## Purpose

This standard prevents small but visible Admin layout regressions: duplicated
headings, unexplained whitespace, competing primary actions, low-value helper
copy, and visual changes that pass behavior tests while remaining hard to use
in a PC browser.

It applies especially to the runtime observation workbench:

- `/admin/usage-statistics`
- `/admin/troubleshooting`

It complements [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md),
[Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md),
and [Admin Disclosure and State Ownership Standard v1](admin-disclosure-state-ownership-standard-v1.md).

## Admin content priority contract

本节是所有 Admin 内容/版式改动的必查规则。先确定操作者任务，再决定展示
层级；不能以「看起来更干净」代替判断，也不能把所有文字统一移入帮助。
现有路由契约继续有效，尤其是 [Quiet 队列契约](admin-ui-spec.md)：Subscriptions
保留任务 list，Support 保留互斥 view、显式 Apply 和可见 Inspect。

### 1. 开工前提交四类内容清单

每次改动在任务说明或 PR 中列出以下四类及其理由。无内容时写不适用，不为
凑层级新增区块。若同一句话既有操作事实又有解释，拆开后分别归类。

| 层级 | 判断方式 | 默认载体 |
| --- | --- | --- |
| 常显 | 不看它就可能选错对象、误判当前状态或不知道下一步 | 紧凑结论、摘要行、工作表、字段旁反馈、对象旁动作 |
| 按需 | 知道当前状态后，偶尔需要理解术语、规则或额外筛选 | 短帮助提示、明确命名的 disclosure、更多筛选 |
| 技术证据 | 为核查某项判断而查看的完整标识、原始码、历史、契约和导出 | 所选对象 inspector/drawer、详情页、命名证据区 |
| 删除重复 | 已在标题、标签、当前范围或同一对象中表达过，且没有增加事实 | 删除重复呈现；保留唯一有效入口和原有功能 |

常显至少保留适用的内容：对象身份、当前工作范围/生效筛选、关键状态与原因、
下一步、高频行操作、未保存/保存失败反馈、数据部分失败/过期/截断、样本不足、
权限或安全边界对当前操作的实际影响。字段单位和数字含义不放到唯一的 hover
入口中。`未知`、`无样本`、`未配置`、`暂停`、`零问题` 不互相替代。

诊断页的当前异常与恢复不确定性、配置页的缺失项和实际生效状态、质量页的
样本阶段与分母，都属于判断事实。长篇计算方法可以披露，限制结论的那一句
必须留在当前工作区。

### 2. 标题帮助只承载帮助

`BackofficePageHeader` 的 default density 当前将 `description` 渲染为标题帮助，
compact density 当前将其渲染为行内说明。调用方必须核对最终呈现，不能只看
prop 名称就认为内容常显。

- 稳定的页面职责、名词定义、非阻塞的所有权解释适合标题帮助。
- 动态平台结论、客户覆盖状态、阻塞点、错误和下一步不得仅传入该帮助。
  将必要事实放在现有摘要/状态区域；扩展 shared primitive 时另按共享风险验证。
- 不为修复一个页面而把所有标题帮助展开，也不把 compact/default 密度全站
  强制统一。保持路由模型与既有密度契约。
- 一个页面仅一个主标题；眉题、子标题和段落没有新含义时直接删掉。不能把
  冗余说明搬到另一个 disclosure 后就算完成去重。

### 3. 选择按需入口

| 内容 | 入口规则 |
| --- | --- |
| 一两句、无交互的术语或口径 | 复用帮助 primitive，支持 hover 和键盘 focus；可固定的帮助支持点击与 Escape。不得仅依赖原生 `title` 承载必须读取的信息 |
| 多段说明、次要设置或补充表格 | 内容明确命名的折叠区；收起时保留与当前任务有关的异常数、配置状态或历史数量 |
| 完整 ID、JSON、原始错误、历史流水 | 对象旁「查看证据」进入共享详情/inspector；提供完整读取及复制方式 |
| 导出、稀少维护、危险操作 | 具名证据动作或对象的更多菜单；危险动作隔离并保留对象确认 |
| 导航目录 | 保留紧凑、直接的链接；不为少量相关工具额外增加一层 drawer/disclosure |

不要把高频 Configure、Inspect、查看会话、关键选择项或错误重试改成 hover-only。
仅隐藏非必要装饰不能影响键盘可达性。Tooltip 不承载表单、长列表或必须点击的
链接；这些内容用 disclosure/详情。不得折叠同一任务两次，展开与懒加载仍遵守
[单一状态所有者规则](admin-disclosure-state-ownership-standard-v1.md)。

### 4. 首屏和布局

- 在当前 PC 基准（1440×1050）内，应看到任务对象、状态/结论和主工作面开头。
  队列须看到表头及首个结果或明确加载/空/失败状态；不能只看到标题、解释、
  摘要卡和筛选。局部变更再按影响补查较窄 PC 窗口，不机械全量扫后台。
- 摘要默认不超过五项与当前任务直接相关的指标。设置目录已有逐项状态时，
  页头只汇总真正需要判断的缺失/异常，避免重复全目录和无关汇率、策略参数。
- 工具条围绕同一个工作面组合；避免仅为刷新、视图切换、维度分别加全宽空行。
  主次筛选须有明确标签，不能靠两个「全部」区分。
- 宽表用可用宽度，短表单保持合理阅读宽度；不为了填空白增加卡片或强行拉伸。
  移除无职责的嵌套边框；保留控件、焦点、状态和独立浮层必要边界。
- 诊断页优先当前异常及调查入口，趋势紧随其后。首轮判断必需的趋势继续常显，
  其余分布/来源/历史视图按需；不能一刀切折叠所有图表。
- 原始流水不能默认占据无限页面。保留有界预览及明确的更多入口，沿用既有
  服务端分页和排序，不在浏览器对单页重排冒充全局优先级。

本节的首屏要求明确了 UI Standard/IA 旧「两屏内」的宽松表述：后续受影响
区域按首屏工作面开头验收，不要求整张表或完整表单在首屏放完。

### 5. 视觉强调与语义

- 一个任务区域默认至多一个强调的主操作。重复行操作保持可见，通常使用中性
  按钮或文字链，不让整列蓝色实心按钮抢过对象与异常。
- 正常/已保存保持安静；错误、阻塞、待处理优先。选中态、键盘焦点和 disabled
  仍要可区分，不以一律降低对比度获得安静感。
- 状态必须写明所属事实，如「站点：活跃」「订阅：活跃」「覆盖：需跟进」。
  不能并列无标签的「错误 / 活跃 / 活跃」，不能让父区风险颜色把正常值染红。
- 数字必须有单位/范围；不同口径的健康分、错误次数、运行次数不可使用同一
  无标签数字。长公式/版本号进详情，实际金额、币种、适用限制留在判断处。
- 身份可读名优先；无名或未知类型若在同一列表重复，必须常显足够的区分信息。
  不能把不同错误都改成同一句泛化文案后，将唯一差异全部藏起来。
- 暂停状态和限制当前动作的安全说明必须常显；不能用空态引导重新启用已暂停
  功能。保留既有商业读取/额度功能，不借整理 UI 扩展商业能力或改变数据真值。

### 6. AI 交付与拒收条件

实施前记录：页面模型、操作者任务、四类清单、保持常显的事实、被移走内容的
具体目的地、影响范围和验证选择。实施后对照同范围/同状态的前后浏览器证据：

- 主工作面是否更早出现，重复标题/卡片/说明是否减少；没有测量就不报节省百分比。
- 不展开帮助能否回答「什么对象、当前什么状态、哪里受阻、下一步是什么」。
- 收起/展开后状态计数、可见性、请求、焦点和返回上下文是否一致；移走的功能
  是否仍能通过鼠标及键盘到达。
- 失败、部分成功、样本不足、长名称等受影响状态是否仍能正确判断；未测项明确标注。

上述任一核心事实只在 hover/disclosure、不同对象不可区分、工作面被说明挤出
首屏、频繁行操作消失、危险操作占据正常状态主位，应拒收并修正。
在现有 visual receipt 的相关规则及 review items 中记录结果，不新增美观分数，
不为通过静态检查而更新 golden 或放宽阈值。PR 的 Admin UI 区必须填写内容
清单和迁移入口。文档清单与 PR 模板是人工/代理评审约束，不自动证明截图合格。

本次[定点审查](history/admin/2026/records/admin-information-hierarchy-audit-2026-10-29.md)
仅记录改造建议；落实时按当前源码重新确认，不把旧截图作为现在的事实。

## Core rules

### One job per visual region

Every visible region must answer one operator question. A title, subtitle,
section heading, chart title, and helper sentence must not repeat the same
meaning. If a chart already names the measure, do not add a second heading for
that measure.

### Use the full available workbench

A PC workbench must not preserve a narrow legacy max-width when the adjacent
space has no content. Before shipping, inspect the rendered bounding boxes and
remove unused grid columns, empty asides, and route-local width constraints.

### Separate primary, secondary, and reference content

Core evidence and the next operator action remain visible. Reference
explanations, definitions, and specialized evidence may be disclosed on
request. Disclosure is a product decision, not a substitute for removing
redundant copy.

### Tabs combine views, not responsibilities

Use tabs when two views answer the same question and share filters and state.
For runtime analysis, chart and table are two views of the same evidence:

- Usage Statistics defaults to `Table` for frequent operator comparison;
  `Chart` is an explicit comparison view of the same selected scope;
- `Table` exposes the same scope for comparison and drill-down;
- filters, time range, sort state, and deep links remain consistent;
- the top-level observation TABs are Usage, Media, Vector, and Editorial
  Quality; Runtime Diagnostics remains a separate operator job and route.

### Fold only low-frequency content

Trend evidence needed for first-pass diagnosis is expanded by default.
Definitions, long evidence-boundary explanations, and detailed plugin records
may be folded. A disclosure label must name its content precisely; avoid
catch-all labels such as “More reference”.

### Action hierarchy must be visible

Solid emphasis is reserved for the selected time range and current dimension.
Cross-page navigation such as “Open runtime diagnostics” uses a secondary
style. Sorting and utility actions use the same or lower emphasis. Two solid
blue actions in one toolbar require explicit justification.

## Accepted runtime observation composition

The Usage Statistics page follows this order:

1. the shared four observation TABs and 1/3/7/14/30-day control;
2. page title, compact runtime metrics, and source freshness;
3. refresh and `Chart` / `Table` controls;
4. site/function/plugin dimension controls next to the working surface;
5. one dimension table, comparison chart, or paginated plugin history;
6. definitions and technical-validation scope, collapsed by default.

Do not restore a bottom related-observation link row or an unconditional
Runtime Diagnostics shortcut. Contextual table links carry time and site or
function into diagnostics. Selecting plugin records opens their table; a
runtime chart must not imply that it depicts plugin events.

The Troubleshooting page owns anomaly handling, evidence completeness, and
single-run inspection. Usage Statistics should link into it with the current
window and selected site/function context rather than duplicating its inspector.

## PC visual review checklist

Before M4 synchronization, inspect a fresh 1280px or wider browser capture and
answer all of these:

- Is there any empty right column or unused reserved aside?
- Do title, subtitle, section title, and chart title repeat one another?
- Does the main evidence use the available width?
- Are chart and table tabs aligned with the workbench title?
- Does the default view show the page's primary evidence without a click?
- Are selected controls the only solid primary controls in the region?
- Are helper texts short enough to scan, with full definitions disclosed later?
- Does the table retain its drill-down action when selected?
- Are empty, partial, stale, and truncated states still explicit?
- Does the same route remain usable at 900px, 1280px, and 1600px widths?

A behavior test passing does not close this checklist. Playwright must verify
state and navigation; a browser screenshot or visual receipt must verify
composition and whitespace.

## Required verification gates

For material Admin layout changes, run:

```bash
pnpm run check:admin-ui
pnpm run check:admin-ui:visual
pnpm --dir frontend run type-check
pnpm --dir frontend exec eslint <changed-files> --max-warnings=0
pnpm --dir frontend run test:e2e -- tests/e2e/admin-usage-statistics.spec.ts
```

Focused Playwright coverage includes the default table, chart selection,
distinct site/function series, filter persistence, server pagination and group
drill-down, contextual diagnostic links, and partial-failure behavior.
`git diff --check` is required before synchronization.

Only after the local gates and the PC visual review pass may an authorized
candidate be sent to M4. M4 candidate evidence remains separate from merged
`master` acceptance.

## Failure patterns to record in review

If a revision introduces any of the following, stop and correct it before
synchronization:

- moving whitespace from one region to another without removing its owner;
- leaving an old heading or helper sentence after introducing a new tab/workspace;
- hiding the current view behind another disclosure or changing its scope silently;
- using a catch-all disclosure for unrelated content;
- adding a visually primary button for a secondary filter;
- claiming “visual improvement” from passing behavior tests alone.

Each review should state the changed visual region, the removed redundancy, the
space reclaimed, and the browser evidence used to verify it.
