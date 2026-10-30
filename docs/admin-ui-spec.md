# Admin Quiet 队列契约索引

Status: current contract index; #1292（壳层 workspace tab + 账号 Quiet）已合入；
2026-10-30 操作者授权统一 Quiet 队列布局规矩（§2.2），后续 UI 按建议顺序实现。

2026-10-30 对账基线：`92a736d236bb94c53c7bbbbfedbbad2d2c439a2a`（含 #1292 `57bf8827`）。
本文补齐旧 #1215 的文档入口，记录已合入的路由契约与旧提案处置；
不将未经确认的 161 行 draft 整体升级为实现要求，不新增产品范围。

## 1. 权威分工

- [UI Standard](cloud-admin-ui-standard-v1.md)：共享表面、工具条、摘要、行操作与密度。
- [IA v2](cloud-admin-information-architecture-v2.md)：主导航、workspace tab、面包屑及页面模型。
- [Customer Operations Workspace](cloud-admin-customer-operations-workspace-standard-v1.md)：客户、订阅、Coverage 路由边界与排序所有权。
- [Review and Delivery Playbook](cloud-admin-ui-review-and-delivery-playbook-v1.md)：视觉审查、风险分级与 preview/closeout。
- [Frontend Engineering Standard](cloud-admin-frontend-engineering-standard-v1.md)：状态、请求、组件与测试职责。

本文是入口；具体行为由下列路由契约约束。产品所有权、安全、审计与无障碍
边界优先于视觉偏好；更新实现时同步核对契约，勿另造一套 Quiet 状态或分页器。

## 2. 当前路由契约

| 路由及契约 | 分页 | 搜索与操作 |
| --- | --- | --- |
| [Support](../frontend/tests/unit/admin-support-requests-queue-v2-contract.mjs) | 固定 10；不读取 URL `limit` | 单一互斥 view-pills；显式 Apply（Enter 提交表单）；Inspect 为可见行操作 |
| [Accounts](../frontend/tests/unit/admin-accounts-queue-v2-contract.mjs) | 固定 10；不读取 URL `limit` | Quiet 样板：客户总数并入标题，边界说明收进标题帮助；搜索/状态/排序宽屏同行、窄屏换行；账户状态与登录身份分列；目录保留站点数，订阅数留在详情；详情为文字链接；搜索 250ms debounce + Enter；大蓝「搜索」降为 sr-only；清除筛选用文字链；表框标题与页标题同义时 `headerVisibility="sr-only"`；不承接服务风险队列职责 |
| [Subscriptions](../frontend/tests/unit/admin-subscriptions-queue-v2-contract.mjs) | 固定 10；不读取 URL `limit` | Quiet（对齐账号 §2.2）：响应式任务 list；独立命名风险/生命周期 pills、drawer 与 URL focus；总数并入标题；摘要仅 Critical/Warning；搜索/套餐/到期 250ms debounce + Enter；大蓝 Apply 降为 sr-only；清除筛选用文字链；嵌套队列标题 sr-only；不丢掉风险/生命周期 URL/focus/drawer 所有权 |
| [Coverage](../frontend/tests/unit/admin-coverage-workspace-contract.mjs) | 默认 10；保留 URL `limit` 的 `1..500`（队列里唯一 URL limit 例外） | 保留状态 pills、250ms 搜索 debounce 与服务端排序/分页；分页展示与共享 `ListPagination` 对齐见 §2.2 |
| [Audit](../frontend/tests/unit/admin-audit-workspace-contract.mjs) | 固定 10；不读取 URL `limit` | 只读 diagnostic 证据；11 个 URL 筛选与语义表同一工作区，显式 Apply；范围来自成功响应，深页恢复遵循服务端 `last_offset`；非 Quiet 客户队列主战场 |

