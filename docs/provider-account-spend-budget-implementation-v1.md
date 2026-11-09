# Provider/account spend budget implementation v1

Status: active implementation note. This document records the runtime contract
implemented under ADR-055; it does not authorize a live provider call.

## 操作者说明：AI 调用估算预算

配置入口：`/admin/service-settings?tab=provider-budget` → **AI 估算预算**。
页面内的 **估算预算怎么算** 提供同口径说明。

这里控制的是 Cloud 内部的估算预算，不是 API 厂商账户余额或实际账单。
普通文本调用使用当前模型单价和调用用量估算费用；不能连接厂商计费系统时，
无法确认真实扣费，预算上限也不能保证厂商实际扣费不超过同样的金额。
本设置不改变用户套餐价格、积分或 WordPress 的审批与写入。

1. **先设置上限**：为付费服务商同时填写每日、每月估算上限，金额单位为美元。
   点击“添加服务商”后，在弹窗中选择已连接的服务商、账户类型并填写上限。
   确认添加只会加入当前页面草稿，还须点击“保存估算预算”才会应用；取消、
   关闭或按 Esc 不添加空行，也不修改原有页面草稿。已有服务商继续在列表中编辑。
   启用预算保护后，每次调用前先估算并占用额度；预计会超过任一上限就拦截。
   日、月不是两份可以相加的余额，同一次调用同时计入两个周期。
2. **看提醒与占用**：提醒比例只影响接近上限的提示。每日 $0.50、每月 $2.50、
   比例 80% 时，今日占用到 $0.40 或本月到 $2.00 就提示；下一次估算仍在额度
   内时可以继续调用。预算保护关闭后，这里的上限不再拦截新调用。
3. **理解预算占用**：调用前预留，调用后有用量等费用依据时重新核算并替换预留，
   不重复累计。Token 数乘单价仍是估算，不能称为厂商确认扣费。超时或缺少完整
   费用依据时保留占用，不把未知当免费。当前投影只提供合计，不拆分成已完成、
   执行中或待确认金额；剩余额度是上限减合计占用，不是厂商余额。
4. **按需调整高级设置**：没有正数费用估算时，使用“无参考价格时，每次预留”。
   “未设置预算的服务商禁止调用”打开后，未配预算的服务商会被拦截；关闭后
   允许这些服务商绕过此预算检查，但已配置的付费服务商仍必须有完整日/月上限。
   两项策略都在预算保护启用时生效。
5. **核对周期**：按 UTC 日和自然月计算。北京时间每天 08:00 开始新的一天，
   每月 1 日 08:00 开始新的一月；修改上限不会清空当前周期的占用。

模型测试中只读的外部参考价格估算不因此变成运行时预算或用户计费依据；
本次仅调整配置与说明呈现，不新增价格表、厂商账单同步或预算计算规则。

## Runtime contract

The `provider_account_spend_budget` service setting is the single pre-dispatch
fuse for hosted provider attempts. A paid provider must have both daily and
monthly limits before dispatch is allowed. Claims are keyed by the run,
provider, model, and retry count, and are stored separately for the UTC day and
UTC month. Replaying the same dispatch key returns the existing claims without
reserving spend twice. A provider timeout or unknown response retains the
conservative reserved amount. This implementation does not provide automated supplier-bill queries
or operator reconciliation of those unknown charges.

Example configuration:

```json
{
  "warning_ratio": 0.8,
  "conservative_unpriced_cost_usd": 0.05,
  "require_provider_configuration": true,
  "providers": {
    "openai": {
      "account_class": "paid",
      "daily_usd": 5.0,
      "monthly_usd": 100.0
    }
  }
}
```

The warning threshold is observable in logs and counter state. A new claim
that would exceed either limit fails with `provider.budget_exceeded` before
the provider adapter is called. The counters and claims are transactional and use row locks, so
concurrent requests cannot reserve beyond either limit. Usage reconciliation
replaces the reservation with the adapter's usable cost value. That value can be usage multiplied by configured model rates; the
internal `actual_cost_usd` name is not evidence of a supplier-confirmed charge.
The replacement can raise or lower occupancy. An unknown provider outcome
deliberately keeps the reservation. The pre-dispatch estimate is not a
guarantee about the supplier's final bill or a strict post-reconciliation cap.

Verification is local-only: SQLite claim/replay/exhaustion tests cover the
state machine. No real payment, sandbox payment, provider budget, or production
deployment is part of this evidence.
