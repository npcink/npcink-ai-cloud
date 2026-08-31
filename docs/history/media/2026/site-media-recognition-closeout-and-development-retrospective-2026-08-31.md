# Site Media Recognition Closeout and Development Retrospective - 2026-08-31

Status: time-bounded Cloud, Addon, M4, and local WordPress evidence; not current
runtime, production, cost, or customer-value authority.

Current authority:
[Site Media Recommendation Engineering Standard](../../../site-media-recommendation-engineering-standard-v1.md),
[Cloud Image Context Evidence Runtime Contract](../../../cloud-image-context-evidence-runtime-contract-v1.md),
and [Site Knowledge Runtime Contract](../../../site-knowledge-runtime-contract-v1.md).

This record closes the site-media recognition preparation work discussed and
implemented through 2026-08-31. It records what was built, what was proven on
`magick-ai.local`, and which engineering rules were extracted into the active
standard. It does not authorize production deployment, Provider spending,
WordPress writes, a cross-modal retrieval profile, or a permanent Cloud media
library.

## 1. Product Outcome

The target experience was deliberately small:

```text
Click Continue recognizing remaining images once
  -> WordPress creates or resumes one site plan
  -> submit one bounded Cloud batch
  -> project the completed result exactly once
  -> automatically submit the next bounded batch
  -> pause at capacity, daily limit, or execution window
  -> resume when eligible
  -> finish without keeping the browser open
```

A request to recognize millions of images means a logical plan ceiling, not a
single request body or Cloud `run_id`. Small sequential batches remain the
reliability boundary. The ordinary user does not select a model, tune a vector
database, understand a cursor, or repeatedly press a batch button.

## 2. Final Ownership Boundary

The implementation retained three separate owners:

| Owner | Canonical responsibility | Explicit non-responsibility |
| --- | --- | --- |
| WordPress and Toolbox | attachment inventory, permissions, fingerprints, deterministic screening, plan cursor, local writes | Provider execution, Cloud usage truth, permanent model routing |
| Cloud | verified `vision.ai` execution, run records, artifacts, Provider calls, package admission, daily usage, metering, terminal failure evidence | crawling WordPress, becoming an attachment registry, final WordPress writes |
| Cloud Addon | one bounded start/retry action, status projection, localized progress and diagnostics | browser queue loop, duplicate metering, second model selector, second scheduler |

The work reused `image_context_evidence.v1`, Cloud `run_records`, existing
Provider adapters, WordPress Cron, and the existing media-index projection. It
did not add another task queue, model registry, vector database, Cloud crawler,
or WordPress control plane.

## 3. Plan and Batch Contract

One active plan is allowed per site. A plan retains its inventory cursor,
counts, current Cloud run, state, next eligible time, and pause reason. One
active Cloud run is allowed per plan.

The durable rules are:

1. Repeated button clicks resume the active plan instead of creating another
   logical job.
2. The preceding Cloud run must be terminal before the next batch is created.
3. Result projection, processed count, and cursor advancement happen exactly
   once for a terminal batch.
4. Network retries, repeated Cron delivery, status refresh, and repeated
   callback observation reuse stable identities and do not duplicate charging.
5. A failed batch is retried as that batch; it does not silently skip images.
6. Browser JavaScript is not the continuation engine. WordPress Cron continues
   after the administration page closes.
7. Pause, cancellation, terminal error, and completion prevent further batch
   creation.

This contract resolved the earlier symptom where a user action appeared to
process only 10 images. The small batch was intentional; the missing behavior
was durable continuation and clear status, not a need to submit a huge batch.

## 4. Capacity, Daily Limit, and Batch Size

Three independent limits were separated:

| Limit | Question answered | User-facing meaning |
| --- | --- | --- |
| `media_images` package capacity | How many recognized image projections may the package retain? | Image recognition limit and usage ratio |
| daily image limit | How much new recognition work may run in one system-timezone day? | Today's pacing or why work waits until tomorrow |
| per-batch limit | How much work may one Cloud run safely contain? | Technical detail, normally hidden |

Cloud performs capacity admission before a paid Provider call. A mixed batch
may be partially admitted so useful work proceeds up to the available limit.
Refreshing an existing projection at full package capacity remains possible
when it replaces the current evidence and does not consume another capacity
slot.

The daily limit does not describe the package size. Its purpose is to bound
cost and processing pace, coordinate concurrent sites against one Cloud truth,
and support a predictable next eligible time. The package capacity determines
how much media can ultimately remain recognized.

## 5. Progress and Interface Semantics

The final display uses separate denominators:

```text
Recognition completion = processed eligible images / eligible inventory
Package capacity = recognized image projections / media_images limit
Today's execution = admitted images today / daily image limit
```

Recognition completion is the primary plan progress. Package capacity answers
whether more images can be retained. Daily execution is detail or waiting
context. A single progress bar must not alternate among these meanings.

The Addon surface was simplified to:

- localized Chinese status and actionable error text;
- one primary media action instead of model and runtime controls;
- recognition details collapsed by default;
- speed, completion, remaining capacity, and estimated completion shown only
  when the underlying data supports them;
- explicit waiting, retry, paused, complete, and administrator-action states;
- no raw `Finished`, Provider error, run identifier, cursor, or model profile
  in the ordinary first layer.

The ordinary post-completion action became `检查新增图片`. Technical evidence
remains available in the detail disclosure without competing with the user
job.

