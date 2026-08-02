# AI 开发阶段收口与生产就绪复盘（2026-08-02）

状态：historical synthesis and operating handoff。

观察区间：2026-07-28 至 2026-08-02。

目的：把这一轮用户端体验整改、商业语义修正、Admin 操作台收敛、媒体与
反馈能力建设、M4/CI 加固和并行 AI 协作经验整理成一个可复用的阶段记录，
并明确下一阶段进入受控生产验证前必须满足的条件。

本文记录历史与方法，不替代以下现行权威：

- [AGENTS.md](../AGENTS.md)；
- [Development and Validation Operating Model v1](development-validation-operating-model-v1.md)；
- [AI Development Validation Tiers v1](ai-development-validation-tiers-v1.md)；
- [Parallel AI Collaboration Standard v1](parallel-ai-collaboration-standard-v1.md)；
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)；
- [Cloud Production Release Policy v1](cloud-production-release-policy-v1.md)；
- [Production Release Checklist](../deploy/RELEASE_CHECKLIST.md)。

如果本文与现行标准冲突，以现行标准为准。本文不授权 production PR、生产
主机访问、Environment 批准、数据写入、GA 或用户开放。

## 1. 证据边界与快照

本文只把已经进入 `master` 的提交当作交付事实。会话中的 local candidate、
M4 candidate、等待队列、失败试跑和临时 SHA 只用于解释过程，不自动成为
最终结果。

本次文档工作开始时的只读快照是：

