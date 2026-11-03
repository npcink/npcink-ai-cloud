# Admin 功能审计第 1–7 批收口与人工验收交接 — 2026-11-03

状态：开发交付已收口，2026-11-03 操作者确认 Admin 人工验收通过；H10 自然编辑价值验证另记。本记录是具名修订的历史证据，后续接手须重读当前主线与运行身份。

## 1. 范围与结论

第 1–6 批共确认并修复 **58 项**：7 + 10 + 7 + 12 + 10 + 12。第 7 批是收尾专项，未发现新的可确认缺陷，没有新增修复或开启第 8 批。第一批 Q01 是偶发观察项，未确认根因、不计入 58 项，也不宣称已修复；只有再次稳定复现才单列问题。

本清单只覆盖这些批次，不能作为所有历史问题、生产安全、真实支付或所有用户路径已通过的声明。并行交付的 #1340 正确性整改和 #1358 运行时整改独立记账，不能再次累加到 58 项。

| 证据层 | 本次核对结果 |
| --- | --- |
| 开发源与合并 | GitHub `master=6b56fec63c1b06de77cd280cabd9b3bc9ab8b351`；表列 13 个 Admin PR 均已合并，merge commit 均在该主线中 |
| PR CI | 最终 head 的成功/政策跳过已核对；#1348、#1357 的被替代取消记录保留，不把取消或历史失败改写为通过；重复 PR body 检查不累计成新增覆盖 |
| M4 candidate | 各交付组的候选验证保存在各组回执；本次文档整理未重新派候选或运行全后台测试 |
| M4 accepted | 2026-11-03 实时状态：`accepted / promotion_pr=1359 / master / source_dirty=false`，source revision 与上述 master 一致 |
| 运行身份 | `127.0.0.1:18010/health/live` 返回 200、`development / m4-preview / 6b56fec63c1b / dirty=false` |
| 前端制品 | 复用 `a831284d`；其 `frontend` tree 与 `6b56fec6` 均为 `32793cf2306d46d68195e19dc2e47cc4005e04d9`，不是旧应用误用 |
| 人工 | 2026-11-03 操作者在本会话明确反馈“人工验收没问题”，按交接范围记录 H01–H09 Admin 整体接受；未单列各宽度、键盘步骤或截图，不增造逐项实测记录。H10 不在这次 Admin 接受范围内 |
| 生产 | 本审计没有生产操作；未核实当前生产运行和真实交易，不由开发主线、健康检查或 M4 推定生产状态 |

## 2. 58 项逐项对账

下表每项均为“源码修复已集成，历史 CI 与 M4 accepted 已取得；操作者已接受 Admin 整体人工验收”。交付列关联 PR 与第 3 节的契约、实现、可执行反例入口。跨页面问题只计一次。

### 第 1 批（7 项）

| 编号 | 原问题 | 交付与回归组 |
| --- | --- | --- |
| M01 | 回读失败被成功提示掩盖 | [1334][P1334] / A |
| M02 | 保存期间输入可修改，随后被清除 | [1334][P1334] / A |
| M03 | 迟到目录结果进入其他供应商 | [1334][P1334] / A |
| M04 | 浏览器后退直接丢弃供应商草稿 | [1334][P1334] / A |
| M05 | 测试已失败，正常状态和汇总仍保留 | [1334][P1334] / A |
| M06 | 主动停用被误报为目录同步失败 | [1334][P1334] / A |
| M07 | 目录结构异常被当作空目录 | [1334][P1334] / A |

### 第 2 批（10 项）

