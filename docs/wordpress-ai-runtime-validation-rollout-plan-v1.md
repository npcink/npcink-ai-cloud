# WordPress AI Runtime Validation Rollout Plan v1

Status: active development plan. Date: 2026-09-20. The Responses boundary is
governed by [ADR-054](decisions/054-responses-output-boundary-and-no-silent-downgrade.md).

Current closeout status is recorded in the
[2026-09-21 evidence and repository audit](history/wordpress-ai-closeout-audit-2026-09-21.md).
The execution receipt below preserves earlier investigation checkpoints;
it is not proof that all natural-traffic, semantic-review, or cleanup criteria
have graduated. Cloud #973 is merged and M4 accepted; Addon #154 is merged.

## Objective

Validate the existing official WordPress AI surfaces as natural traffic for
Npcink Cloud Runtime, routing, provider execution, and metadata-only quality
evidence. This rollout does not add a new AI product surface. WordPress keeps
permissions, review, revisions, final writes, and publication; Cloud keeps
runtime execution, routing evidence, provider calls, usage, health, and
read-only quality projections.

The end-to-end chain to prove is:

```text
official WordPress AI action
  -> Addon compatibility boundary
  -> Cloud Runtime run
  -> routing decision and provider call
  -> suggestion presented locally
  -> local save or no-save evidence
  -> generation-level attribution to the Cloud run
```

## Problems this plan resolves

| Problem | Consequence if left unresolved | Resolution |
| --- | --- | --- |
| A user generation and a Cloud run are treated as one thing | retries and fallback inflate denominators and make adoption rates unreliable | `quality_session_id` groups the user session, `generation_id` identifies one presented result, `correlation_id` carries the Cloud `run_id`, and provider-call records remain Cloud-owned attempts |
| A later regeneration can overwrite the first result's attribution | the system cannot explain which result was adopted | emit `presented`, `superseded`, `repeated`, and outcome events per generation |
| Save evidence is confused with a quality score | an inferred adoption claim becomes false product truth | retain atomic evidence type and lifecycle state; do not upload prompt, output, post, or user content |
| Client telemetry can drift from Cloud provider facts | provider, model, profile, cost, and fallback reports disagree | join outcome events to Cloud-owned run and provider-call records |
| Routing changes cannot be explained later | a quality change cannot be attributed to profile or router changes | persist router version, profile revision, selection policy, and candidate order in the run policy snapshot |
| Official WordPress AI is an experimental upstream | plugin updates can silently break the bridge | keep the Addon compatibility boundary and run a version matrix with stable and warning lanes |
| Early samples are biased and small | automatic optimization creates false conclusions | observe first, explain second, manually adjust routing, and defer automatic optimization |

## Phase 0 — Contract freeze

**Goal:** make the measurement vocabulary unambiguous before collecting more
traffic.

Decisions:

- `quality_session_id` is the short user interaction window.
- `generation_id` is one presented generation inside that session.
- `run_id` is the Cloud logical execution and is carried as `correlation_id`.
- A provider retry or fallback remains an internal Cloud provider-call attempt;
  no new Addon attempt identifier is introduced.
- v2 is the single active quality contract in the pre-public stage. The
  repository's one-active-contract rule forbids a long-lived v1/v2 dual read or
  dual write.
- Evidence is atomic: `generation_presented`, `newer_generation_presented`,
  `repeat_pressure`, `exact_hash_match`, `unknown_save`, or
  `expired_without_save`.
- Lifecycle is explicit: `presented`, `superseded`, `adopted_exact`,
  `saved_unknown`, or `expired`.
- Raw prompt, generated content, final post content, post ID, and user ID remain
  local or omitted. No `quality_score` is introduced.

**Exit criteria:** the Addon and Cloud accept the same v2 fields, fixtures use
unique generation IDs, and contract tests reject raw-content fields.

## Phase 1 — Generation lifecycle and attribution

**Goal:** correctly answer which generation was saved, superseded, or left
without a save.

Implementation:

1. Addon assigns a fresh `generation_id` for every generation.
2. A short-window regeneration keeps one quality session, marks the prior
   generation `superseded`, and emits a new `presented` plus `repeated` event.
3. Exact saved content is high-confidence local fingerprint evidence;
   unmatched save is an `unknown_save` observation, not a rejection claim.
4. Expiry emits one bounded `expired_without_save` outcome.
5. Cloud groups and projects by generation while retaining session-level rates.
6. Attribution coverage reports both session and generation join rates.

**Current status:** implemented in the working tree. Addon behavior tests,
Cloud quality API/worker/contract tests, the metadata-only regression report,
and JavaScript readiness tests pass locally. Real signed ingestion and natural
traffic evidence remain a later exit.

## Phase 2 — Routing explainability

**Goal:** explain a model result without making routing a second control plane.

Implementation:

- Cloud records `router_version=hosted_router.v1` in the runtime policy
  snapshot.
