# Model Reference Metadata v1

Status: active internal operator metadata.

Date: 2026-06-29

## Context

Cloud provider operators need model capability and reference price context while
configuring provider channels. External catalogs such as `models.dev` are useful
because they expose model modality, context limits, output limits, capability
flags, release metadata, and reference token prices.

The same data is not reliable enough to become Cloud routing truth or billing
truth. External catalogs can lag provider changes, omit provider-specific price
variants, or carry incomplete capability details.

## Decision

Use `model_reference_*` storage as a Cloud-owned reference metadata layer.

The first source is `models.dev`. The internal admin sync endpoint imports its
provider/model metadata into:

- `model_reference_sources`
- `model_reference_models`
- `model_reference_overrides`

The data is exposed to internal Admin through:

- `GET /internal/service/admin/model-references`
- `POST /internal/service/admin/model-references/sync`

The Admin provider-channel form may display reference capability and price
metadata beside the provider-visible model catalog. Operators may use the data
to decide which model IDs to expose on a provider channel.

The provider workbench keeps three separate tabs: connection settings, account
models, and read-only reference information.

- The model list contains only the account-returned catalog and existing saved
  choices. Opening reference information never adds rows, enables models, or
  changes the account model count.
- Reference details may enrich an exact matching account model ID. Strip only
  a known system namespace; do not infer aliases between similar model names.
  An absent match explicitly says reference information is unavailable. It does
  not prevent normal text-model configuration or trigger a paid probe.
- Check freshness per record, not only per source. Sync upserts retain absent
  rows: a record older than its source's latest successful snapshot is historical.
  A record/source older than 24 hours, an invalid timestamp, or an unavailable
  source is not current. Only current records enrich account-model details;
  historical records require explicit history visibility and carry a reason.
  The open workbench re-evaluates age every minute, so a long-open page cannot
  indefinitely present an expired record as current. No stored rows are deleted.
- Show reference source, last sync time, and USD per million input/output tokens
  alongside known prices. Missing price/context remains missing.
- The reference tab shows matching records first; other records, search, and
  historical/deprecated visibility stay behind a disclosure. The historical
  setting is a browser preference, never a provider write.
- Successful account fetch settles and announces its own result first. Then
  check the `models.dev` source summary: refresh independently if absent, failed,
  invalid, or at least 24 hours old. Reuse a successful check younger than 24
  hours. A fresh source can still lack a particular model; never fabricate or
  substitute its data. No runtime request fetches external reference data.
- A reference refresh failure has its own retry and preserves account choices,
  catalog success, and already loaded reference records. A pending result must
  not overwrite a different supplier's workbench. Refresh is also available as
  an explicit read-only action.
- Batch enable/disable applies only to account models and appears in collapsed
  operations for directories larger than one page (25 models), with impact
  confirmation. There is no disable-all shortcut or manual model-add control.
- A compatible gateway may choose a reference provider separately from its
  connection identity. This is a view selection, not a model or routing write.

The 24-hour check describes our fetch freshness, not a guarantee that a third
party has published the latest upstream prices or every model ID.

## Boundaries

This layer is allowed to be:

- hosted metadata
- operator reference detail
- provider-channel configuration aid
- price estimation input
- model capability inspection input

This layer is not:

- billing truth
- usage meter truth
- router truth
- provider credential truth
- ability registry truth
- workflow registry truth
- prompt or preset truth
- WordPress write truth

Real usage cost remains owned by provider-call telemetry and usage ledger
records. Runtime model selection remains owned by the existing hosted runtime
and local WordPress control-plane contracts.

## Source Handling

External source payloads are treated as untrusted input:

- the sync service validates payload shape before using it;
- all values are normalized into bounded fields;
- raw source JSON is retained only as reference metadata;
- sync failures are recorded on `model_reference_sources`;
- manual overrides are stored separately from source records.

Reference prices use:

```text
usd_per_1m_tokens
```

This price unit is explicit display metadata only.

## Current Non-Goals

- no model batch testing;
- no automatic cheapest-model routing;
- no automatic plan or billing mutation;
- no customer-facing price guarantee;
- no replacement of platform `catalog_models`;
- no replacement of provider connection model visibility.
- no heavyweight model operations console.

## Verification

Use focused checks:

```bash
.venv/bin/python -m pytest tests/api/test_service_provider_routes.py::test_admin_model_references_syncs_models_dev_payload_as_reference_only
node frontend/tests/unit/admin-ai-resources-contract.mjs
pnpm run frontend:type-check
```