| 编号 | 原问题 | 交付与回归组 |
| --- | --- | --- |
| S01 | Jina Reader 无法正常保存 | [1334][P1334] / B |
| S02 | 关闭有保护，刷新 / 后退没有保护 | [1334][P1334] / B |
| S03 | 纯空格被当作有效凭据，还会替换原主搜索 | [1334][P1334] / B |
| S04 | 目录中的空记录使整页失效 | [1334][P1334] / B |
| V01 | 打开诊断会静默丢失向量草稿 | [1334][P1334] / B |
| V02 | 重试没有保存新密钥，却显示整体完成 | [1334][P1334] / B |
| V03 | 写入结果未知时直接允许重复操作 | [1334][P1334] / B |
| V04 | 重建失败的重试按钮执行了配置保存 | [1334][P1334] / B |
| V05 | 畸形保存成功响应触发全局错误页 | [1334][P1334] / B |
| V06 | 取消替换后保留错误 dirty 标记，可写回旧 Endpoint | [1334][P1334] / B |

### 第 3 批（7 项）

| 编号 | 原问题 | 交付与回归组 |
| --- | --- | --- |
| R01 | 候选链写入结果未知时仍可重复提交 | [1336][P1336] / C |
| R02 | 策略错误“重试”重放写入 | [1336][P1336] / C |
| R03 | 空执行时间没有本地校验 | [1336][P1336] / C |
| T01 | 服务设置网络写入异常没有进入既有回读恢复 | [1336][P1336] / C |
| T02 | 空白替换删除已有服务凭据 | [1336][P1336] / C |
| T03 | 可选预算连接证据使整页崩溃 | [1336][P1336] / C |
| T04 | 畸形时区被显示为真实配置默认值 | [1336][P1336] / C |

### 第 4 批（12 项）

| 编号 | 原问题 | 交付与回归组 |
| --- | --- | --- |
| B4-01 | 只修改备注也会提交旧的完整客户状态，覆盖另一会话刚设置的停用状态与原因 | [1337][P1337] / D1 |
| B4-02 | 已入账但响应丢失后可再次提交新幂等键；临时数据库实际出现两笔各 +250 | [1337][P1337] / D1 |
| B4-03 | 必需集合或主对象缺失，被显示为空目录或正常详情；合成客户还能保存 unknown 状态 | [1338][P1338] + [1339][P1339] / D2、D3 |
| B4-04 | 响应丢失直接恢复保存；成功 data={} 也提示已保存 | [1338][P1338] / D2 |
| B4-05 | 首笔已创建但响应丢失时提示普通失败，重复提交撞到现有账号规则 | [1338][P1338] / D2 |
| B4-06 | 保存期间仍可继续输入，成功后丢弃后输入内容 | [1344][P1344] / D4 |
| B4-07 | 未保存时返回列表没有提示，回到详情草稿已丢失 | [1344][P1344] / D4 |
| B4-08 | 一个 null 站点条目阻断整个客户详情 | [1344][P1344] / D4 |
| B4-09 | ai_credits={} 被显示为“正常、0/0、剩余0”，积分操作仍开放 | [1344][P1344] / D4 |
| B4-10 | 一个 null 流水条目使完整客户详情进入全站错误页 | [1344][P1344] / D4 |
| B4-11 | 丢响应后可再次激活；成功 data={} 时直接显示已激活 | [1339][P1339] / D3 |
| B4-12 | 更新已执行但响应丢失后开放再次 PATCH，没有确认读取 | [1339][P1339] / D3 |

### 第 5 批（10 项）

| 编号 | 原问题 | 交付与回归组 |
| --- | --- | --- |
| B5-01 | 并发保存用旧表单覆盖另一人的新额度 | [1346][P1346] / E1 |
| B5-02 | 普通草稿关闭或离开时静默丢失 | [1347][P1347] + [1348][P1348] / E2、E3 |
| B5-03 | 网络结果未知后直接允许换新 key 再次保存 | [1347][P1347] / E2 |
| B5-04 | 保存结果未验证，回读旧值仍提示已发布 | [1347][P1347] / E2 |
| B5-05 | 必需集合缺失被显示为合法空目录 | [1347][P1347] + [1349][P1349] / E2、E4 |
| B5-06 | 输入步长不匹配合法值，回车保存失败而点击可保存 | [1348][P1348] / E3 |
| B5-07 | 畸形成功响应清空目录却提示保存成功 | [1348][P1348] / E3 |
| B5-08 | 响应丢失后缺少结果确认，再次保存进入 409 恢复死路 | [1348][P1348] / E3 |
| B5-09 | 缺失详情被判断稳定，返回目标不匹配仍可发起操作 | [1349][P1349] / E4 |
| B5-10 | 单条坏站点数据触发全局错误页 | [1349][P1349] / E4 |

