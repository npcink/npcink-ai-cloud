# Real Editor Cohort Operations v1

Status: active preparation and observation runbook.

Purpose: prepare and run the first bounded real-editor observation across two
independent Local WordPress sites without turning Cloud telemetry into content
analytics, WordPress approval truth, or an automatic product-mutation loop.

This runbook authorizes no production deployment. A real Provider dispatch
also requires an open shared Provider-call ledger and one successful claim
immediately before that dispatch.

## 1. Intended Outcome

Use `2-3` consenting editors across at least `2` independent WordPress sites to
exercise:

- title generation;
- content summary;
- selected-text rewrite.

The cohort must end with exactly one operator decision:

- `go`: proceed to a separately authorized controlled production validation;
- `modify`: correct one named seam and repeat only the affected evidence;
- `hold`: the sample is insufficient, so repeat at the same bounded scale;
- `stop`: value is weak or risk, support burden, or cost is disproportionate.

`go` does not mean GA. A cohort below 50 complete quality sessions remains in
the `validation` sample stage and cannot support a broad product-benefit claim.

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

The maximum Provider budget is 30 calls. Reserve it across the two sites and
three tasks:

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
- the operator has identified 2-3 consenting editors.

Do not create a permanent tunnel daemon. For M4-backed Local WordPress use,
keep the governed foreground tunnel open only for the observation window.

## 6. Observation Record

Cloud and Addon automatically provide technical and adoption metadata. The
operator records only the following additional bounded human observations:

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
- task completion, edit burden, and support intervention counts;
- WordPress pre-save and explicit-save write evidence;
- privacy, budget, duplicate, and cross-site invariant results;
- exactly one `go`, `modify`, `hold`, or `stop` decision;
- one named next action and explicit non-goals.

If trusted dated pricing is unavailable, preserve `cost_estimate_mode=unpriced`
and report monetary cost as unknown. `cost=0` in that mode must not be
interpreted as free execution.

## 10. Product Boundary

WordPress remains monitoring-consent, editor review, adoption, approval, and
final-write truth. The Addon owns only bounded local correlation and signed
transport. Cloud owns hosted execution, runtime/usage evidence, metadata-only
event storage, read-only aggregation, and daily detection.

This runbook adds no Cloud control plane, prompt/router/preset editor,
workflow registry, scheduler truth, automatic optimization, or WordPress write
owner.
