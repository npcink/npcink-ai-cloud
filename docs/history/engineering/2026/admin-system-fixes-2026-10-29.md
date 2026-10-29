# Admin 系统检查修复记录 — 2026-10-29

状态：落实经操作者同意的 [13 项问题](admin-system-audit-2026-10-29.md)。本记录与原审查时的事实分开保留；验证结果见下文。

## 范围与实现

同一 Admin 维护模块，风险等级 L2：涉及 PostgreSQL 聚合、共享弹窗及历史导航、保存后的状态归属。保持 overview / queue / configuration / detail 页面模型，后端仍是保存与运营证据的真相源。仅 PC 验收，包含 900px 窄窗口。没有新增商业功能、启用暂停入口或增加 WordPress 控制面。

| 编号 | 落实内容 | 回归关注点 |
| --- | --- | --- |
| A01 | Admin 与站点插件观测的错误分组复用同一 coalesce 表达式/参数；补 PostgreSQL 隔离 schema 用例 | SQLite 不能代替 PostgreSQL 分组执行；真实候选只读 GET 另验 |
| A02 | 首页读取回调不再依赖翻译变化；新增显式刷新，刷新失败标注旧快照并提供重试；动态运营结论在正文常显 | 保留上次时间与数据；失败不能静默显示当前健康 |
| A03 | 编辑弹窗存在时禁止快捷键再打开快速跳转；共享弹窗仅允许最上层处理 Esc/Tab | 积分包草稿及运行配置上层确认的取消/焦点行为 |
| A04 | 合规资料的数据加载与语言呈现分离 | 切换语言保留整个草稿，不额外 GET |
| A05 | 合规保存/发布期间禁用工作区输入、目录与动作，并以同步 ref 防重入 | 延迟响应期间不接受会被旧回执覆盖的新输入 |
| A06 | 积分包保存期间锁定全部编辑输入及保存入口，并以同步 ref 防重入 | 单次提交、响应完成后显示提交时的草稿 |
| A07 | 合规发布、套餐保存/销售状态、订阅账单快照重建加入“写成功、待回读确认”状态 | 读取失败冻结旧快照，只读重试不会再次写入；成功提示不误称保存失败 |
| A08 | 合规资料、服务设置、运行配置共用站内链接、beforeunload 和历史导航保护 | 保留 Next history state，后退先恢复原条目再确认；取消保持 URL/草稿，确认使用原历史步长 |
| A09 | 积分包目录开始刷新或刷新失败后暂停编辑，成功读取后恢复 | 不允许用已知陈旧目录提交整目录覆盖 |
| A10 | 首页账户/站点/订阅计数与用量指标缺失、非数字或无效时显示 `—`，附未知说明 | 不把有效 envelope 内的缺字段归零 |
| A11 | 首页商业待办的动作明确命名“打开服务状态” | 目标是现有服务状态队列，未宣称精确匹配首页七天计数；未新增筛选 API |
| A12 | 初次下钻补 `risk=all&status=active`；复核发现 active 状态与聚合计数范围不同，已改为独立的“全部订阅（总数）”入口，见文末复核 | 全部入口仅保留 plan_id 与 risk=all；活跃数不再伪装成同口径明细链接 |
| A13 | 积分包显式 focus 未命中时保留 focus、提示缺失并提供清除 | 不再静默选中第一项；无 focus 时仍允许默认首项 |

A09 本轮处理已知陈旧快照禁写；现有积分包 PATCH 仍是整目录更新，没有增加并发版本比较。两个操作者各自读取成功后并发保存的冲突检测，仍属于需独立评估的契约维护项，不能把本轮前端禁写当作乐观锁。

## 验证与证据状态

### 本地

