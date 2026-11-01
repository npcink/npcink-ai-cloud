# Admin 商业目录一致性契约 v1

范围：已有积分包目录的多人保存正确性、套餐活跃计数与订阅下钻，以及订阅读取证据。
这是现有商业路径维护，不开放新销售能力，不改变价格、权益、资格、试用或订单快照。
遵守[商业阶段边界](engineering/commercial-development-next-stage-v1.md)与
[Admin 信息层级规范](cloud-admin-visual-information-architecture-review-standard-v1.md)。

## 积分包保存

- `GET /internal/service/admin/credit-packs` 返回不透明 `revision`。
  `catalog_version` 表示目录格式，不能用于并发判断。
- `PATCH` 仍提交完整 `items`，同时必须回传读取时的 `expected_revision`。
  缺失版本返回 409 `service.credit_pack_catalog_revision_required`；
  版本过期返回 409 `service.credit_pack_catalog_revision_conflict`。
  旧客户端必须先刷新页面取得版本；不兼容无条件覆盖写入。
- 首次保存使用主键唯一约束下的 `INSERT ON CONFLICT DO NOTHING`；
  已配置目录使用带版本谓词的原子 `UPDATE`。不能先读、在应用中比较后无条件写。
  旧目录没有版本时，以更新时间生成只读兼容令牌，首次成功写入即换成随机版本。
  每次成功保存均生成新版本，即使时钟值相同；无需数据迁移或 GET 侧写入。
- 目录替换和成功审计在同一事务中提交。失败保存不得改变目录或生成成功审计。
  `ServiceSetting.config_json` 是普通 JSON；不能依赖 PostgreSQL 的 JSON 整体相等运算。
- 编辑器绑定打开时的完整目录与版本；编辑中禁用目录刷新。
  冲突后保留草稿供核对，禁用再次保存，并常显原因与“读取最新目录”。
  先只读展示最新目录，原草稿仍保留；明确确认“放弃草稿并采用最新目录”后才替换。
  不自动换用最新版本重试旧草稿，不把其他积分包恢复成旧值。
  初读与保存共用完整投影校验。缺版本、集合或损坏条目视为读取失败；
  已有有效目录与时间保留为陈旧，首次失败提供重试，不伪造合法空目录。

## 积分包提交证据与恢复（第五批组 2）

- 普通未提交草稿接共享导航保护；X、取消、Escape、刷新、历史与站内/同路径
  目标变更受保护。放弃普通草稿不等于撤销已发送请求。
- Credits 为 1–10,000,000 整数，有效期为 1–1095 整数。金额遵循现有后端
  `round(float(value), 6) > 0` 的归一化规则；编辑器支持最小 0.000001、六位小数，
  拒绝空值、非有限值、零/负数和超出表单精度值，不自动夹值或改变原价 99。
  按钮是原生 submit，与 Enter 共用表单验证及提交函数。
  既有后端会将空推荐选择恢复为默认，表单明示至少保留一个推荐套餐并在持久化/
  PATCH 前阻止全空；读取仍允许类型正确的空推荐列表，不复制后端默认映射。
  后端也允许重复的有效推荐 tier，读取保留其顺序和重复值；保存另一包时保留
  未编辑包的全部可写值，不额外规范化。重复 pack_id、非法 tier 仍视为损坏。
- PATCH 发出前，在同一标签页 sessionStorage 保存原 key、expected_revision、
  完整提交 items、目标和原表单。存储失败/损坏则冻结写入。
  发送后响应丢失、坏成功投影或确认失败保留原意图，不换 key、重发或猜测失败。
  恢复意图后的首次目录读取失败仍可 Retry 只读目录；普通读取不确认该操作，
  不清理/改写原 key、expected_revision、items 或草稿，也不解除写冻结。
  精确确认成功使已发出的旧目录读取失效，迟到目录/错误不得覆盖确认结果；
  离开上下文后的一般读取及确认响应均不得污染新页面或删除保留的原意图。
- 成功 PATCH 增加 `catalog_operation={expected_revision,items}`，与原目录替换和
  `payment.credit_pack_catalog.update` 成功审计在同一事务；不新增第二条成功审计。
