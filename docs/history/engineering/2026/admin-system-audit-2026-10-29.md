# Admin 系统性检查与问题清单 — 2026-10-29

状态：只读审查与隔离异常复现完成，记录 13 项问题；本轮只修改文档，尚未实施下表业务修复。前序修复和本轮新问题分开记录，不把已有回归通过当成全后台无问题。

配套：[前序经验复盘](admin-audit-lessons-2026-10-29.md)。所有优先级表示后台使用/正确性修复顺序，不是生产安全漏洞定级。

## 当前版本、方法与覆盖

- 本地分支 `codex/observation-evidence-fixes-20261029`；本轮开始于文档提交 `e3800f44`，经验复盘先保存为 `ae9df50c2ad6311f2189e547b13d21ee3a649239`。业务源码仍是前序最终修复版本。
- 开工及收尾 M4 状态一致：backend source_revision 与 frontend_source_revision 均为 `4a677b13d45e946c2e3fb42511e86d3222e8f73c`、source_dirty=false、acceptance_state=candidate。没有执行同步、主机修改或生产操作。
- 真实已认证浏览器读取 27 个页面/视图：22 个目录或模块页，编辑质量视图，以及客户、订阅、工单、站点四类详情各抽取一条现有记录。不是每一条数据、所有筛选或所有管理动作的穷举。
- PC 主基准 1440×1050；另检查 12 个代表页面的 900×1050 窄窗口。该矩阵未发现整页横向溢出。查看首页和快速跳转的深色截图；不是全后台明暗全组合验收。
- 正常读取走真实 M4；错误、延迟写入、保存/发布成功后读取失败使用单独浏览器页的隔离响应。隔离页拦截所有 API 写请求，针对场景返回 Mock 成功或失败，不透传真实写入。真实浏览页写请求监听为空。
- 没有实际保存共享配置、发布公开合规资料、调整套餐/积分、发送邮件、支付交易、模型验证或付费 Provider 调用。

| 区域 | 已读取的页面/视图 | 本轮结论边界 |
| --- | --- | --- |
| 概览与共享壳层 | `/admin`、主导航、快速跳转、主题 | 实测首页读取、入口、嵌套弹窗及失败提示 |
| 客户与支持 | accounts、support-requests 目录，各一条详情及一条 site 详情 | 正常只读路径可用；没有操作真实客户 |
| 商业记录 | coverage、subscriptions、plans、credit-packs、economics，一条 subscription 详情 | 正常读取及跨页面链接；部分配置异常通过 Mock 验证 |
| 运行与观测 | usage-statistics（含 quality）、plugin/media/vector-observability、troubleshooting、audit、agent-feedback | 插件观测实际 500；其余首轮读取未遇到同类失败，不等于全行为通过 |
| 外部能力与设置 | ai-resources、external-services、vector-settings、runtime-profiles、service-settings、site-compliance | 读取与代表交互；新增草稿/回读问题见下表 |
| 暂停入口 | ai-advisor 直接访问 | 仍显示暂停页面，未触发新分析 |

## 问题清单

证据类型：**M4 实测**为真实候选读取/界面行为；**隔离复现**为同一候选前端配合 Mock API；**代码核对**用于解释行为和界定影响。下表未核实生产环境，不能据此宣称生产故障或已发生客户数据损失。