Support、Accounts、Subscriptions 及 Audit 的固定页大小忽略 URL `limit`，不承诺页大小覆盖；Coverage 保留已有
有界参数。Subscriptions 按操作任务使用 list，不为统一名称强制改成 table。
URL 筛选、offset、focus、返回上下文及请求失败后的展示范围均按各路由契约保留。

保留旧稿有用的不变量，并继续由上列权威与契约维护：

- Admin 保持宽桌面工作区；顶栏不重复面包屑，详情保留自身返回上下文，不复制 Portal 56rem 壳层、IA、组件套件或聊天形态。
- 工具条位于主工作表面上方；一个页面标题，事实摘要帮助判断当前处理对象，避免装饰指标墙。
- 可见范围/总数如实对应已加载结果；单页/空页策略与共享分页器边界按 §2.2 与路由契约统一，不另造分页器。
- 服务端先做全局筛选/排序再分页；浏览器不得对单页重排冒充全局风险顺序。
- drawer、键盘导航、焦点恢复与等待对象等既有操作契约不得因密度调整回退。
- Portal 未发送的草稿附件与 Admin 隔离；队列展示不改变附件 API 或 WordPress 最终写入权。

## 2.1 壳层二级导航（2026-10-26 操作者授权）

- 移除顶栏「运营工作台 / 当前栏目」重复定位文字，保留可折叠侧栏按钮和各详情页自己的返回操作。
- 客户、商业记录、外部能力、服务设置、观测、诊断六组二级导航由壳层同一组件承载，内容区不再重复渲染隐藏菜单。
- 按内容区整体中心对齐，不随左侧按钮和右侧工具宽度偏移。空间足够时放顶栏首行；不足时整组在顶栏下一行居中，依据实际菜单与工具宽度判断，不硬编码设备断点。
- 保留每组原有路由、唯一选中项和观测/诊断跳转时的有效时间窗与站点上下文；观测页时间筛选继续由页面拥有。
- 商业记录 Tab 组下必须挂一条安静的 Phase 1 freeze note（文案键 `admin.commercial_freeze_hint`；IA v2 要求）。壳层承接二级导航后，该说明由壳层商业 Tab 组渲染，不得因 tab 上移而失踪。
- 本规则针对 PC；不扩展到 Portal 导航，不恢复已暂停入口。

## 2.2 Quiet 队列布局统一（2026-10-30 操作者授权）

账号目录（#1292）为客户队列 Quiet 样板。下列规矩约束后续实现；**本文件合入本身不交付 UI**，只授权下一轮按顺序改订阅 → 覆盖 → 标题去重 / freeze note；工单若再收 Apply/Inspect/双列徽章，须另开操作者授权（仍不默认采纳旧 #1223）。

### MUST

1. **一页一个主标题**：壳层 Tab、`BackofficePageHeader` h1、表框/`AdminDataTableFrame` 标题不得同义三层叠读。嵌套面板标题与页标题同义时，表框用 `headerVisibility="sr-only"`（账号样板），或等价只保留一处可见主标题。
2. **摘要帮助判断对象**：客户队列默认摘要 ≤2 个行动向指标，或把总数并入标题（账号）；禁止与顶栏胶囊语义叠床架屋的装饰指标墙。
3. **筛选工具条 Quiet 默认（客户队列）**：状态/视图胶囊即时生效；搜索约 250ms debounce + Enter；在胶囊与 debounce 已覆盖时，大蓝「搜索」/Apply 降为 sr-only 或不渲染；**清除筛选统一为文字链**（账号），不采用图标钮与 secondary 按钮混用。
4. **分页展示统一**：共享 `ListPagination` 与覆盖自建底栏须同一策略——单页仍显示「起止 / 共 N」（Quiet「单页也显示范围」），或覆盖改回共享组件并让共享组件满足该展示。URL `limit` 仅 Coverage 保留 `1..500`；其它客户队列固定 10、忽略 URL `limit`。
5. **商业 freeze note**：见 §2.1；实现须挂到壳层商业 Tab 组。
6. **密度**：客户队列表壳头可采用 compact，与观测/诊断 compact 面在同 workspace 内视觉连贯；账号 Quiet 为队列参考。配置长页（`ai-resources` / `service-settings` / `runtime-profiles` 等）仍属 configuration 模型，不在本轮 Quiet 队列主战场。

