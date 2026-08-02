# AI 并行整改阶段收尾与开发复盘 — 2026-08-03

状态：historical closeout and engineering synthesis

目的：归纳 2026 年 7 月下旬至 8 月初多会话并行整改的实际结果、未完成事项、失败经验和下一阶段交接边界。本文是历史证据与方法总结，不替代现行规范，也不授权 production、M4 mutation 或新的产品范围。

当前权威仍是：

- [AGENTS.md](../AGENTS.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Structural Remediation Delivery Standard](structural-remediation-delivery-standard-v1.md)

若本文与现行规范冲突，以现行规范为准。

## 1. 原定目标

本轮工作的起点不是“测试太多”，而是五类可验证问题：

1. 前端行为测试没有进入默认 CI。
2. `RuntimeService` 与 `CommercialRepository` 承担过多职责。
3. 多个 Admin 页面仍是混合状态、API、验证和展示的单体控制器。
4. 测试数量很高，但缺少覆盖率基线，源码正则契约占比过高。
5. 大型测试文件与工程脚本入口膨胀，维护和选择成本上升。

在实施过程中，范围扩展到与这些问题直接相关的交付基础设施和真实用户链路：并行 ownership、M4 candidate/accepted 分层、Admin 操作路径、Portal 回跳、商业事实、媒体智能、Local WordPress 连接和 Hosted Text 闭环。

## 2. 当前完成状态

### 2.1 已解决

#### 前端行为门禁进入默认 CI

当前 frontend job 已执行：

- lint；
- type check；
- Vitest `test:unit`；
- frontend contracts；
- 由 changed-scope 触发的 Admin operator 与 Portal workspace 关键 Playwright 路径。

这关闭了“CI 绿灯但没有运行现有前端行为测试”的原始 P1 缺口。全量 Playwright 仍不应无差别塞入每个 PR；当前按变更范围选关键路径是更合理的成本模型。

#### 并行开发从口头协调变成可执行制度

项目形成了三个唯一：

1. 一个 conflict domain 只有一个实现 owner；
2. 同一时刻只有一个 human protected merge lane owner；
3. 同一时刻只有一个 shared M4 runtime operation owner。

配套形成 locked worktree、builder/integrator/investigator、local-ready handoff、candidate release、clean-master promotion 和双释放回执。大量并行任务能够串行进入 merge/M4 真相链，而不是互相覆盖候选。

#### M4 交付证据边界显著收紧

本轮反复验证并固化了：

- source sync/deploy 只能证明 candidate；
- PR required checks 是 merge authority；
- merged current master 加 `m4:preview:promote` 才能成为 accepted；
- browser transport degraded 必须标记 `not_counted`，不能伪报 UI 通过；
- fingerprint、operation lock、frontend slot consumer 和 stale lock 必须 fail closed；
- build/runtime 输入变化才升级 deploy，普通源码优先 source-only sync。

M4 frontend volume consumer 事故进一步补齐了 deploy guard、slot operation locks、Bash 3 empty-array cleanup、精确 stale-lock recovery 和 hermetic contract fixture。

#### 高价值 Admin/Portal 操作链完成多批收敛

已落地的代表性能力包括：

- Support、Subscriptions、Accounts、Sites 的安全 `return_to` 与一层嵌套返回上下文；
- 服务状态/Coverage 的全局筛选、紧凑工具栏、客户详情和键盘选择；
- Plans 参数编辑、Subscription 风险排序和商业工作台简化；
- Portal 支付回跳恢复、公开定价 loading truth、验证码 resend cooldown、额度到期 locale；
- AI Resources provider trust、模型引用覆盖和维护工作台；
- Admin 统一 header、密集表格、inspector 与 PC-first 操作路径。

这些批次保持了 Cloud/WordPress truth boundary，未把 Cloud 变成第二个 WordPress 控制面。

#### 商业与媒体事实链获得真实验证

本轮完成或验证了：

- CNY 调用时成本快照与缺失计数；
- AI credit 的真实 Local WordPress 消耗变化；
- Support waiting/risk queue；
- media evidence reuse、语义检索、本地 Ollama embedding 和 suggestion-only ALT；
- WordPress → Addon → Cloud feedback 链路；
- WordPress Ability → Addon → Cloud Hosted Text → GPT-5.5 → editor adoption 闭环。

这些结果是 development/M4 evidence，不自动等于 production 或 human acceptance。

#### 大型 API 测试文件得到明显拆分

最初约 7,771 行的 `tests/api/test_service_routes.py` 在当前基线约为 2,303 行。测试没有因为“大”而被删除，而是按能力逐步迁移，说明按路由/领域拆分是可行的。

### 2.2 部分改善

