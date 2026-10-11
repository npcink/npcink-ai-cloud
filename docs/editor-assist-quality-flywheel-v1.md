# Editor Assist Quality Flywheel v1

Status: active quality-evidence contract; metadata-only and non-authoritative
for WordPress final writes.

## Purpose

`editor_assist_quality.v2` turns ordinary WordPress AI editor behavior into
metadata-only quality evidence:

1. the Cloud Addon records a successful editor-assist generation;
2. a second generation for the same local article, task, and actor within ten
   minutes records repeat pressure;
3. a later explicit local save or publish records either an exact output match
   or an unmatched save;
4. a session with no matching save after one hour expires as a no-save signal;
5. Cloud aggregates the events and emits read-only issue candidates;
6. an issue candidate points to a fixed-corpus evaluation task before any
   production change is considered.

This is silent analysis. It does not add feedback buttons or interrupt the
editor.

## Ownership Boundary

WordPress remains the approval, preflight, adoption, and final-write truth.
Saving or publishing editor-visible content is the user's local decision. The
Governance Core is not part of this editor-assist acceptance path.

Cloud may:

- receive signed metadata-only events;
- aggregate rates and latency;
- correlate the event `correlation_id` with Cloud-owned run evidence;
- read its own run and provider-call identity to attribute quality evidence;
- expose a read-only internal quality summary;
- recommend a fixed-corpus evaluation.

Cloud must not:

- retain prompts, generated text, post IDs, or user IDs in this contract;
- expose Provider cost, token, or billing data through this read model;
- approve or publish WordPress content;
- mutate prompts, models, routes, presets, or workflows automatically;
- treat an unmatched or expired session as proof that the user rejected the
  output.

## Event Fields

The existing `magick-plugin-observability-v1` transport is extended additively
with safe scalar fields:

| Field | Meaning |
| --- | --- |
| `quality_contract` | Must be `editor_assist_quality.v2`. |
| `quality_session_id` | Random identifier for one local post/task/actor session. |
| `task_key` | `title_generation`, `content_summary`, or `content_rewrite`. |
| `object_scope_hash` | Site-keyed HMAC used only for local correlation scope. |
| `actor_scope_hash` | Site-keyed HMAC; never a WordPress user ID. |
| `generation_sequence` | One-based generation number in the short window. |
| `generation_id` | Stable opaque identifier for one presented generation within the quality session. |
| `wordpress_ai_version` | Locally detected official WordPress AI plugin version, or an explicit unknown bucket when unavailable. |
| `lifecycle_state` | `presented`, `superseded`, `adopted_exact`, `saved_unknown`, or `expired`. |
| `evidence_type` | Metadata-only evidence class for the lifecycle transition. |
| `outcome` | Exact save, unmatched save, or expired without save. |
| `outcome_confidence` | `high` for an exact fingerprint, otherwise `medium`. |
| `save_kind` | `save`, `publish`, or `none`. |
| `time_to_outcome_bucket` | Coarse duration bucket. |
| `content_storage` | Always `omitted_metadata_only`. |

The Cloud run ID uses the existing `correlation_id`. Generated content is
represented only by a keyed local fingerprint and is never uploaded.

## Event Kinds

- `addon.editor_assist.generation.presented`
- `addon.editor_assist.generation.superseded`
- `addon.editor_assist.generation.repeated`
- `addon.editor_assist.outcome.observed`
- `addon.editor_assist.outcome.expired`

## Read Model

`GET /internal/service/admin/editor-assist-quality`

Filters:

- `window_hours`: 1 to 720 (up to 30 days);
- `site_id`: optional;
- `task_key`: optional.

The response includes session counts, repeat rate, exact saved rate, unmatched
saved rate, expired-without-save rate, exact publish count, generation latency
P50/P95, task breakdowns, a bounded trend, the immediately preceding comparison
window, run and model attribution, linked-run technical health, Addon-version
distribution, router-version/profile-revision buckets, and issue candidates.

### Run, model, and runtime-profile attribution

The summary adds a bounded `attribution` section. It answers which hosted model
and which runtime profile produced the sessions that were exactly saved, saved
after generation, or expired, so a poor adoption rate can be traced to a model
or a profile instead of staying a task-level number.

A session is attributed to the Cloud run that the Addon correlated with the
generated output it matched or expired. That run id was already carried as
`correlation_id`, so the breakdown reads Cloud's own `run_records` and
`provider_call_records`. It adds no Addon upload, no telemetry field, and no
database migration.

- `by_model`: one bucket per `model_id`, with the same rate fields as a task
  summary, the contributing `provider_ids`, and the provider call that produced
  the run's output. When a run tried several candidates, the last successful
  call is treated as the producer.
- `by_runtime_profile`: one bucket per `run_records.profile_id`, with the
  contributing `ability_names`. A run with no successful provider call — for
  example the site-knowledge profile — appears here only and never under
  `by_model`.
- `coverage`: attributed and unattributed session counts. An unattributed
  session has no matching run evidence in Cloud, so its model cannot be stated.
- `by_router`: read-only buckets keyed by `router_version` and routing/profile
  revision. This explains a routing change without allowing the quality report
  to change routing.
- `method`: the attribution rule as one sentence.

At most twelve buckets are returned per dimension, ordered by session count.
The read model declares `attribution_source` as
`cloud_owned_run_and_provider_call_evidence` in its boundary block.

This is identity attribution only. Cloud selects the provider call's
`provider_id`, `model_id`, and `instance_id`; `cost`, token counts, and billing
fields are neither used nor returned, and the existing restriction on joining
this evidence to Provider cost or customer billing remains in force. An
unattributed or low-sample bucket is an instrumentation signal, not a
model-quality verdict, and never changes routing or model selection.

