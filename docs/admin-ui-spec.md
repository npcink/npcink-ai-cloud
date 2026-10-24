# Admin Quiet 队列契约索引

Status: current contract index; no new UI mandate.

2026-10-25 对账基线：`3b920f25025b165ac387595ec34309d7f0cac2f4`。
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
| [Accounts](../frontend/tests/unit/admin-accounts-queue-v2-contract.mjs) | 固定 10；不读取 URL `limit` | 客户目录筛选及返回上下文按本路由契约；不承接服务风险队列职责 |
| [Subscriptions](../frontend/tests/unit/admin-subscriptions-queue-v2-contract.mjs) | 固定 10；不读取 URL `limit` | 响应式任务 list；独立命名的风险/生命周期等筛选、drawer 与 URL focus |
| [Coverage](../frontend/tests/unit/admin-coverage-workspace-contract.mjs) | 默认 10；保留 URL `limit` 的 `1..500` | 保留状态 pills、250ms 搜索 debounce 与服务端排序/分页 |

三个固定页大小的队列忽略 URL `limit`，不承诺页大小覆盖；Coverage 保留已有
有界参数。Subscriptions 按操作任务使用 list，不为统一名称强制改成 table。
URL 筛选、offset、focus、返回上下文及请求失败后的展示范围均按各路由契约保留。

保留旧稿有用的不变量，并继续由上列权威与契约维护：

- Admin 保持宽桌面工作区与面包屑，不复制 Portal 56rem 壳层、IA、组件套件或聊天形态。
- 工具条位于主工作表面上方；一个页面标题，事实摘要帮助判断当前处理对象，避免装饰指标墙。
- 可见范围/总数如实对应已加载结果；单页/空页策略与共享分页器边界按路由实现，不复制分页器。
- 服务端先做全局筛选/排序再分页；浏览器不得对单页重排冒充全局风险顺序。
- drawer、键盘导航、焦点恢复与等待对象等既有操作契约不得因密度调整回退。
- Portal 未发送的草稿附件与 Admin 隔离；队列展示不改变附件 API 或 WordPress 最终写入权。

## 3. 旧提案与后续实现

Support 由 #1235/#1237、Accounts 由 #1239、Subscriptions 由 #1240、Coverage
由 #1242 承接。它们是后续实现，不代表旧 #1218/#1219/#1221/#1222/#1223
的 exact heads 原样合入，或每项旧视觉提案均已实现。

本轮保持当前已合入契约：不采纳旧 #1215 的跨路由统一 URL page-size override；
不采纳旧 #1223 的独立 attention/status 双组、自动 debounce/Enter immediate、
移除 Apply、hover-only Inspect 及弱化 status 的组合改版。
当前互斥 view 保持队列语义，显式 Apply 保持请求提交边界，可见 Inspect 和 status
保留操作可发现性与状态可读性。没有当前使用证据要求再次更换这套操作模型；
这些旧提案不作为本轮未交付功能重开，也不冒称已实现。

旧 #1215 的逐批点头流程不替代操作者当前授权；是否可自动合入按会话有效授权
及现行 review/CI 规则执行。本文合入不授权任何新的 UI、共享组件或生产改动。

## 4. 证据与后续验收

按 [M4 标准](m4-preview-ai-development-standard-v1.md) 核对源码、编译产物、
`source_revision` 与运行身份；bind-mount/同步成功不能单独证明镜像或生产已对齐。
local、CI、M4 candidate、merged、M4 accepted、production、human evidence 分别报告。

历史 Admin Quiet 审计的 130-test 选集记录为 125 PASS / 5 截图 FAIL；
没有同基线比较时不能认定为旧基线问题或候选回归。后续 15-spec/121-test
选集范围不同，不能据此抹掉五项失败或拼成全量 green。它们仍需在对应范围核实，
不得借文档结案自动更新截图、放宽阈值或跳过用例。

完整 master 重扫继续按 [Phase 2–3 follow-on](engineering/phase-2-3-follow-on-v1.md)
单独验收；合入、CI 或 M4 通过均不等于生产部署或真实使用验收完成。