- The snapshot includes profile ID, profile/binding revision, execution kind,
  selection policy, candidate order, and the selection basis.
- Actual provider/model/instance and fallback remain in Cloud run and provider
  call records; the Addon does not report or override them.
- Quality dashboards may join these facts for read-only analysis.

**Exit criteria:** a run can be reconstructed from its profile revision,
selection policy, candidate order, selected provider/model, provider calls, and
quality outcome without inspecting WordPress UI internals.

## Phase 3 — Compatibility matrix

**Goal:** isolate official WordPress AI churn to the Addon boundary.

The matrix must cover:

| Lane | WordPress | Official AI plugin | Addon | PHP | Gate |
| --- | --- | --- | --- | --- | --- |
| stable primary | WordPress 7.0.4 | 1.3.0 release artifact | current release candidate | 8.0, 8.2, 8.4 | blocking |
| stable regression | WordPress 7.1.1 | 1.2.0 release artifact | current release candidate | 8.2 | blocking for the reviewed browser flow |
| upstream warning | WordPress 7.1.1 | upstream `develop` | current release candidate | 8.2 | non-blocking warning until reviewed |

The Addon maps upstream ability/class/hook details to stable internal task keys;
Cloud only sees the Npcink connector contract. A matrix failure must not cause
Cloud to learn upstream PHP class names or UI details.

**Current status:** the Addon now declares concrete WordPress 7.0.4/7.1.1
lanes, pinned AI release artifacts, and a Playground runner wired into CI.
Stable lanes are blocking; the upstream `develop` lane is warning-only. The
full browser/provider/save flow still requires the opt-in local acceptance
runner because CI has no verified Cloud connection and must not manufacture
paid traffic.

**Exit criteria:** stable lanes pass discovery, scene gating, fake-provider
flow, explicit local save, cleanup, and no-write boundary checks. The upstream
lane may warn but must be visible in the report.

## Phase 4 — Natural traffic pilot

**Goal:** collect unbiased evidence from ordinary editor use.

Defaults:

- monitoring is opt-in and metadata-only;
- seven-day observation window;
- title, summary, and rewrite are measured separately;
- no paid Provider calls are manufactured to fill a sample;
- no automatic prompt, model, router, or approval mutation;
- no cohort field unless an operator explicitly declares an experiment;
- preserve failed, retried, expired, and unattributed evidence.

Daily read-only report:

- generation and session totals;
- technical success, fallback, and latency;
- repeat pressure, exact adoption, unmatched saves, and expiry;
- generation/session attribution coverage;
- provider/model/profile/router breakdown where Cloud evidence exists;
- plugin-version and compatibility-lane distribution;
- unresolved generations with no outcome.

**Current status:** the Cloud summary now exposes runtime success/fallback,
Provider error and P50/P95 latency, router/revision buckets, Addon-version
distribution, and locally detected WordPress AI-version distribution. The
read-only Layer A gate passed, and the Local WordPress preflight passed on
WordPress 7.1.1 + AI 1.3.0 + Addon 0.2.0 with metadata-only monitoring enabled.
The complete local editor smoke now passes through suggestion review, explicit
save, zero pre-save writes, and cleanup with the bounded Fake Provider path.
The current M4 candidate is reachable through the governed foreground tunnel;
the local fake run made no paid Provider call. The seven-day natural-traffic
window remains closed until the operator has a real-user observation window and
the production or approved preview runtime is explicitly selected. These
projections do not trigger routing or prompt changes.

Phase 4 entry gate:

1. local or M4 Cloud Runtime endpoint is healthy and reachable from the site;
2. the same Addon revision passes the browser smoke through suggestion review;
3. Fake Provider quality validation records complete title, summary, and
   rewrite sessions with zero pending records;
4. only then may an operator start the seven-day natural-traffic window.

Current entry-gate result: items 1–3 pass for the local M4-backed fake run;
item 4 is intentionally pending because synthetic traffic is not evidence of
natural adoption. The first bounded real-Provider checkpoint exposed two
compatibility defects: a Responses adapter could select reasoning before the
final message, and a gateway could return plain text despite the title schema.
The adapter now accepts only a typed, completed Responses `message/output_text`
item, rejects reasoning-only, incomplete, failed, cancelled, or Chat Completions
fallback envelopes, and requires the declared title JSON schema. A second
real browser run reached all three official WordPress AI surfaces and preserved
the no-write-before-save boundary, but it failed the saved-summary equality
check because the configured Provider still returned instruction-like text.
The pilot therefore remains closed until the Provider response configuration is
corrected and one new bounded real run passes the semantic output and save
checks. The adapter no longer accepts a gateway-wide `default_thinking_mode` or
injects generic reasoning controls into Responses; only explicit,
endpoint-appropriate request options are mapped. A missing Responses endpoint
is reported as an endpoint error rather than silently downgraded to Chat
Completions, and requested versus gateway-reported model IDs remain separate
evidence fields. The gateway still returned
reasoning-only Responses during the last bounded attempt, so the remaining fix
belongs at the gateway/model mapping or requires selecting a provider lane that
returns a final message.

