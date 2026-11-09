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
- 面向操作者的任务范围使用本地化的具体任务名称，不直接拼接内部 task code。
  名称须核对实际任务契约，区分「图片提示词／生成图片」「音频文稿／音频生成」
  等不同输出；新增已知任务同时补齐中英名称。未知任务明确标为未识别并保留原标识，
  不猜测含义、不丢弃条目，也不因展示名称变化恢复暂停任务。
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

### 7. 后续 AI 的维护与防回退规则

本轮逐页落实使用[落实台账](admin-information-hierarchy-implementation-ledger.md)。
台账记录进度和证据，本规范约束后续改动；历史截图与台账不代替当前源码核对。

| 页面模型 | 优先展示 | 可以深入一层的内容 |
| --- | --- | --- |
| 总览 | 当前结论、待办对象、原因、直接处理入口 | 稳定职责、计算定义、原始快照 |
| 队列 | 可区分的对象、当前筛选、状态/影响、可见行操作 | 低频筛选、完整历史、技术键 |
| 详情 | 当前对象、访问/覆盖/周期等分属状态、阻塞原因、下一步 | 长公式、版本、原始标识、非阻塞维护 |
| 配置 | 缺失项、实际生效状态、当前编辑面、未保存/失败反馈 | 固定技术契约、历史、术语解释 |
| 诊断/质量 | 当前问题、样本阶段/分母、证据限制、调查工作面 | 补充分布、原始流水、定义和导出 |
| 登录 | 访问边界、输入、提交、错误反馈 | 额外会话解释；不新增欢迎卡片 |

后续修改必须遵守：

1. 先读目标路由及其子视图的既有取舍和当前实现。新增 TAB、弹窗、drawer
   也按本节审查；路由清单以 `frontend/admin-ui-manifest.json` 为准，不能只验首页。
2. 不重新引入已经去掉的重复标题、说明、指标、嵌套边框或整列强调按钮。
   确有新任务需要时，在 PR 解释新增信息和职责，而非仅称「统一风格」。
3. 已下沉内容必须保持具名入口、鼠标/键盘可达和原有范围。不能复制一份常显
   内容来解决入口难找，也不能让折叠状态改变请求、筛选、权限或保存语义。
4. 质量百分比必须与当前样本、分母和阶段一起解读；「没有候选」「未上报标签」
   不升级为「质量通过」。健康分、错误条数、传输收件与编辑采纳分别标明口径。
5. 复核每条建议并记录「整改并验证／已有修复并验证／不适用及原因」。未验证、
   失败和受阻项单列，不能以「已审查」「文档完成」或其他页通过替代落实状态。
6. 改动同步维护相关条款、迁移入口和证据。局部规则留在本规范的对应条目；
   不新增平行的 AI 专属规范，不复制易过期的整套代码或截图数值作为硬约束。

静态门禁检查结构和契约，浏览器检查内容与版式，人工验收确认实际使用判断。
三者各自记录；不声称文档能够自动阻止所有后续回退。


### 8. 逐页核对归纳：默认呈现与必要例外

以下归纳前两批历史修改与本批取舍，覆盖 manifest 的 27 个路由模式及质量子视图；
具体路由是否完成浏览器验证，以落实台账为准。历史整改经验在本节成为维护规则，
不继承历史环境、样本数或人工验收状态。
这些规则同样适用于后续 AI 新增字段、状态、页签、弹窗和 drawer。