| 编号 / 优先级 | 范围、触发与观察 | 影响与建议 | 证据 |
| --- | --- | --- | --- |
| A01 / P1 | 插件观测默认 24h 与 336h 请求均返回 HTTP 500，响应为 `Internal Server Error`；页面进入读取失败态 | 当前候选的整页插件观测不可用。先定位 PostgreSQL 查询错误，补实际数据库方言验证，再恢复页面；不要只增加前端重试 | M4 实测重复出现；脱敏 API 日志为 `exception_type=ProgrammingError`；可疑 SQL 见下文，根因尚待确认 |
| A02 / P1 | 首页先成功读取，切换语言触发第二次 GET；第二次 503 后继续显示旧“运营就绪”，无失败、陈旧或重试提示 | 旧结论会被当成当前健康状态。刷新失败保留快照时必须标记陈旧和时间，并提供有界重试；加载身份不应随翻译变化 | 隔离复现：旧 ready 保留、失败提示 false、重试按钮 0；`admin/page.tsx:404`、`:451` |
| A03 / P1 | 积分包或套餐编辑弹窗打开时，将焦点放到非输入控件并按 Cmd/Ctrl+K，可叠加全局快速跳转；再按一次 Esc，两层同时关闭 | 本想关闭搜索却丢弃底层未保存草稿，焦点陷阱也竞争。应只由最上层弹窗处理 Esc/Tab，或编辑期间禁止打开全局跳转；补跨消费者回归 | 隔离页复现：dialog 数 2→0；积分包重新打开后修改丢失；套餐也复现 2→0；`admin/layout.tsx:178`、AdminWorkbenchDialog、useDialogKeyboard |
| A04 / P1 | 网站合规资料编辑主体字段后，使用语言切换器从中文切到英文，字段立即恢复服务端值 | 未保存草稿静默丢失。将数据加载回调与翻译函数分离，语言切换仅更新呈现，并验证整个草稿 | 隔离复现；`site-compliance/page.tsx:201`、`:213`、`:242` |
| A05 / P1 | 合规资料保存请求在途时，表单输入仍可编辑；请求完成后 `setPayload(saved)` 覆盖期间的新输入 | 操作者以为新输入也已保存，实际只保留提交时快照。锁定相关输入/导航，或保留提交版本之后的编辑；增加防重入与延迟响应回归 | 隔离复现：提交 AUDIT_SUBMITTED，在途输入另一值，回执后恢复前者；`:355`、`:381` |
| A06 / P1 | 积分包保存时，仅关闭/保存按钮禁用，包名、价格等输入仍可改；成功后直接关闭编辑器 | 在途新输入丢失。冻结已提交草稿及全部相关控件，保存成功后只处理对应草稿版本 | 隔离复现：在途输入 enabled=true，重新打开仅保留提交值；`credit-packs/page.tsx:180`、`:190`、`:377` |
| A07 / P1 | 合规发布或套餐保存成功，后续 GET 失败，旧版本/旧表单继续展示，发布或保存按钮重新可用 | 只用“成功+加载失败”不足以表达当前状态未知，可能诱导再次发布/保存。保留写成功回执，标记待确认并冻结旧快照，重试只读；订阅快照重建同类代码需定向补验 | 合规与套餐隔离复现；合规旧公开版本仍为 `—`、发布按钮 enabled=true；套餐成功提示和读取错误同时可见、保存 enabled=true；site-compliance `:396`、PlanManagementWorkbench `:302`、`:332` |
| A08 / P1 | 通过站内 Link 进入合规资料/服务设置，修改未保存，再按浏览器后退，直接离开页面，无应用确认或浏览器确认 | 当前保护只覆盖锚点点击和整页 beforeunload，遗漏客户端历史导航；前序修复仍有这个缺口。统一覆盖 Next 客户端历史导航，保留取消及继续行为，不只靠全局 click 监听 | 两页隔离复现，historyLeftDirtyPage=true、prompt=false、dialog=0；site-compliance `:252`、service-settings `:1115` 附近 |
| A09 / P1 | 积分包目录读取成功后刷新 503，虽显示旧目录说明，“编辑”仍可用；保存提交的是整个旧 `items` 数组 | 若目录已被另一操作者更新，编辑一项可能带旧值覆盖其他项。先在快照未确认时禁写；再评估按项更新或版本冲突检测，避免直接扩展交易功能 | 隔离复现编辑可用；前端 `saveCatalog` 仅传 `{items}`；后端 `_payment_mixin.py:110` 起整体替换 `config_json.items`，没有 expected-version 比较。未执行真实覆盖 |
| A10 / P2 | 首页有效 envelope 的 data 缺少 counts/recent_usage 时，四项摘要归零；就绪状态虽然提示未知，数字仍像真实空数据 | 部分无效响应可被误判为空平台。校验必需读模型，或按字段显示未知；不能以 `Number(missing ?? 0)` 代替缺失状态 | 隔离复现四个 0；`admin/page.tsx:133` |
| A11 / P2 | 首页“7 天内到期”待办的“去处理”只进入 `/admin/coverage`，没有到期窗口或具体问题筛选；运行类待办也只按大类跳转 | 处理上下文丢失，需要在目标队列重新查找。链接应带目标页面已支持的筛选/定位；当前不支持时准确称“打开服务状态”，避免承诺对应队列 | M4 实测当前到期待办链接；`overviewActionHref` `:355`、调用处 `:868` |
| A12 / P2 | 套餐目录显示 Free“2 个活跃订阅”，点击后 URL 仅有 plan_id，订阅页自动附加 `risk=needs_action`，实际 total=1 | 展示计数与下钻范围不一致。传递 `risk=all&status=active` 等与计数一致的筛选，并保留 plan_id；用相同后端口径核对 | M4 实测 count 2→total 1；`plans/page.tsx:507`、subscriptions requestKey |
| A13 / P2 | 积分包访问 `?focus=missing-audit-object` 时，没有未找到提示，反而高亮第一条记录 | 精确定位无效却暗示选中了其他对象。显式 focus 未命中时显示未找到并提供清除定位；无 focus 时才允许默认首项 | 隔离复现：missing notice=false、selectedRows=1；`credit-packs/page.tsx:153` |

