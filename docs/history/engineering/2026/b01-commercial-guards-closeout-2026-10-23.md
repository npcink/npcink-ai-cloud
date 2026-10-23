# B01：商业下单限流与紧急熔断 closeout（2026-10-23）

状态：本地开发候选。用户在本会话明确选择“以 #1205 为主，B01 只补限流、熔断和验证”。未新增 seed、未改变价格、未改 AGENTS.md 或 Admin 页面；无生产开启/部署/交易授权。

## Step 1：Pre-flight

- [x] 按顺序阅读 AGENTS.md、开启计划、2026-10-22 盘点、兼容表；读取 README 与相关工程约束。
- [x] git fetch / log / status 已完成。主工作区包含套餐之外的多组未提交改动，包括 account deletion/notification inbox；全部保留。
- [x] 当前基线 auto-upsert 会激活标准 offer；Portal `list_account_plan_offers` 也会调用它并 commit，计划所称“Portal 列表只读、不初始化”不成立。
- [x] Plus/Pro 前端 selectable 需要 offer 与已配置 comparison rights。
- [x] 支付宝六项配置及 RSA2 支付/回调/退款/关单实现存在。有效配置来自加密 ServiceSetting，不应按旧计划假定来自 .env。
- [x] CREDIT_PACKS 是默认目录；有效目录合并数据库 `commercial_credit_pack_catalog` 覆盖，不能只看 dataclass 的 active=True。
- [x] M4 只读 DB 事务核验：四档 plans 均 active，free_v1/plus_v1/pro_v1/agency_v1 均 published。
- [x] M4 支付宝 configured=true、enabled=true；六项仅输出存在性，离线配置/密钥格式校验通过。未打印值，未发起交易。

| M4 offer_id | status | amount/CNY | trial_days | trial_ai_credit_limit |
| --- | --- | --- | --- | --- |
| plus_monthly_v1 | active | 15.00 | 14 | 3000 |
| pro_monthly_v1 | active | 29.00 | 14 | 5000 |

有效积分包 pack_small/medium/large 均 active，分别 ¥99/349/1499、10000/35000/150000 积分。`GET http://127.0.0.1:18010/open/plan-catalog` 返回 status=ok，Plus/Pro 均 available、monthly/self_serve、trial_enabled=true；要求的五项 comparison rights 均非 unconfigured。

M4 来源身份：source_revision=`4fc0ecf3fadbdb6881e9a9573a310bde64fdd1f4`，branch=`codex/portal-breadcrumb-top-off-20261022`，dirty=true，dirty_paths=72，acceptance_state=candidate，promotion_pr=none，Alembic=`20261017_0088 (head)`。这是既有其他批次候选，不是 B01，也不是 accepted/master/production 证据。

## Step 2：DB 变化

未创建或执行 pre-seed migration。M4 已有满足要求的报价；用户已将发布/下架语义交给 #1205。B01 对共享 M4 和生产数据库新建/修改行数均为 **0**。本地自动化只写隔离的临时 SQLite 测试库。

未接管既存 `cloud-commercial-frontoffice-20261023` 工作树中的 auth/migration 草稿。

## Step 3：代码变化

账户下单统一使用 `portal_order_account` 限流 scope，60 秒最多 3 次；套餐、账户积分包、旧站点积分包入口共用额度。复用现有 ReplayReceipt 与 PostgreSQL advisory transaction lock，429 包含 Retry-After 与 retry_after_seconds。鉴权/账户权限/站点归属检查保持在限流之前；成功请求的幂等重放保持在限流之前。

永久保留环境变量 `NPCINK_CLOUD_COMMERCIAL_EMERGENCY_STOP`，默认 false；Settings 实际位于 `app/core/config.py`。true 时新购买/新试用返回结构化 400（`service.commercial_temporarily_paused`），自动初始化停止写入，Portal 套餐/积分包目录返回 commercial_available=false 及空销售项，公开目录将付费档标为 unavailable。三类 Portal CTA 禁用，并显示中文/英文说明。

暂停不修改报价或权益状态；已有订单重放、支付回调/结算、退款与账单读取继续工作。域层也拒绝新订阅、积分包及试用，避免仅靠 Portal 入口拦截。

`_ensure_standard_plan_offers_in_session` 在暂停时直接返回，购买/试用入口单独抛友好错误。没有照旧提示词在该共享初始化函数无差别抛错，否则套餐读取可能变成错误页。暂停解除后的发布/下架真值由 #1205 的持久化状态决定。

源码文件：6 个 Python 应用文件（auth、portal routes、config、audit/payment/subscription mixins）、4 个前端文件（commerce panel、portal-client、portal-error、i18n，共 3 个 TS/1 个 TSX），以及 .env.example。对应后端测试 2 个文件、Vitest/Playwright 各 1 个文件。无新增依赖或 schema。

## Step 4：本地验证证据

