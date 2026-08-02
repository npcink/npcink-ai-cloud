# CommercialRepository 渐进拆分实施计划 v1

状态：Approved for phased local development

日期：2026-08-02

适用仓库：`npcink-ai-cloud`

## 1. 目的

本计划用于把 `CommercialRepository` 从通用商业数据访问入口逐步拆成按领域负责的 repository/query 模块，在保持业务语义可验证的前提下降低修改影响面，最终删除通用巨型门面。

本计划不是按行数做机械拆分，也不是一次性重写。每一批只迁移一个内聚能力，先建立行为特征测试，再移动实现；API、数据库结构和业务规则保持不变。

实施与验收遵循：

- [开发验证运行模型](development-validation-operating-model-v1.md)
- [并行 AI 协作规范](parallel-ai-collaboration-standard-v1.md)
- [M4 Preview AI 开发规范](m4-preview-ai-development-standard-v1.md)
- [生产发布策略](cloud-production-release-policy-v1.md)

## 2. 当前事实

以 `origin/master@7936d9c023f64ba651bddabc79da14ceaee3f503` 为调查基线：

- `app/adapters/repositories/commercial_repository.py` 为 4,202 行。
- `CommercialRepository` 有 157 个方法。
- 类内同时包含 Support、Account、Site、Subscription、Plan、Payment、Refund、Identity、Credit、Usage、Audit 等多个领域。
- Account 和 Site 的无锁查询已经分别抽到 `CommercialAccountQueries` 与 `CommercialSiteQueries`，旧 `CommercialRepository` 通过继承保留兼容入口。
- Subscription 查询被 Billing、Admin、Portal、Payment、Runtime、Site 等多个 domain mixin 调用，直接一次性改调用方会扩大回归面。

因此，首批应复用现有 query mixin 模式，保持所有调用方不变，只移动无锁纯查询实现。

## 3. 决策

### 3.1 目标结构

```text
domain services / API routes
            |
            v
domain-specific repository interfaces
            |
            +-- CommercialAccountQueries
            +-- CommercialSiteQueries
            +-- CommercialSubscriptionQueries
            +-- SupportRepository
            +-- PlanSubscriptionRepository
            +-- PaymentRefundRepository
            +-- IdentityMembershipRepository
            +-- CreditUsageAuditRepository

temporary compatibility facade: CommercialRepository
            |
            +-- delegates/inherits only during migration
            +-- deleted after all callers use owned interfaces
```

### 3.2 核心原则

1. 先冻结增长：除迁移桥接外，不再给 `CommercialRepository` 增加新职责或新领域方法。
2. 按能力拆分，不按文件长度拆分。
3. 先读后写、先无锁后有锁、先低耦合后高耦合。
4. 每批保留 SQL 过滤、排序、空输入、返回类型和事务语义。
5. 第一批不迁移调用方；兼容门面继承新的 query class。
6. 兼容门面是临时设施。项目无历史用户兼容负担，完成领域迁移后应删除，而不是长期双轨维护。
7. M4 candidate、merged source、M4 accepted 和 production validation 是不同证据状态，不互相替代。

## 4. 分阶段路线

### Phase 0：冻结增长与盘点

目标：阻止巨型类继续膨胀，并建立可追踪迁移清单。

- 新商业能力直接进入明确的领域 repository/query 模块。
- 只允许为兼容迁移增加最小继承、导入或委托代码。
- 按方法记录领域、读写属性、锁/事务要求、调用方和测试覆盖。
- 每一批开始前重新基于最新 `origin/master` 复核方法与调用方，文档中的行号和数量不是永久真相。

### Phase 1：Subscription 无锁纯查询试点

目标：建立可复制的拆分模板，用最小风险证明结构迁移流程。

详见第 5 节的精确实施 envelope。

### Phase 2：Support repository

目标：把支持请求、消息、附件、反馈及队列查询收敛到 Support 领域。

