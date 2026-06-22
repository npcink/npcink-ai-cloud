# Site Ops Cloud Analysis Runtime v1

Status: active runtime/detail contract.

`site_ops_cloud_analysis_request.v1` is produced by Toolbox from bounded local
WordPress evidence. Cloud consumes that request through the hosted runtime and
returns `site_ops_cloud_analysis_result.v1`.

## Runtime Role

Cloud role is `runtime_detail`. The Cloud result may rank local findings,
explain aggregate drivers, surface trend notes, and prepare operator next
actions. It must not become a second WordPress control plane.

The runtime result keeps:

- `write_posture=suggestion_only`;
- `direct_wordpress_write=false`;
- `core_proposal_created=false`;
- `cloud_scheduler_truth=false`;
- `operator_review_required=true`.

## Inputs

Allowed input is the Toolbox-prepared request:

- aggregate post/page, media, taxonomy, and approved-comment signal summaries;
- local `site_ops_insight_pack.v1` finding summaries;
- blocked items and requested analysis tasks;
- operator context flags such as Site Context readiness and Cloud readiness.

The request must not include raw private data such as full comment text, comment
author contact details, IP addresses, user agents, provider secrets, private
content, request logs, local scheduler instructions, or WordPress write actions.

## Outputs

The result can include:

- priority queue;
- trend notes;
- confidence and limitations;
- blocked items;
- Core handoff candidates with `proposal_ready=false`;
- operator next actions.

Core handoff candidates are planning hints only. Toolbox, Adapter, Core, and
Abilities still own review, proposal creation, approval, preflight, audit, and
final WordPress writes.