#### RuntimeService 已抽出 diagnostics/query，但仍是巨型类

`RuntimeService` 从初始约 6,093 行、154 个方法下降到当前约 5,396 行、138 个方法，并出现独立的 `RuntimeDiagnosticsQueryService` 和 diagnostics projection。方向正确，但调度、provider execution、media、queue、callback 等职责仍集中，不能宣称结构问题已经解决。

#### CommercialRepository 已抽出 Account/Site query，但总体仍膨胀

Account/Site 无锁查询已经进入独立 query mixin，并有 characterization tests。与此同时，`CommercialRepository` 当前约 4,202 行、157 个方法，比最初调查时更大，说明业务继续演进会抵消零散抽取收益。

下一阶段必须从“偶尔抽几个方法”升级为有终态的领域拆分，详见 [CommercialRepository 渐进拆分计划](commercial-repository-decomposition-plan-v1.md)。

#### 前端页面形成共享 primitive 和 feature module，但页面仍大

Admin 已有统一 header、data table、inspector、workbench、query provider 以及 accounts/support feature modules，操作合同和 PC browser gate 明显增强。但当前页面规模仍然很大：

- Account detail 约 3,029 行；
- AI Resources 约 2,429 行；
- AI Advisor 约 2,484 行；
- Service Settings 约 2,310 行。

因此，“页面责任拆分”只完成了局部基础设施和部分路径，尚未完成控制器/数据/展示的系统分离。

### 2.3 主动延期

- Production Issue #406：必须在既定开发批次结束、冻结 exact candidate、生产前门槛满足后单独启动。
- 具名/多管理员、管理员可信链路、会话撤销：当前单平台管理员阶段不授权扩张。
- Cloud Provider metadata 的生产向量配置：本地/M4 Ollama 验证不自动授权 production provider 变化。
- GIF 媒体视觉证据、弱负例阈值和批量刷新自动化：保留为独立质量问题，避免在轻量检索批次中过拟合。
- 无自然流量时的 24 小时观察：记录为未测量/N/A，不等待，也不制造付费调用来填表。

### 2.4 仍未处理

#### 覆盖率基线仍不可见

仓库已有 `@vitest/coverage-v8` 依赖，但当前未发现可用的 backend `pytest-cov`、frontend coverage script/config 或 CI coverage report。测试很多仍不能回答“关键路径哪些分支没测”。

正确下一步仍是观察性基线：先覆盖核心目录和新抽出的 hooks/query modules，不立即设置全仓 80% 机械阈值。

#### 源码正则契约仍占主导

当前约 87 个 `.mjs` 测试中约 86 个会读取源码。它们对边界禁止项、路由清单、结构治理仍有价值，但不能替代真实函数、组件、API 和浏览器行为。

后续应遵循“保留静态边界，行为合同逐步下沉到 Vitest/pytest/Playwright”，而不是批量删除或批量重写。

#### 工程入口继续膨胀

根 `package.json` 当前约 116 个 scripts，frontend 约 31 个。虽然新增入口中包含必要的 M4 安全、Admin gates 和 focused journeys，但命令发现成本继续上升。工程命令清单、owner、环境、危险性和使用证据仍需持续治理。

#### 巨型页面与巨型类没有达到终态

结构热点虽然有多个成功 pilot，但仍未达到“领域模块可独立测试、旧门面可删除”的终态。下一阶段必须给每个拆分计划设置删除条件，否则兼容 façade 会变成永久债务。

## 3. 工作审视报告

### 原定目标

先补真实验证缺口，再渐进降低后端、前端、测试和脚本复杂度；不发动一次性大重构。

### 完成情况

- [x] 前端 Vitest 与关键 E2E 进入默认 CI。
- [x] 建立并行 ownership、M4 candidate/accepted 和 clean-master promotion 纪律。
- [x] 完成多个高价值 Admin、Portal、商业、媒体和真实 WordPress 闭环。
- [x] 对 Runtime diagnostics、Account/Site queries、大型 API 测试完成有效 pilot。
- [ ] 建立 backend/frontend coverage baseline。原因：并行批次优先处理了行为与产品真相缺口，coverage 观察任务未进入最终交付链。
- [ ] 完成 `RuntimeService`、`CommercialRepository` 和巨型页面终态拆分。原因：每批有意保持范围可回滚，尚未进入连续领域迁移阶段。
- [ ] 完成 scripts 入口治理。原因：运行安全门禁本身继续新增入口，清单和退役机制没有同步闭环。

### 发现的问题

