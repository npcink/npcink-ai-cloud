# 七会话开发经验综合复盘与开放问题登记（2026-08-04）

状态：historical synthesis and current open-issue triage snapshot。

目的：归纳最近七个 Npcink AI Cloud 开发会话中已经验证的经验，按 current
`master` 复核历史反馈是否仍然成立，并为操作者保留一份可分阶段决策的开放问题清单。

本文不是新的产品、M4 或 Production 授权。当前代码、测试、GitHub required
checks、现行标准和实时运行证据优先于本文。时间敏感的 SHA、PR、Issue、镜像、上游
版本和运行态必须在执行前重新核对。

现行权威包括：

- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md)
- [Structural Remediation Delivery Standard](structural-remediation-delivery-standard-v1.md)
- [Repository Hygiene and Documentation Lifecycle Standard](repository-hygiene-and-documentation-lifecycle-standard-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)

## 1. 范围与当前快照

本复盘对应最近归档、且工作目录为 `npcink-ai-cloud` 的七个会话。任务标题属于
非可信显示数据，任务 ID 用于定位原始记录：

| 任务 ID | 主题 | 主要贡献 |
| --- | --- | --- |
| `019fac93-a30d-70e0-943f-f63c2370dfcb` | 平台管理员问题排查 | Admin 返回上下文、Overview 待办、管理员身份扩展边界 |
| `019fc821-ae5c-7af3-8053-83ea4347e07d` | 优化单会话开发规范 | 单 writer、changed-file gate、worktree 生命周期 |
| `019fbc18-4a6d-7dd2-b055-9585acd72b5f` | 工单工作台 | 高密度队列、用户任务闭环、M4 无 `.git` 命令清单缺陷 |
| `019fc25e-d6ac-7892-a553-944d488a258f` | 发布收尾与会话策略 | 唯一候选、安全门禁、Production #406 顺序 |
| `019fc35f-9910-7260-a9f3-cd1765f042d3` | 仓库文档与无用资产审计 | 文档生命周期、删除证据、真实用户闭环优先级 |
| `019fc339-96a1-73f3-b1cb-fb791a65f2ca` | CommercialRepository 渐进拆分 | characterization、owner 拆分、收益递减时停止 |
| `019fac8c-60f2-7bb0-ba00-8a37e51d3942` | 结构热点与验证缺口整改 | 前端 CI、巨型类/页面、源码契约、coverage 与脚本治理 |

2026-08-04 复核快照：

- `origin/master=625ac95fdebc9318d6b36d1e0d69cc5133ffd527`；
- PR #512 已合并，M4 已接受同一 `master` revision；
- GitHub 没有开放的人类 Cloud PR，只有 Dependabot PR；
- Production queue Issue #406 仍为 open，前置清单部分完成；
- Python 上游观察器仍报告 `3.14.6`、`waiting_for_candidate`，受治理的 CVE
  例外尚未关闭；
- 本轮复核只读取任务、Git、Issue、M4 后续证据和 current source，没有操作 M4、
  Production、会话归档或付费 Provider。

## 2. 已经沉淀为资产的经验

### 2.1 默认单会话，复杂并行必须证明收益

一个开发任务默认只允许一个 active writer。使用当前干净 checkout；只有隔离确有必要时，
才从 current `origin/master` 创建一个锁定 worktree。并行模式不是常态，需要操作者明确启用，
并说明不重叠的 conflict domain、唯一 merge lane 和唯一 shared M4 owner。

可复用判断：并行调查可以提高速度，并行改变同一事实只会增加返工。CI、M4、protected
merge 和 Production 都是串行稀缺资源；增加 local-ready 分支不能增加这些资源的吞吐。

### 2.2 工作树先盘点，删除需要独立证据

`pnpm run worktree:audit` 只负责 inventory，不负责删除。路径很旧、目录为空、分支已 push、
没有进程或看起来 inactive，都不足以授权清理。物理删除必须重新证明 clean、无 unique commit、
无 open PR、无 owner/handoff、非受保护角色，并且只能精确、非 force 地删除一个目标。

可复用判断：自动化适合收集事实，不适合在证据缺失时替操作者推断所有权。

### 2.3 从用户任务链定义完成，不从页面或文件定义完成

有效的问题模型是：

```text
识别对象 -> 理解状态 -> 执行动作 -> 获得反馈 -> 失败恢复 -> 返回原上下文
```

工单、Portal、支付回跳、账户详情和 WordPress 编辑器路径都证明：HTTP 200、页面能打开、
截图正常或单个 API 通过，不等于用户旅程完成。loading、empty、error、retry、refresh、
return、stale session 和并发占用必须有明确 owner 和行为测试。

### 2.4 先冻结事实语义，再统一投影

