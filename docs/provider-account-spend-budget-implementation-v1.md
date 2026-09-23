# Provider/account spend budget implementation v1

Status: active implementation note. This document records the runtime contract
implemented under ADR-055; it does not authorize a live provider call.

The `provider_account_spend_budget` service setting is the single pre-dispatch
fuse for hosted provider attempts. A paid provider must have both daily and
monthly limits before dispatch is allowed. Claims are keyed by the run,
provider, model, and retry count, and are stored separately for the UTC day and
UTC month. Replaying the same dispatch key returns the existing claims without
reserving spend twice. A provider timeout or unknown response reconciles against
the conservative reserved amount until an operator or provider query resolves
the actual charge.

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

The warning threshold is observable in logs and counter state. At 100% a new
claim fails with `provider.budget_exceeded` before the provider adapter is
called. The counters and claims are transactional and use row locks, so
concurrent requests cannot reserve beyond either limit. Usage reconciliation
releases the difference between the conservative reservation and the actual
cost; an unknown provider outcome deliberately keeps the reservation.

Verification is local-only: SQLite claim/replay/exhaustion tests cover the
state machine. No real payment, sandbox payment, provider budget, or production
deployment is part of this evidence.
