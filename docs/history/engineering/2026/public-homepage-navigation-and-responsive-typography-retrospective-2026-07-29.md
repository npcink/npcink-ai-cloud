# Public Homepage Navigation And Responsive Typography Retrospective — 2026-07-29

Status: completed development closeout and reusable review checklist.

Scope: the public header and footer navigation, Help FAQ disclosure, homepage
hero and section copy, pricing summaries, responsive breakpoints, and
deterministic visual coverage delivered through PRs
[#333](https://github.com/npcink/npcink-ai-cloud/pull/333),
[#341](https://github.com/npcink/npcink-ai-cloud/pull/341), and
[#344](https://github.com/npcink/npcink-ai-cloud/pull/344).

This is an evidence and working-method record. It continues
[Public Frontend Development Retrospective And Standard — 2026-07-25](public-frontend-development-retrospective-and-standard-2026-07-25.md).
It does not create a new product contract, approve production, or move
WordPress review and publishing control into Cloud.

## 1. Executive Summary

The work began with three visible complaints:

1. the header and footer repeated the same menu destinations;
2. the Help page exposed every FAQ answer at once;
3. large homepage copy felt crowded, while one extra character or word caused
   awkward orphan lines.

The first fixes improved the obvious desktop examples, but a stricter
bilingual audit at `390`, `768`, `1024`, `1280`, and `1440` pixels exposed
additional tablet and small-laptop failures. The final implementation therefore
combined information-architecture ownership, shorter copy, later responsive
breakpoints, component-specific rendering rules, and deterministic visual
assertions.

The reusable conclusion is:

> A responsive typography defect is rarely solved by font size alone. First
> decide which surface owns the content, then reduce copy entropy, give the
> layout enough space, choose breakpoints from measured content pressure, and
> verify both languages at the widths where the layout changes.

## 2. Delivery Evidence

| Stage | Merged evidence | User-visible outcome |
| --- | --- | --- |
| Navigation and Help cleanup | PR #333, `a75bc13a` | Header owns product navigation; footer owns legal and operational links; FAQ answers are collapsed by default |
| Desktop typography balance | PR #341, `4e9cf31b` | Hero width and type rhythm were relaxed; Chinese pricing and footer copy stopped producing the reported awkward wraps |
| Responsive detail correction | PR #344, `5aef0d12` | Tablet navigation, bilingual laptop headings, mobile pricing summaries, and footer notes gained explicit breakpoint and regression coverage |

PR #344 was merged into `master` and promoted from a clean current master
worktree. The accepted M4 evidence recorded:

```text
acceptance_state=accepted
promotion_pr=344
source_branch=master
source_dirty=false
source_revision=5aef0d12e5493e4136bb69ce6e248315f3dd346c
```

The accepted smoke reported HTTP `200` for `/` and `/health/live`. This is
development-preview acceptance for that revision. It is not production
deployment or GA evidence.

## 3. Product And Interaction Decisions

### 3.1 Header and footer have different jobs

The final public navigation ownership is:

| Surface | Destinations | Reason |
| --- | --- | --- |
| Header | Capabilities, How it works, Pricing, Help | Supports the visitor's primary product-discovery path |
| Footer | Privacy, Terms, Service status | Preserves legal and operational access without repeating the primary path |

This rule is stronger than removing two duplicated labels. It prevents future
drift:

- a product-discovery destination belongs in the header;
- a legal or operational destination belongs in the footer;
- a destination is not duplicated merely to make either menu look fuller;
- an exception needs a concrete task-frequency or risk reason.

Help remains in the header because it answers pre-sign-in product and support
questions. Service status remains in the footer because it is an operational
reference, not a primary product step.

### 3.2 FAQ uses progressive disclosure

The Help FAQ uses native `details` and `summary` behavior:

- all answers are collapsed initially;
- the complete question row is the trigger;
- each question opens independently;
- native keyboard and accessibility semantics are retained;
- the content remains available without introducing a custom state machine.

This reduces vertical scanning cost without hiding the list of available
questions. A forced one-item accordion was unnecessary because reading one
answer does not invalidate another.

### 3.3 Copy is part of responsive layout

The crowded hero and orphan lines were not treated as isolated CSS defects.
The copy and the container were reviewed together.

Examples of the resulting rules:

- keep the hero's promise and WordPress-control boundary, but do not force a
  desktop-scale headline into tablet dimensions;
- prefer a shorter heading such as “Start with one site. Scale as needed.” over
  preserving a longer sentence that repeatedly produces a one-word final line;
- shorten CTA copy when the same meaning can be expressed without a fragile
  trailing “WordPress.” line;
- use complete, natural footer sentences and `text-wrap: pretty` as assistance,
  not as a substitute for reasonable copy length;
- do not solve Chinese wrapping by inserting manual line breaks that become
  wrong in another viewport.

### 3.4 Breakpoints follow content pressure

The final responsive changes deliberately delay dense multi-column layouts:

- desktop navigation begins at `lg`, leaving `768px` tablets on the compact
  menu;
- hero display type uses a smaller `sm` size and reaches the largest size only
  at `xl`;
- capability cards use three columns only at `lg`;
- boundary, pricing-header, final-CTA, and pricing-footer split layouts wait
  until `xl`;
- mobile plan descriptions occupy their own row so a final Chinese character
  is not squeezed beside price and expansion controls.

The principle is to choose a breakpoint from the longest supported content,
not from the amount of empty space in one Chinese desktop screenshot.

### 3.5 Compact navigation must not repeat visible controls

At tablet widths the top bar already displays sign-in, locale, and theme
controls. The opened compact menu therefore hides its duplicate instances at
those widths. On small mobile screens, where the top bar hides those controls,
the menu presents them.

This is the same ownership rule applied responsively: a control can move
between containers, but it should not appear twice in the same visible state.

## 4. Investigation And Verification Method

### 4.1 Start from a viewport-language matrix

The final audit covered:

| Width | Primary risk | Required locale coverage |
| --- | --- | --- |
| `390px` | mobile plan summaries, long Chinese labels, menu contents | Chinese plus key English actions |
| `768px` | tablet header pressure and duplicated controls | English and Chinese |
| `1024px` | desktop-nav entry, hero line count, two-column transitions | English and Chinese |
| `1280px` | transition into wider section layouts | longest representative copy |
| `1440px` | intended desktop composition | Chinese and English spot checks |

Testing only `390px` and `1440px` misses the widths where most layout modes
change. Testing only Chinese misses English words that cannot break at
character boundaries.

### 4.2 Combine screenshots with semantic assertions

Screenshots answer “does the composition still look right?” Semantic
assertions answer “did the intended responsive rule actually apply?”

PR #344 added evidence for:

- tablet English header and main content;
- laptop English and Chinese main content;
- compact navigation visibility at `768px`;
- desktop navigation visibility at `1024px`;
- non-wrapping brand and sign-in labels;
- hidden duplicate sign-in inside the tablet menu;
- maximum two-line rendering for English hero, pricing, and final CTA headings.

Line-count assertions are especially useful for orphan prevention. They turn a
known typography requirement into a deterministic failure instead of relying
on a reviewer to notice one distant line in a full-page diff.

### 4.3 Separate sticky-header and main-content evidence

A full-page screenshot can composite a sticky header over content as the
browser captures a tall page. That artifact can look like a real overlap.

The stable approach is:

1. capture the header separately while it is visible;
2. temporarily hide the sticky header only during the main-element screenshot;
3. restore it in `finally`;
4. keep functional assertions proving the real header remains present and
   interactive.

This separates header evidence from page-composition evidence without changing
production behavior.

### 4.4 Distinguish intentional accessibility behavior

The focused skip link can extend beyond a narrow viewport because it is
normally screen-reader-only and becomes visible for keyboard focus. That is
not equivalent to persistent page overflow.

Before “fixing” an apparent visual anomaly, verify:

- whether it is present in the normal state;
- whether it is required for keyboard or screen-reader access;
- whether the screenshot mechanism created it;
- whether the browser actually reports persistent horizontal overflow.

## 5. Work Review Report

### 5.1 原定目标

- 消除顶部与底部菜单的无意义重复；
- 让帮助页 FAQ 更易扫描；
- 缓解首页大标题与说明文字的拥挤感；
- 避免中英文在常见屏宽出现单字、单词孤行；
- 检查首页其他同类细节并完成可回归验证；
- 在不扩大产品边界的前提下完成合并和 M4 验收。

### 5.2 完成情况

- [x] 顶部保留产品发现路径，底部保留法律与服务状态入口；
- [x] FAQ 默认折叠并保留原生可访问语义；
- [x] 调整 hero、定价区、最终 CTA 和页脚的文案与排版；
- [x] 修复 `768px` 与 `1024px` 中英文断点问题；
- [x] 修复移动端套餐摘要的中文孤字；
- [x] 增加分层截图和语义断言；
- [x] 三个 PR 均已合并；
- [x] 最终应用 revision 已获得 accepted M4 evidence；
- [ ] 未进行生产部署，不能声称生产或 GA 完成。

### 5.3 发现的问题

| 严重度 | 具体表现或位置 | 根因 | 改进 |
| --- | --- | --- | --- |
| 高 | 第一轮修改后，`768px` 英文品牌、How it works 和 Sign in 仍有挤压风险 | 初始检查集中在桌面截图和手机截图，缺少断点过渡宽度 | 默认使用 `390/768/1024/1440` 矩阵，并在长语言下检查每个布局切换点 |
| 高 | `1024px` 英文 hero、pricing、CTA 出现三行或单词孤行 | 只调整字号，没有同时约束文案长度、容器宽度和分栏时机 | 先简化文案，再延后分栏，最后用行数断言锁定结果 |
| 中 | tablet 菜单打开后可能与顶部重复 Sign in、语言和主题控件 | 响应式布局改变了控件位置，却没有重新检查同一状态下的所有可见入口 | 为每个断点建立“可见控件清单”，测试重复入口是否隐藏 |
| 中 | 长页面截图出现 sticky header 覆盖内容的假象 | 把截图合成机制误当成实际页面状态 | header 与 main 分开截图，main 截图时临时隐藏 header，并保留功能断言 |
| 中 | 一度用错误的参数转发方式运行 snapshot 更新 | 没有先确认 package script 对 Playwright 参数的封装方式 | 使用仓库命名的 baseline 脚本，更新后再以非更新模式复跑 |
| 中 | 发布期间 `master` 前进，分支两次需要 rebase，重复了部分验证 | 仓库并行合并频繁且保护门禁耗时较长 | 开工基于最新 `origin/master`；发布前再次 fetch/rebase；保持 patch 小；只用 `--force-with-lease` 更新已发布 topic branch |
| 低 | M4 relay lock 返回安全退出，第一次不能立即运行 | 同一 M4 relay 同时只允许一个受管操作 | 等待锁释放后重试，不绕过 relay、不直接传输、不把锁冲突误报为产品失败 |
| 低 | skip link 在聚焦状态看似超出窄屏 | 可访问入口的预期聚焦行为被当成普通布局元素审视 | 先判断正常态、焦点态和实际 overflow，再决定是否修改 |

### 5.4 做得好的地方

- 从用户指出的具体视觉问题追到信息架构和响应式规则，没有用更多
  菜单、卡片或配置增加复杂度；
- 使用独立干净 worktree，未覆盖主目录中的其他进行中工作；
- 将中文和英文都视为真实布局输入，而不是只替换字符串；
- 将截图证据拆成 header、main、hero、pricing 和整页等不同粒度；
- 保留产品真相边界：前端只调整展示，套餐事实仍来自公开计划投影；
- 保留交付证据层级：本地测试、GitHub merge、M4 accepted 和 production
  始终分开陈述。

### 5.5 下次重点关注

1. 在第一次“没有其他问题”结论前完成断点和语言矩阵，不凭单张整页图
   提前收口。
2. 对已知容易孤行的标题建立行数断言，对关键控件建立可见性断言。
3. 将移动菜单视为独立交互状态，检查入口重复、关闭行为和焦点语义。
4. 视觉差异先判断是应用变化、字体未稳定还是截图机制，再更新 baseline。
5. 合并队列活跃时缩短分支生命周期，rebase 后只重跑能回答新增风险的门禁。

## 6. Reusable Public Homepage Checklist

### Information architecture

- [ ] Header destinations support the primary visitor journey.
- [ ] Footer destinations are legal, operational, or secondary.
- [ ] No link or control is duplicated without a named user task.
- [ ] Help and status have distinct discovery and operational roles.

### Copy and typography

- [ ] Hero states product value and the WordPress control boundary.
- [ ] Copy is shortened before adding manual line breaks.
- [ ] Chinese has no isolated final character in key summaries.
- [ ] English has no isolated final word in key headings or CTAs.
- [ ] Heading line count is checked at layout transition widths.
- [ ] `text-wrap: pretty` or `balance` supports, but does not conceal, bad copy.

### Responsive layout

- [ ] Review at least `390`, `768`, `1024`, and `1440` pixels.
- [ ] Review both `zh-CN` and `en-US`.
- [ ] Test the width immediately before and after every important breakpoint.
- [ ] Multi-column layouts begin only when the longest content fits.
- [ ] Mobile and tablet menus do not repeat controls already visible above.
- [ ] Pricing summaries reserve a full row for descriptive copy when needed.

### Interaction and accessibility

- [ ] FAQ triggers use buttons or native summary semantics.
- [ ] Expanded state is keyboard accessible and programmatically exposed.
- [ ] Skip links and focused controls are not mistaken for normal-state overflow.
- [ ] Menu open/close behavior and `aria-expanded` are asserted.

### Visual regression

- [ ] Wait for fonts and disable animation/caret before screenshots.
- [ ] Stub dynamic health and plan responses with deterministic fixtures.
- [ ] Capture critical components separately from full-page evidence.
- [ ] Keep sticky elements from contaminating main-content screenshots.
- [ ] Pair visual baselines with semantic visibility and line-count assertions.
- [ ] Update only intentional baselines, then rerun without update mode.

### Delivery evidence

- [ ] Preserve unrelated dirty work in an isolated worktree.
- [ ] Run the narrowest local gate for the changed seam.
- [ ] Rebase onto current `origin/master` before publishing.
- [ ] Treat GitHub required checks as merge authority.
- [ ] For runtime changes, distinguish candidate preview from accepted promotion.
- [ ] Do not translate accepted M4 evidence into a production or GA claim.

## 7. Final Boundary

This sequence improved how the public site explains and presents the Cloud
service. It did not change plan ownership, entitlement truth, authentication
identity, provider execution, WordPress workflow ownership, or final content
approval.

The stable division remains:

- Cloud public frontend owns bounded presentation and anonymous discovery;
- canonical backend projections own commercial and operational facts;
- WordPress owns content review, confirmation, and publishing;
- GitHub owns reviewed merge authority;
- M4 owns accepted development-preview runtime evidence;
- production requires its own governed release path and evidence.