## 6. Privacy and Observability

Lifecycle telemetry is metadata-only. Useful events include plan started,
batch admitted, batch completed, waiting, resumed, failed, and completed, with
bounded counts, latency, version, and reason codes.

Telemetry must not contain image bytes, image URLs, prompts, full model output,
attachment IDs, article IDs, user IDs, credentials, request headers, or raw
Provider errors. Runtime artifacts follow their own short retention and
cleanup contract; analytics is not an alternate content-retention path.

## 7. Delivery and Acceptance Evidence

The protected delivery chain was:

| Repository | PR | Scope | Merge revision |
| --- | --- | --- | --- |
| `npcink-ai-cloud` | [#878](https://github.com/npcink/npcink-ai-cloud/pull/878) | media-image entitlement, admission, runtime policy, and Cloud projections | `1ae5f66d82a760400dd3d74f72860977aa9c9d45` |
| `npcink-cloud-addon` | [#129](https://github.com/npcink/npcink-cloud-addon/pull/129) | one-click continuation, localized capacity/progress UI, and responsive layout | `36eb5ac0a18359282efd0d9c6859f282de5923ca` |
| `npcink-ai-cloud` | [#879](https://github.com/npcink/npcink-ai-cloud/pull/879) | deterministic M4 tunnel readiness test | `739434af80b51901557bc0fc56daee9caa76de2a` |

GitHub required checks passed for the exact final Cloud revision
`739434af80b51901557bc0fc56daee9caa76de2a`, including backend, frontend,
secret scan, and Python and JavaScript/TypeScript analysis.

Clean-`master` M4 acceptance for PR #878 recorded:

```text
acceptance_state=accepted
promotion_pr=878
source_revision=1ae5f66d82a760400dd3d74f72860977aa9c9d45
source_branch=master
source_dirty=false
```

The local WordPress acceptance at `magick-ai.local` recorded:

```text
inventory estimate = 71
locally filtered = 1
eligible and processed = 70 / 70
plan state = complete
current_run_id = empty
next_eligible_at = null
pause_reason = null
continuation Cron = absent
```

The Overview displayed package capacity as `36 / 100` with `36%` remaining.
Site Knowledge displayed recognition completion as `70 / 70` and `100%`.
Chinese localization, the default-collapsed detail, the single primary action,
and a 390-pixel viewport without horizontal overflow were verified in the
logged-in browser. No browser console error or warning was observed.

These facts prove the named merged revisions, accepted M4 candidate, and local
WordPress behavior at the observation time. They do not prove production
deployment, future runtime health, Provider price behavior, recommendation
quality, or external customer value.

## 8. Corrections and Development Lessons

### Automate intent, not payload size

The product promise is one user decision, not one giant request. A persisted
plan plus bounded sequential batches is cheaper to recover, easier to meter,
and safer to retry than a run containing the whole media library.

### Keep one truth for each fact

WordPress knows what media exists and which item comes next. Cloud knows which
run executed, which Provider was called, and what capacity or usage was
consumed. The Addon projects both. Duplicating any of these truths created the
earlier contradictory counters and status labels.

### A refresh is not a submission

Refreshing the screen reads current progress. Starting or retrying work is an
explicit mutation. Combining them made status inspection capable of creating
Cloud work and obscured the source of duplicate runs.

### Waiting is a first-class state

A count can remain unchanged while a plan is healthy but queued for its
execution window or daily reset. The UI must name the reason and next eligible
time. Showing only `正在运行` while no Provider call can occur is inaccurate.

### Natural time must be tested naturally

The final off-peak and next-day checks did not manually advance Cron or press
the action repeatedly. Natural scheduling evidence is necessary because
manual execution can prove the handler while hiding a broken wake-up path.

### Idempotency spans systems

Provider calls, usage events, Cloud terminal projection, WordPress counters,
and the inventory cursor must share stable identities. Testing only one table
cannot prove that a retried distributed batch is charged and counted once.

### Deterministic tests constrain semantic order only

The M4 tunnel readiness test initially assumed a background process event
would appear in one incidental order. Concurrent startup does not guarantee
that order. The corrected test synchronizes the readiness contract and avoids
asserting unrelated scheduling order.

### Task-clean and globally clean are different claims

The media-recognition task worktrees, branches, temporary PR bodies, and local
tunnel were removed after their deliverables merged. Other locked or dirty
worktrees with separate owners were retained. Cleanup must be scoped by
ownership and evidence; a globally dirty repository is not permission to
delete unrelated development.

## 9. Scale and Quality Follow-up

The reliable continuation mechanism should be validated progressively at
approximately 1,000, 10,000, and 100,000 eligible images before evaluating a
million-scale or 10-million logical plan. Each scale should measure cursor
accuracy, duplicate recognition, retry isolation, database pressure, Provider
cost, throughput, and completion time.

This closeout proves preparation coverage, not recommendation relevance. The
next recommendation-quality phase still needs a fixed corpus and real editor
feedback to compare metadata/structured-evidence retrieval with a compatible
cross-modal or hybrid candidate. No new embedding profile or vector database
is authorized without that evidence and the required contract decision.

## 10. Closeout Boundary

At closeout, the media plan was complete and no continuation Cron or current
Cloud run remained for the observed site. The implementation and this record
do not authorize production deployment. Current runtime state, package values,
worktree inventory, Provider availability, and open pull requests must always
be re-read before future action.
