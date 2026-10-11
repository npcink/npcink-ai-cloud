# WordPress AI Capability Readiness v1

Status: development contract.

The signed, site-scoped `GET /v1/entitlements/current` response adds
`data.entitlement.wordpress_ai_capabilities`. Existing entitlement fields and
the `entitlement:read` scope remain unchanged. WordPress AI itself is not modified.

The snapshot has `contract_version=wordpress-ai-capabilities-v1`, UTC
`checked_at`, `max_age_seconds=300`, `evidence_kind=configuration_snapshot`,
`provider_call_performed=false`, and `runtime_admission_required=true`.
`capabilities` contains `text_generation`, `image_generation`, and `vision`.
Each entry contains `state`, `reason_code`, `configuration_state`, and
`entitlement_state`.

- `configured`: every required hosted route resolves to eligible models and
  the normalized site entitlement permits the connector's internal-data request.
- `unavailable`: configuration or entitlement evidence identifies a blocker.
- `unknown`: current evidence is insufficient, including an expired trial or
  subscription that needs grace evaluation. It does not mean unconfigured.
  Active subscriptions retain configuration evidence at billing-period rollover:
  the existing runtime renews that period on execution. Hiding their models
  would prevent the request that performs the renewal.

Text covers all three existing text scene profiles. Image and vision reuse
their existing routing profiles and current capability probe evidence.
No new ability, workflow, model, prompt, or routing registry is introduced.
The API exposes no upstream credentials, internal instance IDs, or probe payloads.

Reasons are `configured`, `site_inactive`, `subscription_missing`,
`subscription_requires_runtime_check`, `entitlement_missing`,
`entitlement_unknown`, `entitlement_denied`, `provider_unavailable`,
`profile_not_configured`, `no_eligible_model`, `profile_capability_mismatch`,
or `routing_unavailable`. `no_eligible_model` deliberately does not claim
whether health, provider allowlisting, or missing/current probe evidence is
the cause. Cloud operator diagnostics retain that detail.

This is read-only configuration evidence, not preflight or approval truth.
It neither calls a provider nor renews subscriptions, reserves credit, creates
runs, or records commercial admission decisions. Actual requests still enforce
current authorization, data classification, quota, concurrency, storage, and
runtime contracts. Configuration cannot guarantee upstream availability.

Consumers must treat a missing/unsupported contract, invalid shape, failed
refresh, or expired snapshot as unknown, not as evidence that all models exist.
Cache identity must include the Cloud connection identity. Only fresh
`configured` capabilities may be advertised as connector models. A last-known
snapshot can be displayed with its timestamp but cannot authorize advertising
after expiry. Connection status remains independent of model availability.

Rollout order: Cloud response and tests; Addon validation/cache and model
projection; Addon compact status and explicit tests. Old Addon consumers can
ignore the additive field. Before enabling strict model projection on a site,
verify that its Cloud deployment supplies this contract. Do not silently switch
the site's Cloud destination to a preview or fabricate positive readiness.