- 后端修复提交 `14c9e09c`；Admin 功能修复提交 `b4495634`；`b68c9305` 校正首页正文结论断言；`fd87d78f` 修正窄 PC 测试进入页面的路径。后两项仅改测试，没有修改运行时代码。
- 最终完整 `check:admin-ui:visual` **194 passed（3.1m）**；视觉治理 12 rules / 9 pilots、15 个注册 spec 通过，没有更新 golden baseline。日志 `.tmp/admin-fixes-visual-final.log`，工件在 `frontend/test-results/`。
- 完整矩阵以外的首页 **6 passed**；套餐与订阅补验 **10 passed**。补验日志 `.tmp/admin-fixes-overview-final.log`、`.tmp/admin-fixes-supplement.log`；后者此前首页的一项旧帮助标签断言已由前者替换为正文常显断言，不把旧失败写成绿色。
- Portal 对共享 Modal 的代表消费者回归 **2 passed**：切换站点及日期明细返回恢复滚动位置。日志 `.tmp/admin-fixes-portal-modal.log`。
- 插件观测相关本地 API/domain 回归 **26 passed**；Ruff 与对应 domain 文件 mypy 通过。仅有既有 TestClient 依赖弃用警告。
- `check:admin-ui`（含类型）、增量 ESLint、`test:i18n-contract`、Modal 键盘契约、文档可达性、diff 格式通过。日志 `.tmp/admin-fixes-check-closeout.log`、`.tmp/admin-fixes-extra-closeout.log`、`.tmp/admin-fixes-i18n-closeout.log`、`.tmp/admin-fixes-modal-closeout.log`。
- 已查看首页 1440px 正文结论截图，以及运行配置 900px 历史退出确认截图：确认层位于编辑框之上、按钮可达；Tab 留在上层，Esc 取消后保留底层草稿。既有移动尺寸断言仍保留，不计为本轮移动适配。
- 初轮目标回归 62 passed 与完整矩阵有重叠，不相加。完整矩阵首次 193 passed / 1 failed 的原因是新测试在 900px 点击已收起侧栏中的不可见链接；修正为先通过真实 Link 进入，再缩窄验证，最终完整矩阵重新通过。
- 自审覆盖正确性、可读性、共享归属、认证/数据边界及请求行为；没有新增依赖、迁移或公共 API。

### M4 candidate

- 同步前 runtime revision 为 `4a677b13d45e946c2e3fb42511e86d3222e8f73c`。本次行为复查的后端/frontend revision 均为 `49982abda0571f28b96662831589140d00c784f8`，source_dirty=false，acceptance_state=candidate。此后仅测试/收尾文档变化；最终同步身份以 `.tmp/admin-fixes-m4-status-final.log` 为准。
- 插件观测真实 GET 的 24h 与 336h 均为 **200**，返回有效 totals/errors；页面显示两个数据表，不再是原先的读取 500。全局空的 aria-live alert 不作为接口失败。
- 使用现有 `m4:preview:test -- --focused tests/integration/test_portal_postgres_acceptance.py::test_plugin_error_aggregates_on_postgres`，在独立命名 schema 内执行站点与 Admin 两类分组，**1 passed**。用例自行删除该 schema，没有操作共享业务数据。日志 `.tmp/admin-fixes-m4-postgres.log`。
- 1440×1050 真实只读复查 8 个模块页：首页、插件观测、合规资料、套餐、积分包、服务设置、运行配置、订阅列表；另检查一条现有订阅详情。均 HTTP 200、无整页横向溢出；8 页期间收集到的 Admin API 失败及 pageerror 为空。
- 900×1050 复查首页、合规资料、服务设置、运行配置、积分包，均 HTTP 200、无整页横向溢出。脱敏回执 `.tmp/admin-system-fixes-m4-receipt.json`。
- 真实浏览页的非 GET 请求监听为 **0**。没有实际保存共享配置、发布合规资料、改套餐或积分、发送邮件、支付交易或付费 Provider 调用。

| 证据层级 | 本轮状态 |
| --- | --- |
| local verified | 上述静态、行为、构建与矩阵通过 |
| candidate validated on M4 | 真实 PostgreSQL 与目标只读页面通过；仍是 candidate |
| GitHub CI / PR / merged master | 未 push、未创建 PR、未合并；master 基线仍为 `d9185146` |
| accepted on M4 | 未执行 master promotion |
| production / human | 生产未操作，人工界面验收待进行 |

独立层级规范工作区 `codex/admin-hierarchy-audit` 的文档提交不在本批功能提交内；其 `docs/README.md` 索引与本批存在同文件交叠，后续集成必须显式保留双方条目。已遵循动态错误/陈旧/待确认结论常显、高频动作保持可见的约束，没有并行编辑其规范文件。

## 经验补充与回滚

