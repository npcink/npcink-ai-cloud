# 免费账户、额度与取数机制盘点（2026-10-06）

Status: read-only inventory and operator-confirmed implementation recommendation.
本文盘点的是代码，不代表目标环境配置、M4 接收、生产发布或真人使用已验证。
试用口径见[四周计划](trial-stage-commercial-validation-plan-2026-10-06.md)。

## 1. 免费试用的现成开户路径

用户访问 /portal/register，通过邮箱验证码验证完成注册；/portal/login 也有
QQ 首次登录创建账户的路径。正常流程不需要管理员逐人开户或邀请白名单。

源码依据：

- [Portal 注册/登录路由](../app/api/routes/portal.py)：邮箱 request/verify 与 QQ callback。
- [商业身份流程](../app/domain/commercial/mixins/_portal_mixin.py)：
  verify_portal_registration_code、register_portal_identity_provider_login、
  verify_portal_login_code、resolve_portal_identity_provider_login。
- [会话投影](../app/api/portal_session.py)：沿用现有会话，不增加公开响应字段。

盘点时注册只创建身份、账户和成员关系，Free 等 Addon exchange 激活。
本次确认将权益激活移到身份验证成功后的账户事务中；仍不创建站点或运行
密钥。历史正常账户在下次真实验证登录时补齐一次，无订阅历史才符合条件。

复用[账户 Free 绑定 helper](../app/domain/commercial/mixins/_account_mixin.py)
及[套餐绑定与快照机制](../app/domain/commercial/mixins/_billing_mixin.py)：
固定账户级订阅标识、active Free、30 天周期和现有订阅审计；不另外充值
credit ledger、不批量发放。按账户加锁检查，已有任何订阅历史则跳过。

[Addon exchange](../app/domain/commercial/mixins/_site_mixin.py) 保留站点
所有权、一次性 code/state、访问关系、容量与密钥验证。正常新账户已有
Free；历史无订阅账户仍可使用原兜底。暂停/取消订阅不能靠重新连接恢复。

## 2. “每周 N 次”与额度、限流、credits

推荐配置：复用 Free 的现有代码基线，不新增配置值。

| 机制 | 现状 | 本轮选择 |
| --- | --- | --- |
| 套餐额度 | Free 基线为 300 AI credits、1 个站点、并发 1；还有已有资源边界 | 保留 |
| 运行次数/token/cost 字段 | Free 模板数值为 0；运行授权的本轮消费检查使用 AI credits | 不当作每周次数限制 |
| credits | 按已有计费/运行机制扣减，单次不同能力消耗不等 | 最贴近现有成本约束 |
| 限流/并发 | 控制瞬时请求，不能代表七天累计次数 | 沿用，不充当周配额 |
| 周次数重置 | 没有专用每周 N 次套餐机制 | 不开发、不加 cron |
| 周期恢复 | Free 绑定 now 至 now+30 天，现有访问/对账流程按原规则恢复周期 | 不用登录或重连重置 |

依据：[套餐目录](../app/domain/commercial/plan_catalog.py)、
[运行权益检查](../app/domain/commercial/mixins/_runtime_mixin.py)、
[周期快照](../app/domain/commercial/mixins/_billing_mixin.py)。
“300 credits”不能宣传成“300 次生成”。目标环境权益显示尚待核对。

Provider 账户级预算独立于 Free：[预算执行](../app/domain/runtime/provider_budget.py)、
[预算盘点](provider-budget-hard-cap-inventory-2026-09-23.md)。
全局设置关闭/缺失时可能不执行保护；开始前需确认 enabled、配置要求及
实际付费 Provider 日/月限额覆盖。数值由操作者决定，本会话不改运行配置。

## 3. 免费账户如何避免欠费语义

使用既有 active Free，不伪造付费订单、不产生待付款试用订阅。
额度耗尽走已有 quota 拒绝及周期规则，不按欠费恢复，不自动转收费。
暂停/取消等历史商业状态仍保持原保护，不为试用绕过限制。

注册即 Free 能消除正常新用户因尚未连接而没有订阅的状态；无法使用时区分
站点未连接、额度不足、Provider 总预算及已有访问限制，不要求用户付款。
不改变付费账户、订单或支付配置，也不据此宣称整站支付已经关闭。

Portal 现有[账户权益接口](../app/api/routes/portal.py)
GET /portal/v1/account/entitlements 可在无站点情况下取得套餐和额度；
[账户首页](../frontend/src/app/portal/page.tsx) 已请求该接口。调整旧的
“连接后才能看到额度/激活 Free”说明，继续提示从 WordPress 完成站点连接。