The `runtime` section reports only runs linked to the observed generation or
session events: run status totals, fallback count/rate, Provider call/error
totals, and coarse Provider latency P50/P95. The `compatibility` section reports
Addon-version and locally detected official WordPress AI-version distributions.
When a host cannot expose the official version, it is placed in an explicit
`unknown_wordpress_ai_version` bucket rather than guessed or silently omitted;
the separate readiness matrix remains the authoritative version coverage gate.

Issue candidates require at least five relevant sessions:

- repeat pressure: repeat rate at or above 25%;
- no-save pressure: expired rate at or above 30%;
- exact adoption low: exact saved rate below 40%.

These thresholds are initial diagnostic defaults, not product promises.
Candidates are classified by sample size:

- fewer than 5 sessions: `insufficient`;
- 5 to 49 sessions: `validation`, low confidence;
- 50 to 199 sessions: `observation`, medium confidence;
- 200 or more sessions: `decision`, high confidence.

A candidate is `sustained` only when the same task and issue code also crossed
the threshold in the immediately preceding equal-length window. Only a
high-confidence sustained candidate is marked `actionable` and recommends
`run_fixed_corpus_evaluation`. This recommendation remains read-only and never
starts Eval automatically.

### Sample-stage gate for further instrumentation

These stages also gate further instrumentation. While the daily detector reports
`insufficient` or `validation`, the useful work is collecting ordinary editor
sessions, not adding fields or views: a new breakdown over a handful of sessions
produces empty or misleading buckets and makes the loop look more mature than
its evidence.

Prompt-template version attribution is the next planned evidence stage, and it
is deliberately not part of this contract. The WordPress text scenes do not
receive a prompt from WordPress — Cloud builds the scene prompt in
`app/domain/wordpress_ai_connector/runtime.py::build_provider_input`. That stage
must therefore version Cloud's own scene prompt scaffold and record the version
on the run. It must not be implemented by asking the Addon to upload a template
identifier the Addon has no way to know.

Start that stage when the daily detector reports `observation` — at least 50
sessions in the seven-day window, ideally from more than one site. The detector
is the existing `editor_assist.quality_detection.cadence` task in
`app/workers/ops_cadence.py`, so the gate is already evaluated once every 24
hours and needs no new machinery. Until it reports `observation`, collecting
ordinary editor sessions is the only required work.

## Runtime Diagnostics v1.1

The existing Runtime Diagnostics page contains a compact
`Editor-assist quality` section. It reuses the existing admin read boundary and
chart component to show:

- current sessions and adoption rates;
- up to seven bounded trend buckets;
- task filters for title, summary, and rewrite;
- sample stage, confidence, persistence, and candidate next action.

This is an operator diagnostic surface, not a second product dashboard. It has
no feedback form, mutation control, notification action, or WordPress write
path.

### Read-only JSON export

The expanded Editor-assist quality detail may export the currently loaded raw
read-model response as a JSON file for bounded offline analysis. The export is
a secondary operator action and is unavailable while the read is loading,
failed, or empty.

The export:

- reuses the existing `GET /internal/service/admin/editor-assist-quality`
  response and creates no second API, database projection, report system, or
  scheduled job;
- performs no Provider call, Eval run, Cloud mutation, or WordPress write;
- retains the metadata-only contract: no prompt, article text, generated text,
  credential, WordPress post ID, or WordPress user ID may be introduced merely
  for export;
- is evidence for external analysis, not automatic proof of rejection,
  acceptance, willingness to pay, retention, or commercial viability;
- must not be joined to Provider cost or customer billing data without a
  separately reviewed product and data-boundary change.

An operator may inspect the exported file with a spreadsheet, notebook, or
third-party analysis tool. Cloud remains the read-only evidence owner, while
WordPress remains the adoption and final-write owner.

## Daily Read-only Detection

The existing `ops-worker` cadence evaluates the seven-day summary once every
24 hours. It records only aggregate counts and bounded candidate references in
the existing cadence audit evidence:

- issue code and task key;
- sample size and confidence;
- new or sustained persistence;
- actionable candidate count.

The detector creates no database table, notification, ticket, Eval run, or
production configuration change. It remains useful while volume is low because
the result distinguishes instrumentation validation from decision-grade
evidence.

## Existing Components Reused

- the Addon's signed, bounded plugin observability buffer and hourly flush;
- Cloud's existing `PluginObservabilityEvent` table and JSON metadata column;
- the existing internal-service authentication boundary;
- Eval Lab fixed-corpus and Promptfoo-style evaluation tasks, including
  `summary_hard_gate`.

No new telemetry platform, queue, database migration, scheduler, notification
system, or dashboard framework is introduced in v1.1.

## Gate

Run:

```bash
pnpm run check:editor-assist-quality
```

This validates the regression fixture, focused API/domain behavior, targeted
lint, and the explicit no-auto-mutation boundary.

The fixture also declares five human-readable cases beside the existing event
stream: exact publish adoption, edited adoption with and without repeat
pressure, and two expired-without-save signals needed to exercise the bounded
diagnostic threshold. Those cases do not reinterpret an unmatched or expired
session as rejection.

Combined with the five Content Support Agent Feedback samples, inspect the
bounded ten-case report with:

```bash
pnpm run report:ai-quality-regression
```

This command is deterministic and metadata-only. It produces evidence for
review but does not call a Provider, retain raw content, block on subjective
editorial quality, or trigger Eval or production mutation.
