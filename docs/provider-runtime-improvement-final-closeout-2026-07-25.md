# Provider Runtime Improvement Final Closeout — 2026-07-25

状态：本轮 Provider/Pi 启发的运行时改进、独立证据补齐、问题纠偏和最小共享调用账本均已合并到
GitHub `master`。生产环境未变更；网关真实结算价格、真实用户观察、生产推广、Streaming 和更多
CMS 扩展仍按明确条件延期。

本文是本轮工作的最终入口与开发复盘。它归纳历史事实、当前验收状态、前后效果、问题根因和可复用
方法，但不覆盖各份带日期的原始证据，不创建新的运行时契约、生产许可、商业定价真相或 WordPress
写入授权。

## 一句话结论

本轮工作的核心收益不是把
[`earendil-works/pi`](https://github.com/earendil-works/pi)
引入 Cloud，而是选择性吸收其 Provider 兼容机制，并在现有 Python 边界内完成：

- Provider 错误、usage 和缓存 token 的统一归一化；
- 可隔离、无原始 prompt 的缓存亲和键；
- 有来源、有模式、不会改变 AI Credit 的成本估算；
- 已知上下文窗口下的调用前溢出预检；
- WordPress 本地审核与最终写入所有权的真实 E2E 证明；
- 跨同一 Git clone 多 worktree 的最小共享 Provider 调用预算。

最终形成的工程判断是：**借鉴机制，不迁移所有权；先建立证据，再讨论扩张；缺少权威元数据时宁可
保持未知，也不从模型名、零值或观察性样本推断结论。**

## 范围与所有权

本轮始终保持一条控制链：

```text
WordPress Ability / UI
  -> Addon validation, signing, bounded transport
  -> Cloud routing, Provider execution, normalization, evidence
  -> mqzj OpenAI-compatible gateway
  -> gpt-5.5
  -> suggestion_only result
  -> WordPress local review
  -> explicit local Save / Update
```

各层所有权没有改变：

- WordPress：Ability、prompt/preset、权限、审核、preflight、审计、编辑器状态和最终写入真相；
- Addon：场景校验、签名、受限传输和结果投影；
- Cloud：托管路由与执行、错误/usage 归一化、上下文预算、成本估算和运行时证据；
- M4：可丢弃的开发集成与验收环境；
- GitHub `master`：经过保护分支审核的开发源代码真相；
- production：需要独立 operator 批准的发布目标。

没有引入 Pi 包、Node sidecar、第二套 agent/session/tool registry、第二个工作流注册中心、Cloud
侧 CMS 写入或通用 Streaming 协议。

## 历史归纳

| 阶段 | 关键结果 | Git 事实 | 最高验收状态 |
| --- | --- | --- | --- |
| Provider 兼容性 P0-P2 | 原生 Python 实现错误/usage 归一化、缓存亲和与证据、上下文预检 | PR `#243`, `ed5ddf6a` | 合并并在 M4 接受 |
| 真实 Provider cohort | `mqzj/openai -> gpt-5.5` 二十次调用全部成功，形成真实缓存证据 | PR `#252`, `3133be02` | M4 Provider edge 证据通过 |
| WordPress 标题 E2E | 签名链、外部 Provider、本地审核、显式写入和 draft 所有权通过 | PR `#260`, `49ecfa3e` | Local WordPress/M4 功能路径通过 |
| `context_window` 与 P2 | 使用官方版本化来源和连接级 override 建立 `1,050,000` token 上限 | PR `#261`, `08f96927` | M4 正常与溢出路径通过 |
| 首次价格/采用记录 | 记录在最终审计完成前进入自动合并；保留为历史事件，不作为最终权威结论 | PR `#262`, `2fe8052c` | 被后续纠偏取代 |
| 价格与缓存经济纠偏 | 删除越界叙事，加入确定性重算与 AI Credit 隔离，保留调用超额事件 | PR `#264`, `f478d3dd` | 合并并在 M4 接受 |
| 价格接受记录 | 固化官方列表价仅为 runtime estimate 基线 | PR `#266`, `d87f23ae` | 开发估算证据通过 |
| 网关结算价格 | 因无可信 tariff/invoice，明确延期而不是制造数字 | PR `#268`, `fd751236` | human/external acceptance 延期 |
| 三项总收口 | 对齐标题 E2E、P2 和价格三项当前状态 | PR `#269`, `05107c97` | 文档收口通过 |
| 最小共享调用账本 | 同一 clone 的多 worktree 原子共享预算、幂等 claim 和 fail-closed | PR `#271`, `f1349eb5` | source/local 验证并合并 |

以上提交均已验证为当前 `master` 的祖先。历史文档中的 “pending” 或候选 SHA 仍代表其记录当时的
事实；本文负责给出当前 reconciliation，不回写或美化历史。

## 落实前后对比

| 能力或风险 | 落实前 | 落实后 | 可证明的收益 |
| --- | --- | --- | --- |
| Provider usage | 各 Provider 字段不一致，缓存读写与 reasoning 可能丢失 | 统一为 total、uncached、cache read/write、output、reasoning | 下游计量、诊断和测试使用同一语义 |
| 错误分类 | context overflow 可能落入普通 invalid request | 归一为 `provider.context_overflow`，同候选不重试、可按既有规则 fallback | 更少无意义重试，错误可观测 |
| 缓存亲和 | 无稳定 `prompt_cache_key` | 使用 site/model/profile/contract/stable-prefix 的哈希身份 | 不暴露 prompt，且为真实缓存命中建立条件 |
| 缓存证据 | 缓存 token 被丢弃，无法量化 | cohort 记录 `72,960` cache-read tokens，读缓存占输入 `86.18%` | 证明当前连接和模型的机制有效 |
| 成本语义 | 缺价格时 `0` 容易被误读为免费 | 显式区分 `unpriced`、`partial_rates` 和有来源的 estimate | 防止估算、结算与用户计费互相污染 |
| 上下文预算 | 未知窗口会直接送到 Provider；可能先花调用再失败 | 连接级权威 override 投影到路由，已知溢出在 Provider 前拒绝 | 溢出路径 attempts/tokens/cost 均为零 |
| WordPress E2E | Provider edge 成功不能证明用户路径和写入所有权 | 从 Ability/Addon/M4/Provider 到审核、显式保存完整验证 | 生成/插入零写入；一次保存对应一次写入和一次 revision |
| 调用预算 | 各并发任务只有局部上限，30 次计划最终发生 39 次 | Git common-dir 共享账本，claim 前原子检查 aggregate/item cap | 20 进程争抢 7 个额度时仅 7 个获准、13 个拒绝 |
| 上游采用方式 | 容易把有用机制与 Pi 的产品架构一起讨论 | 只在现有 Provider/routing seam 原生实现 | 降低迁移面和第二控制面风险 |
| Streaming | 容易被当作 Adapter 开关 | 明确要求先有版本化 WordPress 事件契约 | 避免破坏 usage 终态、取消、重放和错误投影 |

## 可量化结果

### 真实 Provider 和缓存

二十次 `gpt-5.5` Provider-edge cohort：

- 成功：`20 / 20`；
- 输出契约匹配：`20 / 20`；
- 输入 token：`84,660`；
- uncached input：`11,700`；
- cache read：`72,960`；
- cache write：`0`；
- cache-read token ratio：`86.18%`；
- 输出 token：`411`。

首请求与 warm 请求的 latency 只作为观察性数据，不用于声称缓存造成了延迟改善，因为没有随机化
no-cache 对照。

### 官方列表价估算

使用当时记录的官方 `gpt-5.5` 列表价基线：

- input：`5.00 USD / 1M tokens`；
- output：`30.00 USD / 1M tokens`；
- cache read：`0.50 USD / 1M tokens`；
- cache write：保守按普通 input 计价。

对上述 cohort 的确定性重算：

| 口径 | 金额 |
| --- | ---: |
| 观察 token 总估算 | `$0.107310` |
| 无缓存反事实估算 | `$0.435630` |
| 模型化差额 | `$0.328320` |
| 模型化差额比例 | `75.37%` |

该结果只是官方列表价下的 runtime estimate，不是 `mqzj` 的 invoice、tariff、实际节省、用户账单或
AI Credit 折扣。真实网关结算收益必须等待带日期且可审计的商业证据。

### P2 真实预检

- 官方版本化模型来源给出 `1,050,000` token context window；
- operator 管理的连接级 metadata override 成为 M4 运行时真相；
- 正常 WordPress 标题路径通过预检并调用外部 Provider；
- 合成超大输入在 `provider.execute` 前失败；
- 失败路径 Provider attempts、tokens 和 cost 均为零；
- 输入未被截断、重写、总结、压缩或变更。

### WordPress 写入所有权

- 生成与插入建议时 WordPress 持久化写入为零；
- 用户明确 Save/Update 后产生一次写入和一次 revision；
- post 仍为 draft，sentinel 内容不变；
- Cloud 只返回 `suggestion_only`，没有直接写 WordPress；
- 证据只保留标量、ID 和哈希，不保留 prompt、输出或凭据。

### 共享调用账本

账本位于同一 clone 的 Git common directory，以 `0600` 文件、`0700` 目录、独占文件锁和同目录
原子替换实现：

- aggregate 和 per-item budget 均 fail-closed；
- dispatch ID 幂等重放不重复扣减；
- closed、corrupt、未知字段、未知 item 和跨 item 重用都拒绝；
- 不记录 prompt、结果、凭据、命令或客户内容；
- 它是开发/operator 工具，不是 runtime quota、billing、entitlement 或 WordPress truth。

其明确限制是：不能阻止另一 clone、另一台机器、人手调用或未接入 CLI 的脚本绕过。因此未来真实
Provider 试验必须指定一个控制 clone，并在每次 dispatch 前 claim，结束后再用 Provider 记录对账。

## 从 Pi 吸收了什么，拒绝了什么

### 吸收

- Provider-neutral error taxonomy；
- OpenAI/Anthropic cache usage 归一化；
- cache token 与成本证据分桶；
- 跨 Provider 的 context-overflow 识别；
- 保守上下文估算。

### 拒绝或延期

- agent loop、session orchestration、compaction 和 tool registry；
- `pi-ai` 直接依赖、Node runtime 或 sidecar；
- 第二个 Ability、workflow、prompt/preset 或审批控制面；
- 自动截断、总结、压缩或重写 WordPress 输入；
- 未经版本化下游契约的 generic Streaming；
- 仅凭模型名称推断 context window 或价格；
- 把 runtime estimate 直接变成 gateway settlement、AI Credit 或套餐政策。

筛选标准不是“上游实现是否先进”，而是“当前矛盾属于谁、最窄 owner seam 在哪里、是否能用独立
证据验收、失败时是否能局部回滚”。

## 可复用开发思路

1. **先对齐当前真相。** 检查 dirty worktree、`origin/master`、边界文档、运行时状态和历史证据；
   历史 SHA 是线索，不自动等于当前状态。
2. **一次只命名一个验收矛盾。** Provider 兼容、消费者 E2E、缺元数据、经济估算和调用预算是不同
   问题，不共享完成条件。
3. **先写 change envelope。** 明确 repository、module、owner、non-goals、公开契约、调用/成本
   预算、验证门、回滚和不能改动的系统。
4. **选择最窄所有者 seam。** 优先在 Provider adapter、routing metadata、操作合同或本地 operator
   guard 解决，不先增加平台和依赖。
5. **先建立确定性证据。** 用 fixture 和合成负例证明字段归一、零调用溢出、计价分桶、credit
   隔离和 fail-closed。
6. **再运行最小真实正例。** 先 trace route 和模型，再设调用上限、输出上限、连续失败停止条件和
   隐私边界。
7. **每次真实 dispatch 前原子 claim。** 局部计数或失败停止条件不能代替共享总预算。
8. **按层报告状态。** 分开 source/local、candidate、PR/CI、merged master、accepted M4、
   production 和 human/external acceptance。
9. **把技术证据和商业政策隔离。** usage、estimate、settlement、AI Credit、套餐和 invoice 是
   六个不同事实。
10. **发布前完成最终审计。** scope、diff、隐私、调用账本和 rollback 审计必须在触发可能自动合并
    的 publish 流程之前完成。
11. **透明纠偏。** 预算超额、合并竞速、无收益或缺外部价格都应记录，而不是重写历史或制造正面
    结论。
12. **按停止规则结束。** 当前矛盾解决后，把剩余项按 owner、前置条件和验收门拆开，不顺手扩成
    production、billing 或新协议。

## 工作审视报告

### 原定目标

- 评估 Pi 中哪些内容适合当前 Cloud；
- 在不移动 WordPress/Cloud 所有权的前提下完成 Provider P0-P2；
- 补齐签名 WordPress 标题外部 Provider E2E；
- 获得权威 `context_window` 并完成 P2 真实预检；
- 按官方模型价格建立缓存经济估算，但不冒充网关结算；
- 增加最小共享调用账本，避免并发试验突破总预算；
- 把事实、问题、方法、延期项和下一次启动条件沉淀为本地文档并进入 Git。

### 完成情况

- [x] Provider P0-P2 源码、测试、CI、合并和 M4 验收完成；
- [x] 二十次真实 Provider cohort 与缓存证据完成；
- [x] WordPress 标题 E2E 及本地审核/最终写入所有权完成；
- [x] 权威 `context_window`、正常路径和 overflow 零调用路径完成；
- [x] 官方列表价 runtime estimate、确定性重算和 AI Credit 隔离完成；
- [x] 网关结算价格在证据不足时明确延期；
- [x] 共享调用账本及并发 fail-closed 测试完成；
- [x] 当前总复盘和 README 入口完成；
- [ ] 生产部署、真实用户采用和网关商业结算不在本轮完成范围。

### 发现的问题

| 严重程度 | 问题描述（具体行为，非笼统描述） | 根本原因 | 改进建议 |
| --- | --- | --- | --- |
| 必须纠正，已处理 | 计划最多 30 次真实调用，实际产生 39 次；三个 E2E 与并发 cohort 都成功，但仍突破授权预算 | 各子任务只有局部上限，没有所有 worktree 共享的原子总账本；三连败规则只限制失败，不能限制成功调用 | 已通过 PR `#271` 增加 common-dir 共享账本；以后 change envelope 必须声明 experiment/item budget，每次 dispatch 前 claim，结束后对账 |
| 必须纠正，已处理 | PR `#262` 在 scope 与调用上限审计尚未完成时自动合并，停止 auto-merge 的动作输给 checks/merge 竞速 | 把 publish 当成“创建候选”而不是“随时可能合并”，最终审计发生得太晚 | 在 publish 前完成 diff、scope、隐私、call-ledger 和 rollback 审计；已用 PR `#264` 新增纠偏而非改写历史 |
| 应当纠正，已处理 | Provider-edge cohort 一度容易被理解为 WordPress 用户链路已经通过 | Adapter 执行、签名 transport、本地审核和最终 save 属于不同验收层 | 单独运行并记录 PR `#260` 的 consumer E2E；后续所有报告使用分层 acceptance ledger |
| 应当纠正，已处理 | 缺价格时的数字 `0`、官方列表价估算、网关结算和 AI Credit 容易被混为一谈 | 单一 cost 字段缺少 provenance、mode 和 owner 解释 | 强制解释 `cost_estimate_mode`；分离 list estimate、gateway settlement、invoice、Credit 和 package truth |
| 应当纠正，已处理 | 首请求与 warm 请求延迟差容易诱发“缓存降低延迟”的因果叙事 | cohort 无随机化 no-cache 对照，样本只适合机制和 usage 观察 | 只报告 latency observation；只有物质性需求出现时再设计受控对照 |
| 应当纠正，已处理 | 历史证据文档在合并后仍保留当时的 pending/candidate 描述 | 带日期记录本来描述当时事实，后续状态分散在新的 PR 中 | 不篡改历史测量；新增 reconciliation 入口并绑定 reachable master commit |
| 建议改进，仍存在 | 本地共享账本不能阻止其他 clone、机器、人工或未接入脚本绕过 | 最小方案故意不创建分布式 runtime quota 或第二控制面 | 真实试验限定一个控制 clone；若未来跨机并发成为真实需求，再单独做边界和架构评审 |
| 建议改进，仍存在 | Python 3.14.6 CVE 例外仍有时间约束 | 当前阶段没有受支持的固定镜像可直接完成替换 | 在 `2026-08-05` 前优先处理受支持镜像；未解决前不启动新的真实用户/editor 观察 |

### 做得好的地方

- 从当前边界和证据出发，吸收上游机制而不是复制其产品架构；
- 用干净 worktree 保护用户已有修改，并以精确路径 staging；
- 把 deterministic negative test 与 bounded real positive path 配合使用；
- 不保存 prompt、输出、凭据或原始 cache key；
- 把 source、M4、production 和 human/external acceptance 明确拆开；
- 在没有网关价时选择延期，而不是把官方列表价包装为真实结算；
- 对超额调用和自动合并竞速做透明纠偏，并把纠偏落实成工具和流程；
- 识别到文档状态会老化后，使用总入口 reconciliation，而不是篡改历史。

### 下次重点关注

1. 先解决 Python 3.14.6 CVE 时间门，不在安全例外未解决时扩展真实用户观察；
2. 任何真实 Provider 试验先创建共享 ledger，并将 claim/dispatch/reconcile 作为一个不可拆步骤；
3. 只有出现可信 tariff、invoice、settlement 或首个付费用户决策时才重开网关价格；
4. 只有绝对成本、延迟或真实用户证据达到物质性时才继续优化缓存/latency；
5. Streaming 必须先有版本化 WordPress connector contract 和 terminal usage 语义；
6. 生产推广继续走独立、明确、可回滚的 operator approval。

## 当前验收账本

| 层级 | 状态 | 说明 |
| --- | --- | --- |
| source/local | 通过 | Provider 兼容、P2、定价/credit 隔离和共享 ledger 均有确定性覆盖 |
| PR/CI | 通过 | 关键变更均经保护 PR 合并 |
| GitHub `master` | 通过 | 本文列出的关键提交均对当前 `master` 可达 |
| accepted M4 | Provider/P2/价格证据通过 | ledger 为 local-only 工具，无需 M4 部署 |
| Local WordPress consumer | 通过 | 标题建议审核和显式本地写入链通过 |
| production | 未变更 | 未获得也未隐含生产发布授权 |
| human/external | 部分延期 | 真实用户采用、内容质量和网关结算价格待外部证据 |

## 延期项与重开条件

| 项目 | 当前状态 | 重开条件 |
| --- | --- | --- |
| Python 3.14.6 CVE 例外 | 有截止日期的延期 | 首个受支持固定镜像候选；当前记录的例外截止 `2026-08-05` |
| 小规模真实用户/editor 观察 | 延期 | CVE 安全门完成，试验范围和共享调用预算获批 |
| `master` 到 production 推广 | 延期 | 安全门通过、发布范围明确、回滚已知且 operator 明确批准 |
| `mqzj` 网关结算价格 | `deferred_until_real_user_or_invoice_evidence` | 可信 tariff、invoice、settlement、首个付费用户或明确 spend threshold |
| 缓存/latency 深化 | 延期 | 绝对成本、延迟或用户体验达到物质性阈值 |
| Streaming | 延期 | 版本化 connector event contract、terminal usage、重放/取消/错误投影完整 |
| 其他 CMS 平台 | 延期 | WordPress 主链稳定且出现可测量产品需求 |

## 停止规则

本轮应在此停止。当前 Provider 兼容、真实缓存证据、WordPress 标题 E2E、P2 真实预检、官方列表价
估算和同 clone 调用预算问题均已在其授权层级闭环。

本文不授权：

- 新的真实 Provider 调用；
- M4 或 production 变更；
- WordPress plugin 源码或写入边界变更；
- 将 runtime estimate 作为网关 settlement 或用户 billing truth；
- 新 agent/session/tool platform；
- generic Streaming；
- 继续扩大本次文档收口范围。

## 相关记录

- [Provider Runtime Compatibility Development Retrospective](provider-runtime-compatibility-development-retrospective-2026-07-25.md)
- [Provider Three-Item Closeout And Development Retrospective](provider-three-item-closeout-and-development-retrospective-2026-07-25.md)
- [Provider Call Ledger And Next-Stage Deferral](provider-call-ledger-and-next-stage-deferral-2026-07-25.md)
- [Pi-Inspired Provider Runtime Compatibility Evidence](pi-provider-runtime-compatibility-evidence-2026-07-25.md)
- [WordPress Title External Provider E2E Revalidation](wordpress-title-external-provider-e2e-revalidation-2026-07-25.md)
- [Provider Context Window And P2 Revalidation](provider-context-window-p2-revalidation-2026-07-25.md)
- [Provider Pricing And Cache Economics Revalidation](provider-pricing-and-cache-economics-revalidation-2026-07-25.md)
- [Development And Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)

## 回滚

回滚本次文档提交即可。它不修改 runtime、数据库、Provider 配置、M4、production、WordPress、
AI Credit、entitlement 或历史证据。
