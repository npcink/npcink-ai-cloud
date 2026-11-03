# 退款能力缺口盘点（2026-09-22）

Status: dated static inventory. 只读代码盘点与契约文档对照；无运行验证、无沙箱操作。行号会漂移，以文件与符号名为准。出处：[next-stage-plan-2026-09-22.md](next-stage-plan-2026-09-22.md) P1。

> **历史盘点提示（2026-11-02）**：本文保留 2026-09-22 的盘点背景，以下“缺口清单”已按当前代码重标状态。当前退款通知分发见 `app/api/routes/open.py`，Admin 入口见 `app/api/routes/commercial_payments_admin.py`，失败状态落库与回调处理见 `app/domain/commercial/mixins/_payment_mixin.py`，对应本地回归见 `tests/api/test_admin_payment_refunds.py`、`tests/api/test_open_payment_notify_routes.py` 和 `tests/domain/test_payment_service.py`。真实支付网关与生产交易仍未验证。

## 0. 摘要

真实退款（alipay.trade.refund）的网关调用、退款状态机、幂等与并发保护、
credits 回冲、Alipay 退款回调入口和内部 Admin 退款入口均已实现，并有本地
单元/领域/API 测试覆盖；Provider `refund.query` 对账适配器与有界
`ops_cadence` 任务已实现并有本地回归，但从未经过沙箱或生产验证。Portal
自助退款仍明确冻结；订阅退款的 credits 语义已写入活动契约。

## 1. 已实现（附证据路径）

- 数据模型：`payment_refunds`（状态 requested/unknown/succeeded/failed；网关可判定
  错误会写入 failed 与 failed_at）、`payment_events`（退款事件唯一键）、credit ledger 退款
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
- 执行入口：`POST /internal/service/payments/orders/{id}/refunds`、
  `POST /internal/service/payments/refunds/{id}/mark-succeeded`（内部 token +
  幂等头），以及按账户列出订单并发起全额退款的
  `POST /internal/service/admin/accounts/{account_id}/payment-orders/{order_id}/refunds`；
  Alipay 退款通知入口为 `POST /open/payments/alipay/notify`（启用支付配置后按
  退款字段分流）——`app/api/routes/service.py`、`app/api/routes/commercial_payments_admin.py`、
  `app/api/routes/open.py`。
- 测试：`tests/domain/test_payment_gateways.py`（真实网关 monkeypatch 单测）、
  `test_payment_service.py`、`test_subscription_commerce.py`（部分退款累计、
  试用退款恢复、窗口过期、已消耗拒退）、`tests/api/test_payment_routes.py`、
  `tests/api/test_open_payment_notify_routes.py`、`tests/api/test_admin_payment_refunds.py`。

## 2. 缺口清单

| # | 缺口 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 退款回调入口 | 已实现（Alipay） | `/open/payments/alipay/notify` 按退款字段调用 `process_payment_gateway_refund_callback`，完成签名、金额和幂等处理；WeChat 仍是预留未启用 |
| 2 | 退款对账 | 已实现（本地验证） | `PaymentGatewayProvider.query_refund` 使用稳定 `out_request_no` 调用 `alipay.trade.fastpay.refund.query`；`payment_refund_reconciliation` cadence 以 5 分钟起步指数退避、默认最多 5 次，耗尽保持 `unknown` 并转人工；尚无沙箱/生产证据 |
| 3 | 失败终态 | 已实现（网关错误路径） | `request_payment_refund` 将可判定网关错误写入 `failed`/`failed_at`，不可判定响应写入 `unknown`；没有独立的人工 mark-failed API |
| 4 | Portal 自助退款 | 未实现 | 无路由无按钮；terms 页指引用工单提交订单号 |
| 5 | Admin 运营退款入口 | 已实现（内部 API） | `POST /internal/service/admin/accounts/{account_id}/payment-orders/{order_id}/refunds` 支持全额退款、权限、幂等和阻断条件；是否提供 Portal 自助 UI 仍是缺口 |
| 6 | 沙箱/生产验证 | 未执行 | 真实网关仅有 monkeypatch 单测；[local-first-validation-stage-2026-09-21.md](local-first-validation-stage-2026-09-21.md) 明确暂缓且无执行证据 |
| 7 | 测试空白 | 部分 | 已有退款幂等、未知响应、金额校验、Alipay notify 路由和 Admin API 本地测试；仍无真实网关错误响应和沙箱端到端证据 |
| 8 | 订阅退款 credits 语义 | 已声明（本地回归） | 活动契约明确：订阅全额退款撤销对应订阅且不写 credit ledger adjustment；credit pack 退款按比例写负向 adjustment；部分订阅退款只保留支付证据，不自动减少 entitlement |

## 3. 与暂缓清单的关系

local-first 计划暂缓"真实支付宝收款、生产支付配置和退款操作"。收款已被
[payment-and-domestic-readiness-note-2026-09-22.md](payment-and-domestic-readiness-note-2026-09-22.md)
更新为"实测通过"；退款操作维持暂缓。本盘点不改变任何暂缓状态，只列清缺口。

## 4. 建议的后续任务拆分（不在本任务执行）

1. 契约先行：补充退款 notify、unknown/failed 终态和订阅 credits 语义的当前
   活跃契约，避免只依赖本历史盘点；
2. 实现层：已增加 Provider `refund.query` 适配器和 `ops_cadence` 对账任务，
   对 requested/unknown 退款形成有界、可审计的状态收敛；
3. 入口层：Portal 自助退款仍需产品政策与权限设计，当前 Admin 内部 API 不等同
   于客户自助入口；
4. 验证层：沙箱全链路（下单→退款→回调→异常重放→对账）作为商业化
   closeout 的前置证据。

## 5. 证据状态

原始 2026-09-22 盘点属于 development lane、documentation-only、L0；本次
2026-11-02 修订补充了当前代码与本地测试路径，但仍未执行沙箱、生产网关或
真实交易验证；不含任何凭据。