## Phase 5 — Manual decision gate

**Goal:** decide whether the evidence is strong enough to change one routing
choice or run one bounded comparison.

The gate requires at least 50 observations in the seven-day window, ideally from
more than one site, before adding prompt-template attribution or changing the
measurement contract. Any routing change is manual, documented with its profile
and router revisions, and followed by another observation window.

Automatic optimization remains deferred until the data has stable task/site
segments, complete attribution, known compatibility coverage, and a reviewed
experiment design.

## Phase 6 — Graduation

The validation phase graduates when the operator can answer from real data:

1. What is the technical success, fallback, and P50/P95 latency rate?
2. What is the adoption or no-save rate for each task?
3. What portion of generations joins to a Cloud run and provider call?
4. Which profile, router revision, provider, and model produced the result?
5. Did a routing change improve a task segment without harming another?
6. Did an official WordPress AI or Addon version change alter the evidence?

If any answer depends on raw content, guessed client-side provider fields, or an
unattributed denominator, the phase has not graduated. The next action is to
repair evidence quality, not add a new AI feature.

## Verification and rollback

The development lane uses the narrowest applicable checks first:

```bash
php tests/behavior-editor-assist-quality.php
composer run check:js
composer run test:contracts
.venv/bin/python -m pytest -q \
  tests/api/test_editor_assist_quality_routes.py \
  tests/contract/test_ai_quality_regression_samples.py \
  tests/workers/test_ops_cadence_worker.py
bash scripts/check-editor-assist-quality.sh
python3 -m app.ops.editor_assist_quality_status --window-hours 168
```

Before merge, run the repository changed-path and anti-drift gates. If the v2
event contract needs rollback, revert the strict Addon consumer and Cloud
projection together in one reviewed change; do not restore a silent dual
contract or accept v1 events through an undocumented fallback.

## Current execution receipt

- Cloud Layer A: editor-assist focused tests `9 passed`; feedback-status gate
  `24 passed`; targeted lint and remote-command syntax passed.
- Addon contracts: JavaScript readiness `6 passed`; full PHP contract suite
  passed; compatibility matrix and boundary checks passed.
- Local WordPress preflight: passed for WordPress 7.1.1, AI 1.3.0, Addon 0.2.0;
  no fixture, browser, Provider call, or WordPress write was performed by the
  preflight.
- Local Fake Provider browser smoke: passed through title failure/retry/
  regeneration, summary, selected-paragraph rewrite, review, explicit save,
  zero pre-save writes, metadata-only correlation, and cleanup. Evidence was
  `event_total=9`, `session_total=3`, `pending_count=0`, and no forbidden
  fields. It made no paid Provider call.
- Pilot status command: added as a read-only machine-readable gate. It reports
  the seven-day window, the 50-session manual-decision threshold, the next
  action, and the three automatic-mutation flags; it never treats synthetic
  fixture sessions as natural traffic.
- M4 read-only baseline (2026-09-19T23:24:52Z): `session_total=0`,
  `sample_gate=insufficient`, `manual_decision_ready=false`, and
  `next_action=continue_natural_observation`. The connected local site reported
  verified Addon settings and metadata-only monitoring enabled. This is an
  empty natural-traffic baseline, not a quality or adoption result.
- Real-Provider technical checkpoint (2026-09-20): the bounded ledger remains
  open with `claimed_calls=17` and `remaining_calls=13`; the title item is
  exhausted at `5/5`, so no further title dispatch is permitted in this
  experiment. The first direct facade run succeeded after the bounded title
  fallback, but later browser attempts showed reasoning-only or
  instruction-like Responses from the configured `mqzj` gateway. The adapter
  now requires a typed completed final message, strips reasoning items from
  connector projections, enforces the title schema, and fails closed when no
  usable answer exists. Local focused tests pass; no ledger reset or budget
  extension is automatic.
- Real browser evidence (2026-09-20): the second controlled run reached title,
  summary, and rephrase, performed no pre-save WordPress write, and cleaned up
  the draft. It did not pass the final save-equality gate because the returned
  summary was instruction-like. This is technical-path evidence only, not a
  product-quality pass or a natural-traffic result.
- Latest gateway recheck (2026-09-20): `mqzj` remained `ready`; the `gpt-5.5`
  instance remained on Responses and degraded because of quality failures.
  The new attempt still produced a reasoning-only item and failed before
  summary adoption. The next action requires an external gateway/model mapping
  change or a newly declared bounded experiment; it is not safe to start
  natural traffic from this evidence.
- Natural-traffic pilot: not started; it cannot be replaced by the local fake
  run.
