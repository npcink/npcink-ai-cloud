# CommercialRepository 拆分收口与开发复盘 — 2026-08-03

Status: historical closeout and engineering synthesis; not authorization for further decomposition.

状态：historical closeout and engineering synthesis

目的：记录 CommercialRepository 渐进拆分的实际结果、有效经验、低效来源、停止决策和后续
商业验证交接。本文是历史证据，不授权继续拆分、M4 mutation、Production 或 Phase 2。

当前权威仍是：

- [CommercialRepository 渐进拆分计划](commercial-repository-decomposition-plan-v1.md)
- [Structural Remediation Delivery Standard](structural-remediation-delivery-standard-v1.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)

若本文与 current master 或现行规范冲突，以 current master 和现行规范为准。

## 1. 为什么启动

初始 `CommercialRepository` 同时承载 Support、Account、Site、Subscription、Plan、
Payment、Refund、Identity、Credit、Usage、Audit 等领域，约 4,202 行、157 个自有方法。
它已经成为修改影响面大、事务/锁边界难审查、调用方依赖模糊的结构热点。

目标不是把一个文件机械切小，而是：

1. 冻结通用门面增长；
2. 先迁移无锁纯查询，再迁移明确写事务；
3. 用 characterization 保持旧行为；
4. 逐步让高价值调用链依赖明确 owner；
5. 在收益递减时主动停止，把资源转回产品和商业验证。

## 2. 实际完成了什么

### 2.1 实现迁移

阶段内建立或固化了以下 owner：

- Account、Site、Subscription、Support、Plan、Payment、Identity、Membership、Platform
  Admin、Credit、Usage 与 Runtime Knowledge queries；
- Support、Plan、Subscription、SubscriptionOrder、Payment、Portal Auth、Identity、Access、
  Account/Site、Site API Key、Trial/Entitlement、Credit、Usage、Billing、Service Audit 与
  Commercial Decision repositories；
- `CommercialSubscriptionLifecycleRepository` 作为订阅商业生命周期的明确事务组合边界。

高价值 caller 迁移覆盖了低耦合 worker/API、Audit、Support、Admin Identity/Access、Admin
dashboard/credit、Account 和 SubscriptionCommerce。最后一批将试用、公开套餐、agency
quote、checkout、upgrade/downgrade、renewal 和 refund 事务交给 lifecycle owner；trial
start 使用同 Session 的 `CommercialAccessRepository` 查询 membership，没有把 Access
重新膨胀进 lifecycle 合同。

### 2.2 可测量结果

| 指标 | 初始/retirement 基线 | 收口状态 | 说明 |
| --- | ---: | ---: | --- |
| facade 行数 | 4,202 | 36 | current master 实测 |
| facade 自有方法 | 157 | 1 | 唯一方法为 `__init__`，无业务分支 |
| facade 组合 bases | 多领域实现内聚 | 8 | 均为明确 repository/query owner |
| production importers | Phase 7A 时 18 | 5 | Billing、Payment、Portal、Runtime、Site |
| production 构造点 | Phase 7A 时 126 | 71 | current master AST 实测 |
| 名称引用 | Phase 7A 时 185 | 97 | current master AST 实测 |
| helper 注解 | Phase 7A 时 59 | 26 | current master AST 实测 |

当前 facade 的八个组合 owner 是：Subscription Lifecycle、Site API Key、Runtime
Knowledge、Credit、Decision、Identity、Access 和 Support。facade 已不再拥有查询、写入、
锁或事务业务实现。

### 2.3 交付证据

- Phase 0 + 1 通过 PR #464 合并并 M4 accepted，首批原样迁移 11 个 Subscription 无锁纯查询；
- Phase 7A 通过 PR #491 建立 facade retirement contract，属于 test/docs，M4 N/A；
- Phase 7I 通过 PR #499 合并，merge revision 为
  `23438194c891e6edffda57f71eeff6932057adae`；
