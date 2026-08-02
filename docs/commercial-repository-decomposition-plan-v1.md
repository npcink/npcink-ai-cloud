# CommercialRepository 渐进拆分实施计划 v1

状态：Phase 0 + Phase 1 + Phase 2A completed; Phase 2B candidate ready, PR pending

日期：2026-08-03

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

初始调查基线为
`origin/master@7936d9c023f64ba651bddabc79da14ceaee3f503`：

- `app/adapters/repositories/commercial_repository.py` 为 4,202 行。
- `CommercialRepository` 有 157 个方法。
- 类内同时包含 Support、Account、Site、Subscription、Plan、Payment、Refund、Identity、Credit、Usage、Audit 等多个领域。
- Account 和 Site 的无锁查询已经分别抽到 `CommercialAccountQueries` 与 `CommercialSiteQueries`，旧 `CommercialRepository` 通过继承保留兼容入口。
- Subscription 查询被 Billing、Admin、Portal、Payment、Runtime、Site 等多个 domain mixin 调用，直接一次性改调用方会扩大回归面。

因此，首批应复用现有 query mixin 模式，保持所有调用方不变，只移动无锁纯查询实现。

Phase 0 + Phase 1 已通过 PR
[#464](https://github.com/npcink/npcink-ai-cloud/pull/464) 合并。当前集成基线为
`origin/master@fd7e538e46f56a1b9c44777531f00fdb3281ba2b`：

- `CommercialSubscriptionQueries` 已承接 11 个 Subscription 无锁纯查询；
- `CommercialRepository` 通过继承继续暴露原公共入口，调用方未批量迁移；
- 门面从 4,202 行、157 个自有方法下降到 4,010 行、146 个自有方法；
- 合并后的 M4 状态为 `acceptance_state=accepted`、`promotion_pr=464`、
  `source_branch=master`、`source_dirty=false`；
- API、数据库、迁移、业务状态、权限、Production 与 WordPress 均未变化。

上述 SHA、行数和方法数是 2026-08-03 的阶段收口事实。后续批次仍必须从最新
`origin/master` 重新计算，不能把它们当作永久合同。

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

- Phase 2A 只拆无锁读取、聚合及其 SQL helper，继续使用兼容门面，不迁移调用方。
- Phase 2B 才允许在新的独立计划和事务清单下评估创建、状态流转和反馈写入。
- 保持既有全局风险排序、分页和 `return_to` 合同。
- Phase 2A 完成不自动授权 Phase 2B。

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

## 6. Phase 0 + Phase 1 收口与经验

### 6.1 实际迁移结果

本批实际迁移了以下 11 个方法：

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
- `count_subscriptions_expiring_by`

`count_subscriptions_expiring_by` 在实施时重新确认仍为无锁、无写入的纯 count
查询，没有新事务耦合，因此纳入。AST 对比确认迁移前后方法集合、签名和方法体
一致；新 query class 不包含 `add`、`flush`、`commit`、`rollback` 或行锁。

精确变更文件为：

- `app/adapters/repositories/commercial_subscription_queries.py`
- `app/adapters/repositories/commercial_repository.py`
- `tests/domain/test_commercial_query_repositories.py`
- `docs/commercial-repository-decomposition-plan-v1.md`

### 6.2 分层证据

| 层级 | 结果 |
| --- | --- |
| Characterization | 迁移前聚焦文件 5 passed |
| Local focused | 迁移后聚焦文件 5 passed；Ruff 通过；全量 mypy 260 个源文件无问题 |
| Local affected | Payment/SubscriptionCommerce 39 passed；Commercial runtime、Portal lock 和相关 Portal/Admin 节点 20 passed |
| Local policy | `check:anti-drift` 通过 |
| Local broad | 直接运行 contract/domain 选择：1,548 passed、3 skipped，732.09 秒 |
| M4 candidate | source-only sync；聚焦 query repository 5 passed，2.57 秒 |
| PR/CI | PR #464 required checks 全绿；backend-targeted 8 分 45 秒 |
| Merged | `origin/master@fd7e538e46f56a1b9c44777531f00fdb3281ba2b` |
| M4 accepted | `promotion_pr=464`；accepted smoke 1 passed，0.60 秒；`source_branch=master`、`source_dirty=false` |

没有自然业务流量，因此 24 小时观察和真实稳定性指标记录为未测量/N/A；没有为
制造数据调用付费 Provider。Production Issue #406 继续冻结。

### 6.3 为什么本批耗时较长

主要耗时不在约 190 行结构移动，而在必须串行闭环的证据链：

1. 本地全量 contract/domain 测试耗时 732.09 秒；
2. GitHub backend required check 耗时约 8 分 45 秒；
3. M4 candidate 必须先于 PR 收口，合并后又必须从干净 current master promotion；
4. `check:fast` 在不含 `.env` 的隔离 worktree 中于本地 Docker 前置检查退出，
   随后为了补齐证据又直接运行了同范围测试；
5. 文档 handoff、唯一文件 ownership、Cloud merge lane 和 shared M4 ownership
   都需要按顺序取得和释放。

其中第 4 项是可避免成本。缺少运行环境前置条件时，失败的 wrapper 不增加代码
正确性证据，也不应通过复制 `.env` 或改用本地 Docker 补救。

### 6.4 后续批次的验证去重规则

后续纯查询抽取采用证据覆盖矩阵，不以“多跑一次”替代风险判断：

1. 迁移前先跑 characterization tests；迁移后复跑同一聚焦集合。
2. 本地固定执行 Ruff、全量 mypy、最窄调用链测试和 `check:anti-drift`。
3. `check:fast` 只在集成风险确实要求且当前 worktree 满足其环境前提时运行。
   缺少 `.env` 时直接记录 not run/环境不满足，不先制造一次预期失败。
4. 对同一 revision，若 GitHub required checks 已承担完整 contract/domain merge
   authority，本地不再无理由重复同范围全量套件。
5. M4 candidate 只跑能证明迁移 seam 的精确文件或 node；合并后 promotion 只跑
   最窄 smoke，不重复 CI 已覆盖的全套测试。
6. CI 等待期间可以完成五轴 review、PR body 和证据整理，但 Cloud lane、M4
   candidate、merge 与 clean-master promotion 的状态转换不得并行越过。
7. source-only sync 若要求 deploy，或 fingerprint、ownership、lock/slot 异常，
   立即停止，不 retry、recover 或 fallback。

M4 relay 本批实测 candidate upload/download 为 11/2 秒，promotion 为 12/9 秒；
这些不是主要瓶颈。下一批应优化的是本地重复 broad gate 和等待期间的工作编排，
而不是削弱 merge authority 或 accepted 条件。

## 7. Phase 2A 建议：Support 无锁查询

Phase 2A 已按本节 envelope 完成本地实现和 M4 candidate 验证，并通过 PR #465
合并及 clean-master M4 acceptance。Phase 2B 在完成双释放后才从新 worktree 启动。

### 7.1 实现目标

新增 `CommercialSupportQueries`，原样迁移 Support 的无锁读取、列表、计数和队列
聚合。`CommercialRepository` 通过继承保留现有公共调用方式，第一批不修改
domain/API 调用方，也不改变 ADR-038 的 server-owned waiting-state projection。

当前 master 上建议纳入的 10 个公共方法为：

- `get_support_request`
- `get_support_request_message`
- `list_support_request_messages`
- `get_support_request_attachment`
- `list_support_request_attachments`
- `count_support_request_attachments`
- `get_support_request_feedback`
- `list_support_requests`
- `count_support_requests`
- `summarize_support_request_queue`

同时迁移仅服务上述查询的两个私有 SQL helper：

- `_support_request_risk_rank`
- `_support_request_filters`

若最新 master 仍保持该方法集合，完成后门面自有方法预计从 146 个下降到 134
个。这个预计值只用于 change envelope；交付时必须重新以 AST/当前代码报告实际值。

### 7.2 开始前必须处理的文档

每次实现会话完整阅读并遵守：

- `AGENTS.md` 与当前 `README.md`
- `docs/development-validation-operating-model-v1.md`
- `docs/parallel-ai-collaboration-standard-v1.md`
- `docs/m4-preview-ai-development-standard-v1.md`
- `docs/commercial-repository-decomposition-plan-v1.md`
- `docs/decisions/038-server-owned-support-waiting-state-projection.md`
- `docs/cloud-admin-support-requests-query-closeout-2026-07-29.md`
- `docs/cloud-admin-support-request-queue-retrospective-2026-08-01.md`
- `docs/cloud-admin-phase-c-support-request-queue-acceptance-2026-07-12.md`

实现批默认只更新本计划的事实、方法清单和验收证据。纯结构迁移不新建 ADR，
也不修改 ADR-038；若需要改变 waiting-state、48 小时阈值、Portal projection、
排序或分页语义，立即停止并另开业务合同批次。

### 7.3 首选文件范围

- 新增 `app/adapters/repositories/commercial_support_queries.py`
- 修改 `app/adapters/repositories/commercial_repository.py`
- 扩展 `tests/domain/test_commercial_query_repositories.py`
- 仅为锁定全局风险/分页 characterization 时扩展
  `tests/domain/test_support_request_queue.py`
- 收口时更新 `docs/commercial-repository-decomposition-plan-v1.md`

除 characterization 无法清楚落入上述测试外，不新增大型测试文件，不整理 Support
domain mixin、API route 或 Admin 前端。

### 7.4 必须保持的查询合同

- `get_*` 的 `None` 语义和同一 SQLAlchemy `Session` 注入方式不变；
- message/attachment 默认只返回 public，`include_internal=True` 语义不变；
- message 按 `created_at ASC, message_id ASC`，attachment 按
  `created_at ASC, attachment_id ASC`；
- attachment count 的空结果仍为 `0`；
- request 的 account/site/principal/status/topic/query/attention 过滤完全不变；
- 默认排序与 risk 排序、稳定 tie-breaker、offset、正 limit、`None`/非正 limit
  语义不变；
- risk、summary 和 attention 继续共享同一 48 小时 cutoff 与服务端投影；
- 全局过滤和风险排序继续发生在分页之前；
- 查询 class 不调用 `add`、`flush`、`commit`、`rollback`，不取得行锁，也不通过
  `no_autoflush` 等方式改变现有 Session autoflush 行为；
- 新 query class 与旧门面结果、签名、异常和调用顺序一致。

### 7.5 明确排除

- `create_support_request`
- `create_support_request_message`
- `create_support_request_attachment`
- `upsert_support_request_feedback`
- `mark_support_request_complete`
- `mark_support_request_waiting_for_operator`
- `restore_support_request_waiting_state`
- 任何等待状态、首次响应、公开活动或 notification 事务语义变化
- Support domain/API 调用方迁移、Admin UI、`return_to`、数据库和迁移变化
- assignment、AI reply、SLA policy、Production、WordPress 和 Phase 2B

### 7.6 Characterization 与验证目标

实现前先锁定：getter `None`、public/internal timeline、升序 tie-breaker、附件零计数、
所有 request filter、query 大小写归一化、默认/risk 排序、global-before-pagination、
attention/summary 共用 cutoff，以及空结果 summary。时间相关测试使用固定
`risk_as_of`，不依赖墙钟。

验证顺序为：

1. Support/query characterization focused pytest；
2. 迁移后同一 focused pytest；
3. Ruff、全量 mypy；
4. `tests/domain/test_support_request_queue.py` 及最新调用图对应的最窄 Support
   domain/API 节点；
5. `pnpm run check:anti-drift`；
6. 仅存在未覆盖集成风险且环境满足时运行 `check:fast`；否则由 GitHub required
   checks 承担 broad merge authority；
7. 一次 source-only M4 candidate 和精确 Support query focused test；
8. PR 合并后 clean-master promotion、status 和一个最窄 Support queue smoke。

### 7.7 Phase 2A 停止条件

- 任一候选方法出现写入、显式/隐式事务依赖、行锁或跨领域副作用；
- 移动 helper 需要改变 risk、attention、summary 或分页语义；
- 写路径依赖查询发生在 flush 前后的具体副作用，而继承门面无法原样保持；
- characterization 暴露 Portal/Admin 不一致，需要改 API 或 UI；
- 相关文件已有其他会话 ownership，或 shared M4/Cloud lane 不可用；
- 为通过测试需要纳入 Phase 2B 或修改 ADR-038。

### 7.8 Phase 2A candidate 收口证据

以 `origin/master@fd7e538e46f56a1b9c44777531f00fdb3281ba2b` 为实施基线，
Phase 2A 实际迁移了第 7.1 节列出的 10 个公共查询和 2 个私有 SQL helper。
AST 对比确认迁移前后的方法集合、签名和方法体全部一致。

当前 candidate 的精确文件为：

- 新增 `app/adapters/repositories/commercial_support_queries.py`
- 修改 `app/adapters/repositories/commercial_repository.py`
- 扩展 `tests/domain/test_commercial_query_repositories.py`
- 更新 `docs/commercial-repository-decomposition-plan-v1.md`

`tests/domain/test_support_request_queue.py` 作为既有 characterization 继续运行，
但不需要修改。门面从 4,010 行、146 个自有方法下降为 3,695 行、134 个自有
方法。新 query class 除 `__init__` 外为 12 个迁移方法，扫描确认没有
`add`、`add_all`、`flush`、`commit`、`rollback`、`with_for_update` 或
`no_autoflush`。

candidate 分层证据：

| 层级 | 结果 |
| --- | --- |
| Pre-move characterization | query repository + Support queue：8 passed |
| Post-move focused | 相同集合：8 passed |
| Static | Ruff 通过；全量 mypy 261 个源文件无问题 |
| Affected API | Portal Support 主流程与无 Site 支持流程：2 passed，1 个既有 deprecation warning |
| Policy | `check:anti-drift` 与 `git diff --check` 通过 |
| Initial M4 candidate | source-only sync；relay upload/download 13/2 秒；query repository 7 passed，3.53 秒 |
| M4 status | `acceptance_state=candidate`、`promotion_pr=none`、branch 为当前 topic、4 个 dirty task paths、Alembic head、HTTP healthy |

第一次 M4 focused 命令因错误地传入两个 `--focused` scope，在本地参数解析阶段
退出；没有 SSH、Docker 或 runtime mutation。随后按 wrapper 的单 scope 合同只
运行 query repository 文件。`check:fast` 未运行：隔离 worktree 不含 `.env`，
且本批没有额外风险需要重复 GitHub required checks 将承担的 broad merge gate。

Phase 2A 随后由 PR #465 合并为
`origin/master@341716326e8954743d1697eda2b5f7238ccd335f`。从 clean current
master 执行 promotion 后，M4 status 为 `acceptance_state=accepted`、
`promotion_pr=465`、`source_branch=master`、`source_dirty=false`，聚焦 query
repository smoke 为 7 passed。Cloud lane 与 shared M4 已分别释放。

## 8. Phase 2B：Support 写入 repository

### 8.1 Current-master 事务与锁清单

Phase 2B 基线为
`origin/master@341716326e8954743d1697eda2b5f7238ccd335f`。允许迁移 7 个方法：

- `create_support_request`
- `create_support_request_message`
- `create_support_request_attachment`
- `upsert_support_request_feedback`
- `mark_support_request_complete`
- `mark_support_request_waiting_for_operator`
- `restore_support_request_waiting_state`

前 4 个方法做 ORM mutation，并保持既有 `add`/`flush`；后 3 个 helper 只修改传入
的 `SupportRequest`。这 7 个方法均不 `commit`、`rollback`，不执行
`with_for_update` 或 advisory lock。事务仍由 `_support_mixin.py` 中 8 个 service
流程拥有：同一 Session 内完成 Support mutation、service audit record 和最终
`session.commit()`。本批不得把 commit 下沉到 repository，也不得拆开上述原子边界。

### 8.2 实现 envelope

- 新增 `app/adapters/repositories/commercial_support_repository.py`，其中
  `CommercialSupportRepository` 继承 `CommercialSupportQueries`，形成可独立实例化
  的完整 Support repository；
- `CommercialRepository` 改为继承 `CommercialSupportRepository`，保留全部现有
  domain/API 调用方式，不做调用方迁移；
- 新增 `tests/domain/test_commercial_support_repository.py`，先锁定 flush 后可见性、
  public/internal activity、waiting state、附件 byte size/count、feedback upsert 和
  3 个 state helper，再迁移实现；
- 既有 `tests/domain/test_support_request_queue.py` 与 Portal Support API 流程只作为
  affected regression 运行，不因结构拆分修改；
- 明确排除 assignment、AI reply、SLA、notification、API、数据库、migration、权限、
  业务状态重新解释、其他商业域、Production、WordPress 和调用方批量迁移。

### 8.3 保持合同与停止条件

- 7 个方法的签名、默认值、方法体、`add`/`flush` 时点和返回 ORM identity 必须与
  Phase 2B 基线一致；
- customer/operator/internal 对 activity、first response、waiting_on 和
  waiting_since 的影响保持不变；feedback update 忽略新的 feedback_id 并复用既有行；
- 新 repository 与 facade 使用同一 Session 时，查询和 ORM identity 必须一致；
- 若发现需要新增锁、commit/rollback、跨领域写入、状态机修复或调用方改造，立即停止。

实施完成后门面预计从 3,695 行、134 个自有方法下降为 3,491 行、127 个自有方法。
Phase 2B 完成不自动启动 Phase 3。

### 8.4 Phase 2B 本地收口证据

实际迁移了第 8.1 节 7 个方法。AST 对比确认方法集合、签名、decorator 与方法体均
与 Phase 2B 基线一致。当前精确变更文件为：

- 新增 `app/adapters/repositories/commercial_support_repository.py`
- 修改 `app/adapters/repositories/commercial_repository.py`
- 新增 `tests/domain/test_commercial_support_repository.py`
- 更新 `docs/commercial-repository-decomposition-plan-v1.md`

本地证据：

| 层级 | 结果 |
| --- | --- |
| Pre-move characterization | Support write + 既有 queue：3 passed |
| Post-move focused | Support write + query repository + queue：10 passed |
| Affected API | Portal Support 主流程与无 Site 支持流程：2 passed，1 个既有 deprecation warning |
| Static | Ruff 通过；全量 mypy 262 个源文件无问题 |
| Policy | `check:anti-drift`、`check:release-policy`、`git diff --check` 通过 |
| Transaction scan | 新 repository 无 commit、rollback、行锁、advisory lock 或 no_autoflush |

门面实际下降为 3,491 行、127 个自有方法。M4 candidate、PR/CI、merged source 和
clean-master M4 accepted 继续作为不同证据层；本节不预填尚未发生的结果。

## 9. 回滚

Phase 1 是无数据变更的单批结构迁移。回滚应为精确 revert：恢复门面内原查询方法、移除新增继承与 query 文件、回退对应测试。不得通过数据库迁移、数据修复或环境操作完成回滚。

Phase 2A 若实施，同样只允许精确 source revert：恢复 Support 查询与 helper 到门面、
移除新增继承/query 文件并回退对应 characterization。不得回滚
`20260801_0078`、修改等待状态数据或触碰 M4/Production 数据来完成结构回滚。

Phase 2B 只允许恢复 7 个 Support mutation/helper 到门面、移除
`CommercialSupportRepository` 继承与聚焦 characterization。不得通过数据修改、
事务补偿或环境操作完成结构回滚。

## 10. 后续批次启动规则

Phase 2 及以后不得因 Phase 1 本地完成而自动启动。每批都必须重新：

1. fetch 并核对 current `origin/master`；
2. 盘点 open human PR、worktree、conflict domain、Cloud lane 和 M4 owner；
3. 声明独立 change envelope；
4. 在 clean locked worktree 实施；
5. local → M4 candidate → PR/CI → clean-master promotion 分层验收；
6. 明确双释放后才交棒下一批。

生产发布 Issue #406 与本结构重构解耦，在开发批次全部闭环并重新冻结 exact candidate 前不得自动启动。
