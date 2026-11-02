# Admin diagnostic evidence validation v1

Status: source contract for B6-09/10/11/12. Local verification is separate from
CI, M4, merge, production and human acceptance.

## Scope and ownership

The existing service coverage queue, audit workspace and runtime diagnostics
validate evidence at their read boundary. This does not change backend
serializers, authorization, service writes, WordPress adoption or any paused
feature. Existing request identity, abort and late-response guards remain the
state owners. No new registry, workflow or collection pipeline is introduced.

## Read contracts

| Finding / surface | Required evidence and behavior |
| --- | --- |
| B6-09 coverage | Require the current queue envelope, summary, filter/pagination identity and bounded page slice. Validate each account, package, subscription and evidence row. Null/malformed rows, duplicates and wrong row scopes are quarantined locally. Construct the allowed action target from the row account/subscription and actual `recommended_action`; arbitrary or mismatched links are never adopted. |
| B6-10 audit | Require timestamp, pagination, diagnostics and bounded page slice. Match each metadata row against exact event/site/account/actor/scope/idempotency/type/outcome and RFC3339 time filters. Unknown outcome strings remain readable. Strip unknown properties, including raw request/result payloads. Bad rows cannot stand in for matching evidence. |
| B6-11 telemetry | Require finite nonnegative counts, bounded rates, denominator relationships, generated/window/filter identity, alert metadata, evidence limits and daily usage values. Required missing/invalid fields reject the snapshot; no zero/empty-alert fallback. Legal zero denominators retain the serializer's coverage of 1, non-AI runs and pending provider evidence remain distinct. Optional group gap values stay null. Invalid provider/group rows are isolated and block a healthy conclusion. |
| B6-12 run evidence | Validate each run and bind both ordinary and exact lists to nonempty site/capability/run constraints. Capability follows backend exact `ability_family OR ability_name OR profile_id` semantics. Reject malformed, duplicate, wrong-target and inverted-time rows locally; keep legal rows and explicit retry. No replacement run is selected. |

Top-level invalid evidence follows the existing read-error path. The last
successful same-scope snapshot may remain visible with a failure/old-evidence
notice; a rejected response does not advance its success identity. Local row
issues remain visible beside the working surface and do not turn an all-bad
page into “no results.” Source totals describe the unfiltered server slice;
visible legal rows and rejected-row counts are shown separately.

Run-list scope validation covers row identity and structure, not proof of every
server-side issue predicate or a second reconstruction of the server query.
The run envelope requires `items`, `sampled` and `truncated`; telemetry owns the
validated observation window. These limits are intentional and are not claims
that all server evidence has been independently reconstructed.

## Information hierarchy

- Always visible: selected scope, counts/sample limits, invalid-row count,
  failed/retained evidence, unknown conclusion and Retry.
- On demand: existing Inspect/drawer evidence, complete identifiers and guides.
- Technical evidence: bad source row positions, serializer fixtures, bounded
  metadata, browser/command receipts. No raw prompts, results or credentials.
- Removed duplication: none. Existing fields and actions keep their entrypoints;
  invalid arbitrary links and invented zero defaults are rejected at the boundary.

The existing directory/diagnostic page models, shared inspectors and action
hierarchy remain. No new tab/dialog/drawer or page composition is introduced.
PC checks use 1440 and 1056 pixels; no theme tokens changed. Narrow diagnostic
columns retain existing wrapping. Human visual acceptance remains separate.
See the [implementation ledger](admin-information-hierarchy-implementation-ledger.md).

## Regression evidence

`tests/domain/test_admin_diagnostic_serializer_contract.py` builds actual
CommercialService/RuntimeService responses using an explicit test Settings and
temporary SQLite database. Its fixture is consumed by frontend parser and
browser regressions. Fixed wall-clock timestamps and observational query time
make comparison deterministic; no hosted Provider or customer data is used.
SQLite setup/seed operations write to that disposable database. Browser business
API reads are mocked and GET-only, which is not a claim of zero database writes
across the entire verification process.

The real coverage serializer slices the filtered collection by offset and
limit, with total equal to its length; audit uses the same filtered count and
limit/offset query. Expected length is `max(0, min(limit, total - offset))`.
Nonempty short pages retain their legal rows and actual returned length, but
add `pagination.items` and a visible incomplete-page warning. They are not
certified as complete. An empty slice with records still declared inside the
requested range rejects the response. No real serializer path allowing a
stable, complete short page has been established; the old partial-page fixture
is a malformed-evidence counterexample, not production contract authority.

Normal legacy browser fixtures explicitly fill current serializer fields using
a normal-scenario builder. Malformed injections bypass that helper. The generic
fulfill/envelope helper, collector, assertion thresholds and golden baselines
are unchanged. The obsolete audit tests accepting wrong/missing response offsets
now require invalid-evidence behavior; server-owned deep-offset recovery still
uses a real page boundary. Exact filter/offset recovery and time assertions stay.

[Local evidence and failure history](history/admin/2026/records/admin-diagnostic-evidence-validation-local-2026-11-02.md)
records the source base, checks, screenshots and limitations. Runtime/deployment
claims require the integrator's separate evidence chain.