### 第 6 批（12 项）

| 编号 | 原问题 | 交付与回归组 |
| --- | --- | --- |
| B6-01 | 提交完成会清空等待期间新输入的回复或内部备注 | [1356][P1356] / F2 |
| B6-02 | 离开工单时没有草稿保护，返回后内容丢失 | [1356][P1356] / F2 |
| B6-03 | 回复响应丢失后可直接重发，前后端均缺少有效去重 | [1355][P1355] / F1 |
| B6-04 | 不同写操作可并行，任一完成会解锁仍在处理的提交 | [1355][P1355] / F1 |
| B6-05 | 详情与写入回执缺少目标和结构校验 | [1355][P1355] / F1 |
| B6-06 | 初次详情读取失败后，仍能发送回复和修改状态 | [1355][P1355] / F1 |
| B6-07 | 缺字段被当空工单，单个坏记录使整页不可用 | [1356][P1356] / F2 |
| B6-08 | 仅改状态也会把未修改的旧备注追加成新内部消息 | [1356][P1356] / F2 |
| B6-09 | 响应缺失会伪装空目录，坏条目和错目标行动链接未隔离 | [1357][P1357] / F3 |
| B6-10 | 坏审计响应被当无证据，且未核对记录与精确筛选范围 | [1357][P1357] / F3 |
| B6-11 | 缺失证据被补成0或没有异常 | [1357][P1357] / F3 |
| B6-12 | 按站点排查异常时会接纳其他站点的运行记录 | [1357][P1357] / F3 |

## 3. 契约、实现与可执行反例入口

[信息层级落实台账](../../../admin-information-hierarchy-implementation-ledger.md)保留各页面原入口与取舍。下表只列接手最短入口；完整文件与反例由对应 PR diff、现存 spec 和本地原始回执承载。源码链接随主线演进，不是不可变版本快照。