- PR #499 required `backend-targeted` 约 8 分 18 秒通过；
- clean-master promotion 显示 `acceptance_state=accepted`、`promotion_pr=499`、
  `source_branch=master`、`source_dirty=false`；
- accepted source bundle 为
  `b255ecebce8517ffde7e2fcd7e7b99d7df6e79287c933da978ba6bf51277e5df`；
- post-merge retirement 与完整 SubscriptionCommerce smoke 为 26 passed；
- PR #500 将暂停决策和 accepted 证据合并进实施计划，属于 docs-only，M4 N/A。

这些证据证明 reviewed master 与 M4 development runtime 的结构行为，不代表 Production、
真实客户接受或商业价值已经成立。

## 3. 值得的地方

### 3.1 高风险热点被控制

最大收益不是减少 4,166 行，而是明确了 query、transaction、lock 和 audit owner。新商业
代码不再自然流入一个 157 方法的类，review 可以围绕更窄的领域与测试展开。

### 3.2 Characterization 阻止了“借重构改语义”

每批先锁定过滤、排序、分页、空值、fallback、commit/flush 与锁语义，再移动实现。Phase
7I 首轮完整 SubscriptionCommerce 测试真实暴露五个 trial 场景的同一 `AttributeError`：
lifecycle owner 不拥有 membership query。正确修复是显式组合 Access owner，而不是扩大
lifecycle 的九 owner 合同。失败因此成为边界证据，而不是被隐藏。

### 3.3 facade 模式降低迁移风险

先移动实现、保留继承门面，再迁移高价值 caller，使每批都可精确 source revert，无需数据库
修复或业务补偿。这种桥梁在阶段内有价值，但必须有 retirement contract 和 remaining
inventory，不能成为永久默认入口。

### 3.4 证据分层保持诚实

本地绿色、M4 candidate、PR required checks、merged master、M4 accepted、Production 与
human acceptance 始终分开记录。没有自然业务流量时没有伪造 24 小时观察，也没有为制造
证据调用付费 Provider。

## 4. 为什么过程显得慢

主要耗时不在代码移动，而在串行交付链：

```text
characterization
  -> implementation
  -> focused local gates
  -> source-only M4 candidate
  -> protected PR checks
  -> merge
  -> clean-master promotion and smoke
```

该链条保证安全，但拆分被切成大量很小的 Phase/PR 后，每批都重复支付 ownership、基线刷新、
CI、merge lane、M4 promotion 和文档更新成本。后期单个 `backend-targeted` 通常约 7 至 9
分钟，human merge lane 与 shared M4 又必须串行；增加更多会话并不能提高这两个唯一资源的
吞吐。

另一个低效来源是最初把“最终删除 facade”视为必须连续完成的路线图目标。当前期商业验证
价值高于内部整洁度时，继续减少剩余 5 个 importer 的收益已经明显下降。

## 5. 应如何优化

### 5.1 合并同风险的 coherent batch

保留一个纯查询 pilot 和一个高风险事务 pilot；后续同 owner、同 Session、同测试面的移动
应合并，不为每个小方法单独创建 PR。只有事务、锁、API 或 owner 发生变化时才拆批。

### 5.2 在唯一瓶颈前限制 WIP

并行用于只读调用图、characterization、review 和独立 conflict domain。protected merge
lane、shared M4 和 Production decision 保持唯一 owner；等待队列过长时停止新 mutation，
而不是继续制造 local-ready 分支。

### 5.3 每三批做一次收益复核

如果连续三批只改善行数、importer 或引用计数，却没有降低真实故障、变更时间或商业实验风险，
必须暂停并比较替代投入。结构指标用于发现趋势，不是产品 KPI。

### 5.4 每个 revision 只回答一次同类问题

内循环使用 focused tests；M4 只在 coherent checkpoint dispatch；GitHub required checks
负责 merge authority；post-merge 只做 promotion、status 和最窄 smoke。没有独立风险问题时
不重复全门禁。

### 5.5 阶段文档记录决策，不复制消息流