## A01 的数据库方言线索与验证缺口

`app/domain/observability/plugin_events.py:561` 起，错误聚合 SELECT 与 GROUP BY 分别新建 `coalesce(error_code, "")`，站点侧聚合 `:310` 起也有同模式。用当前 SQLAlchemy 和 PostgreSQL psycopg 方言编译相同表达式，SELECT 与 GROUP BY 的空串成为两个独立绑定参数：

```sql
SELECT coalesce(error_code, %(coalesce_2)s::VARCHAR), count(id)
FROM plugin_observability_events
GROUP BY coalesce(error_code, %(coalesce_3)s::VARCHAR)
```

这是应优先排查的分组一致性线索，不能仅凭此编译结果宣称已取得 PostgreSQL 完整报错或确认唯一根因。M4 脱敏日志只提供 ProgrammingError 类型，未绕过日志脱敏读取秘密或擅自改数据库。站点侧有同模式也不代表已对 Portal 端实测出 500。

本轮独立执行现有 `tests/api/test_plugin_observability_admin.py`：**14 passed，1 条既有 TestClient 依赖弃用提示**。测试以 SQLite 建库，仍能与真实 M4 的 500 并存。这说明前序本地回归覆盖了业务样本，却未充分证明 PostgreSQL 上的新聚合查询可执行；应补数据库方言边界检查及部署后的模块读取检查，不放宽断言或删测试。

## 没有升级为确定问题的观察

- 前序宽范围审计曾数秒返回；本轮同类一次只读 GET 返回 200、约 63ms。查询参数、缓存和数据时点不完全相同，既不将旧慢查询当本轮固定事实，也不宣称性能问题已解决。
- 套餐初始化“两步写入”可能失败并重试，但服务端第一步是 upsert，不能把它误报成必然重复创建 409；已有失败重试用例也保留。没有将该猜测计入 13 项。
- 普通全页离开合规资料时 beforeunload 能提示；A08 专门指站内客户端导航后的历史后退，不笼统称所有退出保护失效。
- 客户/站点/订阅详情中存在多处异步读取和写后刷新，源码复核发现值得继续检查的状态归属；未对未复现路径宣称“串客户”或数据错写。
- 认证失效、非管理员授权、跨账号隔离和生产外网安全不属于本次完整渗透测试结论；不以管理员能打开页面作为权限安全证明。
- 真实 Provider 连接、生成、WordPress 采纳、支付和邮件送达没有执行，页面就绪标签不代替这些证据。

## 建议处理顺序与验证

1. 先恢复 A01 插件观测读取；定位 PostgreSQL 根因，并在候选上验证默认与变更时间窗。它直接阻断必要证据读取。
2. 收口共享交互 A03/A08，再处理 A04–A06 草稿和在途输入保护；共享修改应覆盖不同弹窗消费者，防止每页局部补丁互相冲突。
3. 处理 A02/A07/A09 的快照可信性和写成功后待确认，区分写失败与读失败，禁止用旧快照继续提交。
4. 最后处理 A10–A13 的未知值、待办目标、计数下钻及精确定位。优先复用目标页已有筛选，不新增后台平台能力。

本轮没有修改应用源码，因此没有重新运行前端构建或整套视觉门禁；前序 188 项通过只作为前序记录引用，不是本次审查的全覆盖测试结果。新问题的交互证据来自上述浏览器实测和隔离复现。

本地忽略工件：`.tmp/admin-system-audit-plugin-tests.log`、`.tmp/admin-system-audit-api.log`、首尾 M4 status 日志和 `admin-system-audit-*.png` 截图。截图含开发环境实际展示数据，留本地，不提交真实客户标识、域名配置或完整 API fixture。本轮工具定位/等待超时经修正后重查，不计为产品故障。

文档可达性 **595/595** 与 diff 格式检查通过。本记录与文档索引单独提交；没有 push、PR、CI、GitHub 合并、M4 accepted、生产或人工验收。
