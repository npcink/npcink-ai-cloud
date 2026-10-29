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
| A12 | 套餐活跃订阅数下钻补 `risk=all&status=active` | 避免订阅页默认 needs_action 改变计数口径 |
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
