# 退款能力缺口盘点（2026-09-22）

Status: dated static inventory. 只读代码盘点与契约文档对照；无运行验证、无沙箱操作。行号会漂移，以文件与符号名为准。出处：[next-stage-plan-2026-09-22.md](next-stage-plan-2026-09-22.md) P1。

## 0. 摘要

真实退款（alipay.trade.refund）的网关调用、退款状态机、幂等与并发保护、
credits 回冲**均已实现且有单元/领域测试覆盖，但从未经过沙箱或生产验证**。
真正缺失的是四块：退款回调入口、退款对账（refund.query 与对账任务）、失败
终态路径、以及除内部 service 路由之外的任何发起入口（Portal 无自助、Admin
无操作界面）。

## 1. 已实现（附证据路径）

- 数据模型：`payment_refunds`（状态 requested/succeeded/failed；注意 failed
  无写入路径）、`payment_events`（退款事件唯一键）、credit ledger 退款
  adjustment（幂等键 `credit_pack_refund:{refund_id}`）、
  `paid_credit_grants.refunded_ai_credits` 加 CHECK 封顶——
  `app/core/models.py`、`migrations/versions/20260612_0042_payment_orders_refunds.py`、
  `20260711_0059_paid_credit_grants.py`、`20260728_0073_ai_credit_contract.py`。
- 支付宝真实退款：`AlipayPaymentGatewayProvider.create_refund`
  （`alipay.trade.refund`、RSA2 签名与响应验签、CNY 校验、部分退款
  `out_request_no`=refund_id、金额与外部单号回查、超时视为 unknown）——
  `app/domain/commercial/payment_gateways.py`。
- 状态机联动：退款成功→订单 refunded、订阅撤销/恢复、credit grant 扣减——
  `app/domain/commercial/mixins/_payment_mixin.py`。
- 幂等与并发：Idempotency-Key 重放返回既有退款、订单 FOR UPDATE 行锁、
  累计退款上限、退款窗口过期拒绝、已消耗 credit pack 拒退——
  `_payment_mixin.py` 与 `app/adapters/repositories/commercial_*`。
- 唯一执行入口：`POST /internal/service/payments/orders/{id}/refunds` 与
  `POST /internal/service/payments/refunds/{id}/mark-succeeded`（内部 token +
  幂等头）——`app/api/routes/service.py`。
- 测试：`tests/domain/test_payment_gateways.py`（真实网关 monkeypatch 单测）、
  `test_payment_service.py`、`test_subscription_commerce.py`（部分退款累计、
  试用退款恢复、窗口过期、已消耗拒退）、`tests/api/test_payment_routes.py`。

## 2. 缺口清单

| # | 缺口 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 退款回调入口 | 未实现 | `/open/payments/*` 无退款 notify 路由；`verify_payment_gateway_refund_callback` 已实现但无调用方；open-callback 契约本身未定义退款路径（契约级未定义） |
| 2 | 退款对账 | 未实现 | 无 `alipay.trade.fastpay.refund.query`/`trade.query`；`ops_cadence` 无网关对账任务；超时 unknown 的退款只能人工排查 |
| 3 | 失败终态 | 未实现 | `failed` 状态与 `failed_at` 无任何写入路径，无 mark-failed 路由/服务方法 |
| 4 | Portal 自助退款 | 未实现 | 无路由无按钮；terms 页指引用工单提交订单号 |
| 5 | Admin 运营退款入口 | 未实现 | admin 路由与前端均无退款操作入口（仅退款窗口等合规披露配置） |
| 6 | 沙箱/生产验证 | 未执行 | 真实网关仅有 monkeypatch 单测；[local-first-validation-stage-2026-09-21.md](local-first-validation-stage-2026-09-21.md) 明确暂缓且无执行证据 |
| 7 | 测试空白 | 部分 | 无幂等重放专项测试、无真实网关错误分支测试、无回调端到端（依赖缺口 1） |
| 8 | 订阅退款 credits 语义 | 未声明 | ai-credit 契约只覆盖 credit pack 退款；订阅套餐退款走订阅撤销/恢复、不写 ledger，契约未声明该语义 |

## 3. 与暂缓清单的关系

local-first 计划暂缓"真实支付宝收款、生产支付配置和退款操作"。收款已被
[payment-and-domestic-readiness-note-2026-09-22.md](payment-and-domestic-readiness-note-2026-09-22.md)
更新为"实测通过"；退款操作维持暂缓。本盘点不改变任何暂缓状态，只列清缺口。

## 4. 建议的后续任务拆分（不在本任务执行）

1. 契约先行：扩展 cloud-open-callback 边界文档，定义退款 notify 路径与失败
   终态语义（docs 任务）；
2. 实现层：退款回调路由 + mark-failed + 对账 cadence 任务（L2，需 M4 证据）；
3. 入口层：优先做 Admin 运营退款入口（经内部服务发起），Portal 自助退款
   涉及产品政策后置；
4. 验证层：沙箱全链路（下单→退款→回调→异常重放→对账）作为商业化
   closeout 的前置证据。

## 5. 证据状态

development lane、documentation-only、L0；全部结论来自静态阅读，证据路径
见上；不含任何凭据。