- 专用 `GET /internal/service/admin/credit-packs/operations/{operation_id}` 接收
  expected_revision，只通过精确操作者、key、PATCH 路径、事件、结果与设置范围
  查询成功审计（最多两条以拒绝歧义），再 SELECT 当前设置。要求原 expected_revision、
  完整提交目录与当前唯一 revision/目录一致。当前值碰巧相同、旧审计、重复审计或
  后来同值新 revision 均不能确认。没有证据返回 unconfirmed，不能据此授权再次写入。
- 确认链不调用一般目录、客户、站点、ledger、reconcile、bootstrap、flush 或 commit。
  原 internal token + 可选 Admin cookie 认证保留；无效认证仍有既有拒绝审计，
  不把拒绝路径描述为数据库零写。Admin proxy 精确要求 can_manage_catalog。
- 仅原 PATCH 的明确拒绝可解除 sent intent；确认 GET 的 409/422 不能清除它。
  只有完整写投影与绑定原操作的持久回执及当前目录均通过验证，才替换目录、关闭
  表单、清理意图并提示成功。确认读取不会触发第二次 PATCH。

## 订阅读取证据（第五批组 3）

订阅队列与详情在采用响应前验证真实 serializer 的消费字段，不把缺失集合、
风险计数、预算或用量解释为空目录、0 或稳定状态。

- 队列验证必需 items/total/summary/filters/pagination 与原请求范围；风险排序仍由
  后端负责。summary 在风险过滤和分页前计算，不要求其总和等于 total；合法空页、
  越界空页和真实 0 保留。失败刷新保留旧结果、旧范围和成功读取时间并常显陈旧。
- 详情必须匹配路由 subscription_id 及账户/套餐/coverage 关系。account、plan、
  plan_version 可以明确为 null，此时保留有效指标、标记待核实并阻止依赖操作；
  缺字段不伪造空对象。当前 published plan version 可不同于订阅存储版本，按父套餐
  验证；不改变实时参数策略。meter 聚合可以稀疏，Token 读取 budget_state.tokens
  的权威 current_total，不能用不存在的 usage.tokens 补 0；limit <= 0 仍合法。
- covered_sites 单独验证：坏集合数量未知；坏条目、重复目标双方及跨账户条目逐项
  标明不可用，有效详情和站点继续可读。坏站点不生成链接，依赖操作保持禁用。
  billing 统计排除 archived/released 站点，不机械等同于覆盖集合；历史订阅快照合法。
- 只有当前有效的客户或站点范围才挂载审计面板；已验证 account 优先，summary/trail
  均保持 account 范围，不叠加首个 site，也不信任响应中的任意链接或请求全局审计。
  原查看审计记录入口保留。路由切换隔离旧 GET、错误、POST 完成及其读回。
- 重建仍使用既有目标端点和幂等策略；本组只验证证据/目标并保护成功后的读回。
  写入成功但读回损坏时保留待确认与旧详情，只有一个 GET Retry，失败重试不再 POST。
  未扩展 S03 的未知提交恢复、新 key 或持久化协议。

隔离 mock 浏览器和合成 SQLite API 响应只证明本地消费行为。SQLite 导出观测段
33 条 SELECT 不代表真实客户数据库全链零写。严格浏览器里的部分 header RSC
200→ERR_ABORTED 仍为失败；历史基线同签名不构成自动豁免。
本地交接与反例见[组 3 记录](history/engineering/2026/admin-subscription-evidence-2026-11-02.md)。

## 套餐活跃集合

`ADMIN_ACTIVE_SUBSCRIPTION_STATUSES` 是计数与下钻的同一来源：
`trialing / active / past_due / suspended`。它表示既有目录活跃口径，
不等同于付款成功或全部订阅健康。

- 活跃数字链接：`/admin/subscriptions?plan_id=…&risk=all&status_group=active`。
  全部订阅链接保留，只带 `plan_id` 与 `risk=all`。
- `status=active` 仍仅表示单一状态；`status_group=active` 表示上述四状态集合。
  不支持的集合由 API 拒绝，集合与单状态同时提交返回 400。
- 服务端在汇总、风险筛选、排序和分页前应用集合，计数与明细口径一致。
  仍保留原有 500 条队列范围上限，超过时明确报错要求缩小范围，不伪造部分总数。
