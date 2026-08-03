# Structural Remediation Delivery Standard v1

状态：active engineering guide

目的：规范巨型 repository、service、page、test 与 script 的渐进整改，使结构变化可验证、
可回滚，并且不会挤占产品验证的主线资源。本文补充开发验证与并行协作规范，不改变 Cloud
产品边界、M4 authority 或 production policy。

## 1. 适用范围

本规范适用于：

- 责任过度集中的 service 或 repository；
- 同时持有 API、状态、验证和展示的页面控制器；
- 超大测试文件或高度重复 fixture；
- 膨胀且 owner、环境或危险性不清的工程命令；
- 需要从源码形状合同迁移到真实行为测试的结构热点。

行数、方法数和依赖数只是调查信号，不是重构授权。翻译数据、生成代码、迁移历史或稳定的
声明式配置可以自然较大；没有真实变更风险、缺陷或交付摩擦时，不因“看起来大”而拆分。

## 2. 两种完成状态

### 2.1 单批完成

一个结构批次只有同时满足以下条件才算完成：

1. 目标职责有唯一、可命名 owner；
2. 行为、事务、锁、错误、排序和性能合同得到相称验证；
3. 公共行为没有被重解释，或合同变化被拆到独立批次；
4. 兼容层没有获得新的业务职责；
5. 回滚不需要数据修复、跨域补偿或环境操作；
6. local、candidate、PR、merged、accepted、production 证据保持分层。

### 2.2 热点收口

热点收口不等于必须删除最后一层 facade。满足以下条件时可以主动暂停：

- 巨型实现已缩成无业务分支的薄装配层；
- 新职责已进入明确 owner，已迁移的调用方有回归保护；
- 剩余依赖数量可枚举，且没有继续增长；
- 下一批主要改善内部整洁度，不再显著降低真实缺陷、变更风险或交付时间；
- 同期存在更高价值的客户、商业或运行验证工作。

“文件变短”“新增 helper”“测试仍绿”单独都不构成完成；反过来，“没有删除最后 36 行”
也不代表阶段失败。受控暂停是一种明确的工程决策，不是遗忘债务。

## 3. 价值优先级

一次只主攻一个结构热点，并按以下顺序判断收益：

1. 是否阻塞当前产品或商业实验；
2. 是否经常引发真实故障、错误事务边界或安全风险；
3. 是否显著拖慢高频修改、评审或测试选择；
4. 是否能形成清晰、稳定且可独立测试的 owner；
5. 是否能在一个短批次中无 API、数据库或业务语义变化地完成。

优先选择“高变更风险、边界清晰、纯读、无锁、无外部写”的职责。不要同时拆 backend
core、frontend page、tests 和 scripts。若预期收益只能表述为“更优雅”，默认不启动。

## 4. 标准实施循环

### 4.1 Baseline

- 基于 current `origin/master` 重新测量，不复用旧 SHA、行号或方法数；
- 盘点 worktree、open human PR、conflict domain、merge lane 和 shared runtime owner；
- 列出目标方法/组件、调用方、事务/锁、测试和性能敏感点；
- 标注纯移动、合同变化和未知副作用；未知项未查清前不编辑；
- 写明本批希望降低的具体风险，以及不做本批会影响什么。

### 4.2 Freeze growth

- 旧热点不再接受新职责；
- 只允许最小 import、inheritance、delegation 或 adapter bridge；
- 新功能直接进入目标领域模块；
- 记录 remaining inventory、删除条件和暂停条件；
- 用静态 retirement contract 保护禁止项，但不用源码正则代替业务行为测试。

### 4.3 Characterize before moving

测试当前行为，而不是理想行为。按相关性锁定：

- 参数、返回类型、`None`、空列表和零值语义；
- SQL 过滤、排序、`distinct`、offset/limit 与 fallback；
- transaction、implicit flush、commit、rollback 和 row-lock ownership；
- 错误代码、权限和 consumer 可见行为；
- 查询次数、重复请求或明显复杂度风险。

若当前行为本身需要修复，把修复与结构移动拆成不同批次。真实失败应保留为边界证据，
不得通过扩大 owner 或改写旧语义来“顺手解决”。

### 4.4 Move one responsibility

- 新模块名称表达领域能力，不使用 `utils`、`helpers2` 或 `misc`；
- 依赖从构造函数或明确 interface 进入；
- 不复制 source of truth；
- query owner 不得写入、flush、commit、rollback 或取行锁；
- 带锁读取靠近拥有同一事务的 mutation owner；
- 旧 facade 只委托或继承，不保留第二份实现；
- 不在同一批重写 API、schema、视觉、权限或业务政策。

### 4.5 Migrate callers

首个 pilot 可以保持调用方不变，以证明移动安全。后续只迁移内聚、同风险的调用方，不按
文件数量机械切成过多 PR。兼容 facade 只有在以下条件下才可暂留：

- 调用方迁移顺序明确；
- 新调用禁止进入 facade；
- 已迁移调用方有直接 owner characterization；
- remaining inventory 持续可见；
- 暂留成本小于立即删除的回归成本。

### 4.6 Delete or pause

当 remaining inventory 为零，删除 facade、alias、重复测试和无用 wiring。若边际收益已低，
按第 2.2 节暂停，并记录触发重新启动的证据。不得为了完成路线图而继续制造批次。