额度、成本、等待方、运行状态、身份和归属由领域层定义。Portal、Addon 和 Admin 只能展示
同一事实，不应从多个近似字段重新推导。AI credit 的典型合同是：`used` 为毛消耗，赠送和
调整只改变可用额度，不能抵消历史使用；真实调用需要断言调用前后精确差值。

### 2.5 渐进拆分要以责任和风险为单位

CommercialRepository 的成功点不是机械减少行数，而是先 characterization，再拆 query、
transaction 和 lock owner；旧 facade 只作为临时组合入口。相同 Session、相同 owner、相同
风险面的移动可以合成 coherent batch，避免每个方法单独支付 CI/M4/merge 成本。

停止同样是工程能力：当 facade 已没有业务实现，剩余调用方不阻塞真实用户路径时，不为数字
归零继续拆分。

### 2.6 工具和运维 guard 必须在第一副作用前失败关闭

部署脚本先证明 lock、目标身份、consumer、label、fingerprint 和输入，再执行 rsync、build、
stop、migration 或 write。对象不存在、检查命令失败和权限不足必须分型；无法证明安全时返回
非零，不能自动清理别人的 slot、lock 或 candidate。

### 2.7 证据状态不能互相冒充

```text
local verified
  != PR verified
  != merged master
  != M4 candidate
  != M4 accepted
  != production validated
  != human accepted
```

浏览器在 tunnel/transport 阶段超时且没有进入产品断言时，证据为
`degraded/not_counted`。没有自然流量就写 `unmeasured/N/A`，不能制造付费调用或用 M4
健康替代 Production/真实用户证据。

### 2.8 评审发现属于实现循环

七个会话反复证明，P1/P2 往往来自遗漏的负向分支：删除文件、无 `.git` 源码包、重复
container、错误 volume label、空 Bash 数组、刷新后状态恢复、或同一站点的并发任务。
有效 review 必须在同一 scope 内修正根因、补回归、重跑被影响的证据，而不是只 resolve
thread 或扩大成新工程。

## 3. 历史反馈当前状态

| 反馈 | 当前状态 | current-master 证据 | 判断 |
| --- | --- | --- | --- |
| 前端 unit 与关键 Playwright 未进入默认 CI | 已解决 | CI 运行 `test:unit`；frontend 变更按分类运行 Admin/Portal 关键路径 | 保持，不再单独立项 |
| CommercialRepository 是 4,000 行业务门面 | 主要解决 | facade 当前 36 行、仅 `__init__`，业务实现已归明确 owner | 暂停继续拆到零 |
| 单会话仍背负并行协作复杂度 | 已解决 | PR #510/#511 和 single-session lifecycle 已进入 `master` | 观察 3 至 5 个真实任务再调整 |
| 工单信息密度和基本操作闭环不足 | 已解决 | 高密度队列、按需 inspector/dialog、返回上下文和 focused E2E 已落地 | 只修真实使用阻断 |
| WordPress inline 被后台 Site Knowledge 并发占满 | 已解决 | PR #512 分离 interactive/background pool，真实调用 `used +8`、`remaining -8` | 保持并发回归 |
| M4 工程命令清单在无 `.git` 容器内失败 | **未解决** | checker 仍强制执行 `git ls-files`，M4 source bundle 仍不包含 `.git` | 小范围高收益修复 |
| Admin Overview 异常入口不能带预筛选/返回上下文 | 未解决、主动延期 | Overview 仍只链接 canonical queue，不携带异常筛选与 focus | 真实运营需要前暂缓 |
| 可信管理员身份链、具名/多管理员、会话撤销 | 未解决、主动延期 | 当前仍按单管理员产品边界运行 | 扩大运营人员前再做 |
| RuntimeService 责任过度集中 | 部分解决 | 当前约 5,405 行；比早期下降但仍是热点 | 改到相关责任时继续抽取 |
| Account/AI Resources/AI Advisor/Service Settings 巨型页面 | 部分解决 | controller/hook 已抽取，但页面仍约 2,300 至 3,029 行 | 不为行数单独重写 |
| 源码正则契约过多 | 未解决、受控债务 | 87 个 `.mjs` 契约，真实交互已有 Vitest/Playwright 但尚未替代大部分静态断言 | 触碰交互 seam 时转换 |
| Portal/Runtime/WordPress connector 测试文件过大 | 未解决、受控债务 | 最大文件约 7,183、4,941、4,186 行 | 按能力修改时拆分 |
| 覆盖率缺少持续趋势 | 未解决 | 前端已有 coverage 依赖，但 CI 未形成 changed-code trend；后端无持续报告 | 先观察修改代码，不设全仓阈值 |
| 工程命令太多、文档太多 | 部分解决 | 已有命令 inventory、docs index、deprecated 流程；未批量删除 | 按使用证据分批治理 |
| 生产镜像包含整个 `app/deploy/scripts` | 未解决、主动保留 | 部分正式 smoke、恢复和运维合同仍依赖这些文件 | 候选稳定后再做 delivery manifest |
| Python 3.14.6 CVE 例外 | **当前发布阻断** | upstream observer 为 `waiting_for_candidate`，例外到期日为 2026-08-05 | 不猜 digest、不延长、不抢跑 |
| Production #406 | **部分完成、仍未完成** | SSH trust 等部分前置完成；exact bundle/scan、生产 PR、部署、正式 smoke 和观察未完成 | 安全门禁关闭后接棒 |
| 真实用户与商业可行性 | 未测量 | 已完成一次操作者 WordPress 真实闭环，但没有 3 至 5 名目标用户或自然复用 | 当前无用户时不伪造结论 |

