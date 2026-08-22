# 反馈数据飞轮、串行交付与生产交接阶段复盘 — 2026-07-30

状态：当前开发阶段已按受保护合并、clean-master M4 acceptance 和双释放完成
收口；Issue `#406` 是下一步受控生产验证准备的唯一 handoff。生产部署、
24 小时观察和 GA 均未由本文宣告完成。

范围：归纳从“用户反馈数据是否足够、在哪里查看、是否需要模拟数据”开始，
到反馈采集链路、可观测性、真实 Local WordPress 验收、并行开发协调和受控
生产发布排队的完整思路。

本文是日期化历史记录，不替代
[Cloud Agent Feedback Contract](cloud-agent-feedback-contract-v1.md)、
[Feedback Data Operations](feedback-data-operations-v1.md)、
[Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md)、
[Development and Validation Operating Model](development-validation-operating-model-v1.md)、
[Cloud Production Release Policy](cloud-production-release-policy-v1.md) 或
[Cloud Release Checklist](../deploy/RELEASE_CHECKLIST.md)，也不授权生产部署。

## 1. 执行结论

这一阶段最重要的进展不是增加了一个反馈页面，而是把数据飞轮拆成了可验证的
连续链路：

```text
WordPress 本地行为和设置真相
-> Addon 本地缓冲、签名与幂等传输
-> Cloud 元数据事件和站点隔离存储
-> 只读聚合、覆盖率和质量分层
-> Admin / operator status 查看
-> 固定语料评估和人工审查
-> 受保护的代码变更、灰度与复测
```

当前结论分为三层：

1. **渠道和类型已经足以验证采集系统。** 编辑结果、Agent 反馈、媒体质量、
   插件可观测事件和 WordPress 监控状态投影已经有明确入口、契约和只读出口。
2. **当前数据量不足以驱动产品或模型决策。** 确定性 fixture 和一次真实
   Local 链路只证明采集、幂等、禁用和聚合语义，不证明跨用户收益或生产覆盖。