| 严重程度 | 具体问题 | 根本原因 | 改进 |
| --- | --- | --- | --- |
| 必须改正 | 早期出现多个会话同时等待 merge lane/M4，产生长队列和频繁 rebase | 把“会话数量”误当成吞吐，未及时围绕瓶颈限制 WIP | 保持一个 integrator、最多两个 accepted local-ready waiting item；其余会话转为调查/评审 |
| 必须改正 | 一些 M4 浏览器超时最初容易被误解为产品失败 | 没有先区分服务端处理、资源体积和 relay/SSH 吞吐 | 先跑 bounded browser preflight；degraded 只记 `not_counted`，用同 revision local production browser 证明产品行为 |
| 必须改正 | M4 deploy 曾被过期 frontend slot 阻断，并在 cleanup 中留下 operation lock | deploy 对共享 volume consumer、slot 并发和 Bash 3 行为覆盖不足 | 已增加 fail-closed consumer guard、slot locks、hermetic contracts 和精确恢复流程；后续运行前先查 locks/slots/fingerprint |
| 应当改正 | PR 数量很多，但 coverage、scripts 和 mega-class 终态仍未完成 | 工作被高价值用户路径持续打断，缺少结构整改的连续主攻窗口 | 下一阶段只主攻一个结构域，从 Subscription queries 开始，完成一批再交棒 |
| 应当改正 | 部分 source-regex contract 对重排敏感 | 静态测试创建快，真实 seam 测试成本更高 | 新功能优先行为测试；静态测试只保留治理和禁止项，触达旧测试时逐步替换高价值断言 |
| 建议改进 | 历史回执非常完整，但信息量大、重复状态多 | 多会话依赖人工消息流协调 | 保留标准化 receipt，但阶段文档只沉淀决策、异常和最终证据，不复制全部状态流 |

### 做得好的地方

- 脏工作区始终被视为 ownership evidence，没有通过 reset/stash 清理他人工作。
- 有效 review 均在同一 PR、同一 scope 内最小修正，没有用第二 PR 绕过。
- M4、CI、merged source、production 和 human acceptance 始终分层陈述。
- 多次真实 Local WordPress/Provider 验证保持 suggestion-only 或明确 final-write owner，没有越过 Cloud 边界。
- 失败被保留为证据：browser timeout、deploy slot conflict、Bash cleanup、fixture 非 hermetic 都没有被伪报为通过。

### 下次重点关注

1. 用连续的结构整改窗口完成 Subscription 无锁 query 抽取，不同时启动第二个 mega-class/page 拆分。
2. 给兼容 façade 写删除条件和 remaining-method inventory，避免“先兼容”变成永久架构。
3. 在新 query/hook 模块建立 coverage 观察基线，先报告未覆盖关键分支，不设全仓硬阈值。
4. 每新增工程命令都补 owner、环境、危险性和调用来源；定期标记 deprecated，而不是只增不减。
5. 只有真实流量或明确合成 workload 才启动观察窗口；没有输入时如实记录未测量。

## 4. 可复用开发思路

### 4.1 先解决验证缺口，再动结构

没有行为门禁时，大重构只会放大不确定性。先让关键路径进入 CI，再抽 query/service/controller，失败才有可归因证据。

### 4.2 把“真相”拆成不同状态

```text
local verified
  -> M4 candidate
  -> PR checks green
  -> merged master
  -> clean-master M4 accepted
  -> controlled production validation
  -> human acceptance / measured benefit
```

任何一层都不能替代后一层。文档、回执和最终报告都应说明最高证据状态。

### 4.3 并行化独立工作，串行化真相变更

适合并行：只读调查、独立 conflict domain、本地测试、diff review。

必须串行：同一 contract、migration head、human merge lane、M4 candidate、production decision。

### 4.4 结构拆分以删除为终点

有效拆分不是“多几个小文件”，而是：

- 新职责进入明确 owner；
- 旧入口不再增长；
- 调用方逐批迁移；
- 兼容门面有删除条件；
- 测试锁定业务行为而不是文件形状。

### 4.5 观察必须有输入和问题

本地开发环境不会因为等待而自动产生业务证据。观察前必须声明：

- workload 来源；
- 指标与阈值；
- revision 和环境；
- 成本上限；
- stop rules；
- 没有流量时的 `unmeasured/N/A` 处理。

不为“填满 24 小时”制造无意义付费调用。

## 5. 下一阶段交接

主攻方向：执行 [CommercialRepository 渐进拆分计划](commercial-repository-decomposition-plan-v1.md) 的 Phase 0 + Phase 1，只抽 Subscription 无锁纯查询。

并行保持冻结：

- `RuntimeService` 下一责任抽取；
- Account detail / AI Resources 页面控制器拆分；
- 全仓 coverage threshold；
- scripts 批量删除；
- Production Issue #406。

Phase 1 accepted 双释放后，再依据 current master 选择下一批，不自动启动全部路线。