- 当前集合及其四状态说明常显；刷新、排序、分页保留集合。
  选择单一状态、全部状态或清除筛选时移除集合，不留下隐藏的交集条件。
- 计数与明细分别读取时仍可能因真实订阅变动而变化；此契约不承诺跨请求冻结快照。

## 验证与维护经验

1. 用两个独立数据库事务同时提交同一版本，默认目录、旧目录和已有版本目录均应
   恰好一个成功；检查最终目录与唯一成功审计。固定时钟验证版本确实变化。
2. API 检查缺版本、过期版本、单状态兼容与组合筛选拒绝。
3. 同时构造六种生命周期状态，核对活跃计数、风险汇总、分页去重与完整集合。
4. 浏览器检查草稿保留、显式恢复、其他积分包新值不被覆盖、版本缺失时禁写，
   以及下钻 URL、筛选选中态、刷新、排序和分页。验收范围为 PC。
5. SQLite 并发通过不能替代 PostgreSQL 运行证据。隔离 schema 用例见
   `tests/integration/test_admin_credit_pack_postgres.py`，由共享 M4 持有人执行；
   不在真实目录制造冲突测试。

证据状态须分别报告本地、CI、M4、合并与生产。文档和静态断言通过不等于视觉验收。

## 2026-10-30 本地交接记录

基线：`a5347b41`。角色为 builder，合并与共享 M4 由「目标规划」会话持有。
本批不修改客户额度页面、共享 Admin 台账或兼容矩阵；翻译文件经原持有人明确交还，
只追加商业独立键，集成时保留额度告警批次的三个英中键。

本地证据：

- 66 项定向后端测试通过：并发初次保存、旧目录、已有版本、同一时钟、
  审计失败回滚、API 409、四状态计数与分页，以及既有支付/销售/套餐路径。
- 完整 Ruff、5 个改动源码文件 mypy、前端类型检查、定向 ESLint，
  `check:admin-ui` 结构/类型/静态门禁通过。
- `check:admin-ui:visual` 注册矩阵 197 项通过。随后对取消冲突弹窗后的目录提示、
  套餐两个入口分行做最终调整，重建后三页 28 项通过；最后区分目录提示与草稿提示文案，
  重建后积分包 7 项再次通过。未更新任何截图基线。
- 已目视核对 900×800 PC 的冲突编辑器与活跃集合页面；集合状态及说明常显、
  草稿值可核对、恢复入口可见。另有 1440×800 集合截图。
  本地图片保存在 `.tmp/commercial-consistency-evidence/`，可由相关浏览器 spec 重建。
- 五轴自审：原子写入与审计同事务；保持现有鉴权与订单快照；无迁移、依赖或新增外部调用；
  沿用服务端分页、风险汇总与队列上限；冲突恢复不自动重放旧目录。

待集成方完成：刷新最新 master，叠加保留客户额度翻译与台账，运行隔离 PostgreSQL
三场景并发用例、CI 和 M4 候选/接受验证，提交合并结果。上述本地证据不代表这些状态已完成，
也不代表操作者视觉接受或生产已部署。


## 集成完成记录（2026-10-30）

上述 builder 记录保留其交接时点状态。集成后 [#1320](https://github.com/npcink/npcink-ai-cloud/pull/1320)
已合入 `71cef1bd05383a50ed19f30a2a764a53f80bfa7e`，最终 source `af5e985b`
完整 CI `40999318446` 通过。真实 PostgreSQL 三场景各一胜一冲突、唯一成功审计
通过；本地 28 项 PC 浏览器和 CI 注册矩阵 198/198 通过，无新 golden。

clean master 推广 #1320 后 M4 为 accepted、source `71cef1bd`、frontend
`178bac9f`、`source_dirty=false`；实际套餐 2 → 2 与目录读取只读复验通过。
[Admin 台账最终回执](admin-information-hierarchy-implementation-ledger.md#最终交付回执2026-10-30)
记录完整状态、证据入口、协作交还与回退。未在真实目录制造冲突，未部署生产；
旧页面 409 后显式刷新、前后端成套发布、原队列上限与实时数据限制仍适用。