| 验证 | 实际结果 |
| --- | --- |
| 最终仓库本地门禁 | `pnpm run verify:local` 退出 0；Portal API/套餐域 130 passed、1 skipped（PostgreSQL 专属），差异/发布策略/Ruff/mypy/TypeScript/scoped ESLint/13 项 Vitest 均通过 |
| 套餐/支付宝网关/支付域/Portal API 回归 | 165 passed，1 项 PostgreSQL 专属测试未选入；SQLite/FastAPI TestClient，非真实支付 |
| 新试用恢复路径 | `POST /portal/v1/account/plan-trials`，payload `{"tier_id":"plus"}`，200，subscription.status=trialing；DB 活跃快照为 plus_v1、月积分 3000；审计 `subscription.paid_trial.start_or_upgrade` 存在 |
| 套餐支付签名与通知基线 | 本地临时 RSA 测试密钥生成 checkout；`POST /open/payments/alipay/notify` 经签名校验返回 success，payment pending→paid；此既有 Pro 试用转付费用例的订阅为 scheduled，不能写成即时激活 |
| 下单限流 | 套餐订单、账户积分包、旧站点积分包前三次均 200，后续各入口均 429；Retry-After 在 1–60 秒；原订单重放 200；另一账号不共享额度；过窗口后恢复 200 |
| 熔断阻断 | 三个下单入口与试用均 400，error_code=`service.commercial_temporarily_paused`；账户/站点销售目录 200 且商业不可用，订单历史仍 200 |
| 熔断中的结算/退款 | 暂停前的 Plus 订单结算仍生效；另一测试账户的积分包支付 +10000，退款 -10000；套餐退款恢复 Free；已有订阅/积分包订单域层重放仍返回原订单 |
| 熔断持久状态 | 暂停时不 seed 标准 offer；已有 active 报价、¥15/¥29 金额不被修改；恢复后目录返回两档报价 |
| Python 静态质量 | changed-file Ruff、6 个应用文件的 targeted mypy 通过 |
| 前端质量 | TypeScript、定向 ESLint、13 项 Portal 错误提示 Vitest 通过 |
| 契约 | Portal package、i18n completeness（1787 keys）、3 项账户授权契约通过 |
| 正式前端构建 | `next build --webpack` 通过 |
| 浏览器 | 本地正式构建 + mock API，1 项 Playwright 通过：三个 CTA 均禁用、订单历史可见、恢复刷新后三个入口均启用；暂停/恢复截图保留 |

原提示词中的 `/account/subscription/order` 并非实际接口，真实接口是 `/portal/v1/account/subscription-orders`。试用为 `/account/plan-trials`；支付回跳消费位于 `/portal/billing`。原提示词的审计名 `account.plan_trial_started` 也不是当前事件名；未新增第二套事件。

本地构建初次尝试遇到 Turbopack 对跨工作树 node_modules 软链接的限制；改用 Webpack。开发服务器 mock 会话加载未通过，最终浏览器证据来自正式构建；未在本批修复其他会话/前端缺陷。

自审已检查鉴权与幂等顺序、共享限流窗口、错误展示、域层防绕过、结算/退款保留和任务差异；未发现需要阻断本地交付的问题。此结论不替代 #1205 集成、PostgreSQL 并发验证或生产验收。

## Step 5：边界、证据状态与遗留

Cloud 仍只拥有支付、账单、权益和积分；未移动 WordPress 能力、提示、审批或最终写入权。无新基础设施，无微信真实 API，无价格或冻结声明修改。

- 本地：实现和上述聚焦验证通过；工作树 `/Users/muze/.codex/worktrees/b01-commercial-guards/npcink-ai-cloud`，branch=`codex/b01-commercial-guards`，从 `244cab8f` 建立，锁为 `codex:b01-commercial-guards`。
- 保留交付：本会话负责 B01 本地候选；以独立提交保留，工作树保持锁定。待 #1205 集成后由后续明确接手的会话重验并完成合并；只有交付已保存、任务提交已合并或明确撤回且工作树干净时，才可按生命周期流程解除锁与清理。
- CI：本批未触发。Merged：本批未合并。M4 candidate：本批未同步。M4 accepted：本批未取得。
- Production：未修改/部署，未开启销售、执行真实支付或退款。人工验收：待定。
- #1205：仍需先完成其发布/下架变更的集成，再在最新 master 上衔接本补丁并重验目录/下单一致性；本地原始基线通过不等于两批已合并验收。
- M4：当前已有其他批次候选，未覆盖、重启或切换其配置。后续候选同步与 PostgreSQL 并发限流验证尚待可用验证窗口。
- 真实支付宝公网回调、真实退款、真实交易与实际重建 API 后的环境切换尚未验证；离线 RSA 检查、模拟回调和 DB 测试不能代替。

## 开关与回滚

经相应环境授权后，在现有受保护的 backend env_file 设置 `NPCINK_CLOUD_COMMERCIAL_EMERGENCY_STOP=true`，按现有流程重新创建读取该环境文件的 API 容器；只 restart 不会重新注入 Compose 的环境变量。刷新 Portal 以读取不可用状态。暂停不需要 SQL 修改报价，也不会取消已有订单。

恢复时将同一受保护配置改为 false 并重新创建 API，刷新 Portal。已有下架商品应保持下架；不得用 SQL 全量 ACTIVE 覆盖 #1205 的状态。

源码回退为精确撤回 B01 补丁，无 migration 回滚。撤回前应先确认是否仍需保持销售暂停；旧版本不识别本开关。生产配置变更、重新创建容器及源码发布都需要对应的明确人工授权。