- 共享修复需要覆盖真实消费者：弹窗热键、确认层级、三个配置页的历史取消与继续分别验证。
- 写成功与读失败必须分开建模；重试 GET 不等于重试 mutation。
- 数据加载身份与语言显示无关，切换语言不应重置草稿。
- PostgreSQL 聚合必须实际在 PostgreSQL 上执行；SQLite 全绿不能解释真实 500。
- 路由参数或动作名称必须准确表达下钻范围，避免把概览计数与另一条默认队列相等同。
- 不更新截图基线以绕过失败；测试定位错误与产品缺陷分开记录。

仅源码维护，无数据库迁移。回滚使用本分支对应提交的 reviewed revert；M4 候选可按现有通道恢复已知版本。没有生产部署或生产回滚授权。

## 落实复核 — 2026-10-29

本节回应操作者“检查落实情况”，区分功能正确性与原始信息层级整改。前文 194 项完整矩阵、26 项后端回归及 PostgreSQL 1 项是真实的前序证据，本轮核对原始日志，不声称再次执行了这些完整检查。

### 功能复核与补修

- A01：本轮重新读取 M4 插件观测 24h / 336h 接口，均 HTTP 200 且 totals 结构有效。分组修复已生效。
- A02–A11、A13：核对实现及已有回归记录；本轮定向复跑首页未知指标/陈旧提示、积分包 focus/陈旧禁写/快捷键隔离/保存锁、运行配置 900px 历史确认、合规语言切换/历史返回/写后回读失败。代表路径通过，不声称穷举了所有弹层组合或所有 PC 浏览器。
- A12：发现前次修复不完整。`list_admin_plans` 的 `subscription_counts.active` 包含 trialing、active、past_due、suspended，单独的 `status=active` 过滤不能得到同一组明细。提交 `12d845f9` 保留现有活跃计数，将原数值链接改为独立且常显的“全部订阅（总数）”；目标保留 `plan_id` 与 `risk=all`，不带 status。没有改变计费、聚合口径或增加筛选 API。当前仍不提供精确的四状态活跃集合下钻。
- 新用例使用总数 5 / 活跃 3，验证两者分开显示、1440/900px 入口可达和无整页横向溢出；实际点击后验证订阅读取请求保留套餐与全部处理状态，并且无 status 条件。
- 本轮浏览器定向回归 **9 passed**，另分别复跑套餐和订阅的“写成功、GET 失败、只读重试”各 **1 passed**，共 11 项；不与前序 194 相加。日志 `.tmp/admin-implementation-review-targeted.log`、`.tmp/admin-implementation-review-package-readback.log`、`.tmp/admin-implementation-review-readback.log`。
- 本轮构建、`check:admin-ui`（含类型）、增量 ESLint、套餐目录契约、i18n 契约通过。日志 `.tmp/admin-implementation-review-check.log`、`.tmp/admin-implementation-review-lint.log`、`.tmp/admin-implementation-review-i18n.log`。Next 构建产生的 `next-env.d.ts` 自动变更已移除，不提交构建副产物。
- M4 首次同步 `12d845f9` 后的截图发现 900px 下新链接挤成多行；随后将状态列 30% / 订阅列 11% 调整为 19% / 22%，链接保持单行。补充链接不跨出本单元格的断言并重新构建，定向用例 **1 passed**（是上述用例的改后重跑，不作为新的独立覆盖相加），增量 ESLint 与套餐目录契约通过。日志 `.tmp/admin-implementation-review-plans-width.log`、`.tmp/admin-implementation-review-width-lint.log`。
- 继续查看稳定后的 900px 截图，发现限制说明挤进操作列、管理按钮断行；最终将操作列扩为 12%、状态列缩为 17%，限制按单项换行、操作按钮约束在单元格内。新增的英文检查还复现了缺失套餐的 Advanced setup 按钮溢出，已用受限宽度及按词换行修正。套餐管理与下钻最终 **2 passed**，日志 `.tmp/admin-implementation-review-plans-width-final.log`，增量 ESLint 与目录契约通过。首轮几何断言在不同时间采集边界受到侧栏动画干扰，已改为同一 DOM 任务内比较；没有放宽边界要求。

### 信息层级仍未完成的部分

以下是独立层级复核交接与本轮源码核对一致的待办，不能用功能用例通过抵消：

