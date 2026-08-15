# Real Editor Cohort Operations v1

Status: active preparation and observation runbook.

Purpose: prepare and run bounded editor-assist observation across independent
Local WordPress sites without turning Cloud telemetry into content analytics,
WordPress approval truth, or an automatic product-mutation loop. The runbook
supports both a technical-monitoring-only mode and a separately declared human
value cohort; the two evidence modes must never be conflated.

This runbook authorizes no production deployment. A real Provider dispatch
also requires an open shared Provider-call ledger and one successful claim
immediately before that dispatch.

## 1. Intended Outcome

Use at least `2` independent WordPress sites to exercise:

- title generation;
- content summary;
- selected-text rewrite.

The session declares one evidence mode before any real dispatch:

- `technical_monitoring_only`: prove instrumentation, Provider compatibility,
  budget, write boundaries, metadata-only collection, and cleanup; no human
  edit-burden or value conclusion is required or inferred;
- `human_value_cohort`: use `2-3` consenting editors and collect only the
  bounded human observation fields in Section 6.

A human-value cohort must end with exactly one operator decision:

- `go`: proceed to a separately authorized controlled production validation;
- `modify`: correct one named seam and repeat only the affected evidence;
- `hold`: the sample is insufficient, so repeat at the same bounded scale;
- `stop`: value is weak or risk, support burden, or cost is disproportionate.

`go` does not mean GA. A cohort below 50 complete quality sessions remains in
the `validation` sample stage and cannot support a broad product-benefit claim.
A technical-monitoring-only run may conclude only `continue`, `modify`,
`hold`, or `stop`; it cannot produce `go` or a user-value claim.

## 2. Fixed Scope And Budget

Use neutral site aliases in observation records:

| Alias | Local site | Purpose |
| --- | --- | --- |
| `site_a` | `https://magick-ai.local` | existing technical-acceptance site |
| `site_b` | `http://magick-toolbox.local` | independent second-site evidence |

Do not upload or record editor names, email addresses, WordPress user IDs, post
IDs, article titles, prompts, generated text, post content, credentials, or
headers. If an operator needs to distinguish editors in a local worksheet, use
ephemeral aliases such as `editor_1`, `editor_2`, and `editor_3`.

Read the current entitlement before relying on package capacity. Do not retain
an obsolete assumption such as “Free allows only one active site” after the
service contract changes. The 2026-08-15 technical receipt observed `2 / 3`
active sites and `3 / 9` bound sites; this is dated evidence, not a permanent
pricing or entitlement promise.

The maximum Provider budget for the named experiment is 30 calls. Reserve it
across the two sites and three tasks:

```bash
pnpm run provider:call-ledger init \
  --experiment-id editor-cohort-20260815 \
  --max-calls 30 \
  --item site-a-title=5 \
  --item site-a-summary=5 \
  --item site-a-rewrite=5 \
  --item site-b-title=5 \
  --item site-b-summary=5 \
  --item site-b-rewrite=5
```

Immediately before a real dispatch, claim one call with a unique opaque
dispatch ID. A failed claim forbids the Provider call. Claimed calls are never
refunded merely because execution stopped before dispatch.

The Addon browser smoke accepts one strict
`WP_AI_TEXT_PROVIDER_LEDGER_PLAN` JSON object containing only:

- `experiment_id`;
- an absolute `ledger_repo` path;
- unique `item_id` and `dispatch_id` pairs for `title_generation`,
  `content_summary`, and `content_rewrite`.

With `WP_AI_TEXT_VALIDATE_PROVIDER_QUALITY=1`, preflight validates monitoring,
the open experiment, reserved items, dispatch conflicts, and remaining item
capacity without creating a draft, starting a browser, claiming a call, or
invoking a Provider. During the full smoke, each claim occurs immediately
before its matching UI dispatch. Only exit status zero plus
`provider_dispatch_allowed=true` authorizes the click.

## 3. Automatic Collection Boundary

Automatic collection reuses the existing opt-in path:

```text
WordPress administrator enables metadata-only monitoring
  -> Addon records bounded local editor-assist correlation
  -> Addon observability buffer flushes signed event batches
  -> Cloud stores metadata-only plugin events
  -> Cloud read model aggregates quality sessions
  -> existing ops cadence evaluates a seven-day summary once per day
```

The automatic path collects only the existing bounded fields, including:

- `quality_session_id`, `task_key`, and `generation_sequence`;
- site-keyed `object_scope_hash` and `actor_scope_hash`;
- Cloud `correlation_id` / run identity;
- generation completed or repeated;
- exact save, unmatched save, publish, or expiry outcome;
- outcome confidence, save kind, and coarse time-to-outcome bucket;
- generation latency and aggregate quality rates;
- the explicit WordPress-local monitoring-state boolean projection.