- 先拆无锁读取与聚合。
- 再在独立批次迁移创建、状态流转和反馈写入。
- 保持既有全局风险排序、分页和 `return_to` 合同。

### Phase 3：Plan、Subscription 写入与订单

目标：把套餐版本、Offer、订阅写入和 SubscriptionOrder 放到明确的商业合同边界。

- 写入和订单不得与 Phase 1 合并。
- 明确 flush/commit 所有权、幂等键和并发规则。
- 带锁读取和写入放在同一事务所有者附近。

### Phase 4：Payment 与 Refund

目标：隔离支付订单、支付事件、退款及账务观察事实。

- 保留支付状态机、幂等和审计证据。
- 不在 repository 拆分时改变支付宝回跳、金额或货币快照语义。

### Phase 5：Identity 与 Membership

目标：隔离 Principal、身份绑定、账户成员、站点绑定和管理员授权。

- 权限和可信链路属于独立安全批次。
- 不借结构重构引入具名多管理员、会话撤销或权限模型变化。

### Phase 6：Credit、Usage 与 Audit

目标：隔离额度账本、用量计量、Provider call 记录和商业审计事件。

- 账本事实与展示聚合分离。
- 不重算历史金额，不改变现有 CNY 调用时快照合同。

### Phase 7：删除兼容门面

目标：所有调用方依赖明确的领域接口，删除 `CommercialRepository`。

完成条件：

- 通用门面不再有业务方法。
- 所有调用方通过领域 repository/interface 注入。
- 无跨领域循环依赖。
- 全部行为、事务、锁和性能合同有相应测试。
- 删除门面后无需永久 alias 或双实现。

## 5. Phase 1 精确实施 Envelope

### 5.1 Focused module

Subscription read queries。

### 5.2 Intended change

新增 `CommercialSubscriptionQueries`，把首批无锁、无写入的 Subscription 查询从 `CommercialRepository` 原样迁入。`CommercialRepository` 增加继承并删除类内重复实现，现有 domain/API 调用方保持不变。

### 5.3 首批允许迁移的方法

- `get_subscription`
- `list_account_subscriptions`
- `list_subscriptions`
- `count_subscriptions`
- `summarize_subscription_status_counts`
- `summarize_subscription_plan_counts`
- `count_subscriptions_by_account`
- `count_subscriptions_by_site`
- `get_latest_account_subscription`
- `get_runtime_subscription`
- `count_subscriptions_expiring_by`，仅在实施会话再次确认它仍是无锁纯查询且没有新的事务耦合后纳入。

其中 `get_latest_account_subscription` 和 `get_runtime_subscription` 必须继续复用 `list_account_subscriptions`，避免复制排序规则。

### 5.4 明确排除

- `upsert_account_subscription`
- `get_subscription_for_update` 或任何带锁读取
- SubscriptionOrder 的读取、计数、创建或写入
- Plan、PlanVersion、PlanOffer
- Payment、Refund、Credit、Usage、Audit
- API、数据库 schema、迁移、业务状态或 domain policy 变化
- 调用方批量改为直接依赖新 query class
- M4 build/deploy、production 或 WordPress 改动

### 5.5 预期文件

首选精确范围：

- 新增 `app/adapters/repositories/commercial_subscription_queries.py`
- 修改 `app/adapters/repositories/commercial_repository.py`
- 扩展 `tests/domain/test_commercial_query_repositories.py`

只有在 characterization test 无法在现有测试文件清楚表达时，才允许新增一个聚焦测试文件；不得顺手整理其他商业测试文件。

### 5.6 必须保持的行为合同

- `list_account_subscriptions` 的 `created_at DESC, subscription_id DESC` 排序不变。
- `list_subscriptions` 的所有过滤器、Site join、`distinct`、offset、limit 和排序不变。
- `account_ids=[]`、`site_ids=[]` 的早返回语义不变。
- `limit=None`、`limit<=0` 的现有语义不变，不借机“修正”。
- count 与 summary 对空数据、空 status/plan id、`None` 的处理不变。
- grouped count 的 key/value 类型不变。
- runtime subscription 的 active/trialing 优先级和 fallback 不变。
- 相同 SQLAlchemy `Session` 注入方式不变。
- 查询类不得 `add`、`flush`、`commit`、`rollback` 或获取行锁。
- 门面上的公共方法签名、返回类型和异常行为不变。

