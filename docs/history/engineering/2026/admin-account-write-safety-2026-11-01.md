# 客户写入正确性：B4-01 / B4-02 · 2026-11-01

本记录为 builder 本地交付。仅落实第四批报告前两项；B4-03–12 排队等待单独派单。

## 范围与身份

- 派单／integrator：`01a190f3-ab78-7763-bad1-79cc8fd7a72d`；builder：`01a1929f-2271-7550-b73e-07abd2a0a629`。
- 基线：fetch 后 `origin/master=f3843095ca61a34ffd2cc9598fe0c54e0efd8421`。
- 分支：`codex/admin-account-write-safety`。
- 工作树：`/Users/muze/.codex/worktrees/admin-services-vector-fixes/npcink-ai-cloud`；复用先前已交付、干净的工作树，旧分支仍保留。
- 锁：`codex:01a1929f-2271-7550-b73e-07abd2a0a629`。交付后冻结本冲突域，保留干净工作树和锁，待 integrator 收尾。
- 冲突域：客户运营字段更新、人工积分调整的既有幂等关联与只读确认、客户详情对应交互、词条、台账及回归。
- 不触碰价格、权益、销售／试用资格、支付、Provider、WordPress 写入、M4 或生产；不发布 PR 或合并。

## B4-01：后端限定字段，并发状态路径共同加锁

新增 `PATCH /internal/service/admin/accounts/{account_id}/operator-profile`，浏览器对应
`/api/admin/accounts/{account_id}/operator-profile`，沿用 `can_manage_accounts`。
请求只允许 `operator_display_name`、`operator_note`；未知字段拒绝 422，缺省字段保留，
空白字符串清除对应可选运营字段。返回既有序列化客户对象；不存在返回既有 404。

Repository 在事务内通过 `get_account_for_update` 读取最新客户，仅合并这两个 metadata
键，不写 name/status 或其他 metadata。`set_account_status` 同样先锁行再读 metadata，
避免反向并发时停用／恢复用旧 metadata 覆盖刚保存的备注。成功审计与更新同事务。
前端只发送运营字段；不通过“GET 后整对象 POST”模拟并发保护。旧通用 upsert 保留。

后端回归覆盖先停用后保存、先保存后停用／恢复、最新 canonical name 与新 metadata
保留、正常保存／部分更新／清空、越权字段拒绝及身份缺失。SQLite 证明状态持久化与
两种提交先后顺序，不能证明 PostgreSQL 行锁调度。另提供可选
`tests/integration/test_admin_account_profile_postgres.py`：复用仓库唯一随机可丢弃 schema
fixture，用真实重叠事务验证两种持锁顺序；本会话没有共享数据库权限，不执行 M4 测试。

资料保存畸形成功、未知结果确认、输入期间新草稿与导航保护仍属于 B4-04/06/07，
没有把这些待办计作本批完成。

## B4-02：固定意图，只读核对真实流水

一次提交先在当前 tab 的 `sessionStorage` 保留客户、稳定操作 ID 及提交快照，
POST 明确使用此 ID 作为原 `Idempotency-Key`。既有 ledger 唯一键与 replay guard
继续生效；没有新幂等基础设施、数据迁移或修改同键 409 契约。

新增 `GET /internal/service/admin/accounts/{account_id}/credit-ledger/adjustments/{operation_id}`，
浏览器同路径 `/api/admin/...`，沿用 `can_manage_billing`，后端须经过既有 internal/admin
认证。按 `account_credit_adjustment:{account_id}:{operation_id}` 精确查询，并匹配客户、
来源类型及已鉴权 `actor_kind/actor_ref`。不依赖余额、列表首屏或账期；GET 无写入／成功审计。
返回 `{account_id, operation_id, state, entry}`：匹配真实持久流水为 `applied`，其余为
`unconfirmed` 且 entry=null；没有找到不能证明未入账，也不开放自动重写。