The path must keep `content_storage=omitted_metadata_only`. It must not collect
prompts, generated output, article content, raw request/response bodies,
WordPress post/user IDs, media bytes, credentials, cookies, nonces,
authorization headers, database names, table names, or filesystem paths.

Cloud quality summaries are read-only evidence. They must not automatically
change a prompt, model, router, preset, workflow, WordPress object, approval,
or publication state.

An operator-local scheduled summary may read the ledger, observation receipt,
Local WordPress state, and Cloud seven-day aggregates. It is a convenience
reader, not repository truth, a second scheduler, or permission to mutate
monitoring, sites, WordPress content, M4, or production.

## 4. Local-First Verification Matrix

Complete the layers in order. A later layer must not be used to hide a failure
in an earlier one.

### Layer A: source and deterministic contracts

- Cloud: `pnpm run check:editor-assist-quality`.
- Cloud: `bash scripts/check-feedback-status.sh`.
- Cloud: focused Provider-call ledger tests.
- Addon: focused editor-assist and observability behavior tests.
- Addon: static boundary contracts.
- Confirm fixtures contain no prohibited content or identity fields.

This layer makes no Provider call and needs no WordPress, M4, or production
mutation.

### Layer B: disposable local integration

- Run the Addon Playground smoke for bootstrap and compatibility.
- Use Fake Provider mode to validate title, summary, and rewrite without paid
  calls.
- Enable the quality-validation mode and require complete generated/outcome
  sessions with no pending records.
- Inject timeout, safe error, retry, regenerate, disabled-monitoring, corrupt
  response, and interrupted-flush paths.
- Confirm buffer bounds, idempotent upload, retry behavior, expiry, cleanup,
  and metadata-only payloads.

Local Docker may provide disposable dependencies or isolated fixtures. It must
not be reported as M4, production, or accepted runtime evidence, and it must not
silently replace the repository's M4 Cloud integration lane.

The deterministic checkpoint must also reject a malformed ledger plan before
fixture creation. Fake Provider mode remains independent from the real
Provider ledger and must not claim paid-call budget.

### Layer C: two Local WordPress consumers

For each site, verify independently:

- WordPress, WordPress AI, and Addon versions;
- the exact mounted plugin path and revision;
- verified connector state and intended Cloud target;
- explicit metadata-only monitoring consent;
- title, summary, and rewrite feature readiness;
- monitoring-state projection delivery;
- generation and outcome events reach Cloud;
- zero WordPress writes before explicit Save/Update;
- exactly the intended write and revision change after explicit save;
- non-target blocks remain unchanged;
- no cross-site event, run, credential, or result leakage;
- cleanup removes only disposable posts, sessions, options, and fixtures.

Validate two different evidence seams explicitly:

1. local event completeness before upload: six events, three sessions, zero
   pending records, expected per-task outcomes, and zero prohibited fields;
2. Cloud ingestion after the bounded flush: accepted/stored/duplicate counts
   and a zero or explained local buffer.

Do not infer Cloud storage merely because the local buffer was correct, and do
not infer local classification correctness merely because Cloud accepted a
batch.

Use Fake Provider first. A site is not ready for the real cohort until its Fake
Provider pass produces one complete quality session for each task and leaves
the pending count at zero.

### Layer D: bounded real Provider confirmation

Use the real Provider only for facts Fake Provider cannot prove:

- actual Provider/model wire compatibility;
- real response semantic validity;
- real latency, tokens, AI credits, fallback, retry, and error evidence;
- human adoption and edit burden.

Require `WP_AI_TEXT_VALIDATE_PROVIDER_QUALITY=1` for the automated Provider
browser acceptance. It must fail before draft creation and Provider dispatch
unless verified metadata-only monitoring is already enabled.

Real Cloud run IDs are opaque and are not required to contain a local fixture
token. Correlate current-post quality events through the existing site-keyed
`object_scope_hash(post_id|task_key)` and task key. Never add a raw post ID or
generated text to the Cloud event merely to simplify a test.

If Provider execution, editor adoption, explicit save, credit evidence, and
cleanup succeed but a later verification-only assertion fails, preserve the
paid-call evidence and diagnose the assertion. Do not replay the Provider calls
only to make the harness green when the same outputs and metadata can answer
the failed risk question.

## 5. Readiness Gate Before Real Use

Both sites must satisfy all conditions:

- connector verified;
- metadata-only monitoring explicitly enabled by the local administrator;
- current Addon includes the Provider-quality fail-closed gate;
- title, summary, and rewrite independently enabled;
- Cloud monitoring-state projection is fresh;
- Addon buffer and quality pending counts are zero;
- Fake Provider quality validation passed for all three tasks;
- no unexpected WordPress write occurred;
- the shared ledger is open with 30 or fewer remaining calls;
- a foreground, disposable connector path is available when using M4;
- `cohort_mode` is explicitly `technical_monitoring_only` or
  `human_value_cohort`;
