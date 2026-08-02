# Structural Remediation Delivery Standard v1

状态：active engineering guide

目的：规范巨型 service/repository/page/test/script 的渐进整改，使结构变化可验证、可回滚，并最终删除临时兼容层。本文补充开发验证与并行协作规范，不改变 Cloud 产品边界、M4 authority 或 production policy。

## 1. 适用范围

本规范适用于：

- 责任过度集中的 service 或 repository；
- 同时持有 API、状态、验证和展示的页面控制器；
- 超大测试文件或高度重复 fixture；
- 膨胀的工程命令与脚本入口；
- 从源码正则合同迁移到真实行为测试。

不适用于仅因翻译数据、生成代码或迁移历史而自然变大的文件。行数是调查信号，不是重构授权。

## 2. 完成定义

结构整改只有同时满足以下条件才算完成：

1. 目标职责有唯一、可命名 owner。
2. 行为、事务、锁、错误和性能合同有验证。
3. 新调用进入新边界，旧入口停止增长。
4. 兼容层的调用方、剩余职责和删除条件可枚举。
5. 回滚不需要数据修复或跨域手工操作。
6. local、candidate、merge、accepted、production 证据保持分层。

“文件变短”“新增 helper”“测试仍绿”单独都不构成完成。

## 3. 优先级选择

一次只主攻一个结构热点。按以下顺序评分：

1. 变更频率和真实故障/回归风险；
2. 责任是否能形成清晰领域边界；
3. 是否已有 characterization tests；
4. 是否能无 API/数据库/业务语义变化地移动；
5. 是否能在一个短批次中形成可删除的旧职责。

优先选择“高变更风险、边界清晰、纯读、无锁、无外部写”的责任。不要同时拆 backend core、frontend page、tests 和 scripts。

## 4. 标准实施循环

### 4.1 Baseline

- 基于 current `origin/master` 重新测量，不复用旧行号或旧方法数。
- 盘点 worktree、open human PR、conflict domain、merge lane 和 M4 owner。
- 列出目标方法/组件、调用方、事务/锁、测试和性能敏感点。
- 标注“纯移动”“合同变化”“未知副作用”。未知项未查清前不编辑。

### 4.2 Freeze growth

- 在计划中声明旧热点不再接受新职责。
- 只允许最小 import、inheritance、delegation 或 adapter bridge。
- 新功能直接进入目标领域模块。
- 记录 remaining inventory 和 façade deletion condition。

### 4.3 Characterize before moving

测试当前行为，而不是理想行为。至少锁定：

- 参数与返回类型；
- 排序、过滤、分页、空输入和边界值；
- 错误和 fallback；
- transaction/flush/commit/rollback/lock ownership；
- 查询次数、重复请求或明显复杂度风险；
- consumer 可见行为。

如果当前行为本身需要改变，把修复与结构移动拆成不同批次。

### 4.4 Move one responsibility

- 新模块名称表达领域能力，不使用 `utils`、`helpers2` 或 `misc`。
- 依赖从构造函数或明确 interface 进入。
- 不复制 source of truth。
- 旧 façade 只委托或继承，不保留第二份实现。
- 不在同一批次重写 API、schema、视觉或业务政策。

### 4.5 Migrate callers

首个 pilot 可以保持调用方不变，以证明移动安全。后续批次必须逐步让调用方依赖领域接口，并更新 remaining inventory。

兼容 façade 只有在以下情况才可暂留：

- 调用方迁移分批进行；
- 每批有明确 owner 和顺序；
- 新调用禁止进入 façade；
- 删除条件和剩余数量持续可见。

### 4.6 Delete

当 remaining inventory 为零：

- 删除 façade、alias 和重复测试；
- 清除无用 import 与 DI wiring；
- 运行受影响集成 gate；
- 在 closeout 中记录删除完成，而不是继续保留“以防万一”。

## 5. 不同热点的拆分规则

### 5.1 Repository

优先顺序：

