# CommercialRepository 渐进拆分实施计划 v1

状态：Phase 0 至 Phase 6G M4 accepted；Phase 7A merged（M4 N/A）；Phase 7B 至 Phase 7I M4 accepted；CommercialRepository 继续拆分已暂停

日期：2026-08-03

适用仓库：`npcink-ai-cloud`

## 1. 目的

本计划用于把 `CommercialRepository` 从通用商业数据访问入口逐步拆成按领域负责的 repository/query 模块，在保持业务语义可验证的前提下降低修改影响面，最终删除通用巨型门面。

本计划不是按行数做机械拆分，也不是一次性重写。每一批只迁移一个内聚能力，先建立行为特征测试，再移动实现；API、数据库结构和业务规则保持不变。

实施与验收遵循：

- [结构整改交付规范](structural-remediation-delivery-standard-v1.md)
- [开发验证运行模型](development-validation-operating-model-v1.md)
- [并行 AI 协作规范](parallel-ai-collaboration-standard-v1.md)
- [M4 Preview AI 开发规范](m4-preview-ai-development-standard-v1.md)
- [生产发布策略](cloud-production-release-policy-v1.md)

阶段结果、收益复核、低效根因与商业验证交接见
[CommercialRepository 拆分收口与开发复盘](commercial-repository-decomposition-closeout-and-development-retrospective-2026-08-03.md)。

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

Phase 2B 随后由 PR #466 合并为
`origin/master@b660bd20baf76d168101f6f3715e8830f56fe6f9`。从 clean current
master promotion 后，M4 status 为 `acceptance_state=accepted`、
`promotion_pr=466`、`source_branch=master`、`source_dirty=false`；聚焦 Support
write repository smoke 为 2 passed。Cloud lane、shared M4 与 task worktree lock
均已释放。

## 9. Phase 3A：Plan 无锁查询

### 9.1 Current-master 方法与调用图

Phase 3A 基线为
`origin/master@b660bd20baf76d168101f6f3715e8830f56fe6f9`。本批只迁移：

- `get_plan`
- `list_plans`
- `get_plan_version`
- `list_plan_versions`
- `get_plan_offer`
- `list_plan_offers`

六个方法均只使用 `session.get`、`select`、`scalars`，没有 `add`、`flush`、
`commit`、`rollback`、行锁或 advisory lock。调用方分布在 billing、account、
subscription commerce、payment 和 runtime service mixin，但本批全部继续通过
`CommercialRepository` facade 调用，不批量迁移。

### 9.2 实现 envelope

- 新增 `app/adapters/repositories/commercial_plan_queries.py`；
- `CommercialRepository` 增加 `CommercialPlanQueries` 继承并移除类内重复实现；
- 扩展 `tests/domain/test_commercial_query_repositories.py`；
- 更新本文，记录 Phase 2B accepted 与 Phase 3A 合同；
- 明确排除 `upsert_plan`、`upsert_plan_version`、`upsert_plan_offer`、
  `upsert_account_subscription`、SubscriptionOrder、Payment/Refund、调用方迁移、
  API、数据库、migration、权限、Production 和 WordPress。

### 9.3 必须保持的查询合同

- getter 的命中 ORM identity 与缺失 `None`；
- Plan 按 `created_at DESC, plan_id DESC`，PlanVersion 按
  `created_at DESC, plan_version_id DESC`；
- Plan/Version 的 status、plan_id filter，以及 `limit <= 0` 不限量；
- 无 account_id 时 Offer 只返回 global offer；有 account_id 时只返回 global 加该
  account 的 offer；
- Offer 的 status、self-serve filter，`valid_from_at <= now` 和
  `valid_until_at > now`；
- Offer 按 `amount ASC, offer_id ASC`；新 query class 与 facade 结果一致；
- 若出现写入、锁、隐式事务或需要修改调用方/旧语义，立即停止。

迁移后门面预计从 3,491 行、127 个自有方法下降为 3,425 行、121 个自有方法。
Phase 3A 完成不自动授权 Plan/Subscription 写入或订单拆分。

### 9.4 Phase 3A 本地收口证据

实际迁移第 9.1 节 6 个方法。AST 对比确认方法集合、签名和方法体与 Phase 3A
基线一致；新 query class 无 mutation、flush、事务控制或锁。精确变更文件为：

- 新增 `app/adapters/repositories/commercial_plan_queries.py`
- 修改 `app/adapters/repositories/commercial_repository.py`
- 扩展 `tests/domain/test_commercial_query_repositories.py`
- 更新 `docs/commercial-repository-decomposition-plan-v1.md`

本地证据：

| 层级 | 结果 |
| --- | --- |
| Pre-move characterization | Plan query node：1 passed |
| Post-move focused/affected domain | query repository + Subscription Commerce + Payment：47 passed |
| Affected API | Admin Plan + anonymous public catalog：2 passed，1 个既有 deprecation warning |
| Static | Ruff 通过；全量 mypy 263 个源文件无问题 |
| Policy | `check:anti-drift`、`check:release-policy`、`git diff --check` 通过 |
| Structural | facade 为 3,425 行、121 个自有方法；query mutation/lock scan clean |

M4 candidate、PR/CI、merged source 与 clean-master accepted 继续分层记录，不预填
尚未发生的结果。

Phase 3A 随后由 PR #467 合并为
`origin/master@a0275099054cce383da4295f3b9d6178eea6df6a`。从 clean current
master promotion 后，M4 status 为 `acceptance_state=accepted`、
`promotion_pr=467`、`source_branch=master`、`source_dirty=false`；聚焦 Plan query
repository smoke 为 8 passed。Cloud lane、shared M4 与 task worktree lock 均已释放。

## 10. Phase 3B：Plan 写入

### 10.1 Current-master 方法与事务清单

Phase 3B 基线为
`origin/master@a0275099054cce383da4295f3b9d6178eea6df6a`。本批只迁移：

- `upsert_plan`
- `upsert_plan_version`
- `upsert_plan_offer`

三个方法均复用 Phase 3A 的 getter，create 时 `session.add`，create/update 后
`session.flush` 并返回同一 ORM identity；均不 `commit`、`rollback` 或取得行锁。
commit 继续由 billing、subscription commerce 与 runtime service 的外层 session
所有者执行。本批不迁移调用方，也不改变同一事务中的 audit、账户锁、Offer retire
或 Subscription 写入顺序。

### 10.2 实现 envelope 与合同

- 新增 `app/adapters/repositories/commercial_plan_repository.py`，继承
  `CommercialPlanQueries`；
- `CommercialRepository` 改为继承 `CommercialPlanRepository` 并移除类内三个重复
  upsert；
- 新增聚焦 characterization
  `tests/domain/test_commercial_plan_repository.py`；
- Plan create 的空 name 回退 `plan_id`，update 的空 name 保留旧 name；
- description 空字符串继续归一为 `None`；
- PlanVersion 与 PlanOffer update 继续逐字段完整替换；
- 明确排除 `upsert_account_subscription`、SubscriptionOrder、Payment/Refund、API、
  schema/migration、业务状态、权限、调用方迁移、Production 和 WordPress。

### 10.3 本地收口证据

迁移前 characterization 为 1 passed。迁移后 AST 对比确认三个方法集合、签名和
方法体与 current-master 基线完全一致；聚焦 Plan write + query repository 为
10 passed，受影响 Payment、Subscription Commerce 与 runtime defaults 为 50 passed，
Admin Plan 与 Payment API 为 2 passed（1 个既有 Starlette deprecation warning）。
Ruff 通过，全量 mypy 264 个源文件无问题，`check:anti-drift` 与
`git diff --check` 通过。

门面实际下降为 3,304 行、118 个自有方法。source-only M4 candidate 没有要求
deploy，并以 facade + 新 repository 的同一聚焦 Plan write characterization 作为
runtime seam。精确 bundle 与通过数以本批最终交付证据为准，避免为把 candidate
自身 fingerprint 写回 source 而制造循环重同步。PR/CI、merged source 和
clean-master M4 accepted 继续作为不同证据层；本节不预填尚未发生的结果。

Phase 3B 随后由 PR #468 合并为
`origin/master@df7f1d50eab5a50b1fef284a9f7ac73225faf410`。required checks 全绿，
其中 backend-targeted 为 7 分 54 秒。从 clean current master source-only promotion
后，M4 status 为 `acceptance_state=accepted`、`promotion_pr=468`、
`source_branch=master`、`source_dirty=false`；聚焦 Plan write repository smoke 为
2 passed。Cloud lane、shared M4 与 task worktree lock 均已释放。

## 11. Phase 3C：AccountSubscription 写入

### 11.1 Current-master 方法与事务清单

Phase 3C 基线为
`origin/master@df7f1d50eab5a50b1fef284a9f7ac73225faf410`。本批只迁移
`upsert_account_subscription`。该方法复用 Phase 1 的 `get_subscription`，create
时 `session.add`，create/update 后 `session.flush` 并返回同一 ORM identity；不
`commit`、`rollback` 或取得行锁。

调用方位于 Account、Billing 与 Subscription Commerce 流程。commit 及同一事务中
的 Plan ensure、entitlement snapshot、billing snapshot、audit、PaymentOrder 与
SubscriptionOrder 状态继续由既有 domain service 所有；本批不迁移调用方或重排
这些步骤。

### 11.2 实现 envelope 与合同

- 新增 `app/adapters/repositories/commercial_subscription_repository.py`，继承
  `CommercialSubscriptionQueries`；
- `CommercialRepository` 改为继承 `CommercialSubscriptionRepository` 并移除
  类内单一 upsert；
- 新增 `tests/domain/test_commercial_subscription_repository.py`；
- create/update 的 account、plan/version、status、period、started/canceled/
  suspended 与 metadata 字段语义保持不变；
- 不在 upsert 参数中的 scheduled plan/version/change 字段在 update 时继续保留；
- 明确排除直接 Subscription 状态流转整理、SubscriptionOrder、Payment/Refund、
  API、schema/migration、调用方迁移、权限、Production 和 WordPress。

### 11.3 本地收口证据

迁移前 characterization 为 1 passed。迁移后 facade 与新 repository 共同运行同一
合同；subscription write + query repository 为 10 passed。AST 对比确认签名和
方法体与 current-master 基线完全一致；受影响 Payment、Subscription Commerce 与
runtime defaults 为 50 passed，Entitlement API 为 6 passed（1 个既有 Starlette
deprecation warning）。Ruff 通过，全量 mypy 265 个源文件无问题，
`check:anti-drift` 与 `git diff --check` 通过。

门面实际下降为 3,259 行、117 个自有方法。M4 candidate、PR/CI、merged source
和 clean-master M4 accepted 继续作为不同证据层；本节不预填尚未发生的结果。

Phase 3C 随后由 PR #469 合并为
`origin/master@e0f0c4a39733c1ee9fa30c5928ea81b9ebcf00a1`。required checks 全绿，
backend-targeted 为 8 分 00 秒。从 clean current master source-only promotion 后，
M4 status 为 `acceptance_state=accepted`、`promotion_pr=469`、
`source_branch=master`、`source_dirty=false`；聚焦 Subscription write repository
smoke 为 2 passed。Cloud lane、shared M4 与 task worktree lock 均已释放。

## 12. Phase 3D：SubscriptionOrder repository

### 12.1 Current-master 方法与事务清单

Phase 3D 基线为
`origin/master@e0f0c4a39733c1ee9fa30c5928ea81b9ebcf00a1`。本批迁移：

- `get_subscription_order`
- `get_subscription_order_by_payment_order`
- `list_subscription_orders`
- `count_subscription_orders`
- `create_subscription_order`

前四个方法为无锁查询；create 只执行 `session.add` 与 `session.flush`。它们均不
commit、rollback 或取得行锁。账户锁、PaymentOrder 唯一约束、Provider order/
close 调用、幂等判断、订单状态流转、audit 和事务提交继续由既有 Subscription
Commerce service 所有。

### 12.2 实现 envelope 与合同

