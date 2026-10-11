# Cloud Agent Feedback Quality Gate v1

Status: active internal gate.

This gate keeps the first `think -> act -> observe -> repeat` loop for local
operator feedback comparable across Cloud and Toolbox changes.

## Scope

The gate covers:

- Cloud Agent feedback event acceptance and summary rollups.
- Content Support regression samples for
  `content_support / editor_content_support_sidebar`.
- Nightly Inspection operator feedback from
  `nightly_site_inspection / toolbox_nightly_inspection_morning_brief`.
- Media search completion/adoption correlation and saved contextual block ALT
  outcomes through the same metadata-only event contract.
- The read-only Cloud admin quality dashboard boundary.
- The local WordPress truth boundary for approval, preflight, and final writes.

The gate does not cover:

- Prompt or router editing.
- WordPress publishing or object mutation.
- A second approval, workflow, ability, MCP, or OpenClaw control plane.
- Commercial account, subscription, billing, or package surfaces.

## Command

Run from `/Users/muze/gitee/npcink-ai-cloud`:

```bash
pnpm run check:agent-feedback-quality
```

The command runs:

- JSON validation for the checked-in Content Support regression fixture.
- `tests/api/test_agent_feedback_routes.py`.
- Targeted Ruff checks for the feedback route, service, and tests.
- Cloud admin TypeScript type-check.
- Targeted ESLint for the feedback dashboard and navigation entries.
- A frontend boundary contract that blocks mutation controls on the dashboard.

## Current Regression Samples

The fixture lives at:

```text
tests/fixtures/agent_feedback/content_support_regression_samples.json
```

Current expected summary:

- `events_total`: `5`
- `accepted_rate`: `0.4`
- `evidence_useful_rate`: `0.4`
- `evidence_weak_rate`: `0.2`
- `wrong_next_step_rate`: `0.2`

These samples are metadata-only. They must not include prompt text, post
content, provider responses, secrets, confirmation tokens, or write authority.

Together with the five Editor Assist sessions in
`tests/fixtures/editor_assist_quality/quality_events.json`, the repository has
one bounded ten-case deterministic sample set. Generate its human-readable
report with:

```bash
pnpm run report:ai-quality-regression
```

The report validates five cases per capability, global case-ID uniqueness,
metadata-only fields, Editor Assist case-to-event consistency, and the local
WordPress approval/preflight/final-write boundary. Its quality interpretation
is report-only: it performs no Provider call and does not authorize prompt,
model, router, approval, or production mutation.

## Nightly Inspection Feedback

Real-site Morning Brief feedback should reuse the same feedback event contract.
The recommended fields are:

- `source_runtime`: `nightly_site_inspection`;
- `local_surface`: `toolbox_nightly_inspection_morning_brief`;
- `source_run_id`: Cloud run id;
- `source_action_id`: Morning Brief action id;
- `source_object_type` and `source_object_id`: referenced WordPress object;
- `source_reason_codes`: bounded reason codes from the inspection result;
- `source_score` and `source_severity`: source action quality evidence;
- `feedback_labels`: labels such as `wrong_priority`, `already_handled`,
  `evidence_weak`, `wrong_next_step`, or `operator_confidence_low`.

The summary response exposes a `nightly_inspection` read-only rollup with
outcomes, labels, source reason-code counts, rejected reason-code counts,
rejected labels, severity counts, average source score, and quality rates. This
rollup is for scoring and Morning Brief tuning only.

## Media Recommendation Feedback

The `media_quality` summary is session-based:

- search success is searches with at least one result divided by completed
  searches; runtime failures are counted separately;
- candidate adoption is result-bearing search sessions with at least one real
  adoption action divided by result-bearing search sessions;
- ALT modification is edited saved block ALT divided by unchanged plus edited
  saved block ALT;
- every metric reports insufficient samples below 20 observations.

The gate must prove that raw media queries and ALT strings are absent. A
successful WordPress non-autosave transition is required before an ALT event is
classified as saved. Attachment ALT remains outside this first rollup because
the current flow has no attachment-metadata final-write receipt.

## Related-Article And Internal-Link Feedback

The `recommendation_quality` summary is session-based and separates
`internal_links` from `related_articles`.

The accepted correlation contract is:

```text
source_object_type=recommendation_session
source_object_id=<random site-scoped session id>
```

Supported action families include impression, open, copy, ignore, editor
Apply, saved unchanged, saved edited, and undo. Cloud must deduplicate metrics
by `site_id + source_object_id`; the same random string from two sites is not
one session. Actions without a matching impression are reported as orphan
sessions and excluded from impression-based rates.

The summary reports:

- impression, open, copy, ignore, Apply, save-confirmed, edited-save, and undo
  session totals;
- bounded candidate and applicable count buckets;
- engagement, open, copy, Apply, saved-adoption, save-confirmation, saved-edit,
  and undo rates; and
- `sample_status=insufficient` below 20 impression sessions.

`impression_only` events are denominators, not quality outcomes. They remain in
raw event/outcome counts for operational traceability but are excluded from
generic acceptance rates, quality trend, scenario summaries, low-quality label
counts, and quality-label rates.

The gate must prove `raw_content_stored=false`, `raw_anchor_stored=false`, and
`provider_output_stored=false`. Recommendation telemetry must also omit source
matches, public URLs, WordPress post IDs and user IDs, raw prompts, and final
saved content. Cloud summarizes behavior only; WordPress remains the final
write and adoption truth.

Funnel data does not replace a human gold set. Open, copy, Apply, or save may
reflect UI placement or operator workflow rather than relevance. Ranking,
prompt, or router changes require a repeated signal with sufficient sessions
and a separately reviewed sample.

After the `npcink.local` sample-expansion trial, the first watchlist for
Nightly Intelligence quality review is:

- `already_handled`: review whether the Morning Brief is repeating work the
  operator already resolved.
- `wrong_next_step`: review whether the recommended local action should be
  rewritten or split.
- `not_relevant_to_site`: review whether scoring is overfitting generic content
  advice to a site where that item is not useful.
- `duplicate_suggestion`: review grouping and dedupe before changing score
  weights.
- `wrong_priority`: review ranking only after there are enough cross-site
  samples.

The `nightly_inspection.rates` object should expose the corresponding rates so
operators can decide whether to tune scoring, grouping, or Morning Brief copy
after multiple trials. One local site is not enough evidence to change scoring
weights.

## Boundary

Cloud may summarize quality signals and show read-only detail. WordPress local
remains the control plane for approval, preflight, final writes, and object
mutation.