### MUST NOT

- 不复制 Portal 窄壳、聊天详情、Portal 组件套件；不拆掉 Admin 宽桌工具条。
- 不因本轮 Quiet 重开旧 #1223 对 **support-requests** 的双组胶囊 / hover-only Inspect / 弱化 status 组合；Support 互斥 view、显式 Apply、可见 Inspect 仍按已合入契约，除非操作者另授。
- 不引入跨路由统一 URL page-size override（旧 #1215 提案仍不采纳）。

### MAY / 实现顺序

1. 以账号为样板收 **subscriptions**（摘要、工具条、清除筛选）。
2. 收 **coverage**（工具条已较克制；重点统一分页与清除筛选）。
3. 队列表框标题去重；可选队列页 compact `PageHeader`。
4. 壳层商业 Tab 补 freeze note（改动小、IA 缺口）。
5. 观测站点筛可学账号 debounce；Overview 多面板仪表盘收敛放后（P2）。

## 3. 旧提案与后续实现

Support 由 #1235/#1237、Accounts 由 #1239、Subscriptions 由 #1240、Coverage
由 #1242 承接。它们是后续实现，不代表旧 #1218/#1219/#1221/#1222/#1223
的 exact heads 原样合入，或每项旧视觉提案均已实现。壳层 tab + 账号 Quiet 已由 #1292 合入。

本轮保持当前已合入契约：不采纳旧 #1215 的跨路由统一 URL page-size override；
不采纳旧 #1223 对 **support-requests** 的独立 attention/status 双组、hover-only Inspect
及弱化 status 的组合改版。Support 互斥 view / 显式 Apply / 可见 Inspect 仍按已合入契约。

**已合入授权（Accounts + 壳层，#1292）**：账号目录允许总数并入标题、筛选区响应式同行、明确账户/登录状态、未命名客户回退、窄操作列与文字详情链、边界说明收进标题帮助、搜索 debounce+Enter、
降级蓝「搜索」、清除筛选用文字链、表框同义标题 sr-only；workspace tab 允许上移顶栏（见 §2.1）。

**本会话新增授权（§2.2）**：允许下一轮 UI 按 §2.2 实现顺序改订阅、覆盖、标题去重与商业 freeze note；不因此重开 support #1223 全量视觉提案，也不冒称旧 closed PR heads 已合入。
本文档 PR 合入只更新契约，不交付 frontend；UI 变更须硬刷自检对照 Spec 后再请操作者点头合入。

旧 #1215 的逐批点头流程不替代操作者当前授权；是否可自动合入按会话有效授权
及现行 review/CI 规则执行。

## 4. 证据与后续验收

按 [M4 标准](m4-preview-ai-development-standard-v1.md) 核对源码、编译产物、
`source_revision` 与运行身份；bind-mount/同步成功不能单独证明镜像或生产已对齐。
local、CI、M4 candidate、merged、M4 accepted、production、human evidence 分别报告。

历史 Admin Quiet 审计的 130-test 选集记录为 125 PASS / 5 截图 FAIL；
没有同基线比较时不能认定为旧基线问题或候选回归。后续 15-spec/121-test
选集范围不同，不能据此抹掉五项失败或拼成全量 green。它们仍需在对应范围核实，
不得借文档结案自动更新截图、放宽断言或跳过用例。

完整 master 重扫继续按 [Phase 2–3 follow-on](engineering/phase-2-3-follow-on-v1.md)
单独验收；合入、CI 或 M4 通过均不等于生产部署或真实使用验收完成。