实施计划保留事实、合同、回滚和最终证据；复盘保留根因、收益与停止决策。临时 ownership、
轮询状态和逐次日志不应全部复制到长期文档。

## 6. 当前不足与受控债务

- facade 尚未删除，仍有 Billing、Payment、Portal、Runtime、Site 五个 importer；
- 71 个构造、97 个名称引用和 26 个注解仍然偏多；
- retirement contract 冻结 facade 自有方法、组合 bases 和已迁移的具体 caller；全局计数上限
  仍是 Phase 7A ceiling，因此 current inventory 仍需在重新启动时重新测量；
- compatibility facade 仍可能降低新开发者发现明确 owner 的速度。

这些债务当前是已知、可枚举且无新增业务实现的。它们没有证据表明正在阻塞获客、激活、
付费、留存或核心 Hosted GPT-5.5 使用闭环，因此暂不继续投入。

## 7. 停止决策

Phase 7I 后暂停继续拆分是有意决策：

- Admin、Account、SubscriptionCommerce 等高价值商业主链已脱离 facade；
- facade 已缩成 36 行薄装配层；
- API、数据库、迁移、权限和业务状态均未因拆分变化；
- 剩余工作主要改善内部结构，边际收益低于真实客户与商业验证；
- Production Issue #406 与结构拆分解耦。

因此不自动迁移剩余五个 caller，也不为了“路线图完成度”删除 facade。

## 8. 重新启动条件

只有出现以下可验证证据之一，才重新打开 CommercialRepository 拆分：

1. facade ambiguity 造成真实缺陷、错误锁/事务或安全问题；
2. 高频商业功能连续被错误 owner 或巨型依赖显著拖慢；
3. 一个真实客户实验必须修改剩余 caller，明确 owner 能降低交付风险；
4. retirement contract 发现 facade 新增业务职责或依赖反向增长；
5. 性能测量证明 facade 相关构造或查询路径是瓶颈。

重新启动时必须从 current `origin/master` 重算 inventory，不复用本文 SHA、行号和数量。

## 9. 下一阶段主线：商业可行性验证

默认工程主线转为一个最短学习闭环：

```text
明确 ICP 与高频付费场景
  -> 真实用户完成 Hosted GPT-5.5 主路径
  -> 测量首次成功时间与失败原因
  -> 观察自然复用
  -> 验证付费意愿与单位成本
  -> 只修阻断闭环的产品/工程问题
```

优先记录：

- 有多少目标用户开始并完成核心任务；
- 从连接 WordPress 到首次可采用结果的时间；
- 失败发生在连接、配置、Provider、结果质量还是采用环节；
- 用户是否在没有提醒时再次使用；
- 是否愿意进入付费 pilot，以及价格/成本是否可持续。

不要用新的 Admin 页面、报表、全仓结构整改或合成调用代替真实用户学习。没有流量就记录
`unmeasured/N/A`。

## 10. Production Issue #406 交接

Issue #406 是 controlled production validation queue，不是普通 feature 或 GA 授权。结构
阶段结束后，不应无限期冻结准备工作，但仍应冻结一切 production mutation。

当真实 pilot 必须依赖 Production 时，允许先做只读 pre-audit：重新冻结 exact current
master、确定 named operator、最小试点范围、rollback、SSH trust、bundle/image scan、RDS
backup/restore、schema/ownership 和 smoke 前置条件。只有这些门禁满足且获得明确 operator
approval，才进入 production PR 与 deploy。

M4 accepted、HTTP 200 或绿色 CI 不能替代 production evidence；24 小时观察只在真实部署和
自然 workload 存在后开始，不为填表制造付费调用。

## 11. 最终结论

本轮值得：它把一个真实结构热点转化为有 owner、有测试、有回滚、不会继续增长的薄门面。
但继续拆到零目前不值得。最佳下一步不是 Phase 8，而是用已经较稳定的商业主链尽快获得
真实用户、复用和付费证据，并只处理阻断这些证据的明显问题。