- the operator has identified `2-3` consenting editors only when
  `human_value_cohort` is selected.

Do not create a permanent tunnel daemon. For M4-backed Local WordPress use,
keep the governed foreground tunnel open only for the observation window.

## 6. Observation Record

Cloud and Addon automatically provide technical and adoption metadata. In
`technical_monitoring_only` mode, record
`classification_status=not_collected_monitoring_only` and do not fabricate
edit burden, support intervention, or reason codes. In `human_value_cohort`
mode, the operator may record only the following additional bounded human
observations:

| Field | Allowed values |
| --- | --- |
| `editor_alias` | `editor_1` to `editor_3` |
| `site_alias` | `site_a` or `site_b` |
| `task_key` | title, summary, or rewrite |
| `dispatch_id` | opaque ledger dispatch identifier |
| `task_completed` | true or false |
| `edit_burden` | none, light, material, or abandoned |
| `support_intervention` | none, setup, retry, explanation, or blocked |
| `operator_reason_code` | bounded non-content reason code |

Do not write free-form article or suggestion text into the observation record.
If qualitative feedback is needed, translate it into a reviewed bounded reason
code before it enters shared evidence.

## 7. Read-Only Status And Reporting

Use a seven-day window during the cohort:

```bash
python -m app.dev.feedback_status --window-hours 168
```

On a deployed Cloud host, use the governed container wrapper:

```bash
bash deploy/remote-feedback-status.sh --window-hours 168
```

Inspect editor-assist detail through the existing read-only internal endpoint:

```text
GET /internal/service/admin/editor-assist-quality?window_hours=168
```

Keep these sample units separate:

- Provider calls;
- Cloud runs;
- plugin observability events;
- editor-assist quality sessions;
- human task observations.

Never add them into one misleading total.

## 8. Stop Conditions

Stop immediately and preserve evidence if any of these occurs:

- a WordPress write before explicit save;
- cross-site leakage;
- a duplicate side effect or unexplained Provider call;
- prohibited content, identity, credential, or header retention;
- monitoring reported as enabled without WordPress-local consent;
- ledger bypass, corruption, exhaustion, or aggregate uncertainty;
- repeated Provider failure with the same signature after the bounded retry
  allowance;
- cleanup cannot confirm removal of disposable trial state.

Do not continue merely to fill the sample or obtain a green result.

## 9. Decision Receipt

At cohort close, record:

- exact Cloud and Addon revisions;
- site and editor alias counts;
- Provider ledger claimed/remaining/closed state;
- runs, calls, retries, fallbacks, errors, tokens, AI credits, and cost mode;
- complete quality sessions by task and site;
- exact, unmatched, published, expired, and repeated outcomes;
- task completion and the declared observation policy;
- edit burden and support intervention counts only when human observations
  were actually collected;
- WordPress pre-save and explicit-save write evidence;
- privacy, budget, duplicate, and cross-site invariant results;
- exactly one allowed decision for the declared evidence mode;
- one named next action and explicit non-goals.

If trusted dated pricing is unavailable, preserve `cost_estimate_mode=unpriced`
and report monetary cost as unknown. `cost=0` in that mode must not be
interpreted as free execution.

## 10. Closeout And Stable Local Use

At the end of the declared observation window:

1. reconcile every planned dispatch with the shared ledger;
2. close the ledger with a bounded reason when no further paid calls are
   authorized; leaving unused calls in an open experiment is not closeout;
3. verify observability buffer and quality pending counts are zero or have an
   explained bounded retry state;
4. preserve the dated technical receipt and measured/unmeasured fields;
5. confirm the Addon change is merged and required checks passed;
6. repoint long-lived Local sites from an auxiliary topic worktree to a clean,
   stable `master` checkout only during a planned, non-disruptive maintenance
   step;
7. unlock/remove an auxiliary worktree only after it is clean, merged, no
   longer mounted, and no longer needed for rollback.

Content equality with merged `master` is useful evidence but does not turn a
topic branch or locked auxiliary worktree into the stable operations checkout.

## 11. Product Boundary

WordPress remains monitoring-consent, editor review, adoption, approval, and
final-write truth. The Addon owns only bounded local correlation and signed
transport. Cloud owns hosted execution, runtime/usage evidence, metadata-only
event storage, read-only aggregation, and daily detection.

This runbook adds no Cloud control plane, prompt/router/preset editor,
workflow registry, scheduler truth, automatic optimization, or WordPress write
owner.