- 新增 `app/adapters/repositories/commercial_subscription_order_repository.py`；
- `CommercialRepository` 增加该 repository 继承并移除类内五个重复方法；
- 新增 `tests/domain/test_commercial_subscription_order_repository.py`；
- getter 命中 ORM identity、缺失 `None`，空 payment order id 早返回 `None`；
- list 保持 account filter、`created_at DESC, subscription_order_id DESC` 与
  `limit <= 0` 不限量；
- count 保持空 statuses 返回 0 和 status set 过滤；
- create 保持全部金额、period、source/target、payment link 与 metadata 字段，并
  在 flush 后返回同一 ORM identity；
- 明确排除 PaymentOrder/Refund/Event repository、Provider 调用、状态机重写、
  API、schema/migration、调用方迁移、Production 和 WordPress。

### 12.3 本地收口证据

迁移前 characterization 为 1 passed。迁移后 facade 与新 repository 共同运行同一
合同；SubscriptionOrder repository + Subscription Commerce 为 18 passed。AST
对比确认五个方法集合、签名和方法体与 current-master 基线完全一致；Payment
service 为 23 passed，Portal 创建/通知节点为 2 passed（1 个既有 Starlette
deprecation warning）。Ruff 通过，全量 mypy 266 个源文件无问题，
`check:anti-drift` 与 `git diff --check` 通过。

门面实际下降为 3,168 行、112 个自有方法。M4 candidate、PR/CI、merged source
和 clean-master M4 accepted 继续作为不同证据层；本节不预填尚未发生的结果。

Phase 3D 随后由 PR #470 合并为
`origin/master@6cf3eb22f2c058f02fdd543dc1f9d498323e11f8`。测试 fixture 中与本批无关的
高熵 idempotency 示例曾触发 Secret scan；将其收敛为 `None` 并 amend 单一 commit
后，Secret scan 通过，未增加 allowlist 或削弱扫描。最终 backend-targeted 为
8 分 34 秒。从 clean current master source-only promotion 后，M4 status 为
`acceptance_state=accepted`、`promotion_pr=470`、`source_branch=master`、
`source_dirty=false`；聚焦 SubscriptionOrder repository smoke 为 2 passed。
Cloud lane、shared M4 与 task worktree lock 均已释放。

## 13. Phase 4A：Payment、Refund 与 PaymentEvent 无锁查询

### 13.1 Current-master 方法与属性

Phase 4A 基线为
`origin/master@6cf3eb22f2c058f02fdd543dc1f9d498323e11f8`。本批迁移：

- `get_payment_order`
- `get_payment_order_by_idempotency_key`
- `get_payment_order_by_provider_external_order`
- `list_payment_orders`
- `list_pending_payment_orders_before`
- `count_payment_orders_by_status`
- `get_payment_refund`
- `get_payment_refund_by_idempotency_key`
- `list_payment_refunds`
- `get_payment_event_by_idempotency_key`
- `get_payment_event_by_provider_event`

11 个方法均只使用 `session.get`、`select`、`scalar`、`scalars` 或 `execute`，没有
add、flush、commit、rollback、`for_update` 或 advisory lock。

### 13.2 实现 envelope 与合同

- 新增 `app/adapters/repositories/commercial_payment_queries.py`；
- `CommercialRepository` 增加 `CommercialPaymentQueries` 继承并移除类内重复查询；
- 新增 `tests/domain/test_commercial_payment_queries.py`；
- 保持 idempotency/external/provider 空值早返回、account/site/status/canceled cutoff
  filter、offset/limit、pending cutoff 和 grouped status count；
- 保持 PaymentOrder 的 `created_at DESC, order_id DESC` 与 Refund 的
  `created_at DESC, refund_id DESC`；
- 明确排除 `get_payment_order_for_update`、三个 create、Provider 调用、金额/货币、
  状态机、API、schema/migration、调用方迁移、Production 和 WordPress。

### 13.3 本地收口证据

迁移前 characterization 为 1 passed；迁移后 facade 与新 query class 为 2 passed。
AST 对比确认 11 个方法集合、签名和方法体与 current-master 基线完全一致；新 query
class mutation/lock scan clean。Payment + Subscription Commerce 为 39 passed，Portal
创建/通知与 Payment route 为 3 passed（1 个既有 Starlette deprecation warning）。
Ruff 与精确 fixture Gitleaks 通过，全量 mypy 267 个源文件无问题，
`check:anti-drift` 与 `git diff --check` 通过。

门面实际下降为 3,032 行、101 个自有方法。M4 candidate、PR/CI、merged source
和 clean-master M4 accepted 继续作为不同证据层。