| 部分 | 已改善 | 仍待落实 |
| --- | --- | --- |
| 向量观测 | 已注明“所选时段信号” | 错误队列仍在两张趋势及站点/intent 分布之后；badge 的数字来自 health.score，却未就地标为健康分；完整评分公式仍常显 |
| 插件观测 | 14 天读取恢复、错误码可以区分 | 近期 50 条记录仍默认展开，缺少 run 的同一解释逐行重复 |
| 首页 | 动态运营结论正文常显 | Action list / Todo 及 payload 实现术语尚未收敛 |
| 客户与站点详情 | 本批未作层级调整 | 原始层级建议尚待实施，不能计为本批完成 |
| 层级规范 | 独立工作区已提交 `f852fe48` | 尚未集成；docs/README.md 有同文件交叠，需显式保留双方索引 |

A09 的多人并发版本锁仍未实现；已知陈旧禁写不等同于并发覆盖保护。上述界面待办和契约限制均保留，未因复核而扩大到商业功能或共享真实配置写入。

### 本轮最终候选与交付状态

- 补修提交：`12d845f9`（下钻范围）、`7e8474f7`（链接窄列）、`42a668ae`（限制/操作列与英文检查）。最后一个运行时代码提交为 `42a668ae385a181791f16e5d1d30475bb864231c`，后续仅追加本节文档。
- M4 status 的 backend / frontend source revision 均为上述 `42a668ae`，source_dirty=false、acceptance_state=candidate。日志 `.tmp/admin-implementation-review-m4-final.log`。先前第一次 sync 因未显式声明 feature-branch candidate 被本地保护拒绝，随后使用现有 `NPCINK_CLOUD_M4_ALLOW_NON_MASTER_CANDIDATE=1` 候选通道；没有绕过 accepted 或 production 门禁。
- 最终真实套餐页在中英文、1440×1050 与 900×1050 四个组合中，订阅链接、限制项、操作按钮均留在各自单元格内，无整页横向溢出。已查看最终中文窄 PC / 英文宽 PC 截图；工件 `.tmp/admin-implementation-review-plans-{zh,en}-{900,1440}.png`，页脚版本与候选一致。
- 真实点击 Free 的“全部订阅（2）”，目标 API HTTP 200、total=2、无 status 条件；插件 24h / 336h GET 再次返回 200、totals 有效。真实浏览页非 GET 监听仍为 0。所有 mutation 的成功/失败/等待验证均使用隔离 mock，没有写入 M4 共享业务配置。
- 文档可达性 **596/596**、diff 格式通过。没有重新执行全量 194 项、后端 26 项或 PostgreSQL 1 项；引用其原始日志，并执行本轮受影响的定向验证。
- GitHub push / PR / CI / merge、M4 accepted promotion、生产发布及人工验收均未执行。功能补修在当前分支与 M4 candidate 可查看，界面层级待办及 A09/A12 限制仍按上节保留。

## 集成 CI 补核 — 2026-10-29

PR #1312 的 frontend job 在原有预算投影单测中复现失败：测试仍将 `config: null`
当成可编辑默认配置，和本批 `0e10b017` 已引入的损坏响应拒绝规则冲突。
保留运行时保护，将部分配置的默认值用例改为合法空对象，并补充 null 配置必须
抛错的独立回归；没有放宽响应校验或修改应用代码。
本地完整 Vitest 为 60 files / **673 passed**，日志 `/tmp/admin-integration-unit-fixed.log`。
此测试修正是交接之后的集成补修，原始交接分支的应用代码保持不变；CI 以本次
更新后的 PR head 为准，不将前一次失败算为通过。

第二轮 frontend contracts 发现 `RecommendationQuality` 的动态翻译前缀未登记。
在既有 `FAMILY_SOURCES` 中补充受限 metrics/families 的来源说明；保留双向扫描
和目录存在校验。本地使用项目已有 Python 运行环境执行完整 `test:contracts`
通过，日志 `/tmp/admin-integration-contracts.log`。首次本地运行误用了系统旧版
Python，在 `zip(strict=True)` 停止；切换项目环境后通过，未改契约以适配旧环境。

第三轮浏览器矩阵为 193 passed / 1 failed：服务队列的全局摘要比较包含了刷新
按钮，CI 在请求尚未稳定时抓到“加载中”，其计数仍与预期相同。保留完整摘要
相等、全部筛选与请求数量要求，改为先确认初始刷新完成，并使用 Playwright
可重试的文本相等断言等待后续稳定。未改运行时代码、golden 或验收阈值。
原始用例在本地单跑未复现（1 passed），修正后连续执行 3 次通过；日志
`/tmp/admin-integration-queue-{repro,fixed}.log`。仍需本次 head 的 required CI。