## 5. 不同热点的拆分顺序

### 5.1 Repository

```text
pure read queries
  -> grouped/read projections
  -> unlocked writes
  -> locked reads and transactional writes
  -> explicit caller migration
  -> facade delete or evidence-based pause
```

跨领域事务优先使用一个边界明确的 transaction repository，或在同一 Session 中显式组合
多个 owner；不得为了让调用方少写一行而把不相干领域重新塞回一个巨型 owner。

### 5.2 Service

优先抽 pure projection、read-only diagnostics/query、policy builder 和 dispatcher。门面只
负责兼容装配，不继续包含业务分支；抽取后的测试直接覆盖 collaborator。

### 5.3 Frontend page

目标 ownership：page 负责路由装配，client/hook 负责 API 与 normalization，controller
负责交互状态，workbench/component 负责展示，共享 primitive 负责重复交互与 geometry。
首批只拆一个独立状态域，不同时重做视觉。

### 5.4 Test 与 script

测试按 capability、route 或 contract owner 拆分，不按固定行数切块。命令至少记录 owner、
环境、read-only/mutation、approval、调用证据和退役路径；未知脚本先调查，不批量删除。

## 6. 验证与证据

| 问题 | 首选证据 |
| --- | --- |
| query、纯函数、hook | focused pytest/Vitest |
| transaction/lock | 行为测试与 Session/SQL characterization |
| API contract | focused API test |
| operator/user interaction | Playwright 或真实 consumer |
| 禁止依赖、facade 增长 | source/static retirement contract |
| runtime integration | M4 focused candidate |

结构批次遵守以下证据链：

```text
local verified
  -> M4 candidate when runtime-relevant
  -> PR required checks
  -> merged master
  -> clean-master M4 accepted when applicable
```

文档或纯静态治理默认不占 M4。不要为一个 revision 重复运行回答相同问题的全门禁，也不要
把 M4、CI 或 HTTP 200 解释为 production 或 human acceptance。

## 7. 吞吐与批次优化

结构整改最常见的耗时不是编辑，而是过细批次反复进入串行 merge/M4 lane。默认采用：

1. 一次 read-only inventory；
2. 一个低风险 pilot；
3. 将同 owner、同事务风险、同测试面的后续移动合并为 coherent batch；
4. 每次 candidate 只在 coherent checkpoint dispatch；
5. 三个连续批次若只改善计数而没有新增风险或用户价值证据，强制做收益复核；
6. docs closeout 集中一次完成，不在每个小批重复改写阶段结论。

并行只用于调查、独立 conflict domain 和本地验证；human merge lane、shared M4、migration
head 与 production decision 继续串行。增加会话数不能提高这些唯一资源的吞吐。

## 8. 停止与重新启动

出现以下任一条件应停止当前批次：

- 需要改变 API、schema、业务政策或权限才能继续；
- 发现未记录写入、锁、implicit flush 或跨领域事务；
- current master 或 peer task 改变同一合同；
- 为通过测试必须扩大到第二个不相关领域；
- shared runtime fingerprint、lock、slot 或 ownership 不清；
- 预期收益低于同期真实用户或商业验证；
- 没有可证明的删除或受控暂停路径。

已经暂停的热点只有在出现以下证据时重新启动：

- facade ambiguity 造成真实缺陷或安全/事务问题；
- 高频功能连续被错误 owner 或巨型依赖拖慢；
- 商业实验必须修改剩余调用方，明确 owner 能显著降低交付风险；
- retirement contract 发现 facade 重新增长；
- 性能测量指向该结构为真实瓶颈。

## 9. 商业验证与 Production 边界

前期验证项目的结构整改预算必须服从商业学习速度。热点被控制后，默认主线转为：一个明确
ICP、一个高频付费场景、首次成功时间、重复使用、付费意愿和单位成本。只修阻断该闭环的
缺陷、可信度问题和显著交付摩擦。

Production release queue 与结构整改分离。允许为真实试点做只读 pre-audit，但 production
PR、deploy、真实支付和环境 mutation 仍需当前 release policy、exact candidate 和 operator
approval。无自然流量时记录 `unmeasured/N/A`，不等待或调用付费 Provider 制造观察数据。

## 10. 批次回执模板

```text
STRUCTURAL_REMEDIATION_RECEIPT
- hotspot/domain:
- baseline/master:
- owner/worktree:
- risk or delivery cost reduced:
- methods/components/callers moved:
- public behavior changed: yes/no
- transaction/lock change: yes/no
- remaining facade inventory:
- delete or pause decision:
- restart evidence threshold:
- local gates:
- M4 candidate:
- PR/CI/merge:
- accepted promotion:
- deferred debt and reason:
- rollback:
- lane/runtime release:
```

## 11. 首个完整应用

本规范的首个完整应用是
[CommercialRepository 渐进拆分计划](commercial-repository-decomposition-plan-v1.md)。该热点
从 4,202 行、157 个自有方法收缩为 36 行、仅 `__init__` 的薄 facade，并在 Phase 7I 后因
边际收益下降主动暂停。结果与经验见
[CommercialRepository 拆分收口与开发复盘](commercial-repository-decomposition-closeout-and-development-retrospective-2026-08-03.md)。