```text
pure read queries
  -> grouped/read projections
  -> unlocked writes
  -> locked reads and transactional writes
  -> cross-domain orchestration removal
```

Query module 不得隐式写入、flush、commit、rollback 或取锁。带锁读取应靠近拥有同一事务的写入模块。

### 5.2 Service

优先抽：

- pure projection；
- read-only diagnostics/query；
- policy builder；
- dispatcher/coordinator。

门面只负责兼容装配，不应继续包含新的业务分支。抽取后测试应直接覆盖 collaborator，而不是只通过巨型门面间接覆盖。

### 5.3 Frontend page

目标 ownership：

- `page.tsx`：路由装配与页面级入口；
- client/hook：API、DTO normalization、request state；
- controller hook：表单状态、dirty/submit/reset；
- component/workbench：表格、drawer、dialog、inspector；
- shared primitive：重复交互与 geometry。

首批只拆数据控制和一个独立工作区，不同时重做视觉。Admin 改动继续遵守 Admin UI 标准与 PC browser gate。

### 5.4 Test file

按 capability、route 或 contract owner 拆分，不按固定行数切块。共享 fixture 只提取稳定数据构造，不共享易变的步骤顺序和隐式状态。

### 5.5 Scripts

每个命令至少记录：

- 用途与 owner；
- local/M4/production 环境；
- read-only 或 mutation；
- 是否需要 operator approval；
- CI、runbook 或近期调用证据；
- replacement/deprecation date。

无调用证据的命令先 deprecated，再在独立批次删除。禁止一次性批量清理未知脚本。

## 6. 测试与覆盖率策略

### 6.1 行为优先

测试层级按问题选择：

| 问题 | 首选证据 |
| --- | --- |
| 纯函数、query、hook | pytest/Vitest |
| API contract | focused API test |
| operator/user interaction | Playwright/真实 consumer |
| 禁止依赖、文件边界、治理清单 | source/static contract |
| runtime integration | M4 focused candidate |

源码正则适合禁止项和静态治理，不应用于证明真实业务行为。

### 6.2 Coverage 先观察

- 先为目标模块生成 baseline。
- 记录关键未覆盖分支，而不只记录百分比。
- 初期要求修改代码不降低关键模块 coverage。
- 未证明测试质量前，不设全仓统一 80% 门槛。
- 新抽出的 query/hook/component 必须可被独立测量。

## 7. 并行与发布

- 一个 structural hotspot 是一个 conflict domain。
- builder 可并行调查不同热点，但 merge-ready 和 M4 candidate 必须遵守三个唯一。
- 一个批次完成 accepted 双释放前，不自动启动下一结构批次。
- docs-only 计划不占 M4；Cloud source checkpoint 才按规范申请 sync/deploy。
- source 变化后，旧 candidate evidence 失效，必须重新 dispatch。

## 8. 停止条件

出现任一条件立即停止：

- 需要改变 API、schema、业务政策或权限才能继续；
- 方法包含未记录的写入、锁或事务副作用；
- current master 或 peer task 改变同一 contract；
- 为通过测试必须扩大到第二个领域；
- M4 fingerprint/lock/slot/ownership 不清；
- 兼容层新增调用快于迁移速度；
- 没有可证明的删除路径。

停止不是失败。回执应说明发现的真实边界，并为合同变化另开批次。

## 9. 批次回执模板

```text
STRUCTURAL_REMEDIATION_RECEIPT
- hotspot/domain:
- baseline/master:
- owner/worktree:
- methods/components moved:
- public behavior changed: yes/no
- transaction/lock change: yes/no
- remaining facade inventory:
- deletion condition:
- local gates:
- M4 candidate:
- PR/CI/merge:
- accepted promotion:
- deferred debt and reason:
- rollback:
- lane/runtime release:
```

## 10. 当前首个应用

本规范的首个计划应用是 [CommercialRepository 渐进拆分计划](commercial-repository-decomposition-plan-v1.md) Phase 0 + Phase 1：Subscription 无锁纯查询抽取。
