# Editor Assist Quality Flywheel v1

## Purpose

`editor_assist_quality.v1` turns ordinary WordPress AI editor behavior into
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
- expose a read-only internal quality summary;
- recommend a fixed-corpus evaluation.

Cloud must not:

- retain prompts, generated text, post IDs, or user IDs in this contract;
- approve or publish WordPress content;
- mutate prompts, models, routes, presets, or workflows automatically;
- treat an unmatched or expired session as proof that the user rejected the
  output.

## Event Fields

The existing `magick-plugin-observability-v1` transport is extended additively
with safe scalar fields:

| Field | Meaning |
| --- | --- |
| `quality_contract` | Must be `editor_assist_quality.v1`. |
| `quality_session_id` | Random identifier for one local post/task/actor session. |
| `task_key` | `title_generation`, `content_summary`, or `content_rewrite`. |
| `object_scope_hash` | Site-keyed HMAC used only for local correlation scope. |
| `actor_scope_hash` | Site-keyed HMAC; never a WordPress user ID. |
| `generation_sequence` | One-based generation number in the short window. |
| `outcome` | Exact save, unmatched save, or expired without save. |
| `outcome_confidence` | `high` for an exact fingerprint, otherwise `medium`. |
| `save_kind` | `save`, `publish`, or `none`. |
| `time_to_outcome_bucket` | Coarse duration bucket. |
| `content_storage` | Always `omitted_metadata_only`. |

The Cloud run ID uses the existing `correlation_id`. Generated content is
represented only by a keyed local fingerprint and is never uploaded.

## Event Kinds

- `addon.editor_assist.generation.completed`
- `addon.editor_assist.generation.repeated`
- `addon.editor_assist.outcome.observed`
- `addon.editor_assist.outcome.expired`

## Read Model

`GET /internal/service/admin/editor-assist-quality`

Filters:

- `window_hours`: 1 to 168;
- `site_id`: optional;
- `task_key`: optional.

The response includes session counts, repeat rate, exact saved rate, unmatched
saved rate, expired-without-save rate, exact publish count, generation latency
P50/P95, task breakdowns, a bounded trend, the immediately preceding comparison
window, and issue candidates.

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