| 场景 | 默认呈现与理由 | 不可退回的做法 |
| --- | --- | --- |
| 首页总览 | 平台动态结论、读取失败/未知、待办对象与直接入口常显，客户查找保持紧凑工作区；扩展平台用量与证据按需 | 把平台结论再塞回标题帮助；重复「操作清单/待办」标题、查找嵌套卡或无上下文诊断入口 |
| 客户详情 | 概览常显访问、套餐/覆盖的结论、原因与下一步；暂停原因及操作失败跨页签可见。暂停/恢复在原「访问」页签，保留对象确认 | 让红色暂停按钮主导默认概览；把访问阻塞仅留在不活动页签；为下沉动作复制写入处理器 |
| 站点详情 | 标明整体、站点、订阅、覆盖各自状态；当前风险、下一步、金额/币种常显。长汇率公式/版本进原高级证据 | 用站点风险容器把正常订阅染红；并列无归属的状态；把公式重新放到主位 |
| 站点重连 | 非释放站点的非阻塞冷却说明可收起；已释放归属站点默认展开，保留解锁日期、立即允许、恢复默认与保存 | 对已释放站点机械折叠当前需要处理的冷却控件；将允许重连描述成转移归属完成 |
| 插件观测 | 调查前即可区分问题/站点/错误；原始近期流水默认有界预览，展示已显示/本次返回数量及上限，具名展开本次记录；完整历史沿用独立懒加载入口 | 不同错误只剩同句泛化文案；无限展开原始流水；把收到上报/无关联运行当成执行成功/失败；单页重排冒充全局排序 |
| 向量观测 | 当前错误队列和所选错误在趋势/分布之前；健康分与错误次数分别标名，期间/站点/历史范围及恢复未核实限制常显；必要趋势展开 | 把健康分写成错误条数；大块分布挤走错误队列；把历史错误当当前服务仍故障或已恢复的证明 |
| 用量统计 | 默认表格；刷新、表图切换和维度属于同一工具条，来源、新鲜度、当前范围、截断/失败常显；钻取保留时间及对象上下文 | 更换视图丢失筛选/分页/快照；插件记录展示为 runtime 曲线；无条件重复诊断跳转；用说明空行分割同一工具条 |
| 编辑质量 | 阶段、当前样本、分子/分母、待定数、不足限制与比例一起常显；必要趋势展开，定义/导出进入「证据边界与导出」 | 小样本 100% 等同质量已验收；零候选等同无质量问题；有会话但无区间趋势时误写「没有会话」或保留大块空图 |
| 审计 | 事件类型/结果/站点/客户优先；技术键与精确时间在「更多筛选」，所有已生效条件在折叠区外可见；成功心跳/定时记录低强调 | 为安静而删除、少采集、重排或过滤成功审计；收起技术输入后隐去实际查询条件；一次查询耗时推导性能根因 |
| Agent 反馈 | 问题标签队列优先；无标签用带样本范围的短行，保留分母/截断限制。场景与分布具名展开，可读范围优先、完整 runtime/surface 可查 | 从未上报标签推导「产品无问题」；原始标识截断后无完整入口；改版破坏 URL focus 或更改样本/统计口径 |
| 运行排障 | 当前异常、调查下一步、样本上限与恢复不确定性常显；概览/记录/趋势及 inspector 各司其职，上下文导航和相关工具保留直接低强调链接 | 将用途不同的入口误删为重复；把少量工具另包一层 drawer；把有限样本当作故障根因或恢复结论 |
| 媒体观测与顾问 | 暂停、仅历史观察、传输收件/最终采纳边界及失败常显，历史证据入口保留；空态工具安静 | 空态指导重新启用暂停任务；顾问新增分析动作；把传输成功推导 WordPress 已采纳或发布 |
| 客户身份 | 名称/邮箱优先；缺少可读名或同名时保留足以区分的标识。完整 ID 仍可从对象详情读取 | 多行只显示相同的「未命名客户」，唯一差异只在 hover |
| 客户额度警告 | 入口与详情共用判定；详情页签前常显触发项、数值与原因，异常行对应标出。密钥 1/1 是完整覆盖；来源不明确则说明未定位并提供只读刷新，详见客户工作区规范 §3.2 | 将覆盖率当容量使用率；入口警告而详情全正常且不解释；为消除矛盾吞掉真实警告或编造原因 |
| 覆盖、订阅和工单队列 | 生效筛选、原因、结果范围、Apply、Inspect、详情/会话入口常显；重复行动作中性。排序解释、快捷键进具名帮助 | 为安静而隐藏高频行操作，客户端重排当前页冒充服务端全局优先级 |
| 订阅详情 | 周期不等于付款证据的短限制常显；Free 和已移除站点说明按实际对象条件出现。客户全名与打开客户入口常显于基本信息，不在页头重复。零审计可压成短行，失败/重试保持可见 | 所有套餐都显示 Free 教学；把审计读取失败显示成零条；在页头恢复重复长名并挤碎标签 |
| 工单会话 | 初始描述属于客户内容，不能只藏在页头帮助；会话与回复在前。附件独立具名展开，收起仍显示数量和已选文件；公开/内部边界留在动作附近 | 附件上传占据回复前的大区域；收起后隐藏已选文件或丢失上传/下载入口 |
| 服务目录 | 分开表达保存配置、验证结果与实际运行角色；同一事实只表达一次。Configure 和测试都保持可见；保存不等于已验证 | 同行反复写停用/启用；把测试当普通查看、折叠费用或阻塞提示 |
| 向量服务 | 当前环境、生效状态、配置下一步和真实检索限制常显；固定模型契约、维度、距离算法、集合和后端有明确读取入口。生产连接验证和本地运行分别表述 | 用连接就绪替代真实检索通过；用本地运行成功推导生产连接就绪 |
| 运行与服务设置 | 主表/当前设置面优先；缺少可选兜底不当异常。页头汇总缺失或错误，详细组值仍在目录与激活面板；未保存、陈旧、待回读确认常显 | 在页头复制整个目录及正常值；收起动态失败；把未启用的可选组计作配置失败 |
| 合规资料 | 草稿、公开版本、阻塞、法律确认各自明确；无公开版本写「尚未发布」。未保存保护提示只在需要时呈现 | 用无含义的破折号代替未发布；把保存草稿等同发布或取消发布确认 |
| 商业目录 | 现有价格、积分、有效期、客户可见性和管理入口是比较事实；技术 ID 在编辑详情，重名时仍常显区分；固定策略公式不抢主位 | 因精简而隐藏价格/有效期，借外观调整改变价格、资格、额度或订单语义 |
| 成本观察 | 当前快照、估算覆盖范围、缺失不等于零、仅本地草稿和共用浏览器边界常显；收入分解与存储实现按需。失败提示不随细分折叠 | 把未知成本显示为已核实零成本；只在帮助里说明本地草稿；上传本地账单或新增财务能力 |
| 登录 | 一个登录标题、内部访问边界、输入与提交、会话检查/错误；原错误码与 trace 保留支持入口 | 添加重复内部入口眉题、欢迎卡，或把恢复/重试藏进说明 |