前端同时核对响应客户、操作／source ID、流水 ID、事件类型、带符号数额、原因和备注。
网络中断、12 秒超时、畸形成功、500、408、未知 409、`auth.replay_blocked` 都保留意图，
先尝试一次 GET，之后确认按钮仍仅 GET。读取失败、畸形或不匹配始终待确认；冻结
输入和新提交，关闭／重开、刷新、离开／返回同一客户后仍恢复原意图。浏览器无法保存
或恢复该记录时不派发新写入。只有明确的既有积分校验／客户不存在等业务拒绝可释放
意图并保留可修正字段；修正后是新意图、新键。

客户上下文切换时重置新客户 busy/pending，用上下文 revision 隔离旧请求；旧请求
不能串用回执、释放新请求忙碌状态，或把新客户永久锁住。浏览器组件夹具用真实 hook
原位切换 accountId，分别覆盖旧成功／旧丢响应及回到旧客户只读确认。清除持久意图时
再次匹配操作 ID：旧 POST 即使在原操作已被 GET 确认、同一客户已提交新调整后才返回，
也不得删除新操作的恢复记录。该重叠场景在修复前真实回归失败，日志保留。

浏览器会话存储只解决同一 tab 的恢复；清空存储、另开独立 tab／浏览器或人为发起
不同意图仍可能产生独立合法调整。本批不承诺跨客户端“同金额就是同意图”，不以本地
合成故障证明生产曾重复入账。查询未匹配身份时保留待确认，需有权限的运营核对原流水。

## 内容层级与视觉

页面保持既有 `detail` 模型与六个工作页签。常显：待确认、不可重复入账、读取失败、
当前提交快照与读取动作；按需：现有积分调整弹窗；技术证据：本次操作 ID 和原流水
inspector；删除重复／迁移：不移动既有内容、不改共享原语、不更新截图基线。
关闭弹窗后，积分工作区仍可见待确认与恢复入口。读取失败文案归属读取，不写成
“保存失败”来暗示未入账。1440×900 与 1056×900 PC 检查冻结表单、关闭返回、恢复成功；
没有颜色体系、全局布局或共享组件变更，因此没有扩大到全后台矩阵。

## 验证与交接

- 临时 SQLite／FastAPI：新增 6 项 + 既有 service routes，共 24 passed；无真实客户／支付／Provider。
- 离线隔离浏览器：最终新 18 项 + 既有客户目录／详情 24 项，共 42 passed（1.1m）；新 spec 对未匹配 API／外网 fail closed。既有移动端契约随原 spec 保留，不新增移动端验收范围。
- 局部文案、冻结字段可读性及 payload 参数收口后先补跑 7 项通过，再加入旧请求不得删除新意图回归，最终 42 项覆盖全部最新改动。PC 1440／1056 最终截图已逐张检查。
- Python Ruff（全部改动文件）、改动源码 mypy、前端 unit／proxy capability（5 passed）、type-check、定向 ESLint、Admin 结构门禁通过；最终 `verify:local` exit 0（其 API 子集为 6 passed／2 skipped）。
- 可选 PostgreSQL 两项：默认因未提供专用可丢弃数据库而 skip，须 integrator 在自有权限与隔离 schema lane 核实；不当作本地通过。

本地完整命令日志、截图与结果收据位于工作树 `.runtime/b4-account-write-evidence/`；
可查看副本位于执行会话产物目录。第一次 Admin 静态门禁命中旧整客户 POST 断言，
已更新为字段限定 PATCH 契约，同时保留其他页面、草稿及反馈断言；未删测试或放宽阈值。
新增 hook 首次 ESLint 命中 render 内 ref 赋值，已移入 effect；首次 Python 全 Ruff
发现新测试长行，已格式化；可选 PG 测试 fixture 同名导入静态检查已修正。
旧 POST 删除新意图的回归先失败后修复，最终全部浏览器通过。以上均为本地开发纠正，
不是生产故障或遗留问题。

状态分别记录：local-ready 由最终提交／收据确认；CI/PR 未发生；M4 candidate／accepted
未发生；merged 未发生；production 未发生、未核实；人工视觉待验收。后续由 integrator
审阅、整合并负责这些独立状态。第三批及第四批剩余问题均不得由本记录自动放行。
