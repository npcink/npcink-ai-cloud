# Portal 移除站点弹窗版式 — 2026-11-12

> 后继工程状态：本项已随 [PR #1429](https://github.com/npcink/npcink-ai-cloud/pull/1429) 合并并完成 M4 接受。
> 下文保留当时的本地候选、失败及待办记录；[最终状态补记](confirmation-feedback-closeout-2026-11-12.md#最终状态补记--2026-11-12)分别说明 CI、M4、评审限制、清理及生产/人工状态。

## Scope / Boundary

`development` lane，本地候选；仅 `/portal` 和 `/portal/sites/[siteId]` 的移除确认。
基线为本机 `origin/master`：`dc72f1e766ed52204db136c8b3d9a79cebd6aaf5`。
GitHub fetch 连接超时，未确认当前远端 revision；本轮未发布 PR、合并或部署。

工作区 `/Users/muze/.codex/worktrees/site-removal-dialog/npcink-ai-cloud`，
分支 `codex/site-removal-dialog`，锁 `codex:site-removal-dialog`，HEAD 仍为上述基线，
任务变更未提交，由本会话保留；人工验收与后续发布完成前不释放工作区。

用户认可截图评审的“对象 → 影响 → 操作”方向。本轮是该方向的实现，
不把方向认可算作新版浏览器截图的人工接受。保留原站点权限、API、请求参数、
冷却计算、跨账户禁用状态、Free 归属、忙时互斥与刷新失败恢复。
不进行真实站点移除、模型调用、交易、WordPress 写入或主机变更。

## 内容分配与既有取舍

前序 [站点弹窗复查](portal-site-dialog-clarity-2026-11-10.md) 要求站点身份和
后果常显。本次保留该取舍，将长篇 header description 拆成正文列表。
页面模型是单对象危险操作确认；没有新增表格、TAB、drawer 或嵌套卡片。

| 分类 | 处置和入口 |
| --- | --- |
| 常显 | 确认标题、“站点”小标题、名称、完整 URL/缺失提示、“移除后会发生”及五条影响、当前账户重连、跨账户冷却/关闭/时间未知、Free 归属、取消与移除、错误 |
| 按需 | 原站点更多操作菜单仍是弹窗入口；判断事实不移入 hover 或 disclosure |
| 技术证据 | 原站点详情、密钥、用量和审计入口不变；日期追加浏览器本地 GMT 偏移，不固定假称北京时间 |
| 删除重复 | 删除长段首句反问及“准备从当前账户移除的站点”句式，分别由确认标题和“站点”小标题承接；不删除影响事实 |

两个入口复用窄业务展示组件 `PortalSiteRemovalSummary`，保留共享 Modal 原实现，
使用已有 `size="xl"`（576px），正文 14px、名称 16px。没有改变全局 token 或 Modal。
日期仍为现有策略请求时计算的预计值；移除成功通知仍使用后端返回的权威时间。

## Verification

本地通过：类型检查、五个受影响 TS/TSX 文件的定向 ESLint（含既有 e2e 文件）、
`portal-sites-remove-contract`、`modal-keyboard-accessibility-contract`、
i18n 完整性（1990 keys）、`test:copy-surface`、`git diff --check`。

既有浏览器回归 2/2 通过（7.5s）：`confirmed site remove keeps success when
session refresh fails`、`confirmed site remove-from-detail keeps success when
session refresh fails`。保留单次 POST 与只重试 GET 断言；调整过期对象标签断言，
新增小标题/影响列表断言，并将首页移除纳入 Escape/焦点返回覆盖。

浏览器源来自本工作区 dirty candidate 的 Next webpack dev，
`http://127.0.0.1:3312`。数据及写入均由浏览器夹具模拟；不代表真实后端授权或移除。
PC 1440×1050、1056×1050；中英与暗色按实际影响检查。

证据路径（独立保存，不随工作区清理）：
`/Users/muze/.codex/visualizations/2026/11/12/01a1ce87-a69f-7141-bc38-3ae45baa432c/site-removal-dialog/`。
`preview.png` 为使用模拟 Npcink 名称和 URL 的真实本地弹窗截图，日期为模拟策略估算。
`zh-1440.png`、`zh-1056.png`、`disabled-1056.png`、`unknown-1056.png`、
`long-1056.png`、`en-1056.png`、`dark-1056.png`、`error-1056.png` 保留各场景。
`verify.log` 和 `final-preview.log` 为定向浏览器结果。

| 规则 | 结果 | 证据/限制 |
| --- | --- | --- |
| 页面模型匹配 | pass | 单对象确认，站点和后果常显 |
| PC viewport | pass | 1440×1050、1056×1050 |
| 无意外横向溢出 | pass | 正常/禁用/未知 576×438；长名长 URL 576×558，均在视口内 |
| 主标题唯一 | pass | 弹窗单一 h2，两个 h3 各标注内容职责 |
| 首屏工作面 | pass | 对象、全部影响与按钮同屏 |
| 单一主操作 | pass | 仅移除为危险实心按钮 |
| 状态不只靠颜色 | pass | 禁用、时间未知和移除失败均有文字 |
| 对象与操作相邻 | pass | 身份与移除按钮在同一弹窗 |
| 焦点/disabled 可辨识 | pass | 原 Modal/按钮样式保留；真实键盘焦点循环及失败恢复检查 |
| Tab/Escape/焦点返回 | pass | 首页移除 Tab/Shift+Tab 循环，Escape 返回更多菜单；既有两入口提交回归通过 |
| 失败/重试/上下文 | pass | 失败提示在框内，按钮恢复，取消重开清除旧错误；成功后刷新失败保留成功 |
| Console/network | pass | 完成夹具修正后的定向状态检查 pageErrors=[]；仅主动注入的策略 503/移除 503，未发现无法解释的失败 |

初次检查不计为通过的情况：夹具成功响应漏 envelope 元数据，导致策略按原逻辑显示
时间未知；补齐夹具后禁用分支通过。紧接打开即检查键盘时，Modal 的首次 RAF 聚焦
覆盖测试的 Shift+Tab；等待两个 animation frame 后循环通过，未改产品焦点逻辑。
启动浏览器时曾出现一条未复现的 Invalid or unexpected token，且基础夹具缺少
customer-journey/events 产生 404；补齐夹具后的定向状态检查无新 pageerror。
保留这些观察，不声称整个开发浏览器会话从未出现错误。

本次未修改生产、服务逻辑或共享 primitive，不跑全后台矩阵、模型或真实交易；
未以更新截图基线替代人工验收。M4 candidate / M4 accepted / CI / merged /
production 均未运行；新版人工视觉接受为 review_required。

## Review / Risk / Rollback

按 correctness/readability/architecture/security/performance 自审：两个消费者完整使用
同一影响展示；三个策略分支保留，日期加实际 GMT 偏移；站点名/URL 为 React 文本；
无新依赖/网络请求、无业务写入或权限变更。未发现阻塞性问题。

剩余限制：仅本地模拟证据；远端最新基线未确认。后续合并前须更新基线、走要求的 CI，
需要环境验收时另做候选验证。回滚只需恢复本次前端/翻译/定向 e2e 变更并删除新增
展示组件，无数据库迁移。