**同一内容可能因状态改变层级。** 稳定配置帮助可以折叠，实际缺失/错误不能；
空历史可以收紧，加载失败不能当空态；技术 ID 通常次级，身份无法区分时必须外显。
不得为了遵守「少展示」机械删除这些例外。

维护时先在目标路由的当前状态中回答四个问题：对象是谁、当前范围是什么、
哪里受阻、下一步做什么。再核对具名按需入口，最后核对布局与首屏。
更新结构检查时，应断言新的职责与入口，并保留查询、状态、键盘与写入边界
断言；不能仅删掉不符合新布局的断言。截图基线差异须保留实际图和差异图供
审查，不用自动更新基线来证明改造合格。变更 golden 的提交须按 UI Standard
完成所要求的人工视觉验收。文档约束、静态门禁与截图审查相互补充，
均不能单独宣称后续 AI 已不可能改乱。

同一截图存在已跟踪的平台变体时，交付前须核对全部相关变体（如 Darwin 与
Linux）。本机通过不代表 CI 平台基线已同步；各平台分别保留 actual/diff，
不得把另一平台的 PNG 直接复制为基线。逐项确认差异是否属于已经人工接受的
同一视觉变更；超出原验收范围的差异须另行展示并取得适用人工验收，不能因
主观认为「只是平台差异」跳过审查。


### 9. 历史功能修复对视觉整理的约束

以下归纳已经修复的状态与交互问题；具体 API、状态所有者及兼容行为仍由
[状态所有权规范](admin-disclosure-state-ownership-standard-v1.md) 和对应模块契约约束。
外观重排必须保留这些行为，不能把它们当作低优先级说明一起隐藏。

| 已确认的经验 | 后续必须保持 | 最小核对场景 |
| --- | --- | --- |
| 读取失败不等于空目录/零指标 | 首次失败或 malformed 响应显示未知与重试，不开放由默认值伪造的可写表单；同范围旧快照明确陈旧，必要动作冻结 | 首次失败、结构异常、旧快照及 GET 恢复；保留既有 optional 字段兼容，不借整理新增硬拒 |
| 配置、启用、验证、实际运行是不同事实 | 验证失败与未验证不能叫就绪；零验证样本的比例为未知。生产连接/索引/真实检索、本地 runtime 分开，no-hit 表示已检索零结果 | failed、not observed、零样本、no-hit、进行中及未知；错误原因和下一步可见 |
| 保存和回读是两个结果 | 写成功、回读失败显示「已保存，待确认」，冻结旧快照；重试只读，不重复写入，不同时声称保存失败或未保存 | 单次写入计数、回读失败、只 GET 重试、恢复后清除旧警告 |
| 草稿和服务端快照各有所有者 | 轮询、刷新、切换语言不得覆盖 dirty 输入；提交期间相关输入及竞争操作互斥，迟到响应不能覆盖新上下文 | 延迟请求、轮询、重复点击、切换语言、取消/重开；索引进行中不得重复重建 |
| 页签也是可恢复的工作上下文 | URL、同路径链接、刷新、前进/后退与当前页签一致；保留草稿离开保护，只有一个活动面板及 tab stop，方向键/Home/End 可用 | URL 重放、历史导航、未保存切换、键盘和焦点；具名入口真正打开所指工作区 |
| 反馈要归属当前动作 | 测试失败仍刷新持久验证状态；邮件预览使用当前语言和最新配置，错误在弹窗内部，关闭后忽略迟到响应；已保存的非常用时区可读且不被替换 | 行内失败/重试、再次预览、关闭后返回、非常用时区、上游 502/503/504 的准确重试指引 |