- `origin/master=d569f84561acd6d89a75d9209ec8e4eaab59a7b4`；
- `origin/production=74e074245345b1c9476e5671a762ceefee90e662`；
- production queue Issue
  [#406](https://github.com/npcink/npcink-ai-cloud/issues/406) 仍为 open；
- 2026-07-30 对 `master@1c88150c` 的 release-candidate 审计已经因后续开发
  重新开放而失效，不得复用为当前候选证据。

这些值是时间点证据，不是永久状态。未来生产建议必须重新读取当前 Git、PR、
M4、迁移、Secrets 名称、主机和 RDS 证据。

## 2. 这一阶段实际解决了什么

下面按用户任务而不是按文件目录归纳。PR 仅列代表性节点；精确合并历史以
`master` 的 first-parent Git 记录为准。

### 2.1 用户成功路径从“能打开”转向“可理解、可恢复”

Portal 和公共入口连续处理了 onboarding、站点连接、写操作反馈、支付回跳、
刷新恢复、套餐加载、验证码重发、额度到期时间和错误展示。代表性节点包括：

- Portal 恢复与 onboarding：#336、#337、#339、#343；
- 支付回跳 reconciliation、刷新稳定性与恢复：#366、#389、#403；
- 关键 Portal Playwright 门禁：#359、#370；
- 公共定价加载期间保持不可操作：#410；
- 验证码重发 cooldown：#412；
- 付费额度到期时间按 locale 显示且保留需要的时间精度：#413；
- 可重复的 Portal 演示 fixture：#447。

形成的核心认识是：用户体验正确性不仅是成功态。loading、zero、empty、error、
retry、cooldown、return、refresh 和 stale session 都是产品状态，必须有明确
所有者、稳定 UI 和可重复测试。

### 2.2 商业事实从“多个近似字段”收敛到单一语义

AI credit 和成本链路先统一 meter contract，再清理旧 projection，随后修正
“赠送/调整抵消已使用”的语义错误：

- AI credit meter contract 与旧字段迁移/删除：#321、#322、#323、#324；
- `used` 保持毛消耗，赠送与调整只影响可用额度，不反向减少已使用：#379；
- 调用时固定 CNY 成本快照，避免事后汇率或价格变化改写历史：#393；
- 账户详情读取服务端额度与 ledger 证据：#401；
- 将缺失成本快照显式暴露为不完整，而不是静默当作零：#411。

可复用语义是：

```text
used      = 已经发生的毛消耗
remaining = 当前仍可消耗的额度
limit     = used + remaining
```

赠送、回收、人工调整和消费要分别入账。赠送和调整改变 `remaining`，因此也会
改变 `limit`，但不得减少 `used`。任何汇总 API、Portal、Addon 或 Admin 投影
都不得通过净额运算改变 `used` 的历史含义。高价值契约应覆盖“赠送 + 调整 +
消耗”的组合；本轮真实调用证据的目标断言是 `used +8`、`remaining -8`。

### 2.3 Admin 从页面堆叠转向操作者任务台

Admin 改造不是单纯换样式，而是逐步确定页面模型、状态所有权和操作层级：

- 查询、controller 与 route state 责任拆分：#349、#350、#367、#372、
  #374、#380、#385、#394、#397；
- 套餐、账户、额度、服务状态、Coverage、Support 和 AI Resources 收敛为
  PC-first 工作台：#363、#364、#371、#373、#384、#388、#390、#395、
  #396、#398、#400、#405、#408、#416、#419、#422 至 #424、#430 至
  #441、#448、#450 至 #457；
- 统一页面 header、overflow menu、滚动 owner 和审查交付方法：#434、#440、
  #446、#460、#461。

形成的判断顺序是：先定义操作者要识别的对象、要判断的状态和下一步动作，再
决定表格、目录、详情面板、dialog 或 disclosure。默认工作面只保留高频任务；
原始 ID、历史、调试和危险动作按上下文披露，但不能隐藏当前错误、影响范围和
保存语义。

### 2.4 媒体与反馈能力保持“证据投影”，不夺取 WordPress 所有权

这一阶段增加了图像 evidence artifact、媒体库检索投影、视觉证据复用、质量
反馈 rollup、Coverage 投影、语义 embedding 和轻量搜索排序：#351、#381、
#391、#398、#399、#402、#407、#409。

Cloud 可以拥有托管运行、检索和只读证据投影；WordPress 仍拥有本地 ability、
workflow、设置、审批、preflight 和最终写入。建议、索引或反馈不能演变成第二
个 WordPress 控制面。

### 2.5 交付系统从“会话自觉”升级为 fail-closed 规则

工程系统的主要节点包括：

- frontend 单元与关键 Playwright CI：#348、#359、#370；
- 并行 AI 的 conflict domain、merge lane、M4 owner 与 worktree lock：#361、
  #386、#443；
- 临时 frontend slot 与 M4 observation receipt：#368、#369；
- browser transport preflight：#418；
- M4 shared volume consumer guard：#420；
- frontend-only CI 分类：#444；
- 风险分级验证与 stale preview asset 防护：#458；
- M4 Nginx 配置原子发布：#459。

这些机制的共同目标不是增加流程，而是防止三种昂贵错误：覆盖他人 candidate、
把未合并源码当成 accepted、以及在 fail-closed 之前已经改变 live runtime。

## 3. 反复出现的问题、根因与修正

| 问题模式 | 具体表现 | 根本原因 | 固化后的修正 |
| --- | --- | --- | --- |
| 状态层级混淆 | local、PR、M4 candidate、accepted、production 都被称为“完成” | 没有说明每个证据回答什么问题 | 报告最高证据状态、revision、owner 和未覆盖范围 |
| 候选漂移 | production 审计后继续合并功能，旧 SHA 仍被口头当作候选 | 没有真正停止开发队列 | 阶段关闭后再冻结唯一 SHA；任一新合并都使旧审计失效 |
| 商业语义被净额化 | 赠送或调整降低 `used` | 汇总从余额反推历史消费 | ledger 事件分型；`used/limit/remaining` 单一契约；组合测试 |
| 健康检查替代用户旅程 | HTTP 200，但回跳、刷新或按钮仍不可用 | 验证停在相邻层 | 检查实际 Portal、Admin、worker、Addon 或支付消费者 |
| loading 生命周期不稳定 | 支付回跳 paid 后反复进入 session skeleton | 子组件 refresh 与父级 session/search state 相互触发 | 明确 reconciliation owner；覆盖 pending 到 paid 的稳定展示 |
| 浏览器传输被误判为产品失败 | 宿舍链路低吞吐，`page.goto` 未进入断言 | 没有区分服务端、隧道与浏览器 transport | preflight 输出 `degraded/not_counted`，不自动换证据或归罪产品 |
| 并行会话互相覆盖 | 后来的 candidate、PR 或 M4 操作使先前证据失效 | 只有文件边界，没有稀缺运行态边界 | Three Uniques；builder `local-ready`；integrator 串行交付 |
| Infra guard 执行太晚 | guard 拒绝前 live rsync 已可能热重载源码 | 只追踪 `stack_touched`，没有按第一副作用排序 | 第一次 guard 必须早于 rsync/build/stop/migration；build 后再检查竞态 |
| Infra 身份判断过宽 | 相同 Compose labels 的 stale container 被当作 primary | label 被误当作唯一身份 | 取得当前唯一 frontend canonical container ID；0 个可恢复，多个 fail-closed |
| 只读检查 fail-open | volume inspect 故障被当作“卷不存在” | 命令失败与对象不存在未分型 | 存在性、label proof、consumer proof 分开；任何不可判定返回 75 |
| 测试替身污染探针 | fake curl/lsof/nc 让端口可用性测试失真 | fake 对所有输入全局成功 | fake 只匹配目标 URL/端口；occupied 与 free 都有动态回归 |
| Shell 兼容性遗漏 | Bash 3 + `set -u` 展开空数组报错 | 以新 Bash 行为推断运行环境 | 0 至 3 locks 使用 Bash 3-safe 标量计数；重复 release 幂等 |
| UI 优化批次过碎 | 很多小候选排队，反复 rebase/M4/promotion | 把局部可改进等同于必须立即交付 | 同一操作者任务合并为一批；ready 队列最多两项；达到阶段目标即停 |

## 4. 工作审视报告

### 4.1 原定目标

从用户端继续排查体验问题，按价值顺序修复；统一商业与额度语义；改善 Admin
操作效率；补齐真实旅程和契约验证；在并行开发条件下安全提交、合并并完成 M4
接受；最后判断是否可以进入 production #406。

### 4.2 完成情况

- [x] 已完成：Portal 恢复、支付回跳、加载、cooldown、locale 等代表性用户
      状态已进入 `master`，并建立关键 E2E/fixture。
- [x] 已完成：AI credit 的 `used/limit/remaining` 语义、CNY 调用时成本快照与
      账户证据读取已收敛。
- [x] 已完成：Admin 多个高频工作面完成 query/controller/state 拆分、PC-first
      密度和操作层级优化，并形成专门 UI 审查手册。
- [x] 已完成：并行会话、worktree、merge lane、M4 owner、preview tier、browser
      preflight 和 deploy slot guard 已形成仓库规范与自动契约。
- [x] 已完成：源代码、CI、M4 candidate、accepted、production 与人类验收的
      证据层级已经制度化。
- [ ] 未完成：production #406 尚未形成新的 exact release candidate，也没有
      production PR、受保护 Environment 部署、真实生产旅程或 24 小时观察。
- [ ] 未完成：旧 `master@1c88150c` 审计中的 SSH trust、live release/rollback
      identity、RDS restore-readiness、schema drift、ownership inventory、formal
      smoke credentials 和 external OTLP 仍需按新候选重新核验。

### 4.3 发现的问题

| 严重程度 | 问题描述 | 根本原因 | 改进建议 |
| --- | --- | --- | --- |
| 必须改正 | production 预审已经做过一次，但后续开发重新开放，使候选和范围全部失效 | 没有把“建议停止开发”变成可执行的 stage-close gate | 只有满足 Section 7 的冻结条件后才开始 #406；新功能进入即撤销候选 |
| 必须改正 | M4 guard 多轮 review 才发现 live rsync 顺序、canonical ID、inspect/label fail-open 和 Bash 3 问题 | 初版审查偏重目标路径，没有逐个枚举第一副作用、不可判定状态和真实运行 shell | L2 infra 变更先写 fault model；负向测试必须证明副作用未发生 |
| 应当改正 | 很多局部 UI 候选被拆成连续 merge/M4 批次，协调成本明显上升 | 优化目标按页面缺陷切分，而不是按操作者任务和共享 seam 切分 | 用页面模型、操作者任务和 conflict domain 合批；限制 ready 队列 |
| 应当改正 | 一些浏览器窗口未完成时容易被误读为产品失败或通过 | transport、runtime 和产品断言没有统一分类 | 所有 browser receipt 记录是否进入产品断言；未进入统一记 `not_counted` |
| 建议改进 | 历史对话包含大量临时 SHA、候选和交接消息，后续阅读成本高 | 运行证据保留在会话流，没有及时形成按主题的阶段索引 | 阶段结束只保留最终 master 结果、代表性失败模式和未完成边界 |

### 4.4 做得好的地方

- 用户反馈被转换为可验证的状态、语义和恢复路径，而不是只做视觉润色。
- 多次 review 指出的 P1/P2 没有绕过，而是在同一范围内最小修复并重新验证。
- dirty worktree、他人 candidate、M4 lock 和 Cloud merge lane 被当作所有权证据
  保留，没有通过 reset、stash、强制清理或抢占来换取表面进度。
- M4 transport 失败、local 通过、CI 通过和 accepted promotion 均按真实层级
  报告，没有把 HTTP 200 或截图夸大为生产通过。
- Cloud 与 WordPress 的控制面边界在媒体、反馈、AI 能力和最终写入中得到保持。

### 4.5 下次重点关注

- 在任何长开发阶段开始时定义“阶段停止条件”，不要等候选堆积后才决定收口。
- L2 infra 先列出副作用顺序、身份权威、不可判定分支、信号清理和旧 shell
  兼容矩阵，再写实现。
- 真实用户旅程同时覆盖成功、失败、重试、刷新、返回、并发和 stale 状态。
- 进入 release candidate 后冻结普通功能队列；生产 gate 缺证据就停止，不用 M4
  或 synthetic fixture 替代。

## 5. 可复用的开发思路

### 5.1 从用户任务出发，而不是从页面或文件出发

先写用户或操作者的任务链：

```text
识别对象 -> 理解状态 -> 执行动作 -> 获得反馈 -> 失败恢复 -> 返回原上下文
```

然后追踪：写入入口、canonical storage、领域计算、API projection、缓存/刷新、
最终消费者。只有整条链一致，才叫该问题解决。

### 5.2 先定义事实语义，再统一 UI

余额、额度、成本、等待方、服务状态、身份和归属都必须由服务端或领域层定义。
前端只能展示、筛选和提交意图，不能从几个近似字段重新推导业务事实。对未知、
零、失败和不适用分别建模，避免用空字符串、0 或 loading 占位掩盖差异。

### 5.3 用风险选择验证，不用仪式选择验证

- L0：外观且不改变几何/动作/状态，exact static + focused browser；
- L1：route composition，focused contract/behavior + PC browser + 对应 closeout；
- L2：API、auth、shared primitive、persistence、migration、proxy、deploy 等，覆盖
  真正受影响的 source、runtime、CI、promotion 和 smoke；
- documentation-only：链接、格式、文档契约、anti-drift，默认不占 M4。

一份大套件只有在回答新风险问题时才运行；同 revision 不重复制造相同证据。

### 5.4 并行实现，串行改变共享事实

并行的对象是独立调查和独立 conflict domain。必须串行的是：

- 同一个 API/DTO/route/shared primitive/migration head；
- 唯一 human-authored merge lane；
- primary M4、共享数据和真实 provider budget；
- clean-master acceptance 和 production decision。

builder 在 clean commit + narrow gates 后停止于 `local-ready`。integrator 才负责
current-base rebase、PR、CI、M4 和 merge。等待队列最多两个 accepted ready item。

### 5.5 Fail-closed 必须发生在第一副作用之前

部署与运维脚本先枚举会改变什么，再把所有权、目标身份、label、fingerprint、
lock、配置和输入证明放在第一次 rsync/build/stop/migration/write 之前。命令故障
和对象不存在必须分型；无法证明安全时返回非零，不自动删除或恢复他人的状态。

### 5.6 每次完成都报告证据层级

```text
local verified
-> local-ready
-> PR verified
-> merged master
-> candidate validated on M4
-> accepted on M4
-> production validated
-> human acceptance / GA
```

这不是线性自动升级。不同任务可跳过不适用层级，但不得把较低层级命名成较高
层级。

## 6. “完成”的统一定义

| 工作类型 | 最低完成定义 | 不能顺带宣称 |
| --- | --- | --- |
| 只读排查 | 可复现证据、严重度、建议 envelope、未知项 | 缺陷已修复 |
| local builder | clean focused commit、exact files、narrow gates、handoff receipt | PR、M4 或 merge 完成 |
| 普通产品批次 | PR required checks、merged master；需要 runtime 时 clean-master M4 accepted | production 已发布 |
| M4 infra 批次 | fault injection、无副作用证明、正向路径、clean-master accepted、locks released | production infra 相同 |
| 文档/策略批次 | 链接、格式、文档契约/anti-drift、review/CI | runtime 已改变 |
| controlled production validation | exact candidate、全部 pre-mutation gates、protected dispatch/approval、生产 smoke 和观察 | GA 或外部用户接受 |

## 7. 开发阶段何时可以真正收口

以下条件必须同时满足：

1. 已纳入本阶段的每个批次都已 merged、明确撤回或交给后续阶段；
2. 需要 runtime acceptance 的 merged 批次均已从 clean current `master` promotion；
3. 没有本阶段 candidate 占用或等待 M4；
4. Cloud merge lane 与 shared M4 分别明确释放；
5. local-only candidates、dirty/locked worktrees、blockers、rollback 和 next owner
   已记录；
6. 操作者明确把队列从 feature development 切换为 release-candidate preparation。

只完成一个 PR、只释放 M4、只看到 CI green，均不足以关闭阶段。详细权威规则见
[Parallel AI Collaboration Standard Section 11](parallel-ai-collaboration-standard-v1.md#11-development-stage-closeout-and-release-handoff)。

## 8. production #406 的正确入口

阶段关闭后，production 工作仍从 pre-audit 开始，不从 deploy 开始：

1. 冻结一个 exact clean `master` SHA；
2. 记录 scope、migration、bundle/image digest、rollback revision/procedure 和
   named operator；
3. 重新运行 release policy/checklist；
4. 独立验证生产 SSH fingerprint 并在受保护 Environment 固定
   `PROD_SSH_KNOWN_HOSTS`，禁止 runtime `ssh-keyscan` 建立信任；
5. 完成 exact image/CVE、RDS backup/restore-readiness、schema drift、用户/站点
   ownership、live release/rollback identity 与 formal smoke prerequisites；
6. 只有全部 pre-PR gates 有证据后，才创建包含
   `Approved for production validation by operator.` 的 `master -> production` PR；
7. required checks 和 protected merge 后，仍需人工 dispatch 与 Production
   Environment approval；
8. 部署后验证 public revision/health、真实 WordPress reconnect + old-key revoke、
   operator-approved low-value Alipay、external telemetry 和 24 小时观察；
9. GA 是另一次独立决定。

如果 exact candidate 改变、rollback 不完整、SSH trust 未验证、backup/ownership
证据缺失、CI/security 失败或 Environment approval 不可用，立即停止并记录
blocker。M4 accepted、synthetic fixture、HTTP 200 和 release issue 都不能替代。

## 9. 下一阶段建议

下一阶段只保留一个主攻方向：开发收敛后重新启动 #406 的生产前审计。

顺序是：

```text
清空已承诺开发队列
-> clean current master M4 accepted
-> 双释放 merge lane / shared M4
-> 冻结唯一 release candidate
-> production pre-audit
-> 受控 production validation
-> 24 小时观察
-> 独立 GA 决策
```

在候选冻结前可以完成已经承诺的批次，但不再开启第三条普通功能主线。候选冻结
后，任何新功能都应进入后续版本；只有 release blocker 的最小修复可经过重新
冻结后进入当前候选。

## 10. 非目标

本文不：

- 宣称所有用户体验问题已经穷尽；
- 宣称历史 local/M4 candidates 都已合并；
- 删除或解锁历史 worktree；
- 修改 Cloud、WordPress、M4、production、Cloudflare、DNS、Secrets 或数据；
- 创建 production PR 或授权生产部署；
- 把内部验证等同于真实外部用户价值。

未来会话应复用本文的方法，并重新测量所有时间敏感事实。
