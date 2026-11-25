# Text AI Hosted Routing Profile V1

Status: superseded on 2026-11-10 by [Hosted Runtime Profiles: General Text Configuration Repair](cloud-hosted-runtime-profiles-v1.md#general-text-configuration-repair--2026-11-10) (PR #1397).

Date: 2026-06-09

This document records the original routing design. For the current Cloud
contract, use the replacement above: `text.ai` remains the caller-facing
profile, and its model candidates come from `wp-ai.editorial` (Editorial /
长文编辑). The historical `hosted-free` / `free-gpt55` ordering below no longer
selects candidates for `text.ai`.

## Purpose

`text.ai` is the stable hosted text AI entry profile for local product surfaces
such as Toolbox hosted content support.

It is not a model name, a package name, or a promise that Cloud will always use
one specific upstream model. In the June 2026 local verification, the catalog
resolved `text.ai` to `gpt-5.5` as a hosted-free candidate.

## Decision

The original Cloud design distinguished two profile meanings:

- `text.ai`: stable hosted text entry point for product callers.
- `text.free-gpt55`: compatibility/current-offer profile for the existing
  free GPT 5.5 path.

In that design, `text.ai` selected candidates by capability tags and routing policy:

```json
{
  "strategy": "ordered",
  "ordered_tiers": ["hosted-free", "free-gpt55"]
}
```

This allowed the catalog to replace or precede `gpt-5.5` without requiring
Toolbox or other local callers to change their profile id.

## Boundary

This profile belongs to Cloud hosted runtime metadata. It does not create:

- a second WordPress control plane;
- a second ability registry;
- a workflow or Agent registry;
- a prompt/preset truth owner;
- a WordPress write owner.

Local plugins still own the product surface, final enablement, reviewed
handoff, and final WordPress write path. Cloud only resolves and executes the
hosted runtime request.

## Caller Contract

Public runtime callers that use `text.ai` must send a text execution contract.
The minimum fields are:

```json
{
  "profile_id": "text.ai",
  "execution_kind": "text",
  "execution_pattern": "inline",
  "policy": {
    "allow_fallback": false
  }
}
```

If `execution_kind` is missing or differs from `text`, Cloud rejects the request
with an execution-kind mismatch. This is intentional fail-closed behavior.

## What Was Fixed

The local Toolbox hosted content-support path originally called Cloud with
`profile_id=text.ai`, but Cloud did not yet seed that profile. After adding the
profile, the next failure showed that Toolbox omitted `execution_kind=text`.

The June 2026 fix was:

1. Cloud seeds `text.ai` as a hosted text profile.
2. `text.ai` uses `hosted-free` first, with `free-gpt55` as compatibility.
3. Toolbox sends `execution_kind=text`.
4. Runtime responses preserve `hosted_profile` and `model_id` so downstream UI
   can show honest metadata.

## Verification

Commands run during closeout:

```bash
uv run python -m py_compile app/domain/hosted_model_defaults.py app/domain/catalog/service.py
uv run python -m pytest \
  tests/domain/test_catalog_service.py::test_free_gpt55_profile_filters_to_free_hosted_model \
  tests/domain/test_catalog_service.py::test_text_ai_profile_filters_to_hosted_free_model_without_exact_model_pin \
  tests/api/test_runtime_execute.py::test_execute_route_defaults_text_requests_to_free_gpt55 \
  tests/api/test_runtime_execute.py::test_execute_route_accepts_text_ai_profile_alias
git diff --check
```

The local Docker catalog was also refreshed. At the time of verification,
`text.ai` resolved to this hosted-free candidate:

```text
profile_id=text.ai
execution_kind=text
ordered_tiers=["hosted-free","free-gpt55"]
candidate_instance_ids=["openai-global-gpt-5-5"]
```

The `gpt-5.5` candidate here is runtime evidence from that local verification,
not a hardcoded product contract or evidence of current model selection.

## Stop Rule

Do not expand this into a workflow platform, Agent platform, or second router
control surface. The useful next test-only improvement is a small hosted
content-support smoke that asserts:

- `profile_id=text.ai`;
- `execution_kind=text`;
- non-empty `model_id`;
- `direct_wordpress_write=false`;
- `final_write_path=core_proposal_required`.

No feature expansion is needed after this routing contract is stable.
