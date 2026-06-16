# Pro Cloud Batch Runtime v1

Status: active implementation contract

Date: 2026-06-16

## Purpose

Pro Cloud Batch Runtime lets paid sites offload bounded nightly analysis work to
Magick AI Cloud without moving schedule truth, editorial workflow truth, or
WordPress write authority out of the local stack.

The first supported profile is:

`nightly site inspection + morning writing preparation + content quality scoring`

This is not a cloud scheduler, a workflow engine, or an automatic article
writer.

## Ownership Boundary

Local WordPress owns:

- WP-Cron schedule truth and enablement;
- site enumeration and batching policy;
- `npcink-local-automation-runtime` as the future owner for unattended and bulk
  local automation;
- Morning Brief persistence and display;
- user review, Core proposal creation, approval, preflight, apply, audit, and
  rollback;
- all final WordPress writes.

Magick AI Cloud owns:

- signed runtime request acceptance for provisioned active sites;
- queue-backed execution through the existing hosted runtime worker;
- PostgreSQL run evidence through existing `run_records`;
- provider-call/usage evidence for the runtime action;
- polling or callback-compatible terminal result delivery;
- read-only diagnostics.

Cloud must not own:

- WP-Cron schedule truth;
- local batch fan-out policy;
- Core proposal approval state;
- Ability registry or runtime template truth;
- direct WordPress publishing or mutation APIs.

## Runtime Ability

Use the existing public runtime route:

`POST /v1/runtime/execute`

Supported ability names:

- `magick-ai-toolbox/analyze-nightly-content-batch`
- `magick-ai-cloud/analyze-nightly-content-batch`

Defaults:

- `contract_version`: `cloud_batch_runtime_request.v1`
- `ability_family`: `automation`
- `execution_kind`: `nightly_site_inspection`
- `profile_id`: `cloud-batch-runtime.managed`
- `execution_pattern`: `whole_run_offload` for Pro batches
- `storage_mode`: `result_only`
- `data_classification`: `internal`
- `task_backend.callback_mode`: `polling_preferred`

Small diagnostic runs may use `inline`, but product Pro batch flows should use
`whole_run_offload`.

## Request Shape

The request input is site-scoped evidence, not write instructions:

```json
{
  "contract_version": "cloud_batch_runtime_request.v1",
  "task_profile": "nightly_site_inspection_morning_brief",
  "items": [
    {
      "object_type": "post",
      "object_id": 123,
      "title": "Existing title",
      "meta_description": "",
      "word_count": 420,
      "internal_link_count": 0,
      "image_alt_missing": 2,
      "days_since_modified": 430
    }
  ],
  "direct_wordpress_write": false
}
```

Cloud validates the input and rejects secret, approval, or write-control fields,
including `update_post`, `final_write_policy`, `wordpress_write`,
`approval_token`, `nonce`, `cookie`, `password`, and secret-bearing keys.

The first implementation caps each runtime request at 50 content items.

## Result Shape

Cloud returns a reviewable result:

```json
{
  "contract_version": "cloud_batch_runtime_result.v1",
  "runtime_owner": "npcink-local-automation-runtime",
  "cloud_role": "runtime_detail",
  "summary": {
    "items_scanned": 2,
    "actions_total": 1,
    "warning_total": 1,
    "critical_total": 0,
    "average_score": 82.5
  },
  "actions": [
    {
      "action_type": "content_quality_signal",
      "object_type": "post",
      "object_id": "123",
      "score": 67,
      "severity": "warning",
      "reason_codes": ["missing_meta_description"],
      "recommended_next_action": "review_update_brief",
      "direct_wordpress_write": false,
      "status": "succeeded"
    }
  ],
  "safety": {
    "direct_wordpress_write": false,
    "final_write_path": "core_proposal_required",
    "article_body_generated": false,
    "article_write_plan_generated": false,
    "requires_local_review": true
  },
  "handoff": {
    "target_owner": "magick-ai-core",
    "proposal_created": false,
    "operator_next_action": "review_cloud_batch_result"
  }
}
```

The result may contain quality signals, explanation, and writing preparation
evidence. It must not contain long-form article bodies, cloud-produced article
write plans, or final WordPress writes.

## MVP Implementation

The v1 MVP intentionally reuses the hosted runtime system:

- public HMAC auth and scopes from runtime routes;
- idempotency through `site_id + idempotency_key`;
- `run_records` as canonical run state;
- Redis/in-memory queue only as worker wake-up;
- `RuntimeService.process_queued_runs` as the worker entry;
- `/v1/runs/{run_id}` and `/v1/runs/{run_id}/result` for polling.

No Action Scheduler dependency is required in the plugin for the Pro path.
No new Cloud scheduler or orchestration framework is introduced.

## Future Extensions

Future versions may add richer model-assisted explanations, per-action metrics,
and read-only Agency summaries, but only if they preserve this boundary:

local owns control and writes; Cloud owns bounded runtime execution and evidence.