| 组 | 契约 / 实施说明 | 实现入口 | 可执行反例入口 |
| --- | --- | --- | --- |
| A 供应商 | [状态与反馈契约](../../../cloud-admin-feedback-and-layout-contract-v1.md) | [供应商状态](../../../../frontend/src/features/admin/ai-resources/async-operation-state.ts) | [供应商目录 E2E](../../../../frontend/tests/e2e/admin-provider-directory-v2.spec.ts) |
| B 外部服务、向量 | [逐项处置](admin-external-vector-recovery-2026-10-31.md) | [外部服务](../../../../frontend/src/app/admin/external-services/page.tsx)、[向量](../../../../frontend/src/app/admin/vector-settings/page.tsx) | [故障恢复 E2E](../../../../frontend/tests/e2e/admin-external-vector-recovery.spec.ts)、[真实 API fixture](../../../../tests/api/test_external_service_save_recovery.py) |
| C 运行配置、设置 | [状态与反馈契约](../../../cloud-admin-feedback-and-layout-contract-v1.md) | [运行配置](../../../../frontend/src/app/admin/runtime-profiles/page.tsx)、[服务设置](../../../../frontend/src/app/admin/service-settings/page.tsx) | [配置 E2E](../../../../frontend/tests/e2e/admin-runtime-profiles-workspace.spec.ts)、[设置 E2E](../../../../frontend/tests/e2e/admin-service-settings-v2.spec.ts) |
| D1 资料与积分写入 | [写入安全说明](admin-account-write-safety-2026-11-01.md) | [资料编辑](../../../../frontend/src/features/admin/accounts/AccountOperatorProfileEditor.tsx) | [安全 E2E](../../../../frontend/tests/e2e/admin-account-write-safety.spec.ts)、[PostgreSQL](../../../../tests/integration/test_admin_account_profile_postgres.py) |
| D2 客户确认 | [确认说明](admin-customer-confirmation-2026-11-01.md) | [创建确认](../../../../frontend/src/features/admin/accounts/account-create-confirmation.ts) | [客户目录 E2E](../../../../frontend/tests/e2e/admin-accounts-queue-v2.spec.ts) |
| D3 站点确认 | [窄读确认说明](admin-site-confirmation-2026-11-01.md) | [站点操作](../../../../frontend/src/features/admin/sites/site-operations.ts) | [确认 E2E](../../../../frontend/tests/e2e/admin-site-confirmation.spec.ts)、[API](../../../../tests/api/test_admin_site_operation_confirmation.py) |
| D4 客户证据与草稿 | [实施说明](admin-account-evidence-drafts-2026-11-01.md) | [积分证据](../../../../frontend/src/features/admin/accounts/account-credit-evidence.ts) | [证据 E2E](../../../../frontend/tests/e2e/admin-account-evidence-review.spec.ts)、[草稿 E2E](../../../../frontend/tests/e2e/admin-account-evidence-drafts.spec.ts) |
| E1 套餐并发 | [CAS 契约](../../../admin-plan-parameters-concurrency-v1.md) | [套餐工作台](../../../../frontend/src/components/admin/PlanManagementWorkbench.tsx) | [并发 E2E](../../../../frontend/tests/e2e/admin-plan-concurrency.spec.ts)、[PostgreSQL](../../../../tests/integration/test_admin_plan_postgres.py) |
| E2 套餐证据 | [草稿与原操作契约](../../../admin-plan-parameter-evidence-drafts-v1.md) | [套餐工作台](../../../../frontend/src/components/admin/PlanManagementWorkbench.tsx) | [证据 E2E](../../../../frontend/tests/e2e/admin-plan-evidence-drafts.spec.ts)、[API](../../../../tests/api/test_admin_plan_parameter_confirmation.py) |
| E3 积分包 | [商业一致性](../../../admin-commercial-consistency-contract-v1.md) | [积分包](../../../../frontend/src/app/admin/credit-packs/page.tsx) | [证据 E2E](../../../../frontend/tests/e2e/admin-credit-pack-evidence-drafts.spec.ts)、[API](../../../../tests/api/test_admin_credit_pack_confirmation.py) |
| E4 订阅 | [实施说明](admin-subscription-evidence-2026-11-02.md) | [订阅详情](../../../../frontend/src/app/admin/subscriptions/[subscriptionId]/page.tsx) | [订阅证据 E2E](../../../../frontend/tests/e2e/admin-subscription-evidence.spec.ts) |
| F1 工单写入 | [写入恢复契约](../../../admin-support-write-recovery-v1.md) | [工单详情](../../../../frontend/src/app/admin/support-requests/[requestId]/page.tsx) | [恢复 E2E](../../../../frontend/tests/e2e/admin-support-write-recovery.spec.ts)、[PostgreSQL](../../../../tests/integration/test_admin_support_operations_postgres.py) |
| F2 工单草稿与目录 | [草稿目录契约](../../../admin-support-drafts-directory-v1.md) | [工单详情](../../../../frontend/src/app/admin/support-requests/[requestId]/page.tsx) | [草稿目录 E2E](../../../../frontend/tests/e2e/admin-support-drafts-directory.spec.ts) |
| F3 覆盖、审计、诊断 | [证据验证契约](../../../admin-diagnostic-evidence-validation-v1.md) | [审计](../../../../frontend/src/app/admin/audit/page.tsx)、[诊断](../../../../frontend/src/app/admin/troubleshooting/page.tsx) | [验证 E2E](../../../../frontend/tests/e2e/admin-diagnostic-evidence-validation.spec.ts)、[serializer](../../../../tests/domain/test_admin_diagnostic_serializer_contract.py) |

## 4. 合并链与第七批