不能只把正常状态截图做得更空，再让失败、待确认、权限或暂停状态退回到
不真实的默认值。上述交互被改动时，按影响选对应既有 spec；文档归纳本身不
要求重跑全部历史功能或调用真实 Provider。

### 10. 规则来源与后续修订

| 来源批次 | 本规范中的长期取舍 | 证据入口 |
| --- | --- | --- |
| 首批五页，PR #1313 / `bb92b024` | 首页动态结论、客户访问动作归属、站点状态与冷却例外、插件有界预览、向量错误优先 | [首批实施记录](history/admin/2026/records/admin-information-hierarchy-implementation-2026-10-29.md)，含四类清单与原始验证范围 |
| 观测诊断，PR #1314 / `d1cbf463` | 用量工具条/上下文、质量样本/阶段、审计技术筛选/生效条件、反馈样本限定；保留已经合理的排障和暂停页 | [台账「观测与诊断」](admin-information-hierarchy-implementation-ledger.md#本批观测与诊断)，含逐项迁移与浏览器证据 |
| 前序功能修复，集成基线 PR #1312 / `95100159` | §9 的未知/陈旧/待确认、草稿与并发、导航/键盘、预览及错误归属 | [外部能力修复记录](history/engineering/2026/external-capabilities-fixes-2026-10-29.md)、[运行与服务设置修复记录](history/engineering/2026/runtime-service-settings-fixes-2026-10-29.md)；日期记录保留当时状态 |
| 本批剩余页面 | §8 客户队列、订阅、工单、资源设置、合规、商业读取、成本和登录 | [落实台账](admin-information-hierarchy-implementation-ledger.md#本批客户工单资源设置与商业读取)；源码/本地/截图接受与环境状态分别记录 |
| 通知、身份与共享层级，PR #1370 / `1b0e8f90` | 显式范围/更新时间槽位、呈现与判断分离、名称与原码并存、截图原生平台复核 | [收尾与经验](history/admin/2026/admin-layout-notice-readability-closeout-2026-11-05.md)；含历史问题处置、CI/M4及未完成边界 |
| 表单反馈与新增录入，2026-11-09 | §15 输入错误与真实状态分开、按字段/提交反馈、新增草稿确认后加入、完整提交校验与范围绑定 | [本次台账](admin-information-hierarchy-implementation-ledger.md#表单提示时机与新增账单录入2026-11-09)；本地/mock与M4候选分别记录，不代表合并或人工验收 |

后续 AI 从 `AGENTS.md` → 本规范 §8–9 → 台账目标路由 → 当前源码/页面核对，
再决定是否改动。需改变既有取舍时，说明新的操作者任务、原规则不再适用的
证据、替代入口及验证，更新本规范与台账；不能只以「统一风格」覆盖决定。
涉及表单提示、添加/保存或弹窗录入时，同时核对[§15](#admin-form-feedback-contract)。

上表提供决策来源，不把日期记录升级为当前环境事实，也不把一次截图接受
扩大为全部路由、全部状态、CI、M4 或生产验收。规范仅归纳已有功能与呈现，
不激活冻结的功能、采集、商业或平台扩展。

### 11. 布局选型与较矮 PC 窗口

以下使用现有实现作为参考，不新增组件体系。页面类型相同不代表必须采用
同一版式；先判断是否需要比较、连续填写或处理具体对象，再选择载体。

| 任务与选型条件 | 现有参考 | 排版要求与例外 |
| --- | --- | --- |
| 多对象逐列比较：语义表格 | 客户、服务状态、审计 | 身份、状态、原因及操作各有位置；数字列与表头同向对齐，宽表在表内滚动，不挤碎单位、日期或操作 |
| 每项需要读原因再处理：任务 list | 订阅运营 | 保留独立命名的处理/订阅状态和可见 Inspect/详情；窄 PC 重排字段及按钮，不能为了减少高度改成自动提交或隐藏生效条件 |
| 所选对象的结论和事实：详情页 | 订阅详情、客户详情 | 结论、原因、下一步相邻；事实与结论在内容容得下时并排，空间不足再堆叠。长名必须可读，不能为强行首屏截断限制或错误 |
| 少量稳定设置需要对照当前值和状态：配置表 | 服务设置门户地址、向量配置 | 用已有配置表；同一编辑区的控件和行密度协调，凭据继续由专用组件拥有；状态/失败留在对应配置附近 |
| 多字段连续录入：普通表单 | 服务设置 QQ/SMTP、合规资料 | 标签、输入、反馈和保存区保持阅读顺序；可用宽度足够时双列，长输入及动作组可跨列；不将完整表单强塞进窄表格 |
| 临时核查所选对象：共享 inspector | 订阅检查、审计记录 | 保留对象身份、具名证据和关闭后焦点恢复；不嵌套浮层、不复制详情页写入逻辑；长内容在已有正文区滚动 |

- 在既有 1440×1050 基准之外，列数、工具条或断点变化时，选择适用的较矮
  PC 窗口（如 1440×900、1280×800、900×800），检查实际可操作面积。
  这些尺寸是本批取证范围，不是所有局部修改都必须重跑的新增全量矩阵。
- 工具条可先通过排列、间距和按钮同行减少高度。没有使用证据，不擅自判定
  某个筛选低频；进入「更多筛选」时仍须外显生效条件并保留原提交语义。
- 控件、状态和数据的行高随内容增长，不用固定高度裁掉错误、长名称或待确认。
  日期可按完整起止项换行；数字沿用等宽数字与单位，金额不因排版改变精度或币种。
- 短内容后的留白不是缺陷，不增加卡片填充。仅在独立区域需要边界时保留面板；
  减轻阴影或边框时先在目标页核对明暗状态，不批量覆盖共享 primitive。
- 比较前后截图应等待字体和壳层导航布局稳定，保持同数据、语言、侧栏和窗口。
  壳层导航因可用宽度换行造成的高度差，不能冒报成页面改造收益。
- 本批规范化只调整现有呈现；长名、读取失败、陈旧、dirty、保存失败及待确认
  按影响复用已有浏览器用例验证，结果记入台账，不以正常态截图代替复杂状态。

### 12. 共享呈现与回归检查的维护经验

- 复用 `BackofficePageHeader` 的 `scope` / `freshness` 和现有
  `AdminActionGuidance`、表框、检查器、设置工作台；共享组件只负责呈现，
  页面或既有领域 helper 继续持有判断。来源不同的时间范围不强行共用业务口径，
  已有任务 list、比较表和表单也不强制改成一种卡片。
- 名称/邮箱优先，原始标识、未知事件和错误码保留具名读取入口；展示缓存和
  当前站点资料不参与鉴权、历史归属或通知对象选择。字典查找须检查自有键，
  `constructor`、`__proto__` 等未知值不能被解释成继承属性。
- 文案或入口迁移后同时核对目标 spec、关键路径 spec、静态契约和翻译注册。
  定位应约束对象/区域；关闭的 `details` 用不可见与展开后可见验证，不能要求
  其 DOM 不存在。标题计数变化可兼容数量后缀，但仍保留精确路由、原始 payload、
  请求次数和筛选范围断言。不得靠延长等待或删除断言掩盖未知原因。
- 截图差异先区分布局、平台和访问来源；两平台各用原生 actual，并检查
  actual/diff。基线更新后继续运行完整原失败用例，避免只通过截图却漏掉其后
  的草稿、校验或回读检查。首次失败、定向复验与 CI retry 分开记录；重试成功
  不是偶发根因已修复，也不代表整套首轮全绿。

具体处置和未完成边界见[本轮收尾](history/admin/2026/admin-layout-notice-readability-closeout-2026-11-05.md)。

### 13. 文本去重与表格阅读距离（2026-11-05）

本节由运行诊断、媒体交付、审计摘要及能力验证历史的实际问题补充。
之前只核对「有无关键事实、单一主动作、没有溢出」，仍漏掉了重复说明和过长
阅读距离；通过这些门禁不能再直接记为信息层级通过。

- **先写每区的一句任务结论**：默认视图能分清「发生什么 / 影响和限制 / 下一步」。
  标题已有具体失败原因时，不再堆「当前问题 / 选中问题 / 下一步」等同义前缀。
  静态用途说明只保留一个合适入口；不同事实不能仅因关键词相同而删掉。
- **每张表先声明用途**：`短比较`、`记录目录` 或 `配置编辑`，记入 PR / 台账。
  短比较按内容取宽、列间距稳定；禁止为了填满面板给少量短字段均分整页。
  汇总数字用紧凑 `dl`，分组表已有同口径汇总时用表尾，不再追加一行斜杠数字。
  日期、金额、单位和真实长名称可以需要更宽；列数本身不是判错标准。
- **展开区保持自然高度**：并排趋势/详情中，展开一个区域不能把未展开的相邻
  面板拉成同高空壳；使用内容起始对齐，检查“一侧展开、另一侧关闭”以及完整
  时间序列。长区间明细采用具名、可键盘聚焦的有界滚动区，保留全部记录，
  不以固定行数截断；核对末行可达。不能只用一行数据或双侧同时展开的截图验收。
- **记录目录与配置编辑保留任务所需宽度**：客户、审计流水、订单、站点、模型
  配置等不随短比较机械收窄；保留表内滚动、完整对象及动作。禁止全局覆盖
  `table` 宽度或批量替换 `w-full`。短内容后留白可保留，不加占位文案、卡片或假数据。
- **局部对照必查**：同数据、语言、侧栏和窗口截取修改区前后截图；逐列读一行，
  检查表头到数值能否直接对应、相邻数字是否距离过远、长名是否挤压、是否重复
  同一结论。1440 基准之外，受列宽影响时查一个相关窄 PC 窗口；实际宽窗口
  出现拉空时也查实际宽度。不能仅看缩略总览或以无溢出代替这一步。
- **事实与方法拆开**：当前范围、分母、截断/陈旧/未知、样本局限、暂停和恢复
  未核实常显；公式进入具名方法入口。不得把不同单位相除来制造“失败率”，
  不得把传输完成写成 WordPress 保存/采纳。
- **防回退门禁**：`admin-ui-governance-contract.mjs` 保护本轮具名短表的内容取宽
  和摘要 `dl`；现有页面浏览器用例保护值、范围及宽度。契约只覆盖可机械判断
  的回退，无法证明文案清楚。新增或改变表格用途时，必须更新相应测试、解释
  理由并附实际浏览器截图，不能删除门禁后称“设计优化”。
- **覆盖如实记录**：路由扫描、空态截图、有数据主视图、展开详情、失败状态、
  M4 实际数据、人类验收分别记账；一个正常态不代表整页所有状态已完成。
  有范围外或未观察状态时明确写出；不以更新 golden baseline 消除视觉问题。

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

1. shell-owned observation navigation, followed by the page title, source-specific
   time-window controls and refresh together (2026-11-04 refinement);
2. explicit visible scope/freshness and compact runtime metrics; static page
   explanation may use explicitly selected title help;
3. one wrapping toolbar with `Chart` / `Table` and site/function/plugin dimensions
   next to the working surface; source and active scope remain visible;
4. one dimension table, comparison chart, or paginated plugin history;
5. definitions and technical-validation scope, collapsed by default.

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

### 14. 连续折叠、Tab 与独立配置任务（2026-11-05）

- 多个折叠连续出现时，先按任务和信息归属重新分层；不能把每块折叠机械替换
  成一个 Tab。Tab 应有明确同级关系、共同对象/范围及可预测的切换语义，不能
  将配置表单、只读历史、候选参考和技术合同仅因位置相邻排成同级页签。
- 主配置表保持直接可操作。次要独立配置使用常显状态和已保存值摘要，配合
  对象旁「配置」入口；低频历史、候选和合同分别提供具名详情入口，不再占用
  数条大面积折叠横栏。摘要数字用紧凑 `dl`，不为填满宽度制造配置表。
- 读取失败、未知、模型阻塞、验证失败数、未保存与保存结果待确认属于判断事实，
  不得随详情入口一起隐藏；打开编辑面板后，其反馈必须在面板内可见，关闭后
  仍可从摘要判断并恢复。避免同一工作面重复呈现相同反馈。
- 区分已保存值与草稿。关闭保留草稿时明确标注保留范围，摘要不得把未提交的
  时段/限额当作已生效值；关闭/重开、跳转到关联配置、只读回读均不得丢草稿或
  自动补发写入。沿用现有导航离开保护、未知结果恢复和单次写入约束。
- 复用共享 drawer/工作台，详情打开后保留独立读取与重试，关闭恢复触发入口焦点；
  验证 Escape、Tab、窄 PC 和长名称。不得新增一层「更多」把具名入口重新藏起。
- `/admin/runtime-profiles` 的当前取舍：主目录标题旁「验证记录」→能力验证历史；
  配置目录各用途行以独立的「主模型」「兜底模型」列展示候选，未分配时明确标注；
  保留状态与操作列，不在主模型下重复兜底文字，不再额外复制 Toolbox 候选行。
  「站内媒体识别」常显状态、已保存时段（含时区）、带单位的每日限额及紧邻配置入口，
  页头不重复用途列表的模型名称；模型继承关系及完整候选保留在原配置工作台。
  正常摘要优先单行排列，窄PC按组换行，配置按钮不得单独掉行；异常/草稿另起行，
  不为左右等高或预留反馈制造上下空白；
  页头「技术信息」→托管运行合同详情。候选顺序不等于某次实际调用结果，
  媒体识别仍继承视觉理解候选链，不新增第二份模型选择或恢复暂停任务。
- 候选链编辑中的超时、允许兜底、重试次数使用标题旁「高级设置」文字按钮进入
  紧凑弹窗，不恢复整块带边框的折叠横栏。复用同一工作台切换内容，一次仅有一个
  dialog；返回保留候选、筛选和参数草稿，最终仍由「保存用途」统一提交。
  高级参数修改后在入口标注未保存；非法值、保存待确认和只读恢复不能随参数隐藏。
  Escape先返回候选链并恢复文字按钮焦点，主工作台取消才放弃本用途草稿。
- 供应商图片交付参数及自定义运行时元数据沿用同一规则：连接表内具名文字入口→
  同一个dialog的紧凑视图→返回连接设置→原「保存供应商」统一提交。返回和Escape
  保留草稿、恢复各自入口焦点；高级视图的Enter不得隐式保存。搬走字段后仍须核对
  主保存前校验、公共失败/陈旧提示和已保存验证结果与未保存参数的区分；图片测试
  不得使用未保存设置。截图应包含实际字段（如URL模式的精确域名行），先关闭遮挡
  内容的临时通知，再分别审查高级视图与返回后的主界面。

<a id="admin-form-feedback-contract"></a>

### 15. 表单提示时机与新增记录弹窗（2026-11-09）

来源：操作者反馈「点击添加服务商，尚未填写就提示错误」，以及服务设置、运行配置、
本地账单的定向修复，见[落实台账](admin-information-hierarchy-implementation-ledger.md#表单提示时机与新增账单录入2026-11-09)。
本节约束后续同类维护；不表示所有现有表单均已改造或经过人工验收。

**先区分输入是否有效、何时显示错误、是否允许写入。** 三者不能由同一个布尔值代替。
空草稿可以暂不显示错误，但提交前仍必须完整校验；服务器已确认的异常不能因此消失。

#### 提示归属与时机

| 情况 | 呈现与操作 |
| --- | --- |
| 首次打开新增弹窗，或尚未触碰的字段 | 显示标签、单位与必要说明，不把默认空输入显示成操作失败 |
| 正在清空、重填 URL、金额、超时等字段 | 暂缓当前字段的输入错误；离开该字段后再反馈，不因另一字段离开就报出整组必填错误 |
| 点击保存、确认添加，或触发对应提交 | 校验该动作提交的完整草稿，含收起的高级字段；无效时在当前工作区说明原因，不发写请求 |
| 已保存配置缺失、依赖未就绪、模型未验证 | 保留当前状态、阻塞原因和下一步；不能等待用户填写或保存后才显示 |
| 接口失败、陈旧读取、保存结果待确认 | 按原恢复契约显示、冻结或只读恢复；不得随着输入错误清空或弹窗关闭而丢失 |

- 字段应有稳定身份，记录对应字段的交互状态；不能用「表单任意位置被点过」代替。
  聚焦本身不代表填错；空字段离开后出现错误，是正常校验，需要与首次打开区别验证。
- 改正字段后不保留过期的前端错误；服务端失败及未知写结果仍由其原状态所有者管理。
  语言切换、只读恢复不得顺带清空草稿；切换对象、恢复已保存值和成功读回按原契约
  重置交互校验，不能将上一对象的错误带入新对象。
- 若保存按钮允许无效草稿点击以解释原因，必须逐一检查所有提交处理器均有校验守卫。
  `disabled` 和浏览器原生约束不能作为唯一保护，尤其是弹窗提交、Enter 和隐藏高级字段。
  前端提示调整不削弱原有后端校验；重复提交与未知写冻结仍遵循原合同。
- 启用`noValidate`或迁移原生校验时，同时核对原有必填、数值范围及服务端精度约束，
  不能只迁移错误文案而遗漏上下限。折叠字段也在提交前检查；合法零值与空字符串
  分别验证，数值转换前先判断是否填写。
- 不把所有保存按钮统一改成可点击或禁用：未加载、权限不足、提交中、保存待确认等
  真实阻塞继续冻结。保留禁用式输入校验的入口，须在适当时机给出可见原因。

#### 什么时候用弹窗

| 操作者任务 | 载体与确认语义 |
| --- | --- |
| 新增一个需要连续填写多个字段的对象 | 优先使用共享工作台弹窗，独立保留新增草稿；确认有效后才加入列表，取消、关闭和 Escape 不插入空记录 |
| 调整列表里现有对象的少量、需对照的字段 | 可以保留行内编辑，不为形式统一增加弹窗层级 |
| 编辑主任务的次要高级参数 | 复用已有工作台的高级视图；返回保留同一草稿，由原主动作统一提交，不嵌套第二个弹窗 |
| 填写一个长期配置组 | 可保留页面表单；不能因为字段多就机械搬进弹窗，或隐藏已保存异常 |

- 说明确认到底是「加入页面草稿」「仅保存在当前浏览器」还是「保存到服务器」。
  新增服务商预算确认后仍需页面保存；本地账单确认后写入当前月的本地存储，均不能
  表述成已修改厂商账户或完成真实扣费。
- 弹窗草稿绑定当前对象、月份等范围；范围改变时按明确契约关闭、丢弃或保护草稿，
  不得把旧月账单加入新月，也不能将前一对象的输入提交给后一对象。
- 保留已合法的零值及可选项：空金额不等于零金额，可选服务族未选不等于表单无效。
  不因整理交互而收紧业务规则，或把 `Number('')` 得到的零误当成已填写。
- 取消新增与关闭编辑可以有不同语义：前者放弃未确认的新对象，后者按既有合同保留
  草稿。关闭后仍须保留适用的异常、待确认和草稿恢复入口；底部说明与实际行为一致。
- 复用共享弹窗的焦点管理、Tab 和 Escape；错误应留在当前可见任务区，不在遮罩后方。

#### 文案要说明数据来源与用途

字段名、金额单位、保存范围和确认后果应直接可读。规则较复杂时，先给可执行步骤和
一个日常金额示例，再提供具名说明入口；不要只把内部字段翻译成中文。

估算金额尤其要区分内部参考价格、预算占用与厂商账单。没有厂商账单连接就只能称
估算；后台字段叫 `actual_cost_usd` 也不构成真实扣费证据。预算算法与周期的唯一说明
仍见[服务商预算实现说明](provider-account-spend-budget-implementation-v1.md#操作者说明ai-调用估算预算)，
不在此复制计算合同，也不新增账单同步能力。

#### 定向验收与防回退

1. 先沿真实动作检查状态变化与写入位置：点击添加是否先插空行，输入变化是否直接
   触发整组错误，校验是否只依赖保存按钮禁用。已有合理弹窗和提交校验的入口保留。
2. 覆盖首次打开无输入错误、编辑暂缓、字段离开、无效提交零写入、有效确认、取消
   无空记录、重开重置、重复对象、合法零值与可选项；按影响补查月份/对象切换。
3. 保留准确 payload、单次写入、失败草稿、未知结果只读恢复和原本地数据不上传约束。
   不用真实付费调用制造测试数据；弹窗读写验证与生产操作授权分别处理。
4. 浏览器用例必须真正执行所断言的动作：验证离开反馈先移开焦点；验证未触碰字段
   不应先聚焦又离开该字段。静态契约验证行为边界，不锁死无关代码字面顺序。
5. 核看实际改动区域及相关 PC 宽度。截图失败先保留 actual/diff 并判断范围，不以
   更新 golden 或提高容差代替审查；使用 `--ignore-snapshots` 的通过只计作功能回归。
6. 本地/mock、M4 候选、CI、合并、M4 accepted、生产和人工验收分别记账；用户已授权
   自动同步 M4 时，在完整修改与定向验证通过的检查点执行，不引入逐次保存监听器。
   同步流程仍由[M4 开发规范](m4-preview-ai-development-standard-v1.md)约束，文档补充
   不单独触发运行时重建。