## 4. 建议给操作者的分阶段决策

### 阶段 A：先关闭两个发布前硬缺口

1. 继续运行仓库 Python 上游观察器；只有官方候选和精确 digest 可用时，才更新镜像、image
   lock、CVE allowlist 和供应链契约。
2. 单独修复 M4 工程命令清单的无 `.git` 兼容性：作者机保留 `git ls-files` 权威路径；受控
   source bundle 使用确定性清单或严格 filesystem fallback；补无 `.git` 回归。

目的：让最终候选的安全事实和 M4 contract 都可重复，不带已知假绿/假红进入 Production。

### 阶段 B：冻结一个 exact release candidate

1. 停止普通 Admin、结构优化和非阻断依赖更新。
2. 记录同一 `master` SHA、required checks、M4 accepted、bundle digest、image identity、
   migration head 和 rollback revision。
3. 候选变化即废止旧证据，不在多个 SHA 之间拼接结论。

目的：把开发完成状态收敛为一个可审计、可回滚的生产验证对象。

### 阶段 C：完成 Issue #406 的最小受控生产验证

优先补 exact bundle/image scan、RDS backup/restore-readiness、schema drift、user/site
ownership 和正式 smoke 前置条件，再创建 `master -> production` PR。部署后只做最小人工
旅程、回滚可用性和必要观察。当前没有外部用户，因此不需要把 GA、复杂运营体系或大量
合成流量塞入这一阶段。

目的：证明“这个 exact 版本能安全上线、能完成核心闭环、出问题能退回”，不是证明已经有
市场需求。

### 阶段 D：上线后先验证一个核心任务，再决定产品工作

先由操作者通过正常 WordPress Ability -> Addon -> Cloud -> hosted model -> editor adoption
路径自然使用。记录首次成功时间、失败阶段、结果是否采用、调用成本和是否自然复用。没有真实
用户时，操作者旅程只能证明可运行，不能声称用户接受或商业可行。

目的：让后续投入由真实阻断点决定，而不是由页面数量、文件行数或 backlog 数量决定。

### 阶段 E：只在证据触发时偿还结构债务

- 修改 RuntimeService 某责任时抽对应 collaborator；
- 修改巨型 Admin 页面时把新状态/API/动作移入现有 feature/controller；
- 修改交互源码契约时补 Vitest/Playwright 并删除被替代的脆弱断言；
- 修改大型测试领域时按 capability 拆 fixture 和场景；
- 收集 changed-code coverage 趋势，不先设全仓硬百分比；
- 只有镜像审计收益明确时才收窄 delivery manifest。

目的：避免再开启一个长期“大扫除”阶段，让结构投入直接降低真实变更风险。

## 5. 当前不建议启动

- Admin Overview Batch3：不是发布或核心 WordPress 闭环阻断；
- 具名/多管理员、管理员会话清单和撤销：单管理员阶段收益不足；
- CommercialRepository Phase 8：当前 facade 已是薄装配层；
- 全仓 coverage 80% 或类似硬阈值：会奖励简单代码并掩盖关键分支；
- 批量删除 `.mjs`、脚本、文档、分支或 worktree：缺少逐项消费者和所有权证据；
- 为填 24 小时表格制造 Provider 调用、M4 变更或合成用户行为。

## 6. 本文的维护方式

本文是 2026-08-04 的综合快照，不作为永久 backlog 数据库。后续每个问题只在对应 issue、
plan、active standard 或代码合同中更新；本文不追踪逐次候选和临时日志。

当阶段 A-C 完成时，新增一份 production validation evidence/closeout，并在这里追加 successor
链接即可。不要把本文重写成实时状态页，也不要删除七个原会话或历史 closeout 来制造整洁感。

Issue #406 第一段 preparation/canary 的后续证据见
[Issue #406 Controlled Production Validation Preparation Retrospective](issue-406-controlled-production-validation-preparation-retrospective-2026-08-04.md)。
它记录 exact bundle、只读生产盘点、first-install lifecycle blocker 和 localhost-only
canary/browser 证据；不表示阶段 C、production validation、human acceptance 或 GA 已完成。