| PR | merge commit | 范围 |
| --- | --- | --- |
| [1334][P1334] | `13226bda6c6361a9341afdff25310ae705f8368f` | 第1、2批 |
| [1336][P1336] | `f3843095ca61a34ffd2cc9598fe0c54e0efd8421` | 第3批 |
| [1337][P1337] | `79adf441a80c3908e02e28996feee3c2deb26106` | D1 |
| [1338][P1338] | `e2b11a0e207babeb196409d3fa48dccbafa2cc1f` | D2 |
| [1339][P1339] | `190d2e2ea0f99ae1317f67286075056863858e5d` | D3 |
| [1344][P1344] | `e7e884c2595754f1d03737b302c0b99d88f90ca1` | D4 |
| [1346][P1346] | `42fef5409423fb6dc403b1ebfd3304feda5dbd28` | E1 |
| [1347][P1347] | `de8964384f22111f837da64615c3f7bfcfc564ff` | E2 |
| [1348][P1348] | `1d52c8d192dba6b5ad83968acbdf270bfdd18760` | E3 |
| [1349][P1349] | `09666ee48154a64e548c591498495c0392fd0cd4` | E4 |
| [1355][P1355] | `9765c0ba4af99a88b4633145f01526b8aa93a983` | F1 |
| [1356][P1356] | `a26307734547f5855c543c78516eb30c23ab2783` | F2 |
| [1357][P1357] | `a831284dc115429baa78818cdd6376e696c11cbd` | F3 |

第七批基线为 `a831284dc115429baa78818cdd6376e696c11cbd`，tree 为 `1e23b081d166b4da283d1dc6994a6be3601a3f1c`。专项 E2E 28/28、全路由矩阵 27/27、后端相关测试 83/83、i18n 与边界契约通过；后端一个既有弃用警告保留。范围含用量、插件/媒体/向量观测、反馈、经济性、登录会话、暂停入口与 Admin 路由壳层。E2E 的合成响应和后端 fixture 不等于真实客户操作或人工验收；这些重叠批次不累计为独立总样本数。