## 4. 每用户次数与 token 的取数路径

| 证据 | 已有路径 | 周报限制 |
| --- | --- | --- |
| 账户权益/credits | Portal account/entitlements、account/usage-summary；Admin 账户 quota-summary | 套餐周期、今日/24h 不是固定试用周 |
| run | [CommercialUsageQueries](../app/adapters/repositories/commercial_usage_queries.py) 的 list_run_records_for_admin | 支持 site/since，需完整取数并在只读查询补 end-exclusive |
| Provider token/调用 | 同文件 list_provider_call_records_for_admin，按 run 关联 site | 模型/调用明细与 run 汇总不能重复相加；计费失败和重试需保留 |
| 日常用量摘要 | [UsageService](../app/domain/usage/service.py) | 今日与滚动窗口只作核对，不作为周事实 |
| 原生采纳 | [AgentFeedbackService](../app/domain/agent_feedback/service.py) 和已有反馈视图 | summary 最长 168h、存在行数边界；采纳/反馈不是采纳/展示 |
| 编辑建议观察 | [EditorAssistQualityService](../app/domain/observability/editor_assist_quality.py) 和 Admin editor-assist-quality | 标题/摘要/改写覆盖，生成 presented 需核对展示；保存精确匹配与未知结果分开 |
| 实际消费 | 第三方平台用量与价格/账单明细 | 需同时间段、同计费类别，不用充值金额 |

推荐每周方法：

1. 受控保存 S1–S5 与账户/站点的映射，沿用已有观测同意设置。
2. 在既有授权运维入口使用只读事务；将固定 [start,end) 转为 UTC。
   按站点查 started_at 范围内的 run，以 run_id 去重，分类状态/能力/错误。
3. Provider 消费按调用发生时间落入对应周，并通过 run 归属用户；跨周 run
   的调用按调用周归属，不因 run 开始于上一周丢失消费。
4. 现有仓储只支持 since 的查询取完整结果后应用 end-exclusive 过滤，
   或在只读 SELECT 中直接加双边时间条件；不新增线上 API、写库或报表表。
5. 核对展示/反馈关联、重复事件、查询截断与同意覆盖。原生记录不足时
   报证据缺口，人工记录另列，不将没采到的反馈当拒绝。
6. 平台模型/token/图片消费明细用于归因；分摊方法、未归属消费、
   实际金额和月成本折算同时保留。

Admin/Portal 适合快速查看，周报完整性必须核验分页、窗口和截止边界。
不把 scripts/provider_call_ledger.py 当账单：它只是开发实验调用预算。

## 5. 3–5 人开户操作清单

操作者：

- 确认 Provider 硬上限启用且有覆盖，完成六条 Done、告知和页脚核对；
- 确认注册即 Free 的候选已经按授权流程进入实际试用环境；
- 向 3–5 位站长介绍正常注册网址和“参考图编辑暂不可用”；
- 用户注册后记录匿名队列和受控账户/站点映射；指定 T+0。

用户：

1. 正常邮箱验证注册，或 QQ 首次登录。
2. 打开 Portal，确认已有 Free 和本周期额度；无站点是正常连接前状态。
3. 在 WordPress 官方 AI 插件及现有 Cloud Addon 中启动正常连接流程。
4. 返回 Portal 核对站点已连接；回编辑器按自己的写作需求使用。
5. 不付款、不充值；遇到限制记录时间、入口和提示，交给操作者核对。

每周操作者带回平台消费明细与一个主要使用阻碍；不要求逐项做付费测试。

## 6. 缺口与 L2 任务草案

当前实施任务：验证注册后原子绑定 Free；旧正常账户成功登录补齐；
账户锁/幂等与历史订阅保护；Portal 说明、既有测试和 ADR 同步。
不新增 schema/API，保留 Addon 兜底。验收详见四周计划。

后续仅记录，不在本轮实现：

- 参考图输入：Addon 当前在 request 前拒绝 file 输入；更换模型不能单独
  解决。若恢复该能力，另立 Addon/Cloud 输入协议、支持声明和确定性测试任务。
- H1 覆盖不足：先用真实使用查明展示与采纳链路缺口，再决定最小修复；
  不先建通用埋点平台，不修改本轮判据。
- 周取数便利性：只读查询足够时不做后台；若实际取数成为持续阻碍，
  另评估受控导出，保留固定时间范围、分页和访问边界。

上述草案不是实现、PR 或生产授权。
