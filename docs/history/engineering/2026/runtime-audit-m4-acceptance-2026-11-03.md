# Runtime audit M4 acceptance — 2026-11-03

Status: dated runtime evidence for PR #1358, not production or human acceptance.

## Scope and authorization

The operator requested M4 acceptance and real-gateway verification, while reserving
production deployment. After the payment preflight and first read-only probe,
the operator said: “支付相关的功能我生产环境再做”. Payment validation stopped;
no further sandbox prerequisites or production transaction actions are implied.
Portal self-refund remains frozen. No application source, payment configuration,
prices, entitlements, production deployment or external WordPress state changed.

## M4 acceptance

- Merged PR: [#1358](https://github.com/npcink/npcink-ai-cloud/pull/1358).
- Source: `b15ffe6dc1af5f7767efc9e0376a9a1f81e08900`, clean `master` from the
  stable operations checkout. Prior accepted source was `a831284d`, PR #1357.
- Route: office LAN, pinned for status, promotion, focused tests and real local
  Provider execution. Transfer mode: direct. No route fallback was needed.
- `pnpm run m4:preview:promote -- --pr 1358`: exit 0, 26.92 seconds. No image
  rebuild was needed; API was recreated and three workers restarted. Unchanged
  migration source was skipped only after live Alembic head verification.
- Final status: `acceptance_state=accepted`, `promotion_pr=1358`,
  `source_branch=master`, `source_dirty=false`, full revision as above.
- Actual API `/health/live`: HTTP 200, `environment=development`,
  `release=m4-preview`, `source_revision=b15ffe6dc1af`, `source_dirty=false`.
  Proxy `/`: HTTP 200. API-direct `/` is HTTP 404 and is not the frontend route.
- Alembic: `20261024_0091 (head)`. All eight managed services were running;
  five healthchecked services were healthy. Workers have no Docker healthcheck.
  Restart policy remained `unless-stopped`; published proxy/Postgres/Redis ports
  remained loopback-only. Managed Ollama remained running with the same PID.
- Reconciliation runtime settings: interval 300 seconds, batch 25, maximum 5
  attempts. No refund rows were present; live settlement convergence was not exercised.

Focused test command (Python 3.14.8 container):

```bash
pnpm run m4:preview:test -- --focused \
  tests/domain/test_payment_gateways.py \
  tests/domain/test_payment_service.py \
  tests/domain/test_runtime_run_lifecycle.py \
  tests/domain/test_runtime_provider_transactions.py \
  tests/workers/test_ops_cadence_worker.py \
  tests/domain/test_callback_security.py \
  tests/domain/test_openai_provider.py \
  tests/api/test_admin_payment_refunds.py \
  tests/api/test_open_payment_notify_routes.py
```

Result: **232 passed**, one Starlette/httpx deprecation warning, pytest 12.30
seconds, command 15.42 seconds. Gateway fixtures in this set do not become
real-payment evidence merely because they ran on M4.

## Real Provider evidence

The enabled DB-managed local Ollama connection was loaded through
`build_provider_adapter_from_connection`; its `host.docker.internal` endpoint
was checked before one native `ollama_chat` execution with `qwen3.5:9b`.
The public, synthetic input requested a short title for balcony-plant watering
and root-rot prevention. Application adapter result:

- output: `阳台盆栽浇水技巧：防积水烂根指南`;
- elapsed 12.86 seconds; input/output tokens 51/11; `finish_reason=stop`;
- one real local model execution, no mock transport, zero paid Provider calls,
  zero application DB writes.

This verifies the adapter's real local Provider success path. It does not prove
paid hosted API compatibility, WordPress adoption, or independent human quality.
Malformed/timeout/contract failures remain covered by the separate regression set.

## Payment evidence and remaining boundary

M4 had an enabled, configured Alipay setting resolving to the official production
gateway, not a sandbox; five payment orders and zero refund rows were present.
No local sandbox credential file or sandbox environment variable was found in
the inspected task locations. Credentials were neither exported nor printed.

One read-only `alipay.trade.fastpay.refund.query` used synthetic, unpersisted
order/refund references. The real HTTP response lacked the signature required
by `_parse_alipay_signed_response`, producing
`service.alipay_response_signature_missing`. The probe stopped before the
planned adapter follow-up request. No payment/refund creation, callback replay,
settlement, entitlement or ledger write occurred. No root cause for the unsigned
response was established; it is neither a confirmed business rejection nor a
successful refund query.

The operator then deferred payment functionality validation to their production
work. Payment success, signed real refund results, callback/reconciliation
convergence, partial-refund balances and final entitlement effects remain
unverified. Production deployment remains separately operator-owned.

## Evidence retention and reuse

Sanitized raw command logs and the two one-shot probe sources are retained
outside Git in the local task receipt archive under
`.git/task-closeouts/runtime-audit-m4-acceptance-20261103/`. They contain no
credential values. The versioned summary here is the cross-session entry point;
local files are not promised to exist in another clone.

For later acceptance, compare running `/health/live` identity with status and
merged source; classify the actual Provider and payment environment before
calling it; preserve failed probes. A healthy container or signed fixture does
not establish signed real settlement. Do not rerun a paid matrix to manufacture
evidence or execute payments after the operator defers them.

M4_OBSERVATION_RECEIPT date=2026-11-03; route=LAN/direct; sync=not measured; focused=15.42s; promotion=26.92s; operations=1 promotion,0 deploy; stable_502=not measured; m4_only=none observed; coordination=none observed