### 5.7 Characterization tests

移动实现前先补红/绿或等价的行为特征测试，至少覆盖：

- 按账户排序和 latest/runtime 选择。
- status/statuses、account/account_ids、site/site_ids、plan、period-end 过滤组合。
- 空 ID 列表早返回。
- joined Site 不产生重复 Subscription。
- offset、正 limit、`None`/非正 limit。
- status/plan/account/site grouped counts。
- expiring count 的边界时间与 status 过滤（若纳入首批）。
- 新 query class 与旧 `CommercialRepository` 门面均可调用，结果一致。

测试的职责是锁定当前语义，而不是在重构批次中重新设计查询合同。

### 5.8 Verification gates

按风险从窄到宽执行：

1. `tests/domain/test_commercial_query_repositories.py` 的聚焦 pytest。
2. Ruff 与全量 mypy。
3. 受影响调用链的最窄测试，至少复核 `tests/domain/test_payment_service.py`、`tests/domain/test_subscription_commerce.py` 和 Portal/Commercial 相关节点；实际节点由最新调用图决定。
4. `pnpm run check:anti-drift`。
5. 若风险或集成收口需要，再运行 `pnpm run check:fast`，不要对同一 revision 无理由重复全门禁。
6. coherent checkpoint 后按 M4 规范执行一次 source-only candidate。fingerprint、锁或 ownership 异常立即停止；若命令要求 deploy，本批停止并重新确认，不自动升级。
7. M4 release 后再申请唯一 Cloud merge lane；required checks 是 merge authority。
8. 合并后从 clean current `origin/master` 执行 promotion、status 和最窄 smoke，只有 `acceptance_state=accepted` 才算 M4 accepted。

### 5.9 成功指标

- 允许清单中的方法只存在于新的 Subscription query module，由门面继承暴露。
- 所有现有调用方无需修改即可通过测试。
- SQL、排序、过滤、返回值和事务语义无变化。
- 新模块可以独立实例化和测试。
- `CommercialRepository` 方法数和职责实际下降。
- 后续新增 Subscription 读取不得回到通用门面文件。
- 没有 API、迁移、数据或 production 变化。

### 5.10 停止条件

出现以下任一情况立即停止并回执，不扩大 scope：

- 最新 master 已改变相关方法、模型或调用合同。
- 与其他会话发生文件、契约、Cloud lane 或 M4 ownership 冲突。
- 方法实际包含写入、锁、隐式 flush 或跨领域事务要求。
- characterization test 暴露当前调用方依赖未记录的副作用。
- M4 fingerprint 要求 deploy、存在 active lock/slot，或 candidate 来源不清。
- 为通过测试需要修改 API、数据库、业务逻辑或首批排除的领域。

## 6. 回滚

Phase 1 是无数据变更的单批结构迁移。回滚应为精确 revert：恢复门面内原查询方法、移除新增继承与 query 文件、回退对应测试。不得通过数据库迁移、数据修复或环境操作完成回滚。

## 7. 后续批次启动规则

Phase 2 及以后不得因 Phase 1 本地完成而自动启动。每批都必须重新：

1. fetch 并核对 current `origin/master`；
2. 盘点 open human PR、worktree、conflict domain、Cloud lane 和 M4 owner；
3. 声明独立 change envelope；
4. 在 clean locked worktree 实施；
5. local → M4 candidate → PR/CI → clean-master promotion 分层验收；
6. 明确双释放后才交棒下一批。

生产发布 Issue #406 与本结构重构解耦，在开发批次全部闭环并重新冻结 exact candidate 前不得自动启动。