3. **下一步不是继续堆仪表盘。** 当前既定开发批次已经闭环；下一步按
   [Issue #406](https://github.com/npcink/npcink-ai-cloud/issues/406)
   冻结精确候选并进入受控生产验证准备。准备、部署、受控验证和 GA 继续
   分开，任何缺失门槛都必须停止。

## 2. 日期化证据快照

截至本记录最终收口：

- `origin/master` 为
  `9f988e65019fb736c582afba8de227a04db35112`，对应 PR `#414`；
- `origin/production` 为
  `74e074245345b1c9476e5671a762ceefee90e662`；
- 两条分支有意分叉，不能用提交数差异代替精确 tree、bundle 或部署判断；
- PR `#397` 至 `#405`、`#407` 至 `#414` 均已合并且 required checks
  通过；`#406` 是 release-queue Issue，不是 PR；
- PR `#414` 已完成 clean-current-`master` M4 accepted promotion，
  `source_branch=master`、`source_revision=9f988e65`、
  `source_dirty=false`，HTTP 和迁移头健康；
- Media 本地语义向量和轻量混合检索分别通过 PR `#407`、`#409` 合并并
  完成 accepted promotion；真实 WordPress “猫咪”查询保持目标附件 rank 1，
  且仍为 suggestion-only、无 WordPress 写入；
- Cloud merge lane 和 shared M4 已双释放；本阶段没有等待发布或等待
  runtime 验收的 feature candidate；
- Plans 登录后 M4 页面验收因没有可复用 Admin 会话而保持 `not measured`；
  verification/expiry 两批的 M4 browser 也因私网 Next dev 资源传输超时未进入
  产品断言。这些限制没有被误报为通过，相关行为由同 revision 本地 PC、
  protected CI 和 clean-master status 分层证明；
- 生产没有因这些 M4 验收自动更新，M4 accepted 也不是生产或 GA 证据。

### 2.1 串行收口窗口

| PR | 主要结果 | 经验 |
| --- | --- | --- |
| `#386` | 固化 parallel collaboration 与 task worktree lock | 先保护作者状态，再讨论共享通道 |
| `#387`–`#396` | 收口 Support、Plan、Portal、AI Resources、Coverage 与成本语义 | 以真实操作任务和状态所有权拆热点，不做全局重写 |
| `#397` | 按能力拆分 5,000 行级 service route 测试 | 保留测试语义，降低定位和并行修改冲突 |
| `#398` | 增加反馈覆盖率只读 operator status | 先提供可操作的聚合，不急于增加第二个 Admin 页面 |
| `#399` | 增加媒体质量反馈 rollup | 复用一个反馈契约，不为媒体另建分析控制面 |
| `#400` | Coverage 表格行与检查器形成真实选择关系 | PC-first 操作路径优先于卡片式展示 |
| `#401` | 抽离账户积分只读查询控制器 | 查询按页面激活、可取消、精确失效、失败时 fail closed |
| `#402` | 投影 WordPress 本地 monitoring state | `unknown` 不推断为启用，Cloud 不接管本地设置真相 |
| `#403` | 恢复支付返回失败后的重试路径 | 成功路径之外，恢复路径也是产品正确性 |
| `#404` | 增加确定性本地反馈 fixture | 模拟数据可重复、可清理、拒绝生产环境 |
| `#405` | 明确服务状态中的客户行动入口 | 只读诊断与写操作分区，不借错误态改写既有权限 |
| `#407` | 增加 M4 secretless 本地媒体向量 | 本地开发检索可以独立于生产 Provider metadata |
| `#408` | 简化 Coverage operator actions | 每个状态只保留一个上下文动作，技术身份默认折叠 |
| `#409` | 增加有界 semantic + lexical 排序 | 精确命中优先，派生 URL 去重且不靠过拟合阈值掩盖负例 |
| `#410` | Catalog 未就绪时保持公开定价 inert | loading、失败和未配置必须与真实 offer 分开 |
| `#411` | 展示 CNY 成本快照缺失 | 聚合只信调用时快照，不用当前汇率重估历史 |
| `#412` | 改善验证码重发恢复 | 后端限流是真相，前端冷却绑定邮箱且多 scope 返回最长等待 |
| `#413` | 按应用 Locale 展示付费额度到期 | 日期格式显式，Usage 和支付回跳保留精确到期时刻 |
| `#414` | 收紧 Admin 套餐参数控制 | 保存保持唯一主操作，默认/还原为次操作，紧凑几何使用共享 token |

这个窗口的价值不只是合并了多项改动。每一项都遵循：

```text
local-only 候选
-> 唯一 shared M4 owner
-> focused candidate evidence
-> 释放 M4
-> 唯一 human Cloud merge lane
-> required checks / merge
-> clean-master accepted promotion
-> Cloud lane 与 shared M4 双释放
```

## 3. 反馈数据的渠道、类型和查看入口

### 3.1 当前渠道

| 渠道 | 数据所有者 | Cloud 可接收内容 | Cloud 不得接收或推断 |
| --- | --- | --- | --- |
| WordPress 编辑结果 | WordPress / Addon | 结果枚举、关联 ID、时间和粗粒度原因码 | 正文、Prompt、生成内容、最终写权限 |
| Agent review feedback | WordPress / Core | outcome、允许的 labels、脱敏关联元数据 | 审批、preflight、自动 prompt/profile 变更 |
| 插件可观测事件 | Addon | 运行、重复、过期、监控状态等元数据 | 把活跃 key 或普通运行推断成监控同意 |
| 媒体质量反馈 | WordPress / Addon | 有结果/无结果/错误、采用动作、ALT 结果枚举 | 搜索原文、ALT 文本、附件写权限 |
| Cloud runtime | Cloud | provider/run/usage/error/health 证据 | WordPress 工作流和最终内容真相 |

### 3.2 数据类型

当前数据可分为四类：

1. **漏斗覆盖数据**：connected、active runtime、monitoring state、
   plugin observability、agent feedback 和 editor-assist quality 的站点覆盖。
2. **质量结果数据**：accepted、edited-before-accept、rejected、ignored、
   expired 及 bounded labels。
3. **运行可靠性数据**：传输成功、重复、错误、幂等、最后摄入时间和禁用状态。
4. **证据成熟度数据**：`insufficient`、`validation`、`observation`、
   `decision`，且不同样本单位不能相加。

### 3.3 查看入口

- 细节和质量趋势：
  `/admin/agent-feedback`；
- 部署主机聚合状态：

  ```bash
  cd /opt/npcink-ai-cloud/current
  bash deploy/remote-feedback-status.sh --window-hours 168
  ```

- 本地确定性 fixture：

  ```bash
  docker compose -f docker-compose.dev.yml exec -T api \
    python -m app.dev.seed_feedback_flywheel_demo seed
  docker compose -f docker-compose.dev.yml exec -T api \
    python -m app.dev.seed_feedback_flywheel_demo report
  docker compose -f docker-compose.dev.yml exec -T api \
    python -m app.dev.seed_feedback_flywheel_demo cleanup
  ```

这些入口都是只读观察或开发 fixture，不提供 prompt/router 写入、WordPress
对象写入或自动优化按钮。

## 4. 为什么先做确定性模拟数据

随机造量会掩盖重复、缺口和清理问题。PR `#404` 选择固定身份和固定结果：

- 4 个 synthetic connected sites；
- 4 条 agent feedback events，处于 `insufficient`；
- 5 个不同的 editor-assist quality sessions，处于 `validation`；
- 覆盖 monitoring enabled、enabled 但缺 ordinary observability、disabled
  和 unknown；
- 重复 `seed` 只替换精确 fixture 身份，不累加；
- `cleanup` 只删除 fixture 自己的记录；
- production-like 环境和远程数据库直接拒绝；
- 不包含 prompt、生成文本、文章内容、provider response、凭据或真实站点身份。

因此 fixture 适合验证：

- 分母、覆盖率和 gap code；
- `unknown`、`0`、`disabled` 和缺失数据的区别；
- 重跑幂等与精确清理；
- CLI、聚合服务和 UI 的字段契约。

它不适合证明：

- Addon 真实签名传输；
- 用户实际采用或受益；
- 生产覆盖率；
- prompt、模型或路由应该改变。

## 5. 真实 Local WordPress 状态链路验收

在确定性 fixture 之后，使用真实 `npcink.local`、实际 Addon 挂载和当时
accepted 的 M4 API 完成了一次有边界的 stateful 验收。该次验收没有修改
Cloud 源码、没有发布、没有迁移或重建生产环境。

### 5.1 主要结果

- 建立 5 个本地测试会话，覆盖重复生成、精确采用、未匹配保存和过期；
- 产生 5 条结构化 agent feedback；
- 本地缓冲累计 13 条，flush 后 stored `13`、duplicate `0`，缓冲归零；
- 启用期间该开发站点形成 15 条 Cloud observability evidence 和 5 条
  feedback；
- feedback outcomes 为 accepted `2`、edited `1`、rejected `1`、
  ignored `1`，accepted rate 为 `0.6`；
- 连续 heartbeat flush 后计数保持 `15 -> 15 -> 15`，证明幂等；
- 禁用监控后 cron 被清除，新 capture 保持 buffer `0`，flush 被阻断；
- 最终站点记录为 observability `16`、error `0`、feedback `5`、
  monitoring `false`。

### 5.2 数据和环境安全

- 旧凭据在当前 M4 无效时，创建了仅用于 M4 development 的站点和 key；
- key 只通过内存管道进入 WordPress 加密 option，没有打印或持久化明文；
- 未将 WordPress 内容或生成文本写入 Cloud 反馈；
- 5 个本地测试草稿被精确删除；
- plugin symlink 恢复到原目标；
- `npcink.local` 恢复为原停止状态；
- foreground tunnel 关闭；
- shared M4 明确释放给下一任务。

### 5.3 这次验收能证明什么

它证明真实 Local WordPress、Addon、M4 API、缓冲、幂等、禁用和聚合可以
连成一条链。它仍然只是一个开发站点、一次短窗口和少量会话，不能证明
生产覆盖、跨站代表性、长期稳定性或用户收益。

## 6. 当前信息量是否足够

[Feedback Data Operations](feedback-data-operations-v1.md) 将样本成熟度定义为：

| 阶段 | 样本量 | 可以做什么 | 不可以做什么 |
| --- | ---: | --- | --- |
| `insufficient` | `< 5` | 调试单条事件和拒绝路径 | 比较趋势或调整策略 |
| `validation` | `5–49` | 验证采集、分类、去重、隐私和展示 | 宣称产品收益 |
| `observation` | `50–199` | 观察跨时间、跨站点模式 | 自动更改生产策略 |
| `decision` | `>= 200` | 进入人工评估和固定语料决策候选 | 绕过评审直接上线 |

当前真实 Local 数据只达到 instrumentation validation。下一阶段应优先补：

- 至少 2 个独立站点和 2–3 名同意参与的真实编辑者；
- 多个时间窗口中的 enabled、disabled、unknown 和错误恢复证据；
- 结果分类与 WordPress 本地事实的抽样核对；
- 媒体检索的正例、负例和 runtime error 分离；
- 外部 OTLP、生产 smoke 和 24 小时观察；
- 固定语料评估，而不是直接根据线上小样本改 prompt、model 或 router。

## 7. 串行交付中形成的工程经验

### 7.1 只序列化真正共享的东西

源代码调查和不冲突的 local-only 实现可以并行。以下三项必须唯一：

- conflict-domain owner；
- human Cloud merge-lane owner；
- shared-runtime operation owner。

目标不是让所有任务排队，而是防止两个候选同时改写同一个 M4、两个 PR
反复让 required checks 失效，或两个会话在同一页面产生无法归属的 diff。

### 7.2 “双释放”是交付协议

一次 Cloud 改动只有在下面两项都明确释放后，下一任务才接棒：

1. Cloud merge lane：PR 已 merged、closed 或明确退出；
2. shared M4：candidate、revision、dirty state、health、tunnel、锁和恢复状态
   已报告。

若 PR 已合并但 clean-master promotion 未完成，merge lane 仍不能被当作完整
交接。若 M4 已释放但 PR 仍在 required checks 中，后续任务可做 local-only
工作，但不发布第二个人工 Cloud PR。

### 7.3 状态名必须绑定精确证据

```text
local verified
-> candidate validated on M4
-> PR verified
-> merged into master
-> accepted on M4
-> production validated
-> real-user benefit measured
```

共享 M4 是可变预览，不是持久账本。每次 accepted 后应立即记录 PR、merged
revision、source revision、source branch、`source_dirty`、迁移头、health 和
focused smoke。

### 7.4 测试应保护业务语义，不锁死实现细节

本阶段出现过两类有价值的测试纠偏：

- 错误态不应显示误导性的配额结论，但不能因为只读查询失败就顺带隐藏位于
  独立治理区的既有积分写操作；
- React Query 允许内部自动重试，测试应断言“手动重试使请求增加并可恢复”，
  而不是把精确请求次数写成产品契约。

这说明结构测试和浏览器测试的任务是保护可观察行为，不是冻结内部实现。

### 7.5 Readiness 必须限定到当前消费者

一个共享知识库可能同时存有文章与媒体，且历史向量版本不同。媒体检索的
readiness 应只判断本次 `source_types=media` 的候选，不应让无关文章向量
污染媒体空间判断。反过来，也不能通过降低阈值或恢复随机结果掩盖真正的
媒体索引缺口。

该经验来自 Media 批次调查，并已在 PR `#407`、`#409` 的受保护合并与
accepted promotion 中得到验证。它只证明当前本地媒体消费者的 readiness
隔离和检索行为，不证明生产质量或跨用户收益。

## 8. 工作审视报告

### 8.1 原定目标

- 判断反馈采集渠道、类型和信息量是否足够；
- 提供可查看的反馈运营数据；
- 在本地开发阶段建立安全、可重复的模拟数据；
- 用真实 Local WordPress 验证 Addon 到 Cloud 的状态链路；
- 在多任务并发下完成受保护交付；
- 明确开发结束后的生产发布顺序。

### 8.2 完成情况

- [x] 建立反馈事件、媒体质量、监控状态和覆盖率的 bounded contracts；
- [x] 提供 Admin 质量视图与 operator aggregate status；
- [x] 提供确定性、可清理、拒绝生产环境的 fixture；
- [x] 完成一次真实 Local WordPress 到 accepted M4 的 stateful 验收；
- [x] 验证缓冲、flush、幂等、禁用和环境恢复；
- [x] 固化 one merge lane / one shared runtime / double release 的协调方法；
- [x] 建立生产发布后续 Issue `#406`；
- [x] Media、Portal、Coverage、Plans 及其他已承诺开发项均已合并、
  clean-master accepted（适用时）并双释放；
- [ ] 生产部署、24 小时观察和 GA 尚未执行，也不属于本文授权。

### 8.3 发现的问题与纠偏

| 严重程度 | 具体问题 | 根本原因 | 改进 |
| --- | --- | --- | --- |
| 必须改正 | ready 候选曾在发布前遇到新 human PR 抢占 Cloud lane | 只在实现开始时看并发状态，发布前未再次刷新 | 在 publish、M4 mutation、promotion 和 closeout 前重查 open PR 与 owner |
| 必须改正 | 容易把 synthetic counts 当成真实覆盖 | 模拟数据和真实数据使用同一聚合出口 | fixture 输出显式标记 synthetic，复盘分别报告 fixture、Local 和 production |
| 必须改正 | 容易把 M4 accepted 当成持久环境状态 | 共享预览会被下一 candidate 覆盖 | accepted 后立即写日期化 receipt，报告精确 revision 和 smoke |
| 必须改正 | 反馈总量可能把 event 和 quality session 相加 | 不同样本单位在一个飞轮中看起来可合并 | 分开计数、分开 readiness，不制造综合“样本总数” |
| 应当改正 | 一次 API/health 成功容易替代真实 Addon 消费者验证 | 验证停在服务端响应 | 用实际 plugin target、foreground tunnel、buffer、flush 和 disable 路径验收 |
| 应当改正 | 测试可能把自动重试次数或 UI 分区误写成业务规则 | 断言靠近实现而不是用户可见语义 | 断言状态、恢复和权限边界，不固定无关内部细节 |
| 应当改正 | 发布问题容易从“下一阶段”滑成“现在直接上线” | 开发、受控生产验证和 GA 状态被压成一个问题 | 用 Issue `#406` 的 start condition 和 stop condition 分阶段授权 |
| 建议改进 | 多个 ready local candidates 会形成隐性排队成本 | 并行实现快于唯一 merge/M4 lane | 以价值、依赖和候选新鲜度排序；减少长时间 ready 候选数量 |

### 8.4 做得有效的部分

- 先问“数据要支持什么决策”，再决定页面和字段；
- 先做确定性 fixture，再做真实 Local 链路，最后才讨论生产；
- 全程不上传 prompt、生成文本或 WordPress 内容；
- monitoring `unknown` 保持未知，没有从活跃 key 或 runtime event 推断同意；
- stateful 验收结束后精确恢复 symlink、草稿、站点状态和 tunnel；
- 共享资源只允许单 owner，同时保留 disjoint local-only 并行；
- 所有合并继续经过 PR body contract、required checks 和 clean-master
  accepted promotion；
- 发布后续有 durable Issue，但 Issue 本身不成为部署授权。

### 8.5 如果重新开始

1. 第一日就固定三张表：事件契约、覆盖漏斗和证据成熟度；
2. 同时定义 synthetic、Local、M4、production 四类数据标签；
3. 在第一个并行候选前就启用 Three Uniques 和 worktree lock；
4. 每次 accepted promotion 自动生成不含 secret 的日期化 receipt；
5. 达到 `validation` 后停止继续造量，转向多站点真实样本和分类准确性；
6. 在所有开发批次开始前约定阶段终点，避免 ready 候选无限累积；
7. 只有阶段终点满足后才冻结 release candidate。

## 9. 可复用开发规范

### 9.1 数据飞轮

1. 先定义要改善的用户结果，不从“收集更多数据”开始；
2. 只采集完成该决策所需的最小元数据；
3. 保留本地审批、设置和写入真相；
4. 用确定性 fixture 验证结构，用真实 Local 验证传输；
5. 用多站点观察验证代表性，用生产 smoke 验证发布；
6. 自动化采集、聚合和问题发现，不自动化结论和生产变更；
7. 所有改进进入 fixed corpus、人工评审、PR、CI、灰度和复测。

### 9.2 共享开发资源

1. 每个 conflict domain 一个 owner；
2. 每次只让一个 human Cloud PR 占 final merge lane；
3. 每次只让一个 candidate 占 shared M4；
4. 发现 race 时后来的任务退回 local-only；
5. 合并后以 current `origin/master` promotion，不用 feature SHA 冒充 accepted；
6. handoff 必须包含 revision、dirty、health、lock、tunnel 和下一 owner；
7. Cloud lane 与 M4 双释放后才允许下一任务发布或 mutation。

### 9.3 阶段收尾与发布交接

一个开发阶段只有在以下条件同时满足时才关闭：

- 已承诺批次均 merged；
- 需要 M4 的批次均完成 clean-master accepted；
- 没有本阶段 in-progress candidate；
- Cloud merge lane 和 shared M4 已双释放；
- 未完成项、保留 worktree、回滚和下一 owner 已记录；
- 操作员明确把重心从开发队列切换到 release queue。

随后执行：

```text
冻结 exact master candidate
-> 刷新 release policy / checklist
-> 固定 SSH trust、bundle、image scan、backup、ownership 和 rollback
-> master -> production PR
-> exact production CI
-> manual dispatch + Environment approval
-> production WordPress / payment / formal smoke
-> 24 小时观察
-> 单独 GA 决策
```

任何 blocker 都应停止并记录，不能用 M4、synthetic fixture、`200` 或 Issue
状态替代生产证据。

## 10. 后续交接

第 9.3 节的阶段关闭条件现已满足。接下来以 Issue `#406` 为唯一生产交接
记录，先进入 release-candidate 准备；这不等于部署授权：

1. 冻结精确候选和 rollback；
2. 核验 `PROD_SSH_KNOWN_HOSTS`，禁止用 runtime `ssh-keyscan` 建立信任；
3. 完成 exact bundle、image scan、RDS/backup、schema drift 和 ownership；
4. 创建包含
   `Approved for production validation by operator.` 的 production PR；
5. 只有 pre-mutation gates 全部满足后才人工触发部署；
6. 完成真实 WordPress reconnect、低额 Alipay 和 formal smoke；
7. 观察 24 小时；
8. 再作 GA 决策。

## 11. 参考

- [Feedback Data Operations](feedback-data-operations-v1.md)
- [Cloud Agent Feedback Contract](cloud-agent-feedback-contract-v1.md)
- [Cloud Agent Feedback Quality Gate](cloud-agent-feedback-quality-gate-v1.md)
- [Editor Assist Quality Flywheel Closeout](editor-assist-quality-flywheel-closeout-and-development-retrospective-2026-07-26.md)
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [Production Release Timing and Admin Freeze Retrospective](history/production/2026/production-release-timing-and-admin-settings-freeze-retrospective-2026-07-28.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Cloud Release Checklist](../deploy/RELEASE_CHECKLIST.md)
- [Release queue Issue #406](https://github.com/npcink/npcink-ai-cloud/issues/406)
