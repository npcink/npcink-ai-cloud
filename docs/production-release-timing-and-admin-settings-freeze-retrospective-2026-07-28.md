# 正式生产发布时机与后台设置页冻结复盘 — 2026-07-28

状态：阶段决策与开发经验已固化，正式生产发布仍须通过现行门禁。

范围：归纳公开前台、账户与站点连接规则、Cloud Admin 设置页收口后，
关于“现在是否值得正式生产发布、后台设置页还能否继续优化”的判断过程、
证据边界和下一阶段做法。

本文是带日期的历史记录，不替代
[Cloud Production Release Policy](cloud-production-release-policy-v1.md)、
[Cloud Release Checklist](../deploy/RELEASE_CHECKLIST.md)、
[M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
或生产操作员审批，也不授权生产部署。

## 1. 结论

项目已经值得进入正式发布准备，但在本次判断时点，不值得立即宣布正式生产
发布或 GA。

正确节奏是：

1. 只完成一轮与发布安全直接相关的后台设置页改进；
2. 冻结候选，不再用持续视觉优化推迟验证；
3. 让最终 `master` 候选获得当前 M4 accepted 证据；
4. 按正式清单完成真实 Addon 重连、完整 release smoke、备份/回滚、
   外部观测和操作员确认；
5. 先做受控生产验证，观察通过后再单独判断 GA。

“继续优化后台设置页”和“准备生产发布”并不冲突。冲突只出现在没有停止条件、
候选持续变化，导致每一轮发布证据都失效时。

## 2. 这次决策建立在哪些历史工作上

### 2.1 公开前台与账户连接规则已经收口

此前阶段已经完成并记录：

- 注册后不直接发放可用 Free 额度；
- 邮箱验证后账户保持 `pending`，由真实 Addon 连接和风控结果推动激活；
- 注册 API 不再直接创建 `active` 站点；
- Free 额度跟随账户，不跟随站点；
- 同账号允许重连，跨账号复用同一站点默认冷却 90 天；
- 冷却时间允许配置，操作员可人工移除限制；
- 用户端、远端前台和帮助页面说明上述规则；
- 关键文案和页面入口由仓库契约保护，避免后续页面修改时静默丢失。

这使“前台继续扩写”不再是当前主要矛盾。后续前台工作应由真实用户问题或
发布阻断证据触发，不应继续以页面数量或视觉变化作为进度。

### 2.2 Cloud Admin 已完成一轮系统治理

[Cloud Admin UI 开发复盘](history/admin/2026/records/cloud-admin-ui-development-retrospective-2026-07-27.md)
记录了从 PR `#295` 到 PR `#315` 的信息架构、共享工作台、凭据控件、
结构门禁和视觉证据。PR `#315` 的合并版本 `fbb667a3` 曾在 M4 上达到
`acceptance_state=accepted`。

随后又发生两项与最终候选有关的变化：

- PR `#294` 合并 Ability JSON schema 强化，合并版本为 `6cb23747`；
- PR `#317` 合并 Vector Settings 工作台收口，合并版本为 `e01057a5`。

因此，`fbb667a3` 的 M4 accepted 证据只证明那个精确版本，不能自动覆盖
后续 `master`。本复盘也不把 PR `#317` 的合并和 CI 结果写成 M4、
生产或 GA 证据。

### 2.3 发布规范已经给出明确硬门槛

现行 [Cloud Release Checklist](../deploy/RELEASE_CHECKLIST.md) 明确区分：

- repository ready；
- env required；
- service settings required；
- operator required；
- smoke required。

在本次判断时点，清单仍将以下事项列为 open blockers：

- 真实 Alipay 低金额交易；
- 真实 WordPress Addon 重连和旧 key 撤销；
- 无条件跳过的完整 `deploy/release-smoke.sh`；
- schema drift baseline；
- 历史用户与站点 ownership 只读清点；
- 外部 OTLP sink 中可查询的新 trace；
- 24 小时稳定观察；
- 启用 QQ 时的真实登录回调。

此外，Python `3.14.6` 三项受控 CVE 的历史状态为
`waiting_for_candidate`、`fixed_image_claimed=false`，临时受控验证例外最晚
于 `2026-08-05` 到期。该例外只允许满足严格条件的受控生产验证，不等于
正式发布授权，更不等于 GA。

这些均为日期化快照。真正发版时必须重新读取当前清单、当前分支、当前镜像
扫描和当前运行环境，不得复用本文的状态描述。

## 3. 关键矛盾与优先级

| 矛盾 | 实质 | 正确处理 |
| --- | --- | --- |
| 需要真实生产证据 vs. 发布门禁尚未闭合 | 开发预览无法替代真实邮箱、Addon、支付、OTLP 和恢复证据 | 先冻结候选，再按清单做受控验证 |
| 设置页仍可优化 vs. 候选需要稳定 | 每次源码变化都可能使 CI、M4、bundle 和 smoke 重新失效 | 只允许一轮发布导向改进，然后冻结 |
| CVE 受控例外 vs. 安全发布 | 例外是有期限、有限范围的风险接受 | 仅用于明确批准的受控验证；GA 仍需独立结论 |
| Admin 视觉完整度 vs. 核心产品价值 | 内部操作台永远还能继续美化 | 优先验证托管 AI 文本闭环、额度、连接和恢复 |
| 分支历史差异 vs. 精确候选 | `master` 与 `production` 有意分叉 | 以 tree、精确 revision 和发布证据判断，不反向合并美化图形 |

主矛盾不是“页面是否够漂亮”，而是“最终候选是否具备可恢复、可观测、
可重复的真实运行证据”。

## 4. 后台设置页在冻结前允许做什么

### 4.1 允许纳入最后一轮的改进

只有直接降低发布和运营风险的工作进入候选：

- 首屏明确显示未配置、不可用、待验证和阻断原因；
- 必填配置缺失时 fail closed，而不是保存后静默失败；
- 保存、测试连接、发送测试邮件和邮件预览失败后有就近恢复入口；
- 凭据字段明确区分“保持现有值”“替换”“清除”，危险操作单独确认；
- 长标签、错误消息、禁用态、加载态和窄窗口不遮挡关键操作；
- 真实发布 smoke 需要的设置入口可被操作员快速找到；
- 风险较高的配置变更保留审计证据，不暴露 secret 值。

PR `#317` 对 Vector Settings 工作台的收口属于这一类有边界的整理。它合并后，
除非出现具体发布阻断或真实操作者失败，不再继续扩展同一轮视觉改造。

### 4.2 应延期的改进

以下事项不应阻挡当前候选冻结：

- 纯间距、圆角、阴影和颜色微调；
- 为低频信息增加新的卡片、仪表盘或概览页；
- 没有真实任务证据的新筛选器和新设置项；
- 为统一外观而重做整个 Admin；
- 与当前 release smoke、恢复或必填配置无关的交互动效；
- 把 WordPress 本地控制真相复制到 Cloud Admin。

### 4.3 停止条件

满足以下条件后，后台设置页本轮开发即停止：

1. 发布所需配置可发现；
2. 缺失必填项明确阻断；
3. 保存、测试和失败恢复路径可用；
4. 凭据替换、清除和保留语义无歧义；
5. 聚焦契约与关键 PC 视觉用例通过；
6. 没有已知 P0/P1 的发布设置 UX 问题。

停止不表示页面永远不改，而是后续变更必须由真实运营证据、新合同或明确缺陷
重新打开范围。

## 5. 证据阶梯

发布判断必须沿用以下阶梯，不能跨级推断：

```text
本地源码与聚焦测试
-> PR 合并与 GitHub required checks
-> 当前 master 的 M4 accepted
-> 精确 production 候选与 release bundle
-> 受控生产 smoke 和观察
-> 操作员正式签字
-> GA
```

- 本地测试通过，不表示代码已合并；
- PR 合并和 CI 通过，不表示 M4 已运行该版本；
- M4 accepted 不表示生产已经部署；
- `/` 或 `/health/live` 返回 `200`，不表示邮箱、Addon、支付或 Provider
  业务闭环通过；
- 受控 CVE 验证通过，不表示漏洞已经修复；
- 受控生产验证不表示真实用户 GA。

一旦候选源码、lockfile、Dockerfile、Compose、迁移或发布脚本变化，就必须按
影响范围重新生成相应证据。

## 6. 下一阶段建议

### 阶段 A：冻结候选

- 把 PR `#317` 之后的 `master` 作为新的候选起点；
- 只接受 P0/P1、发布阻断和安全修复；
- 建立精确 revision、tree、镜像 digest 和 bundle checksum；
- 禁止以“顺便优化”继续扩大 Admin 范围。

### 阶段 B：刷新开发验收

- 对当前、干净的 `origin/master` 执行 M4 promotion；
- 记录 `acceptance_state=accepted`、当前 revision、合并 PR 和
  `source_dirty=false`；
- 完成与最新 Ability schema、Vector Settings 和 WordPress 文本链路相关的
  focused smoke；
- 不重复运行不能回答新风险问题的全量门禁。

### 阶段 C：关闭安全与恢复风险

- 优先使用修复后的官方 Python 镜像并固定精确 digest；
- 若仍使用临时 CVE 例外，只能在未过期、未出现修复候选且操作员明确批准时
  进入受控生产验证；
- 为最终候选建立备份、恢复点、回滚版本和回滚触发条件；
- 在允许真实用户前完成 ownership 只读清点，歧义站点保持 unbound。

### 阶段 D：完成正式 smoke

- 真实邮箱验证码登录；
- 真实 Addon 重连、fresh key 发放和旧 key 撤销；
- 一个真实签名托管 runtime 请求；
- 真实支付仅在本次发布确实开放支付时执行；
- 外部 OTLP 中查询到本次候选产生的新 trace；
- 完整 `deploy/release-smoke.sh` 无条件跳过；
- 按清单完成 24 小时观察。

### 阶段 E：分开决定受控发布与 GA

受控生产验证可以服务于收集真实证据，但必须限制用户、数据和工作量，并保留
快速回滚能力。GA 只有在清单全部 Required 项完成、观察稳定且操作员明确签字后
才能宣布。

## 7. 工作审视报告

### 7.1 原定目标

- 判断公开前台是否可以收口；
- 明确 Free 额度、账户激活和站点跨账号冷却规则；
- 在用户端、远端前台和帮助页持续展示关键规则；
- 收口 Cloud Admin 设置页；
- 判断是否应立即正式生产发布；
- 把过程整理为可复用的仓库经验。

### 7.2 完成情况

- [x] 前台和规则说明已形成阶段收口；
- [x] 账户、额度和站点连接边界已经明确；
- [x] Admin 信息架构、共享组件和防漂移门禁已经建立；
- [x] 服务设置与 Vector Settings 已完成有界工作台整理；
- [x] 已明确“准备发布”和“立即 GA”的区别；
- [x] 已给出后台设置页最后一轮的允许范围和停止条件；
- [ ] 未执行生产部署、真实用户开放或 GA；这些不属于本文授权。

### 7.3 发现的问题与纠偏

| 严重程度 | 问题 | 根因 | 下次做法 |
| --- | --- | --- | --- |
| 必须改正 | 容易把旧的 M4 accepted 证据用于更新后的 `master` | 没有把证据绑定到精确 revision | 每次报告都写出 source revision、PR、dirty state 和 acceptance state |
| 必须改正 | 容易把 CVE 临时例外理解为生产发布许可 | 混淆“有限风险接受”和“漏洞修复/GA” | 将例外、受控验证、正式发布和 GA 分开审批 |
| 必须改正 | 后台设置页可能进入无限优化 | 没有先定义发布导向范围和停止条件 | 一个 bounded batch 后冻结，只由真实缺陷重新开启 |
| 应当改正 | 把 `production`/`master` 提交数差异理解为简单落后 | 忽略发布分支有意分叉和 tree 差异 | 以精确候选 tree、bundle 和运行证据判断 |
| 应当改正 | 历史清单中的未勾选项可能掩盖当前 blocker | 没有区分 normative、current 和 historical | 以清单状态标签为准，并在发版时刷新当前 blocker 表 |
| 应当改正 | 健康检查容易被表述成业务验收 | 将 liveness 与功能闭环混在一起 | 分别报告 health、真实 smoke、观察和 GA |

### 7.4 做得有效的部分

- 先审查真实页面、代码、分支和门禁，再给发布建议；
- 把 Cloud-owned 设置与 WordPress-owned 控制真相分开；
- 用共享组件、manifest、结构契约和截图防止 UI 风格回退；
- 将高频操作、低频维护和危险动作按频率与风险分层；
- 保留历史文档，同时让现行 policy/checklist 继续作为唯一规范真相；
- 把“是否发布”转化为可验证证据，而不是主观完成度。

## 8. 可复用的开发经验

1. **生产不是预览环境。** 不用正式发布去验证尚未冻结的后台 UI。
2. **也不要等待完美 UI。** 内部操作台满足发布安全和高频任务后应及时冻结。
3. **配置 UX 可能是正确性问题。** 凭据清除、必填项、失败恢复和状态可见性
   会直接影响发布安全，不只是美观。
4. **证据必须绑定精确对象。** revision、tree、bundle、镜像和环境缺一不可。
5. **先决定停止条件，再开始最后一轮优化。** 否则范围会随每次观察继续增长。
6. **规范、操作清单和复盘各司其职。** Policy 定义必须遵守什么，Checklist
   定义当前如何验收，Retrospective 解释为何这样做。
7. **真实闭环优先于页面数量。** 下一阶段资源应优先放在 Addon、Provider、
   邮件、支付、观测和恢复，而不是增加新后台页面。
8. **受控验证和 GA 分开。** 前者允许有限风险下收集证据，后者需要完整门禁。

## 9. 以后回答“现在能否正式发布”的最小判断

只有以下条件同时成立，才建议执行正式生产发布流程：

- 最终候选已冻结，release scope 明确；
- 精确 `master` revision 的 required checks 为绿；
- 当前应用 tree 已获得 M4 accepted；
- 精确 bundle、镜像 digest、扫描和回滚边界已固定；
- CVE 已修复，或仅在规则允许时用于受控验证；
- 备份、恢复点和回滚操作已确认；
- 完整 release smoke、真实邮箱、Addon 和 runtime 闭环通过；
- 外部观测和规定观察窗口通过；
- 生产 promotion PR 包含要求的操作员批准语句；
- GA 由操作员在真实证据完成后单独确认。

若其中任一项缺失，正确表述是“值得继续做发布准备”或“可进入受控生产验证”，
而不是“已经正式生产就绪”。

## 10. 参考

- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Cloud Release Checklist](../deploy/RELEASE_CHECKLIST.md)
- [Development Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Production / Master 差异审查](production-master-delta-audit-2026-07-25.md)
- [Cloud Admin UI 开发复盘](history/admin/2026/records/cloud-admin-ui-development-retrospective-2026-07-27.md)
- [账户、权益、站点重连与前台发布复盘](account-entitlement-site-relink-and-frontend-release-retrospective-2026-07-26.md)
- [公开前台发布代码收口](public-frontend-release-code-closeout-2026-07-26.md)