后续 [#1358][P1358] 为运行时、反馈、回调、检索及退款维护；[#1359][P1359] 记录 M4 验收与支付暂缓。详见[运行时验收](runtime-audit-m4-acceptance-2026-11-03.md)与[开发经验](../../../development-session-notes-2026-11-02.md)。232 项 M4 定向测试和一次真实本地 Ollama adapter 标题生成不等于收费远端 API、WordPress 人工采用或支付结算证据。无签名的真实退款查询失败证据保留，根因未确认；操作者已决定支付功能留待其生产工作，本阶段不继续探测。

## 5. 人工验收交接表

2026-11-03 人工回执：操作者明确表示“人工验收没问题”。以下 H01–H09 随 Admin 整体确认关闭；这是操作者接受证据，不把此前的合成回归改写为逐项人工实测。H10 仍等自然编辑任务，不据此推定 WordPress 采用、生产或支付通过。

起点为开发预览 `http://127.0.0.1:18010/admin`。验收前核对当前 `/health/live` 与 M4 status；若 source 变化，先判断影响，再补相应检查。PC 1440、1056 是宽度，不要求移动/平板矩阵。既有验证与原始失败复用，只对源码变化或具体未决风险补测。

真实开发页只做读取、草稿编辑与取消；选择具名合成对象，避免普通站点详情和客户 ledger 的隐式写入。保存、激活、积分、邮件、重建和故障注入走现有拦截全部业务写入的合成浏览器 fixture，保留“候选前端 + 模拟 API”的证据标签。人工验收不安排真实客户或支付写入。

| 编号 | 人工任务与通过标准 | 当前状态 |
| --- | --- | --- |
| H01 | 两个 PC 宽度检查高频页面、表格、工作台、错误和待确认说明可见，没有遮挡或横向溢出 | 随 Admin 整体确认关闭 |
| H02 | Tab / Shift+Tab / Enter / Escape：焦点可见、弹窗内循环、关闭后回到触发器；多层弹窗仅最上层响应 | 随 Admin 整体确认关闭 |
| H03 | 未保存草稿遇到链接、后退、前进、刷新：取消或 Escape 保留，确认放弃才离开；不制造假 pending | 随 Admin 整体确认关闭 |
| H04 | 供应商、搜索、向量、配置、服务设置：空模型/空白替换校验可理解，取消不会清空真实配置 | 随 Admin 整体确认关闭 |
| H05 | 合成客户创建、备注、积分与站点操作：在途输入行为明确；不确定结果保留同一操作身份，仅用窄确认读取恢复 | 随 Admin 整体确认关闭 |
| H06 | 合成套餐、积分包：并发旧版本被拒，普通草稿受保护，畸形成功回执不会清空目录或显示成功 | 随 Admin 整体确认关闭 |
| H07 | 合成工单：回复/内部备注/状态不能互相解锁，丢响应不重复发信，导航与回填保留草稿 | 随 Admin 整体确认关闭 |
| H08 | 坏条目、缺数值、错对象或错筛选范围局部报错且可恢复；合法 0、unlimited 与真实空集合仍可识别 | 随 Admin 整体确认关闭 |
| H09 | 登录、观测、诊断和暂停入口：错误有下一步，跨范围不显示旧事实，暂停能力不会被重新启用 | 随 Admin 整体确认关闭 |
| H10 | 用自然文章分别尝试标题、摘要、选中文本改写，记录语义保留、修改负担、等待与是否显式采用；没有任务时不凑调用 | 待自然任务；所属 WordPress 仓库单独接手 |

每条记录操作者、北京时间、source、宽度、步骤、结果和脱敏证据。技术检查只能预检，不能代填人工“通过”。发现稳定问题后新建单项问题，按所属模块回归、审核、CI、M4；Q01 再现时按此处理。未出现问题不启动下一轮全后台系统审计。

## 6. 本轮分支整理与保留工作树

首次整理只将本审计 13 个无占用本地分支转存为 `refs/archive/admin-audit-closeout/20261103/local-branches/`。其中 12 个 head 与已合并 PR head 精确相同；`codex/admin-services-vector-fixes=038f2d5a` 是第二批中间提交，保全但不假称等于最终 PR head。各候选远端分支已不存在，未删除任何远端分支；四个依赖更新 PR 和其他会话分支保留。

先核对无工作树占用和无 open PR，再创建归档 refs、验证 bundle，最后以含旧 SHA 的 ref transaction 移出 `refs/heads`。bundle 是以当前主线为 prerequisite 的增量恢复包，不承诺脱离共同 Git 历史独立恢复。

- 私有 bundle：`/Users/muze/.codex/archives/npcink-ai-cloud/2026-11-03/admin-audit-closeout-local-branches.bundle`，mode `600`，130496 bytes。
- SHA-256：`ef4c8579ed6a0b92ad5a5a8b5142b297516e9666638a418b7d1dd9f51e04e66f`。
- 新归档 refs 至少保留 30 天且相关交接结束；bundle 按现行规范保留，不自动到期删除。未清理既有历史归档。
- 首次整理时当前聊天工作树、冻结执行工作树、稳定 M4 ops 均保留；该轮没有移除或解锁当前工作树，也未清理依赖、缓存、数据库与本地原始证据。
- 其他会话所有登记继续保留，包括本轮盘点时目录不可读的登记；不可读不证明可删除，不由本会话 prune 或解除其锁。没有由此启动无界历史清理。

具体分支 SHA、无占用证据、bundle 验证、保留工作树和后续 PR 回执留在本地 `admin-audit-closeout/` 交接目录及共同 Git 目录的 `task-closeouts/admin-functional-audit-batches1-7-20261103/`；它们不是另一个 clone 的必备文件。首次整理分类为 **KEEP_ACTIVE**，当时人工验收与交接仍需工作区。人工接受后的释放须重新核对占用、完整保全 ignored 与原始证据、验证恢复包，并留下最终回执；不能由验收通过直接推定“全部 worktree 已清空”。

### 2026-11-03 最终清理回执（北京时间 12:54）

独立收尾会话重新核对 GitHub：相关 17 个 PR（上表 13 个修复 PR，加 #1358、#1359、#1360、#1361）全部合并，`origin/master=4c522910dc53eecc729c41d912f3de03ff68c3a9`。审核 head `26b92780`、执行 head `ac8a5d27` 分别精确匹配已合并 #1361、#1357，且 tree 与各自 merge commit 相同；squash 前 head 的祖先关系未被当成唯一判断依据。

| 对象 | 重新核对与实际结果 |
| --- | --- |
| 审核会话 `01a190f3-ab78-7763-bad1-79cc8fd7a72d` / `admin-supplier-functional-fixes/npcink-ai-cloud` | 经应用 `set_thread_archived` 归档；应用随后异步移除目录。归档前 tracked/untracked 非 ignored 内容干净，完整目录与既有备份逐文件一致。 |
| 执行会话 `01a1929f-2271-7550-b73e-07abd2a0a629` / `admin-services-vector-fixes/npcink-ai-cloud` | 本次入口前已归档且目录已不存在；未声称本次再次删除。完整目录备份与源码 bundle 重新校验通过。 |
| 两个旧 Git 登记与锁 | 两会话均在归档列表、两路径不存在且无进程引用后，备份旧登记，仅解锁这两个已释放登记。prune dry-run 与实际候选精确相同，均仅这两条；其他登记和锁未改。 |
| 两个本地分支 | `codex/admin-audit-human-acceptance-20261103`、`codex/admin-diagnostic-evidence-validation` 在无工作树占用、无 open PR 和源码恢复包验证后，通过含旧 SHA 的 ref transaction 转存至 `refs/archive/admin-audit-cleanup/20261103/local-branches/`，并清除各自 upstream 配置。 |
| 两个失效跟踪引用 | 精确删除 `origin/codex/admin-audit-closeout-20261103`、`origin/codex/admin-audit-human-acceptance-20261103`；远端对应分支已不存在，head 已保全。未做无范围 remote prune，远端删除数为 0。 |

此前应用返回的 `The task's primary checkout cannot be removed.` 属于历史拒绝；本次使用[应用支持的聊天归档流程](https://learn.chatgpt.com/docs/environments/git-worktrees#worktree-cleanup)，没有重复调用被拒绝的归档操作、绕过应用保护、手改应用数据库或直接删除工作树目录。应用释放目录后，残留登记按[缺失工作树恢复流程](../../../repository-stage-transition-cleanup-standard-v1.md#damaged-or-missing-registration-path)处理。

最终统计：先前 14 个分支归档加本次 2 个，累计 16 个本轮本地分支已移出活动分支集合；本次清除 2 个失效跟踪引用、2 个 Git 登记，两个目标会话均已归档。12:54 回执时，本审计实现与清理范围内未提交、未合并、未释放对象和应用保护阻塞均为 0；本节后续文档发布属于单独的提交交付，不重开 Admin 审计。

恢复资料保留在私有目录 `/Users/muze/.codex/archives/npcink-ai-cloud/2026-11-03/admin-human-acceptance/`，入口为 `RECOVERY.md`。审核/执行完整 tar 的成员清单与所有普通文件 hash、符号链接及源码 bundles 均已重新验证；另补存两个会话的 7 个外置原始证据目录，49,588 个普通文件逐一核对源文件，原始证据仍在原位置。私有恢复资料与内容均未提交 Git。

- 新增源码恢复包 `released-local-branches.bundle`：mode `600`，7,449 bytes，SHA-256 `0009488897a71efb6055a976318f842f84fe5d6449a193960b4b910dffcb96b7`；依赖共同仓库既有 `origin/master` 可达历史。
- 完整文件与证据恢复先解压到新的空目录；tar 中旧 `.git` 指针不是独立仓库，不覆盖新工作树 Git 元数据。源码优先从仍保留的日期归档 refs 恢复。
- 归档 refs 至少保留至 2026-12-03，且相关任务与归属问题全部结束；到期不自动删除。对应 bundle 至少保留至相关 refs 删除后 90 天并经操作者复核；完整备份和原始证据不设自动删除。
- 本地共同 Git 目录最终入口：`task-closeouts/admin-functional-audit-batches1-7-20261103/human-acceptance-final.json`；副本为私有恢复目录的 `cleanup-final-receipt.json`，旧验收回执另存 `human-acceptance-final.before-followup.json`。

结论为**本轮清理完成**。主仓库、稳定 M4 ops、其他任务的分支/登记/锁、全部归档 refs 与证据保留；主仓库两项无关未跟踪内容未改。仓库拓扑仍按 **KEEP_ACTIVE** 保留，不能写成全仓所有任务已清空。本轮未杀共享进程、清空数据库/共享缓存、部署 M4、操作生产、进行真实支付或付费 Provider 调用；未重跑全后台审计或重启自动跟进。

## 7. 经验归纳与停止条件

复用[历史问题关闭规范](../../../historical-issue-closure-and-release-evidence-standard-v1.md)、[既有 Admin 复盘](admin-audit-lessons-2026-10-29.md)、[PC 选择检查](../../../frontend-pc-scope-and-selective-verification-v1.md)及[阶段收尾清理规范](../../../repository-stage-transition-cleanup-standard-v1.md)，不新建平行规范体系：

1. 先用真实 serializer 的合法数据作对照，再破坏字段、目标和范围；不能只证明坏数据被拒，却拒绝合法 breakdown、0 或 unlimited。
2. 区分明确拒绝、结果未知、已写待确认和读取失败；同 key、actor、target、revision 及迟到响应隔离是一条完整链。
3. GET 是 HTTP 方法，不能据此宣称数据库零写；普通站点详情可能 reconcile，ledger 可能 backfill/commit。站点确认使用专用 SELECT-only 窄 GET。
4. 普通草稿与未知写入意图分开保留；读取成功不能覆盖新草稿，回执不能清除在途新输入。
5. 独立审核要保留可执行反例、原始失败和 hash；不以摘要测试数、放宽断言或更新截图基线替代核实。特定基线更新需具体人工视觉接受。
6. 先稳定 worktree 归属，再整理分支；squash 后用 PR head 和归档保全核对，不能只凭祖先关系 force 删除。受保护、不可读和当前 worktree 均保留。

H01–H09 已由操作者整体接受，Admin 第 1–7 批可关闭。H10 自然编辑价值验证按所属 WordPress 仓库与自然任务继续，不占用本审计执行工作树。完成最终恢复保全与交接后可关闭当前聊天；不恢复 automation、不扩展功能、不安排新的付费观察调用。生产发布须单独冻结范围并取得明确授权。

[P1334]: https://github.com/npcink/npcink-ai-cloud/pull/1334
[P1336]: https://github.com/npcink/npcink-ai-cloud/pull/1336
[P1337]: https://github.com/npcink/npcink-ai-cloud/pull/1337
[P1338]: https://github.com/npcink/npcink-ai-cloud/pull/1338
[P1339]: https://github.com/npcink/npcink-ai-cloud/pull/1339
[P1344]: https://github.com/npcink/npcink-ai-cloud/pull/1344
[P1346]: https://github.com/npcink/npcink-ai-cloud/pull/1346
[P1347]: https://github.com/npcink/npcink-ai-cloud/pull/1347
[P1348]: https://github.com/npcink/npcink-ai-cloud/pull/1348
[P1349]: https://github.com/npcink/npcink-ai-cloud/pull/1349
[P1355]: https://github.com/npcink/npcink-ai-cloud/pull/1355
[P1356]: https://github.com/npcink/npcink-ai-cloud/pull/1356
[P1357]: https://github.com/npcink/npcink-ai-cloud/pull/1357
[P1358]: https://github.com/npcink/npcink-ai-cloud/pull/1358
[P1359]: https://github.com/npcink/npcink-ai-cloud/pull/1359