Phase 4A 的 source-only candidate bundle 为
`3ccc9c2e55ae20d33835fe57d204b14b43f9f726c1a950e25f929d33f069d2d3`，
M4 聚焦测试为 2 passed。PR
[#471](https://github.com/npcink/npcink-ai-cloud/pull/471) 的 required checks 全绿，
其中 `backend-targeted` 为 7 分 54 秒；合并后的 master revision 为
`86fdc9427f610d72309234dd364e7092babf5185`。clean-master source-only promotion 后：

- `acceptance_state=accepted`
- `promotion_pr=471`
- `source_branch=master`
- `source_dirty=false`
- accepted bundle
  `527d8a4caa6bbf7389767dcd0d2ea2d53912452df60f713fa590129ad73f76b5`
- `tests/domain/test_commercial_payment_queries.py`：2 passed

Phase 4A 的 Cloud merge lane、shared M4 与 task worktree lock 已明确释放。

## 14. Phase 4B：Payment、Refund 与 PaymentEvent 写入及锁读取

### 14.1 Current-master 方法、调用方与事务属性

Phase 4B 基线为
`origin/master@86fdc9427f610d72309234dd364e7092babf5185`。本批迁移：

- `get_payment_order_for_update`
- `create_payment_order`
- `create_payment_refund`
- `create_payment_event`

`get_payment_order_for_update` 使用单行 `SELECT ... FOR UPDATE`；三个 create 均只做
模型字段映射、`session.add`、`session.flush` 并返回同一 ORM identity。四个方法不
commit 或 rollback，事务生命周期继续由 Payment 与 SubscriptionCommerce service
的现有 `with get_session(...)` 调用流拥有。锁读取仍与调用方的状态机更新保持在同一
Session 内，本批不把锁拆出事务，也不改变任何幂等或状态判断。

直接调用集中在 `_payment_mixin.py` 与 `_subscription_commerce_mixin.py`；现有
Payment service、Subscription Commerce、Portal 支付创建/通知及 payment route 测试
是本批最窄回归图。第一批继续通过 facade 兼容，不迁移这些调用方。

### 14.2 实现 envelope 与合同

- 新增 `app/adapters/repositories/commercial_payment_repository.py`，继承
  `CommercialPaymentQueries`；
- `CommercialRepository` 改为继承 `CommercialPaymentRepository` 并移除四个类内
  重复实现；
- 新增 `tests/domain/test_commercial_payment_repository.py`；
- 保持四个方法的签名、返回类型、模型字段映射、flush、identity、rollback 和
  PostgreSQL `FOR UPDATE`；
- repository 不拥有 commit/rollback，不新增 advisory lock，不扩大锁范围；
- 明确排除支付状态机、幂等判定、Provider、金额/货币、支付宝回调、API、schema/
  migration、调用方迁移、Production 与 WordPress。

### 14.3 Characterization 与本地结构证据

迁移前 facade characterization 为 2 passed；迁移后 facade 与 direct repository
参数化为 4 passed。SQLite 路径验证三个 create 的字段、flush/identity 与 rollback，
PostgreSQL dialect 编译验证锁查询以 `FOR UPDATE` 结尾。AST 对比确认四个方法集合、
签名和方法体与 current-master 基线完全一致；新 repository 没有 commit/rollback。

门面当前为 2,914 行、97 个自有方法。本地回归、M4 candidate、PR/CI、merged source
和 clean-master M4 accepted 继续分别记录，不提前互相替代。

本地受影响验证：Payment query/repository、Payment service 与 Subscription Commerce
合计 45 passed；Portal 创建月付订单、开放支付宝通知与 payment route 合计 3 passed，
只有既有 Starlette deprecation warning。Ruff 与 format check 通过，全量 mypy 268 个
源文件无问题，`check:anti-drift` 与 `git diff --check` 通过。

Phase 4B 的最终 source-only candidate bundle 为
`e81e3bdd44810b819466072d2f19946eac31b4ddad4026a9030b78fae8acc6fd`，
M4 聚焦测试为 4 passed。PR
[#472](https://github.com/npcink/npcink-ai-cloud/pull/472) required checks 全绿，
`backend-targeted` 为 8 分 35 秒；合并后的 master revision 为
`e952de9ccd078e221748618a936a424dc2e025ce`。clean-master source-only promotion 后：

- `acceptance_state=accepted`
- `promotion_pr=472`
- `source_branch=master`
- `source_dirty=false`
- accepted bundle
  `f2406f03dab15705d112820ad6c948bd8ecac0687540fb33f01b767809a79a77`
- `tests/domain/test_commercial_payment_repository.py`：4 passed

Phase 4B 的 Cloud merge lane、shared M4 与 task worktree lock 已明确释放。

### 14.4 Payment 调用方迁移审计

Phase 4B accepted 后重新审计直接 Payment 调用图。17 个直接使用 Payment repository
方法的 domain 函数中，多数同时依赖尚未拆出的 Account 行锁、Entitlement、PaidCredit、
TrialClaim、SubscriptionOrder 或其他领域 mutation。此时逐方法替换会在一个 service
事务内形成 `CommercialRepository` 与 `CommercialPaymentRepository` 双入口，却不能
消除 facade 构造或证明更清晰的事务所有权。

因此 Phase 4 不进行表面调用方迁移。Payment 调用方与其他领域调用方统一在所有 facade
自有方法完成领域归属后迁移；届时同一 Session 可显式组合完整的领域 repository，并在
同一批删除兼容门面。该只读审计没有 source deliverable、PR、M4 或 Cloud lane。

## 15. Phase 5A1：Identity 核心无锁查询

### 15.1 Current-master 方法与属性

Phase 5A1 基线为
`origin/master@e952de9ccd078e221748618a936a424dc2e025ce`。本批迁移：

- `get_principal_identity`
- `get_principal_identity_by_ref`
- `get_identity_provider_binding`
- `get_identity_provider_binding_by_unionid`
- `list_identity_provider_bindings_for_principal`
- `list_identity_provider_bindings`
- `count_principals`
- `list_principals`

八个方法只使用 `session.get`、`select`、`scalar` 或 `scalars`，没有 add、delete、flush、
commit、rollback、`for_update`、`with_for_update` 或 advisory lock。
`get_principal_identity_by_email(for_update=...)`、`get_portal_oauth_state(for_update=...)`
和 `list_portal_login_codes(for_update=...)` 明确排除，即使其默认调用通常不取锁。

### 15.2 实现 envelope 与合同

- 新增 `app/adapters/repositories/commercial_identity_queries.py`；
- `CommercialRepository` 增加 `CommercialIdentityQueries` 继承并移除八个类内实现；
- 扩展既有 `tests/domain/test_commercial_query_repositories.py`，不新增散落测试文件；
- 保持 PK 与 ref lookup、unionid 空值早返回、provider/status filters、空列表早返回、
  binding 的 `created_at DESC, binding_id DESC`、principal 的
  `created_at DESC, principal_id ASC`、limit 非正值和 None/零值语义；
- 第一批不迁移调用方；明确排除 OAuth/login code、Admin directory 大查询、mutation、
  Membership/Site access/Platform admin、API、权限、schema/migration、Production 与
  WordPress。

### 15.3 Characterization 与本地结构证据

迁移前 facade characterization 为 1 passed；迁移后 facade 与 direct query class
参数化为 2 passed。测试覆盖 identity/ref lookup、binding provider/subject/unionid、
principal/provider/status filters、空输入、排序 tie-breaker、limit 与 count。AST 对比
确认八个方法的集合、签名和方法体与 current-master 完全一致；新 query class mutation/
lock scan clean。

门面当前为 2,809 行、89 个自有方法。其余本地回归、M4 candidate、PR/CI、merged
source 与 clean-master M4 accepted 继续分别记录，不提前互相替代。

本地完整 query repository、Auth 与三条 Portal identity 回归合计 118 passed，只有既有
Starlette deprecation warning。Ruff 与 format check 通过，全量 mypy 269 个源文件无
问题，`check:anti-drift` 与 `git diff --check` 通过。

Phase 5A1 的 source-only candidate bundle 为
`ccd568a99a3ffa7dfb1f95cc489b4ee140cf930bac044dd1ed5e14b8ae610602`，
M4 聚焦 characterization 为 2 passed。PR
[#473](https://github.com/npcink/npcink-ai-cloud/pull/473) required checks 全绿，
`backend-targeted` 为 8 分 8 秒；合并后的 master revision 为
`c6ee48513602507759ec5c6304e025fd8ef3227d`。clean-master promotion 后：

- `acceptance_state=accepted`
- `promotion_pr=473`
- `source_branch=master`
- `source_dirty=false`
- accepted bundle
  `ac915b70c34f69aa54bc7d604b87879d9f0b261f79fe423e2f7639c21cbbdfcf`
- Identity 聚焦 smoke：2 passed

Phase 5A1 的 Cloud merge lane、shared M4 与 task worktree lock 已明确释放。

## 16. Phase 5A2：Admin Portal user directory 查询

### 16.1 Current-master 方法与属性

Phase 5A2 基线为
`origin/master@c6ee48513602507759ec5c6304e025fd8ef3227d`。本批只迁移
`query_admin_portal_user_directory_page` 及其 `PortalUserDirectorySummary`、
`PortalUserDirectoryPage` 返回类型。该方法只执行 `select`、`execute` 与 `scalars`，
没有写入、flush、commit、rollback 或行锁。

### 16.2 实现 envelope 与合同

- 把方法和返回类型原样移入既有 `CommercialIdentityQueries`；
- facade 仅通过继承继续暴露入口，不迁移 Admin service 调用方；
- 新增聚焦 `tests/domain/test_commercial_identity_queries.py`；该复杂窗口/聚合查询无法
  清楚放入已经覆盖六个领域的通用 query test；
- 保持 ranked membership/site/subscription 窗口排序、covered subscription 优先、
  source/package 推断、QQ binding 聚合、literal `%`/`_`/反斜线转义、summary、
  offset/limit 与 `principal_created_at DESC, principal_id ASC`；
- 明确排除 Admin hydrate/projection、权限、API 响应、identity/membership mutation、
  schema/migration、Production 与 WordPress。

### 16.3 Characterization 与本地结构证据

迁移前 facade characterization 为 1 passed；迁移后 facade/direct 参数化为 2 passed。
测试覆盖 source/status/package/QQ filters、site URL search、literal wildcard、summary、
最终排序和分页。AST 对比确认方法签名与方法体与 current-master 完全一致；类型仅随方法
移动，新 query class mutation/lock scan 继续 clean。

门面当前为 2,502 行、88 个自有方法。本地回归、M4 candidate、PR/CI、merged source
与 clean-master M4 accepted 继续分别记录，不提前互相替代。

本地聚焦 characterization、Identity core 与完整 Portal users route 合计 7 passed，只有
既有 Starlette deprecation warning。Ruff 与 format check 通过，全量 mypy 269 个源
文件无问题，`check:anti-drift` 与 `git diff --check` 通过。

Phase 5A2 的 source-only candidate bundle 为
`2244e6c528eff4e314b8c3f5ee459457a32d8d769cad6c256d9fbab7da6f4759`，
M4 聚焦 characterization 为 2 passed。PR
[#474](https://github.com/npcink/npcink-ai-cloud/pull/474) required checks 全绿，
`backend-targeted` 为 8 分 49 秒；合并后的 master revision 为
`bd0da1a15615aebd824bf477114582b38355cb9d`。clean-master promotion 后：

- `acceptance_state=accepted`
- `promotion_pr=474`
- `source_branch=master`
- `source_dirty=false`
- accepted bundle
  `5fbdaaf623d0b109f9696b7a6e10dedd7c233d503342d0f6095bdaa41ad1d1bd`
- directory 聚焦 smoke：2 passed

Phase 5A2 的 Cloud merge lane、shared M4 与 task worktree lock 已明确释放。

## 17. Phase 5B1：Membership 与 Site binding 无锁查询

### 17.1 Current-master 方法与属性

Phase 5B1 基线为
`origin/master@bd0da1a15615aebd824bf477114582b38355cb9d`。本批迁移：

- `list_account_user_memberships`
- `count_active_account_principals`
- `count_active_account_sites`
- `count_active_principal_bound_sites`
- `get_account_user_membership`
- `list_accounts_for_principal`
- `list_sites_for_principal`
- `get_portal_site_access`
- `get_latest_released_site_account_binding`

九个方法只执行 get/select/scalar/execute，没有 add、delete、flush、commit、rollback 或
锁。`get_current_principal_site_binding(for_update=...)` 与
`get_current_site_account_binding(for_update=...)` 明确排除。

### 17.2 实现 envelope 与合同

- 新增 `CommercialMembershipQueries`，facade 继承并移除九个类内实现；
- 新增聚焦 `tests/domain/test_commercial_membership_queries.py`；
- 保持三类空列表早返回、membership/site/principal active filters、distinct count、
  account/site tuple 返回顺序、PrincipalSiteBinding current 条件、portal access outer join、
  released binding 的 `released_at DESC, binding_id DESC` 与 None/零值语义；
- 第一批不迁移调用方；明确排除所有可选锁方法、mutation、Platform admin、权限/API、
  schema/migration、Production 与 WordPress。

### 17.3 Characterization 与本地结构证据

迁移前 facade characterization 为 1 passed；迁移后 facade/direct 参数化为 2 passed。
AST 对比确认九个方法集合、签名和方法体与 current-master 完全一致；新 query class
mutation/lock scan clean。

门面在该批为 2,278 行、79 个自有方法。

本地 characterization、完整 Portal users、Admin accounts 与三条 Portal authorization
回归合计 12 passed，只有既有 Starlette deprecation warning。Ruff 与 format check
通过，全量 mypy 270 个源文件无问题，`check:anti-drift` 与 `git diff --check` 通过。

### 17.4 Phase 5B1 合并与 M4 accepted

Phase 5B1 由 PR #475 合并为
`befe5638d9cd86a2d47742efbffd3e7bec6971c7`；required `backend-targeted`
为 8 分 14 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=475`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`716fca4c837f9ba7b91f11513b89f122ab6a2c33004024260008e337c74fd0cf`；
聚焦 membership repository smoke 为 2 passed。Cloud lane、shared M4 与 task
worktree lock 均已释放。

### 17.5 Phase 5B2 Platform Admin 无锁查询

Phase 5B2 在 current `origin/master@befe5638` 上确认并迁移四个无锁纯查询：

- `get_platform_admin_grant`
- `get_platform_admin_grant_by_subject`
- `get_platform_admin_grant_by_email`
- `list_platform_admin_grants`

新增 `CommercialPlatformAdminQueries`，facade 通过继承维持公共调用；第一批不迁移
调用方。保持 provider/subject 精确匹配、email lower-case 比较、可选 status/role/provider
过滤、`created_at DESC, principal_id ASC` 排序、正数 limit 才生效，以及 None/空列表
语义。`upsert_platform_admin_grant`、`delete_platform_admin_grant`、权限/API、锁、schema、
Production 与 WordPress 明确排除。

迁移前 facade characterization 为 1 passed；迁移后 facade/direct 参数化为 2 passed。
AST 对比确认四个方法的签名与方法体完全一致；新 query class mutation/lock scan clean。
门面当前为 2,208 行、75 个自有方法。聚焦 characterization 与四个相关 Admin/Web
节点合计 6 passed，只有既有 Starlette deprecation warning；Ruff 通过，全量 mypy
271 个源文件无问题，`check:anti-drift` 与 `git diff --check` 通过。M4 candidate、
PR/CI、merged source 与 clean-master M4 accepted 继续分别记录。source-only M4
candidate bundle 为
`f9e09aa24802ec64e4c4c1dc2b52a3443b9cabf06cfb11103f89f05911d38de1`，聚焦
Platform Admin query repository smoke 为 2 passed；未要求 deploy，shared M4 ownership
已明确释放。

### 17.6 Phase 5B2 合并与 M4 accepted

Phase 5B2 由 PR #476 合并为
`71db490fe5ae58b2edd975dee21974bf18a73e0e`；required `backend-targeted`
为 8 分 20 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=476`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`708fadcf0f4ff7118a0fe8e31911ff6e4270ffaa90a612a64e5362e0213bd389`；
聚焦 Platform Admin query repository smoke 为 2 passed。Cloud lane、shared M4 与
task worktree lock 均已释放。

### 17.7 Phase 5C1 Portal Auth repository

Phase 5C1 在 current `origin/master@71db490f` 上确认并迁移七个 Portal Auth 方法：

- `create_portal_login_code`
- `expire_pending_portal_login_codes`
- `list_portal_login_codes`
- `get_principal_identity_by_email`
- `purge_expired_portal_auth_evidence`
- `get_portal_oauth_state`
- `create_portal_oauth_state`

新增 `CommercialPortalAuthRepository`，facade 通过继承维持公共调用；不迁移 domain/API
调用方。原样保留 add/delete/flush、PostgreSQL transaction advisory lock、可选
`with_for_update`、email lower-case、active-only 时钟、排序/limit、空 email、purge
`1..1000` 边界、返回计数，以及 OAuth 空字段归一化。repository 不拥有 commit/rollback，
不新增或扩大锁。IdentityProvider/Principal mutation、Membership、Platform Admin mutation、
Site binding、权限/API、schema、Production 与 WordPress 明确排除。

迁移前 facade characterization 为 2 passed；迁移后 facade/direct characterization 与
advisory-lock tests 合计 9 passed。AST 对比确认七个方法的签名和方法体与 current-master
完全一致。聚焦 repository/lock、WordPress Addon OAuth exchange、登录码 request/verify
和 retention cleanup 合计 12 passed，只有既有 Starlette deprecation warning；Ruff
通过，全量 mypy 272 个源文件无问题，`check:anti-drift` 与 `git diff --check` 通过。
门面当前为 2,037 行、68 个自有方法。其余 M4 candidate、PR/CI、merged source 与
clean-master M4 accepted 继续分别记录。source-only M4 candidate bundle 为
`853ce1c13b80022204e3a7eb73bb1085b5b160c5929cf2607a0dab3fd7fde964`，聚焦
Portal Auth repository smoke 为 4 passed；未要求 deploy，shared M4 ownership 已明确释放。

### 17.8 Phase 5C1 合并与 M4 accepted

Phase 5C1 由 PR #477 合并为
`cf174cf1327705dec4b7327f84509acb56650f1f`；required `backend-targeted`
为 8 分 39 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=477`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`067c5e352b42a1d1b47a0c5f011afd520a41d3027bcd49309347f47282fd2b89`；
聚焦 Portal Auth repository smoke 为 4 passed。Cloud lane、shared M4 与 task worktree
lock 均已释放。

### 17.9 Phase 5C2 Core Identity mutation

Phase 5C2 在 current `origin/master@cf174cf1` 上确认并迁移四个 core Identity mutation：

- `revoke_identity_provider_bindings`
- `upsert_identity_provider_binding`
- `upsert_principal_identity`
- `increment_principal_session_version`

新增 `CommercialIdentityRepository`，继承既有 `CommercialIdentityQueries` 与
`CommercialPortalAuthRepository`，以原样保留 `upsert_principal_identity` 对
`get_principal_identity_by_email` 的复用；facade 改为继承这一聚合层并保持公共调用。
保持 provider subject/union principal 不可变错误、last-login None 不覆盖、email fallback、
active binding revoke 计数、session version 零值递增、add/flush 与 None 返回。repository
不拥有 commit/rollback，不新增锁；调用方、Membership、Platform Admin mutation、Account/Site、
权限/API、schema、Production 与 WordPress 明确排除。

迁移前 facade characterization 为 1 passed，迁移后 facade/direct 为 2 passed；AST
对比确认四个方法的签名和方法体与 current-master 完全一致。Identity query、Portal Auth、
identity contract、完整 Portal users、QQ/email binding、session revoke 与 Admin session
相关回归合计 43 passed，只有既有 Starlette deprecation warning；Ruff 通过，全量 mypy
273 个源文件无问题，`check:anti-drift` 与 `git diff --check` 通过。门面当前为 1,925
行、64 个自有方法。其余 M4 candidate、PR/CI、merged source 与 clean-master M4
accepted 继续分别记录。source-only M4 candidate bundle 为
`7377efa45ab84fcf95138bf55b438638d90e11f5325f596388212a79722fac90`，聚焦
Identity repository smoke 为 2 passed；未要求 deploy，shared M4 ownership 已明确释放。

### 17.10 Phase 5C2 合并与 M4 accepted

Phase 5C2 由 PR #478 合并为
`81ff2929ccf8831f31f9d66ce1e9d19db6b790cb`；required `backend-targeted`
为 8 分 10 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=478`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`42450cc8db8382b3194d46104ea6ea667a425cc495c8b346ef161c57b33946e2`；
聚焦 Identity repository smoke 为 2 passed。Cloud lane、shared M4 与 task worktree lock
均已释放。

### 17.11 Phase 5D Access mutation

Phase 5D 在 current `origin/master@81ff2929` 上确认并迁移四个 access mutation：

- `upsert_account_user_membership`
- `revoke_account_user_memberships`
- `upsert_platform_admin_grant`
- `delete_platform_admin_grant`

新增 `CommercialAccessRepository`，继承既有 `CommercialMembershipQueries` 与
`CommercialPlatformAdminQueries`；facade 通过这一聚合层保持公共调用。保持 membership
唯一查找、`allowed_actions_json or []`、active-only revoke、grant create/update、delete
bool、add/delete/flush 与零计数语义。repository 不拥有 commit/rollback，不新增锁；
调用方、Site/principal binding、Account/Site、权限/API、schema、Production 与 WordPress
明确排除。

迁移前 facade characterization 为 1 passed，迁移后 facade/direct 为 2 passed；AST
对比确认四个方法的签名和方法体与 current-master 完全一致。Access、Membership、
Platform Admin、完整 Portal users 与相关 Admin session 回归合计 11 passed，只有既有
Starlette deprecation warning；Ruff 通过，全量 mypy 274 个源文件无问题，
`check:anti-drift` 与 `git diff --check` 通过。门面当前为 1,816 行、60 个自有方法。
其余 M4 candidate、PR/CI、merged source 与 clean-master M4 accepted 继续分别记录。
source-only M4 candidate bundle 为
`eca9b4fc93219faa8e2a5e427be80cf4d577c911059b56f1adcd62bd95b34033`，聚焦
Access repository smoke 为 2 passed；未要求 deploy，shared M4 ownership 已明确释放。

### 17.12 Phase 5D 合并与 M4 accepted

Phase 5D 由 PR #479 合并为
`2cd872b34399879e29eef69bbeb8a201102d2bac`；required `backend-targeted`
为 8 分 5 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=479`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`18cb2026f582da5c2d06044add126d2866b35041226bc7af757a70ee6132bcba`；
聚焦 Access repository smoke 为 2 passed。Cloud lane、shared M4 与 task worktree lock
均已释放。

### 17.13 Phase 5E Account/Site repository

Phase 5E 在 current `origin/master@2cd872b3` 上确认并迁移八个 Account/Site 方法：

- `get_account_for_update`
- `upsert_account`
- `get_site_for_update`
- `get_current_principal_site_binding`
- `create_principal_site_binding`
- `get_current_site_account_binding`
- `create_site_account_binding`
- `upsert_site`

新增 `CommercialAccountSiteRepository`，继承既有 Account/Site query 层；facade 通过
这一聚合层保持公共调用。保持 account/site row lock、binding 可选 row lock、current
filters/order/limit、add/flush、WordPress-only platform 校验、metadata URL 清洗、
provisioned-at 只填空及 None/缺失语义。repository 不拥有 commit/rollback，不新增
advisory lock；Site API key、trial/entitlement、Payment/Credit/Usage/Audit、调用方、
权限/API、schema、Production 与 WordPress 明确排除。

迁移前 facade characterization 与 Site platform contract 为 8 passed；迁移后
facade/direct Account/Site characterization 与双 repository Site contract 为 10 passed。
AST 对比确认八个方法的签名和方法体与 current-master 完全一致。Payment、
SubscriptionCommerce、Account/Site、service/Portal lock 与 authorization 回归合计
53 passed，只有既有 Starlette deprecation warning；Ruff 通过，全量 mypy 275 个源文件
无问题，`check:anti-drift` 与 `git diff --check` 通过。门面当前为 1,631 行、52 个自有
方法。source-only M4 candidate bundle 为
`9942d0ae4c489ceda0265f31728b3019ce5294dd11d5438d84e2df5ad0e89086`，聚焦
Account/Site repository smoke 为 2 passed；未要求 deploy，shared M4 ownership 已明确
释放。其余 PR/CI、merged source 与 clean-master M4 accepted 继续分别记录。

### 17.14 Phase 5E 合并与 M4 accepted

Phase 5E 由 PR #480 合并为
`b020d8ad69dd94e78f9560af7e085ca35beb4622`；required `backend-targeted`
为 8 分 31 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=480`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`9e13dc87af7e0c7935ea56002799943b7384304ffe8170986ab7814e07403adc`；
聚焦 Account/Site repository smoke 为 2 passed。Cloud lane、shared M4 与 task
worktree lock 均已释放。

### 17.15 Phase 5F Site API Key repository

Phase 5F 在 current `origin/master@b020d8ad` 上确认并迁移六个 Site API Key 方法：

- `get_site_key`
- `list_site_keys`
- `count_site_keys`
- `count_site_keys_by_site`
- `count_site_keys_total`
- `upsert_site_key`

新增 `CommercialSiteApiKeyRepository`；facade 通过继承保持公共调用。保持按
`created_at desc, key_id desc` 排序、offset/正 limit 规则、空 `site_ids` 早返回、空
statuses 不过滤、None/空列表/零计数、label 空串归一为 None、轮换关联字段、敏感密文
字段及 add/flush 语义。repository 不取得行锁，不拥有 commit/rollback；key
issue/rotate/revoke/expire 业务规则、调用方、权限/API、schema、Provider、Production 与
WordPress 明确排除。

迁移前 facade characterization 为 1 passed；迁移后 facade/direct characterization 与
既有 Service pagination contract 为 3 passed。AST 对比确认六个方法的签名和方法体与
current-master 完全一致。Payment、SubscriptionCommerce、Site monitoring、Service、
Portal、runtime authorization 与 internal-alpha 调用图回归合计 52 passed，只有既有
Starlette deprecation warning；Ruff 通过，全量 mypy 276 个源文件无问题，
`check:anti-drift` 与 `git diff --check` 通过。门面当前为 1,534 行、46 个自有方法。
source-only M4 candidate bundle 为
`17c492154e6384fec3b8ec59cc3294c971c31e3cc97413ee7ddfb7c0fb2e7124`，聚焦 Site
API Key repository smoke 为 2 passed；未要求 deploy，shared M4 ownership 已明确释放。
其余 PR/CI、merged source 与 clean-master M4 accepted 继续分别记录。

### 17.16 Phase 5F 合并与 M4 accepted

Phase 5F 由 PR #481 合并为
`d1eed51ba8300bc04986df2c8c7dff91379bab5f`；required `backend-targeted`
为 8 分 51 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=481`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`f30bc891f3c0293986161c27ce6ed3cf10fa800019df95689ebf48ee8c097dbc`；
聚焦 Site API Key repository smoke 为 2 passed。Cloud lane、shared M4 与 task worktree
lock 均已释放。

### 17.17 Phase 5G Trial/Entitlement repository

Phase 5G 在 current `origin/master@d1eed51b` 上确认并迁移六个 Trial/Entitlement 方法：

- `get_trial_claim`
- `find_trial_claim`
- `create_trial_claim`
- `supersede_entitlement_snapshots`
- `create_entitlement_snapshot`
- `get_active_entitlement_snapshot`

新增 `CommercialTrialEntitlementRepository`；facade 通过继承保持公共调用。保持 Trial
OR-filter、无过滤返回 None、active snapshot 过滤、可选 subscription 过滤、
`generated_at desc, id desc` 排序、supersede 范围、空结果及 add/flush 语义。
repository 不取得行锁，不拥有 commit/rollback；订阅/支付状态机、entitlement 重算、
调用方、权限/API、schema、runtime、Provider、Production 与 WordPress 明确排除。

迁移前 facade characterization 为 1 passed；迁移后 facade/direct characterization 为
2 passed。AST 对比确认六个方法的签名和方法体与 current-master 完全一致。Payment、
SubscriptionCommerce、Billing/Commercial policy、Portal trial/fallback 与 runtime
entitlement 调用图回归合计 49 passed，只有既有 Starlette deprecation warning；Ruff
通过，全量 mypy 277 个源文件无问题，`check:anti-drift` 与 `git diff --check` 通过。
门面当前为 1,405 行、40 个自有方法。source-only M4 candidate bundle 为
`4e1defb5691f071b37311583b54176f9c144c1914c42274c638260066c08eeeb`，聚焦
Trial/Entitlement repository smoke 为 2 passed；未要求 deploy，shared M4 ownership 已
明确释放。其余 PR/CI、merged source 与 clean-master M4 accepted 继续分别记录。

### 17.18 Phase 5G 合并与 M4 accepted

Phase 5G 由 PR #482 合并为
`e0d87e7e4a8332406839d8af6a277eae490e37eb`；required `backend-targeted`
为 8 分 32 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=482`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`b7ed05a5bc5ce7f6b7989ad347ae561edaea23002cb9fdb49be9f6965a60238b`；
聚焦 Trial/Entitlement repository smoke 为 2 passed。Cloud lane、shared M4 与 task
worktree lock 均已释放。

### 17.19 Phase 5H Runtime/Site Knowledge queries

Phase 5H 在 current `origin/master@e0d87e7e` 上确认并迁移四个无锁纯查询：

- `count_active_runs`
- `count_active_runs_by_site`
- `summarize_site_knowledge_current_counts`
- `summarize_site_knowledge_index_usage`

新增只读 `CommercialRuntimeKnowledgeQueries`；facade 通过继承保持公共调用。保持
queued/running 判定、空 `site_ids` 早返回、请求站点零填充、group-by、sum 零值，以及
account/subscription/since/until 过滤边界。query class 不 add/flush/commit/rollback，
不取得行锁；Run/Knowledge 写入、Usage/Provider 记录、调用方、权限/API、schema、
Provider、Production 与 WordPress 明确排除。

迁移前 facade characterization 为 1 passed；迁移后 facade/direct characterization 为
2 passed。AST 对比确认四个方法的签名和方法体与 current-master 完全一致。Payment、
SubscriptionCommerce、runtime defaults、Site monitoring、vector observability、Admin
聚合与 runtime concurrency 调用图回归合计 62 passed，只有既有 Starlette deprecation
warning；Ruff 通过，全量 mypy 278 个源文件无问题，`check:anti-drift` 与
`git diff --check` 通过。门面当前为 1,313 行、36 个自有方法。source-only M4 candidate
bundle 为 `c19ba292e094c76abc330bc90dc311036a21b2ecbfce880449da5f26b4f29cd1`，
聚焦 Runtime/Site Knowledge queries smoke 为 2 passed；未要求 deploy，shared M4
ownership 已明确释放。其余 PR/CI、merged source 与 clean-master M4 accepted 继续分别
记录。

### 17.20 Phase 5H 合并与 M4 accepted

Phase 5H 由 PR #483 合并为
`59b1379af9d6f1c3d6df409faca175b7671ebb8b`；required `backend-targeted`
为 8 分 29 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=483`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`fe6a3ccbc23825e8169991f01338cb9bd3d196a7af557e25a8a967bad947c9f8`；
聚焦 Runtime/Site Knowledge queries smoke 为 2 passed。Cloud lane、shared M4 与 task
worktree lock 均已释放；没有自然业务流量或观察窗口，24 小时业务观察为 N/A/未测量，
且未调用付费 Provider。

### 17.21 Phase 6A Credit Ledger queries

Phase 6A 在 current
`origin/master@59b1379af9d6f1c3d6df409faca175b7671ebb8b` 上确认并迁移六个无锁纯查询：

- `list_credit_ledger_entries`
- `summarize_credit_consumption_buckets`
- `list_portal_credit_event_groups`
- `list_credit_ledger_entries_for_event_groups`
- `summarize_portal_credit_event_buckets`
- `count_credit_ledger_entries`

新增只读 `CommercialCreditLedgerQueries`；facade 通过继承保持公共调用。保持账户、站点、
订阅、event/source type、since/until 过滤，空列表早返回，`created_at desc,
ledger_entry_id desc` 排序，正 offset/limit 规则，消费 bucket、Portal group/feature、
SQLite/PostgreSQL epoch floor 和 None/零值语义。query class 不 add/flush/commit/rollback，
不取得行锁。

重新审计确认 `get_paid_credit_grant_by_order` 与 `list_available_paid_credit_grants` 都有
可选 `for_update`，因此与 `consume_paid_credit_grants`、`refund_paid_credit_grant`、
`upsert_paid_credit_grant` 一并留给独立 PaidCreditGrant 事务批次；Usage 写入、Admin
usage/provider/billing、Audit/Decision、调用方、权限/API、schema、Provider、Production
与 WordPress 同样排除。

迁移前 facade characterization 为 2 passed；迁移后 facade/direct characterization 为
4 passed。AST 对比确认六个方法的签名和方法体与 current-master 完全一致。Runtime
defaults、Payment、SubscriptionCommerce、Portal credit event/trend/bucket 与 Admin credit
ledger 调用图回归合计 56 passed，只有既有 Starlette deprecation warning；Ruff 通过，
全量 mypy 279 个源文件无问题，`check:anti-drift` 与 `git diff --check` 通过。五轴 review
未发现 correctness、security、compatibility、performance 或 maintainability blocker。
门面当前为 940 行、30 个自有方法。M4 candidate、PR/CI、merged source 与 clean-master
M4 accepted 继续分别记录，不以本地绿色替代后续证据。

### 17.22 Phase 6A 合并与 M4 accepted

Phase 6A 由 PR #484 合并为
`266508d9a8e27c0025b4c643ff416bf8249314a0`；required `backend-targeted`
为 8 分 43 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=484`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`8af1a2cd9cf275eccd842017eacf95d92104e37c193a3147ccc3a005beb06da0`；
聚焦 Credit Ledger queries smoke 为 4 passed。Cloud lane、shared M4 与 task worktree
lock 均已释放；没有自然业务流量或观察窗口，24 小时业务观察为 N/A/未测量，且未调用
付费 Provider。

### 17.23 Phase 6B Credit repository

Phase 6B 在 current
`origin/master@266508d9a8e27c0025b4c643ff416bf8249314a0` 上确认并迁移六个 Credit
写入、PaidCreditGrant 查询/锁/写入方法：

- `record_credit_ledger_entry`
- `get_paid_credit_grant_by_order`
- `upsert_paid_credit_grant`
- `list_available_paid_credit_grants`
- `consume_paid_credit_grants`
- `refund_paid_credit_grant`

新增 `CommercialCreditRepository` 并继承 `CommercialCreditLedgerQueries`；facade 改为
继承这一聚合层保持公共调用。保持 ledger idempotency、consume 整数 credit 校验、六位
归一化、PaidCreditGrant upsert 幂等、`expires_at asc, created_at asc` 消耗顺序、可选
`FOR UPDATE`、consume/refund 上限与余额更新，以及 add/flush 语义。repository 不拥有
commit/rollback，不新增 advisory lock 或事务边界。

`record_usage_meter_event` 明确留给后续 Usage repository；Admin usage/run/provider/
billing、Audit/Decision、调用方、权限/API、schema、支付状态机、Provider、Production
与 WordPress 均排除。

迁移前 facade characterization 为 2 passed；迁移后 facade/direct Credit repository 与
既有 Credit Ledger characterization 为 8 passed。AST 对比确认六个方法的签名和方法体
与 current-master 完全一致，PostgreSQL characterization 同时确认两个可选锁读取生成
`FOR UPDATE`。Payment、runtime defaults、SubscriptionCommerce、Portal/Admin credit
与 Entitlement 调用图回归合计 70 passed，只有既有 Starlette deprecation warning；
Ruff 通过，全量 mypy 280 个源文件无问题，`check:anti-drift` 与 `git diff --check`
通过。门面当前为 763 行、24 个自有方法。M4 candidate、PR/CI、merged source 与
clean-master M4 accepted 继续分别记录，不以本地绿色替代后续证据。

### 17.24 Phase 6B 合并与 M4 accepted

Phase 6B 由 PR #485 合并为
`7a469427b24edfb15cab9171be353a418ab242d0`；required `backend-targeted`
为 8 分 29 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=485`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`a4ad6e26d7d76c7b4f6c4ec4ceff600778c83930daf405f7ca9fac7eafffd5c8`；
聚焦 Credit repository smoke 为 4 passed。Cloud lane、shared M4 与 task worktree lock
均已释放；没有自然业务流量或观察窗口，24 小时业务观察为 N/A/未测量，且未调用付费
Provider。

### 17.25 Phase 6C Usage queries

Phase 6C 在 current
`origin/master@7a469427b24edfb15cab9171be353a418ab242d0` 上确认并迁移七个
Usage/Run/Provider 无锁纯查询：

- `list_usage_meter_events`
- `list_usage_meter_events_for_admin`
- `summarize_usage_meter_events_for_admin`
- `list_run_records_for_admin`
- `list_run_records_by_ids`
- `list_provider_call_records_for_admin`
- `summarize_usage_meter_by_site`

新增只读 `CommercialUsageQueries`；facade 通过继承保持公共调用。保持 site/account/
subscription/ability/meter/run/since 过滤，空列表早返回，created/start 时间与稳定 ID
排序，正 limit 规则，meter totals、site totals 与 UTC `Z` 时间序列化。新 query class
原样包含 direct-instantiation 所需的 `_serialize_datetime`；facade 暂留同名 helper 供
尚未迁移的 Audit/Decision 汇总使用，不在本批抽公共 utility。

query class 不 add/flush/commit/rollback，不取得行锁；`record_usage_meter_event`、
BillingSnapshot、Audit/Decision、调用方、权限/API、schema、Provider、Production 与
WordPress 均排除。

迁移前 facade characterization 为 1 passed；迁移后 facade/direct characterization 为
2 passed。AST 对比确认七个方法的签名和方法体与 current-master 完全一致。Runtime
defaults、Billing rebuild、Site monitoring、Admin read 与 Usage service 调用图回归合计
21 passed，只有既有 Starlette deprecation warning；Ruff 通过，全量 mypy 281 个源文件
无问题，`check:anti-drift` 与 `git diff --check` 通过。门面当前为 595 行、17 个
自有方法。M4 candidate、PR/CI、merged source 与 clean-master M4 accepted 继续分别
记录，不以本地绿色替代后续证据。

### 17.26 Phase 6C 合并与 M4 accepted

Phase 6C 由 PR #486 合并为
`aefc84677d5ffc5f4b6fa5776ced8eea88764b78`；required `backend-targeted`
为 8 分 41 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=486`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`7c2fca96d63c2a13597b16bb897656e7adce0a30470def9276488902b748bde2`；
聚焦 Usage queries smoke 为 2 passed。Cloud lane、shared M4 与 task worktree lock
均已释放；没有自然业务流量或观察窗口，24 小时业务观察为 N/A/未测量，且未调用付费
Provider。

### 17.27 Phase 6D Usage repository

Phase 6D 在 current
`origin/master@aefc84677d5ffc5f4b6fa5776ced8eea88764b78` 上新增
`CommercialUsageRepository(CommercialUsageQueries)`，原样迁移
`record_usage_meter_event`。保持 dedupe key 查询、既有对象早返回、首次字段不覆盖、
UTC `created_at`、`add + flush` 与调用方事务所有权；新 repository 不 commit/rollback，
不取得行锁。facade 改为继承 repository，五个实际 domain 调用点不在本批迁移。

迁移前 facade characterization 为 1 passed；迁移后 facade/direct repository 与七个
query 的聚焦 characterization 为 4 passed。Runtime provider usage、非 fallback 错误
usage evidence、Agent Feedback 幂等与 Site Knowledge index usage 调用图回归合计
4 passed，只有既有 Starlette deprecation warning；Ruff 通过，全量 mypy 282 个源文件
无问题。门面当前为 543 行、16 个自有方法，其中 12 个为 Billing/Audit/Decision
业务方法，其余为 `__init__` 与三个 helper。M4 candidate、PR/CI、merged source 与
clean-master M4 accepted 继续分别记录，不以本地绿色替代后续证据。

### 17.28 Phase 6D 合并与 M4 accepted

Phase 6D 由 PR #487 合并为
`1d98743f3446b6ba053dd0674d1223b3e90548f0`；required `backend-targeted`
为 8 分 26 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=487`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`695e1a95174e210d5ffd85c5aa1b13b83c20c5508de697b6c5333da0f55359b4`；
聚焦 Usage repository smoke 为 4 passed。Cloud lane、shared M4 与 task worktree lock
均已释放；没有自然业务流量或观察窗口，24 小时业务观察为 N/A/未测量，且未调用付费
Provider。

### 17.29 Phase 6E Billing repository

Phase 6E 在 current
`origin/master@1d98743f3446b6ba053dd0674d1223b3e90548f0` 上新增
`CommercialBillingRepository`，原样迁移 `list_billing_snapshots`、
`get_latest_billing_snapshots_by_site` 与 `upsert_billing_snapshot`。保持 site 过滤、
period/start/snapshot 排序、空 site id 列表早返回、每站 latest 的 period end/generated/
snapshot 优先级、主键 get 后 insert/update、全部字段覆盖与 `add + flush`；repository
不 commit/rollback，不取得行锁。facade 通过继承保持调用方式，API/domain/dev 调用方
不在本批迁移。

迁移前 facade characterization 为 1 passed；迁移后 facade/direct characterization 为
2 passed。Billing rebuild、Usage service 与 Site monitoring 调用图回归 7 passed，只有
既有 Starlette deprecation warning；Ruff 通过，全量 mypy 283 个源文件无问题。
AST 对比确认三个方法签名和方法体与 current-master 完全一致。门面当前为 471 行、
13 个自有方法，其中九个为 Service Audit/Commercial Decision 业务方法，其余为
`__init__` 与三个 helper。M4 candidate、PR/CI、merged source 与 clean-master M4
accepted 继续分别记录，不以本地绿色替代后续证据。

### 17.30 Phase 6E 合并与 M4 accepted

Phase 6E 由 PR #488 合并为
`79e398bf278657a39faaa33611d05c20cd130602`；required `backend-targeted`
为 8 分 08 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=488`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`96ed4d14e5b8158ac1a93fa8a8c06669637945d903cbeac0102aadfc6ec45bb6`；
聚焦 Billing repository smoke 为 2 passed。Cloud lane、shared M4 与 task worktree lock
均已释放；没有自然业务流量或观察窗口，24 小时业务观察为 N/A/未测量，且未调用付费
Provider。

### 17.31 Phase 6F Service Audit repository

Phase 6F 在 current
`origin/master@79e398bf278657a39faaa33611d05c20cd130602` 上新增
`CommercialServiceAuditRepository`，原样迁移五个 Service Audit 业务方法与两个
direct-instantiation helper：

- `record_service_audit_event`
- `list_service_audit_events`
- `list_service_audit_events_for_principal`
- `count_service_audit_events`
- `summarize_service_audit_events`
- `_service_audit_filters`
- `_serialize_decision_datetime`

保持 audit event `add + flush`、UTC `created_at`、site/account/site_ids 组合过滤与空列表
语义、principal exact/suffix 匹配与空值早返回、时间/结果过滤、稳定倒序、limit 下限、
group/count 和 UTC `Z` 序列化。repository 不 commit/rollback，不取得行锁；facade 通过
继承保持调用方式，并暂留自己的 `_serialize_datetime` 供未迁移的 Commercial Decision
汇总使用。API/domain/worker 调用方、Decision、schema、权限、Provider、Production 与
WordPress 均不在本批迁移。

迁移前 facade characterization 为 1 passed；迁移后 facade/direct characterization 为
2 passed。AST 对比确认五个业务方法与两个 helper 的签名和方法体和 current-master
完全一致。Health、Service observability、Ops cadence、Portal audit 与 Service commercial
调用图回归合计 17 passed，只有既有 Starlette deprecation warning；Ruff 通过，全量
mypy 284 个源文件无问题。门面当前为 259 行、7 个自有方法，其中四个为 Commercial
Decision 业务方法，其余为 `__init__` 与两个 helper。M4 candidate、PR/CI、merged
source 与 clean-master M4 accepted 继续分别记录，不以本地绿色替代后续证据。

### 17.32 Phase 6F 合并与 M4 accepted

Phase 6F 由 PR #489 合并为
`81cab8e05668d5d266bdbf7a4b09fc94779d8d1c`；required `backend-targeted`
为 8 分 33 秒通过。clean current `origin/master` 的 source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=489`、`source_branch=master`、
`source_dirty=false`，source bundle 为
`3cc0f011082ad970f60c25c7f2d7143d35788b429b4b839506ba765cbb202ae9`；
聚焦 Service Audit repository smoke 为 2 passed。Cloud lane、shared M4 与 task
worktree lock 均已释放；没有自然业务流量或观察窗口，24 小时业务观察为 N/A/未测量，
且未调用付费 Provider。

### 17.33 Phase 6G Commercial Decision repository

Phase 6G 在 current
`origin/master@81cab8e05668d5d266bdbf7a4b09fc94779d8d1c` 上新增
`CommercialDecisionRepository`，原样迁移四个 Commercial Decision 业务方法与两个
direct-instantiation helper：

- `record_commercial_decision_event`
- `list_commercial_decision_events`
- `count_commercial_decision_events`
- `summarize_commercial_decision_events`
- `_commercial_decision_filters`
- `_serialize_datetime`

保持 decision event `add + flush`、UTC `created_at`、site/subscription/decision/code/
request kind/since 过滤、created/id 稳定倒序、`limit=None` 不限量、count 零值、汇总分组、
limit 下限与 UTC `Z` 序列化。时间 helper 使用 Decision 专属命名，避免 facade 多继承时
被更早的 Usage helper 截获；repository 不 commit/rollback，不取得行锁；facade 通过继承
保持调用方式。API/domain/worker 调用方、schema、权限、Provider、Production、WordPress
与 facade 删除均不在本批迁移。

迁移前 facade characterization 为 1 passed；迁移后 facade/direct characterization 为
2 passed。AST 对比确认四个业务方法的公共签名、SQL/过滤/排序/写入结构与
current-master 一致；唯一有意变化是把内部时间 helper 绑定为 Decision 专属名称，以
消除 facade MRO 歧义。Commercial runtime defaults、Service commercial/admin read 与 runtime
diagnostics 调用图回归合计 14 passed，只有既有 Starlette deprecation warning；Ruff
通过，全量 mypy 285 个源文件无问题。门面当前为 60 行、仅有 `__init__` 一个自有方法，
业务职责已全部进入领域 repository/query，但 facade 仍是调用方依赖的临时聚合类型。
M4 candidate、PR/CI、merged source 与 clean-master M4 accepted 继续分别记录，不以
本地绿色替代后续证据。

### 17.34 Phase 6G 合并与 M4 accepted

Phase 6G 由 PR #490 合并为
`6cc899e39af8356f5b186b3ff3c4d678c6f04edb`。自动 review 识别 facade MRO 会让通用
`_serialize_datetime` 被更早的 Usage 基类截获；同一 PR 将 helper 收紧为 Decision
专属名称，并增加反证 characterization，review thread 已 resolved。修正版 required
`backend-targeted` 为 8 分 32 秒通过。clean current `origin/master` 的 source-only
promotion 显示 `acceptance_state=accepted`、`promotion_pr=490`、
`source_branch=master`、`source_dirty=false`，source bundle 为
`215d8e7dbd639abf001c45ddfe7d0c0dcb411afed9e4a34f45d0565d233657d3`；
聚焦 Commercial Decision repository smoke 为 2 passed。Cloud lane、shared M4 与
task worktree lock 均已释放；没有自然业务流量或观察窗口，24 小时业务观察为
N/A/未测量，且未调用付费 Provider。

### 17.35 Phase 7A facade retirement freeze

Phase 7A 在 current
`origin/master@6cc899e39af8356f5b186b3ff3c4d678c6f04edb` 上建立 retirement
architecture contract，不迁移调用方：

- facade 自有方法固定为 `__init__`，不得重新吸收业务职责；
- 16 个现有领域 repository/query 基类集合被冻结，不得增加新的兼容继承；
- production importer 固定为 current-master 18 个文件的子集，后续可删除但不可新增；
- production 构造点不超过 126、名称引用不超过 185、参数类型注解不超过 59，作为
  后续批次只能净递减的 burn-down 基线；
- facade alias 被显式禁止，避免绕过统计。

本批只新增 contract 与更新计划，不修改 `app/**`、runtime、API、事务、锁、schema、
权限、Provider、Production 或 WordPress。focused contract 为 2 passed，Ruff 与 mypy
通过，`check:anti-drift` 与 diff check 在收口执行。按 M4 标准分类为 local-only
test/docs 变化，不产生 candidate、不占 shared M4。下一批从低耦合 production caller
开始迁移，随后再按 commercial mixin 事务域分批收敛；不得用新的通用代理替换旧 facade。

### 17.36 Phase 7A 合并

Phase 7A 由 PR #491 合并为
`4d2f0ae99fe4d069ad10cd5b340a2fa2357f5289`；required `backend-targeted`
为 8 分 37 秒通过。该批只有 test/docs 变化，M4 candidate、promotion 与 accepted 均为
N/A，shared M4 始终未占用；Cloud lane 与 task worktree lock 已释放。

### 17.37 Phase 7B 低耦合 production caller

Phase 7B 在 current
`origin/master@4d2f0ae99fe4d069ad10cd5b340a2fa2357f5289` 上迁移八个低耦合
production caller：

- `app/api/auth.py` 与 `app/api/portal_session.py` 直接使用
  `CommercialIdentityRepository`；
- `app/domain/agent_feedback/service.py` 与 `app/domain/site_knowledge/metrics.py`
  直接使用 `CommercialUsageRepository`；
- `alert_provider_degradation.py`、`latency_probe_summary.py`、
  `router_diagnostics_summary.py`、`router_performance_snapshot.py` 直接使用
  `CommercialAccountSiteRepository`。

两个 worker 测试中的站点 fixture 也改为直接使用
`CommercialAccountSiteRepository`，使可执行 seam 的既有 pytest 同时成为本批
anti-drift backstop；测试仅替换 repository 构造，不改变 fixture 数据或断言。

每处继续使用原 SQLAlchemy Session、同一方法参数和返回处理，不改变事务提交、异常、
site 过滤、usage dedupe 或 metering 语义；未引入新的 repository bundle、factory、alias
或通用代理。production facade importer 从 18 降至 10，构造点从 126 降至 118，名称引用
从 185 降至 177，59 个 commercial mixin helper 注解暂未处理。retirement contract 为
2 passed；认证/session、Agent Feedback、Site Knowledge metering 与四个 worker 的最窄
调用图为 121 passed，只有既有 Starlette deprecation warning；Ruff 通过，全量 mypy
285 个源文件无问题，`check:anti-drift` 与 `git diff --check` 通过。M4 candidate、
PR/CI、merged source 与 clean-master M4 accepted 继续分别记录，不以本地绿色替代
后续证据。

### 17.38 Phase 7B 合并与 M4 accepted

Phase 7B 由 PR #492 squash merge 为
`88f0d9a41b5d63f64c10f69fe4a7d45dad15dbf0`。required backend full-shard gate
全部通过，其中 shard 1/2/3 分别耗时 32 分 22 秒、8 分 51 秒、9 分 38 秒；该差异是
pytest duration weights 失衡证据，不属于本批 repository caller 行为失败，也不在本批
调整 CI 基础设施。clean current `origin/master` source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=492`、`source_branch=master`、
`source_dirty=false`，accepted source bundle 为
`ca53e8c5a1c3a316a6dd915df9fb99d8348908550f0f5bb5bd040aac015c504f`；
post-merge retirement contract smoke 为 2 passed。Cloud lane 与 shared M4 均已释放。

### 17.39 Phase 7C Audit mixin caller

Phase 7C 在 current
`origin/master@88f0d9a41b5d63f64c10f69fe4a7d45dad15dbf0` 上迁移
`app/domain/commercial/mixins/_audit_mixin.py`：

- 三个 ServiceAudit 构造与 `_record_service_audit_in_session` 注解直接使用
  `CommercialServiceAuditRepository`；
- 两个 Decision 构造以及 `_record_commercial_decision_in_session`、
  `_build_budget_policy_state` 注解直接使用 `CommercialDecisionRepository`。

本批不改方法调用、Session、commit、返回序列化、payload redaction、grace count 或任何
repository 实现。先新增 retirement characterization，迁移前为 2 passed、1 expected
failed，迁移后为 3 passed；Service Audit、Decision、Service route、Payment 与
SubscriptionCommerce 调用图为 67 passed，只有既有 Starlette deprecation warning。
Ruff 通过，全量 mypy 285 个源文件无问题，`check:anti-drift` 与 `git diff --check`
通过。production facade importer 从 10 降至 9，构造点从 118 降至 113，名称引用从
177 降至 169，helper 注解从 59 降至 56。M4 candidate、PR/CI、merged source 与
clean-master M4 accepted 继续分别记录，不以本地绿色替代后续证据。

Phase 7C 随后由 PR #493 squash merge 为
`86abe217494f03810b5733d31fc29adcfd19bcb2`；required `backend-targeted`
为 7 分 7 秒通过。clean current `origin/master` source-only promotion 显示
`acceptance_state=accepted`、`promotion_pr=493`、`source_branch=master`、
`source_dirty=false`，accepted source bundle 为
`defb1a615a00ed75f976b1896aab21c6605bc5deef6d51f32740f537ce11b9a2`；
post-merge retirement contract smoke 为 3 passed。Cloud lane、shared M4 与 task
worktree lock 均已释放。

### 17.40 Phase 7D Support mixin caller

Phase 7D 在 current
`origin/master@86abe217494f03810b5733d31fc29adcfd19bcb2` 上迁移
`app/domain/commercial/mixins/_support_mixin.py`：

- 13 个 Support 构造直接使用 `CommercialSupportRepository`；
- 7 条与 Support mutation 共用同一 Session 的审计写入，使用独立的
  `CommercialServiceAuditRepository`；
- 6 条 Portal account membership access 查询使用
  `CommercialAccessRepository`，包括 helper 参数注解。

原门面共有 14 个构造点；其中一个只执行 membership access，不应误归为 Support。
characterization 初稿据调用点名称曾把该职责猜为 Identity，随后全量 mypy 证明
`get_account_user_membership` 的实际 owner 是继承 `CommercialMembershipQueries` 的
`CommercialAccessRepository`，据真实继承图修正测试和实现。所有 repository 继续接收
同一个 SQLAlchemy Session；commit、flush 时点、Support 状态机、Portal 权限判断和审计
原子边界均不改变。

迁移前 retirement characterization 为 3 passed、1 expected failed；迁移后为
4 passed。Support repository/queue 与 Portal/Admin Support 最窄调用图为 5 passed，
只有既有 Starlette deprecation warning；Ruff 通过，全量 mypy 285 个源文件无问题。
production facade importer 从 9 下降到 8，构造点从 113 下降到 99，名称引用
从 169 下降到 154，helper 注解从 56 下降到 55；上述数值已由 current diff 的 AST
扫描核定。
本批不修改 repository 实现、API/schema/权限合同、Support 状态机、数据库、Provider、
Production 或 WordPress。M4 candidate、PR/CI、merged source 与 clean-master M4 accepted
继续分别记录，不以本地绿色替代后续证据。

Phase 7D 随后由 PR #494 squash merge 为
`dc63492c05d1c7229d4448d30b6e60d27fa3a558`；required `backend-targeted`
为 8 分 22 秒通过，且无 review 变更请求。clean current `origin/master` source-only
promotion 显示 `acceptance_state=accepted`、`promotion_pr=494`、
`source_branch=master`、`source_dirty=false`，accepted source bundle 为
`e6e10cff31ed867c1c9710f9f0b7e1db2a9e2dce97392b95290b83fe602951b2`；
post-merge retirement contract smoke 为 4 passed。Cloud lane、shared M4 与 task
worktree lock 均已释放。

### 17.41 Phase 7E Admin Identity/Access caller

Phase 7E 在 current
`origin/master@dc63492c05d1c7229d4448d30b6e60d27fa3a558` 上迁移 Admin mixin 中
八个身份与访问入口：platform-admin grant 的 upsert/resolve/delete/list、Portal user
directory/audit/disable/batch-disable，以及 `_build_admin_identity_projections` helper。

这些入口按真实 owner 使用 `CommercialIdentityRepository`、
`CommercialAccessRepository`、`CommercialServiceAuditRepository`、
`CommercialAccountSiteRepository` 与 `CommercialSubscriptionRepository`。所有 wrapper
继续共享原 SQLAlchemy Session；grant mutation、principal session-version increment、
membership/binding revoke、audit record 和最终 commit 的顺序及原子边界不变。三个仍使用
facade 的 Admin dashboard 调用点只为 identity projection helper 额外构造 Identity/Access
repository，不迁移其余职责。

迁移前 retirement characterization 为 4 passed、1 expected failed；迁移后为 5 passed。
Portal user directory characterization 原先 monkeypatch facade 的 `list_principals`，本批仅将
patch owner 改为新的 Identity repository，分页后 hydrate 的断言不变。Grant、Portal user、
Identity、Access 与 Service Audit 最窄调用图为 16 passed，只有既有 Starlette deprecation
warning；Ruff 通过，全量 mypy 285 个源文件无问题。production facade importer 暂保持 8，
构造点从 99 降至 91，名称引用从 154 降至 145，helper 注解从 55 降至 54，均由 AST
核定。Admin overview/coverage/credit、账户 reconciliation、API/schema/权限模型、数据库、
Provider、Production 与 WordPress 明确不在本批。M4 candidate、PR/CI、merged source 与
clean-master M4 accepted 继续分层记录。

Phase 7E 随后由 PR #495 squash merge 为
`45f32f4ecc270f8b00874de325aa3a430fa12af3`；required `backend-targeted`
为 8 分 25 秒通过，且无有效 review 变更请求。clean current `origin/master`
source-only promotion 显示 `acceptance_state=accepted`、`promotion_pr=495`、
`source_branch=master`、`source_dirty=false`，accepted source bundle 为
`43b785513878db26e234c223a9bbfd6fe0ddaa23012c53b23b3acbe06018e0b6`；
post-merge retirement contract smoke 为 5 passed。Cloud lane、shared M4 与 task
worktree lock 均已释放。

### 17.42 Phase 7F Admin dashboard/credit caller

Phase 7F 在 current
`origin/master@45f32f4ecc270f8b00874de325aa3a430fa12af3` 上迁移 Admin mixin 中六个
dashboard/credit 入口：`get_admin_overview`、
`get_commercial_shadow_pricing_summary`、`list_admin_accounts`、
`get_admin_coverage_work_queue`、`apply_admin_account_credit_adjustment` 与
`get_admin_account_credit_ledger`。

这些入口按真实 owner 使用 `CommercialAccountSiteRepository`、
`CommercialIdentityRepository`、`CommercialAccessRepository`、
`CommercialSiteApiKeyRepository`、`CommercialSubscriptionRepository`、
`CommercialBillingRepository`、`CommercialCreditRepository`、
`CommercialUsageRepository`、`CommercialServiceAuditRepository` 与
`CommercialDecisionRepository`。shadow-pricing 所需 Run/ProviderCall 查询实际由 Usage
repository 持有，不误归到 Runtime Knowledge。所有 repository 继续共享原 SQLAlchemy
Session；credit entry、audit record 与最终 commit 的顺序及原子边界不变。

`get_admin_account` 与 `get_admin_account_quota_summary` 暂不迁移：前者调用账户订阅状态
reconciliation，后者依赖跨域 plan/quota helper；在 helper 参数合同和事务 owner 未单独
characterize 前，不以简单机械替换掩盖跨域耦合。

迁移后 retirement characterization 为 6 passed；Admin accounts、coverage 与 credit 的
最窄行为调用图为 9 passed，只有既有 Starlette deprecation warning；Ruff 通过，全量
mypy 285 个源文件无问题。production facade importer 暂保持 8，构造点从 91 降至 85，
名称引用从 145 降至 139，helper 注解保持 54；facade 本体保持 60 行、16 个 repository
base 与唯一 `__init__`。上述数值均由 current diff 的 AST 扫描核定。

本批不修改 repository 实现、账户 reconciliation、plan/quota helper、API/schema/权限、
数据库、Provider、Production 或 WordPress。M4 candidate、PR/CI、merged source 与 clean-
master M4 accepted 继续分层记录，不以本地绿色替代后续证据。

Phase 7F 随后由 PR #496 squash merge 为
`86503ba5386c9eacf7de5e4a098e944bebb1f6d2`；required `backend-targeted`
为 7 分 59 秒通过，且无有效 review 变更请求。clean current `origin/master`
source-only promotion 显示 `acceptance_state=accepted`、`promotion_pr=496`、
`source_branch=master`、`source_dirty=false`，accepted source bundle 为
`61da5c0cbbe096391312089f21389c50ec17942ca0fd0469fb475dc979b8609c`；
post-merge retirement contract smoke 为 6 passed。Cloud lane、shared M4 与 task
worktree lock 均已释放。

### 17.43 Phase 7G Admin cross-domain lifecycle caller

Phase 7G 在 current
`origin/master@86503ba5386c9eacf7de5e4a098e944bebb1f6d2` 上迁移 Admin mixin 最后两个
facade 入口：`get_admin_account` 与 `get_admin_account_quota_summary`。审计确认两者共同
调用的 reconciliation 不是纯查询：它可能激活 SubscriptionOrder、执行到期 free
downgrade、终止 paid trial、恢复默认 Free Subscription、刷新 entitlement/billing
snapshot、记录 service audit，并显式 flush/commit。因此本批不把它机械拆成松散查询，
而是新增有界的 `CommercialSubscriptionLifecycleRepository`，明确组合 Account/Site、
Plan、Subscription、SubscriptionOrder、Trial/Entitlement、Payment、Usage、Billing 与
Service Audit 九个既有 owner，作为一个 subscription lifecycle transaction seam。

该 lifecycle repository 只有 Session 初始化，不新增查询、写入或兼容转发方法；它不是
第二个通用 facade。原 reconciliation 及下游 helper 的执行逻辑、顺序、flush/commit
位置均不变，只把类型合同收窄到该事务 owner。Admin 的账户、站点、订阅、Plan、Usage、
Credit、Decision、Site API Key、Runtime Knowledge、Identity 与 Access 查询继续使用各自
显式 repository。quota 中 paid-credit backfill 仍在同一 Session，并由 Credit repository
持有；plan lookup、budget decision count 与 runtime knowledge 也分别归还真实 owner。

迁移前 architecture characterization 为 5 passed、3 expected failed；迁移后为 8 passed。
PaymentService、SubscriptionCommerce 与 Admin quota/credit 最窄事务调用图为 43 passed，
只有既有 Starlette deprecation warning；Ruff 通过，全量 mypy 286 个源文件无问题。
production facade importer 从 8 降至 7，构造点从 85 降至 83，名称引用从 139 降至
119，helper 注解从 54 降至 36。facade 本体从 60 行、16 个 bases 收缩为 36 行、8 个
bases；lifecycle repository 为 40 行、9 个 bases 与唯一 `__init__`。上述数值均由 AST
扫描核定。

本批不修改 reconciliation 业务语义、repository 方法、API/schema/权限、数据库/迁移、
Provider、Production 或 WordPress。M4 candidate、PR/CI、merged source 与 clean-master
M4 accepted 继续分层记录。

Phase 7G 随后由 PR #497 squash merge 为
`be26bce244b77d00857ba18439a0313ce5b8b4fd`；required `backend-targeted`
为 6 分 48 秒通过，且无有效 review 变更请求。clean current `origin/master`
source-only promotion 显示 `acceptance_state=accepted`、`promotion_pr=497`、
`source_branch=master`、`source_dirty=false`，accepted source bundle 为
`97757fc9878c3ed548f86f9efbee3cd19ae0a4bd37dd031c5e881ceed8e40ffd`；
post-merge lifecycle smoke 为 11 passed，只有既有 Starlette deprecation warning。
Cloud lane、shared M4 与 task worktree lock 均已释放。

### 17.44 Phase 7H Account caller

Phase 7H 在 current
`origin/master@be26bce244b77d00857ba18439a0313ce5b8b4fd` 上迁移 Account mixin 的
五个 facade 构造：`upsert_account`、`set_account_status`、
`upsert_account_subscription`、`suspend_account_subscription` 与
`cancel_account_subscription`，并把 `_upsert_account_subscription_in_session`、
`_assert_account_site_capacity` helper 注解收窄到 lifecycle transaction repository。

`upsert_account` 在同一 SQLAlchemy Session 内分别使用 Account/Site、Identity、Access、
Subscription Lifecycle 与 Service Audit owner；账户行锁、identity `for_update`、单一
membership 约束、默认 Free 绑定、audit 与最终 commit 顺序不变。账户状态修改使用
Account/Site + Service Audit；subscription upsert 使用 lifecycle transaction seam；
suspend/cancel 使用 Subscription + Service Audit。所有 mutation 仍由原 model/repository
执行，未增加 flush、commit 或锁。

迁移前 retirement characterization 为 8 passed、1 expected failed；迁移后为 9 passed。
Account service、identity membership limit、default Free 与 billing snapshot 最窄 API
调用图共 15 passed，只有既有 Starlette deprecation warning；Ruff 通过，全量 mypy
286 个源文件无问题。production facade importer 从 7 降至 6，构造点从 83 降至 78，
名称引用从 119 降至 112，helper 注解从 36 降至 34，均由 AST 扫描核定。

本批不修改 SubscriptionCommerce、repository 方法、业务状态、API/schema/权限、数据库、
Provider、Production 或 WordPress。M4 candidate、PR/CI、merged source 与 clean-master
M4 accepted 继续分层记录。

Phase 7H 随后由 PR #498 squash merge 为
`b4283495f49fe9b05bcd7fd0e10b67e0f18bfd65`；required `backend-targeted`
为 8 分 38 秒通过，且无有效 review 变更请求。clean current `origin/master`
source-only promotion 显示 `acceptance_state=accepted`、`promotion_pr=498`、
`source_branch=master`、`source_dirty=false`，accepted source bundle 为
`834e07e6baf8b1c66e260caaec82ff91e3e93ccb45792ec8abe756c90153ca09`；
post-merge Account smoke 为 12 passed，只有既有 Starlette deprecation warning。
Cloud lane、shared M4 与 task worktree lock 均已释放。

### 17.45 Phase 7I SubscriptionCommerce caller 与暂停点

Phase 7I 在 current
`origin/master@b4283495f49fe9b05bcd7fd0e10b67e0f18bfd65` 上迁移
SubscriptionCommerce mixin 的七个 facade 构造与全部 facade helper 注解。试用、公开套餐、
agency quote、checkout、upgrade/downgrade/renewal/refund 的写事务统一使用已建立并验证的
`CommercialSubscriptionLifecycleRepository`；trial start 额外使用同 Session 的
`CommercialAccessRepository` 读取 active membership，不把 Access 膨胀进 lifecycle
repository 的九 owner 合同。

首轮完整 SubscriptionCommerce 测试真实发现 lifecycle repository 不拥有 membership
query，五个 trial 场景以同一 `AttributeError` 失败；修正为显式 Access owner 后，retirement
characterization 与完整 SubscriptionCommerce 行为共 26 passed。Ruff 通过，全量 mypy
286 个源文件无问题。production facade importer 从 6 降至 5，构造点从 78 降至 71，
名称引用从 112 降至 97，helper 注解从 34 降至 26，均由 AST 扫描核定。

Phase 7I 完成 accepted 后，本计划暂停继续迁移 Billing、Payment、Portal、Site 与 Runtime
caller，也不自动删除 facade。原因是项目仍处于商业可行性前期验证：Admin、Account、
SubscriptionCommerce 等高价值商业主链已经脱离通用 facade，剩余拆分主要改善内部结构，
短期不改变获客、激活、付费、留存或交付证据。retirement contract 继续禁止 facade 新增
业务方法或扩大 importer/构造/引用/注解上限；只有剩余 facade 明确阻塞商业实验、造成真实
缺陷或显著拖慢高频开发时，才以单独证据重新启动。

Phase 7I 由 PR #499 squash merge 为
`23438194c891e6edffda57f71eeff6932057adae`；required `backend-targeted`
为 8 分 18 秒通过，且无有效 review 变更请求。clean current `origin/master`
source-only promotion 显示 `acceptance_state=accepted`、`promotion_pr=499`、
`source_branch=master`、`source_dirty=false`，accepted source bundle 为
`b255ecebce8517ffde7e2fcd7e7b99d7df6e79287c933da978ba6bf51277e5df`；
post-merge retirement 与完整 SubscriptionCommerce smoke 为 26 passed。Cloud lane、shared
M4 与 Phase 7I task worktree lock 均已释放。

后续默认主线转为商业可行性验证：选择一个明确 ICP 与高频付费场景，缩短首次成功结果的
时间，获得真实试用、复用与付费意愿证据。工程工作只优先处理阻断该闭环的缺陷、可信度问题
和显著交付摩擦；没有真实业务流量时记录为未测量/N/A，不为制造观察数据调用付费 Provider。

## 18. 回滚

Phase 1 是无数据变更的单批结构迁移。回滚应为精确 revert：恢复门面内原查询方法、移除新增继承与 query 文件、回退对应测试。不得通过数据库迁移、数据修复或环境操作完成回滚。

Phase 2A 若实施，同样只允许精确 source revert：恢复 Support 查询与 helper 到门面、
移除新增继承/query 文件并回退对应 characterization。不得回滚
`20260801_0078`、修改等待状态数据或触碰 M4/Production 数据来完成结构回滚。

Phase 2B 只允许恢复 7 个 Support mutation/helper 到门面、移除
`CommercialSupportRepository` 继承与聚焦 characterization。不得通过数据修改、
事务补偿或环境操作完成结构回滚。

Phase 3A 只允许恢复 6 个 Plan query 到门面、移除 query mixin 与对应
characterization。不得把 Plan 写入、SubscriptionOrder 或数据操作纳入回滚。

Phase 3B 只允许恢复 3 个 Plan upsert 到门面、恢复 Plan query 继承并移除新的
Plan repository 与聚焦 characterization。不得通过数据修改、事务补偿或环境操作
完成结构回滚。

Phase 3C 只允许恢复 `upsert_account_subscription` 到门面、恢复 Subscription query
继承并移除新的 Subscription repository 与聚焦 characterization。不得修改订阅
数据、补偿事务或把 SubscriptionOrder 纳入回滚。

Phase 3D 只允许恢复五个 SubscriptionOrder 方法到门面、移除新 repository 与
聚焦 characterization。不得修改 PaymentOrder、Provider 结果或订单数据完成回滚。

Phase 4A 只允许恢复 11 个 Payment/Refund/Event 查询到门面、移除 query class 与
聚焦 characterization。不得把锁读取、create、Provider 或支付数据纳入回滚。

Phase 4B 只允许恢复一个锁读取与三个 create 到门面、恢复 Payment query 继承并
移除新的 Payment repository 与聚焦 characterization。不得修改支付数据、事务补偿、
状态机、Provider 或 API 完成结构回滚。

Phase 5A1 只允许恢复八个 Identity 无锁查询到门面、移除 identity query class 与既有
query repository 文件中的聚焦 characterization。不得把任何可选锁查询、OAuth/login
code、Admin directory、权限或身份数据变更纳入回滚。

Phase 5A2 只允许恢复一个 Admin directory query 与两个返回类型到门面，并移除聚焦
characterization。不得改变 Admin service hydrate、权限、API、身份数据或 SQL 语义。

Phase 5B1 只允许恢复九个 Membership/Site binding 无锁查询到门面、移除 query class
与聚焦 characterization。不得把可选锁读取、mutation、权限或绑定数据修改纳入回滚。

Phase 5B2 只允许恢复四个 Platform Admin 无锁查询到门面、移除 query class 与聚焦
characterization。不得修改 grant 数据、权限、API，或把 upsert/delete 纳入回滚。

Phase 5C1 只允许恢复七个 Portal Auth 方法到门面、移除 repository 与聚焦
characterization，并回退既有 lock test 的 direct 参数化。不得修改认证证据数据、
事务补偿、扩大锁，或把其他 Identity/Membership mutation 纳入回滚。

Phase 5C2 只允许恢复四个 core Identity mutation 到门面、恢复 facade 对 IdentityQueries
与 PortalAuthRepository 的直接继承，并移除新 repository/characterization。不得修改
identity/binding 数据、事务补偿，或把 Membership/Platform Admin mutation 纳入回滚。

Phase 5D 只允许恢复四个 access mutation 到门面、恢复 facade 对 MembershipQueries
与 PlatformAdminQueries 的直接继承，并移除新 repository/characterization。不得修改
membership/grant 数据、事务补偿，或把 Site binding/权限 API 纳入回滚。

Phase 5E 只允许恢复八个 Account/Site 方法到门面、恢复 facade 对 AccountQueries 与
SiteQueries 的直接继承，并移除新 repository/characterization 与 Site contract 参数化。
不得修改 account/site/binding 数据、事务补偿，或把 Site API key/entitlement 纳入回滚。

Phase 5F 只允许恢复六个 Site API Key 方法到门面、移除新 repository 与聚焦
characterization。不得修改 key 数据、密文、轮换关系、事务补偿，或把
Trial/Entitlement、权限/API 纳入回滚。

Phase 5G 只允许恢复六个 Trial/Entitlement 方法到门面、移除新 repository 与聚焦
characterization。不得修改 trial/snapshot 数据、重算 entitlement、事务补偿，或把
Payment/Subscription 状态机与 runtime 纳入回滚。

Phase 5H 只允许恢复四个 Runtime/Site Knowledge 查询到门面、移除 query class 与聚焦
characterization。不得修改 Run/Knowledge/Usage/Provider 数据，或把任何写入、锁、
API/runtime 行为纳入回滚。

Phase 6A 只允许恢复六个 Credit Ledger 查询到门面、移除 query class 与聚焦
characterization。不得把 PaidCreditGrant、Usage 写入、Admin usage/provider/billing、
Audit/Decision、事务补偿或数据修改纳入回滚。

Phase 6B 只允许恢复六个 Credit/PaidCreditGrant 方法到门面、恢复 facade 对 Credit
Ledger queries 的直接继承，并移除新 repository/characterization。不得修改账本或
grant 数据、执行事务补偿，或把 Usage、Billing、Audit/Decision 纳入回滚。

Phase 6C 只允许恢复七个 Usage/Run/Provider 查询到门面、移除 query class 与聚焦
characterization。不得把 Usage 写入、BillingSnapshot、Audit/Decision、数据修改或
事务补偿纳入回滚。

Phase 6D 只允许恢复 `record_usage_meter_event` 到门面、恢复 facade 对 Usage queries
的直接继承，并移除新 repository/characterization。不得修改 Usage 数据、执行事务
补偿，或把 BillingSnapshot、Audit/Decision 与调用方迁移纳入回滚。

Phase 6E 只允许恢复三个 BillingSnapshot 方法到门面、移除 Billing repository 与聚焦
characterization。不得修改 billing 数据、执行事务补偿，或把 Service Audit、
Commercial Decision 与调用方迁移纳入回滚。

Phase 6F 只允许恢复五个 Service Audit 业务方法与 audit filter helper 到门面、移除
Service Audit repository 与聚焦 characterization；facade 自有时间序列化 helper 继续
保留给 Commercial Decision。不得修改 audit 数据、执行事务补偿，或把 Commercial
Decision、调用方迁移、API/权限纳入回滚。

Phase 6G 只允许恢复四个 Commercial Decision 业务方法与两个 helper 到门面、移除
Commercial Decision repository 与聚焦 characterization。不得修改 decision 数据、
执行事务补偿，或把调用方迁移、facade 删除、API/权限纳入回滚。

Phase 7A 只允许移除 retirement architecture contract 与本批计划记录。不得恢复 facade
业务方法、扩大 importer allowlist，或借回滚改变任何生产调用方、runtime 与数据。

Phase 7B 只允许逐文件恢复上述八个低耦合 caller 的 facade import/构造。不得修改
repository 实现、调用参数、事务、数据，或把 commercial mixin 迁移纳入回滚。

Phase 7C 只允许恢复 Audit mixin 的 facade import、五个构造与三个 helper 注解，并
移除本批聚焦 retirement characterization。不得修改 Audit/Decision repository 实现、
payload redaction、事务、数据，或把其他 commercial mixin 纳入回滚。

Phase 7D 只允许恢复 Support mixin 的 facade import、14 个构造与一个 helper 注解，并
移除本批聚焦 retirement characterization。不得修改 Support/Access/Service Audit
repository 实现、Support 状态机、权限、事务、数据，或把其他 commercial mixin 纳入回滚。

Phase 7E 只允许恢复上述八个 Admin Identity/Access 入口与 identity projection helper 的
facade 使用，并把聚焦 API characterization 的 monkeypatch owner 恢复到 facade。不得修改
repository 实现、身份/权限模型、session-version、revoke/audit/commit 语义，或纳入其他
Admin dashboard 与商业 mixin。

Phase 7F 只允许恢复上述六个 Admin dashboard/credit 入口的 facade 构造，并移除本批
聚焦 retirement characterization。不得修改 repository 实现、credit/audit/commit 原子
边界、账户 reconciliation、plan/quota helper、API/权限、数据，或把其他 commercial
mixin 纳入回滚。

Phase 7G 只允许恢复 Admin 最后两个 facade 构造、恢复 facade 的直接 repository bases、
恢复 lifecycle 调用链的原类型注解，并移除 lifecycle repository 与本批聚焦
characterization。不得修改 reconciliation/paid-credit/quota 业务语义、flush/commit
位置、数据、API/权限，或把其他 production caller 纳入回滚。

Phase 7H 只允许恢复 Account mixin 的五个 facade 构造与两个 helper 注解，并移除本批
聚焦 characterization。不得修改账户锁、identity/membership、subscription lifecycle、
audit/commit 语义、数据、API/权限，或把 SubscriptionCommerce 纳入回滚。

Phase 7I 只允许恢复 SubscriptionCommerce mixin 的七个 facade 构造与 helper 注解，移除
trial start 的显式 Access owner，并移除本批聚焦 characterization。不得修改试用、套餐、
订单、支付、退款、reconciliation 或 commit 语义。

## 19. 暂停与重新启动规则

本计划已在 Phase 7I 收口，Billing、Payment、Portal、Site、Runtime caller 迁移和 facade
删除均不再作为默认下一批。只有真实商业实验或高频交付证据表明剩余 facade 已成为阻塞，
并且预期收益高于同周期的客户验证工作，才允许重新启动。重新启动的每批都必须：

1. fetch 并核对 current `origin/master`；
2. 盘点 open human PR、worktree、conflict domain、Cloud lane 和 M4 owner；
3. 声明独立 change envelope；
4. 在 clean locked worktree 实施；
5. local → M4 candidate → PR/CI → clean-master promotion 分层验收；
6. 明确双释放后才交棒下一批。

生产发布 Issue #406 与本结构重构解耦，在开发批次全部闭环并重新冻结 exact candidate 前不得自动启动。
