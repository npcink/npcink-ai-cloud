# Service settings projection remediation — 2026-09-09

Status: development candidate; not merged, accepted, or production evidence.

## Scope and outcome

This is the first module in the operator-authorized phased simplification.
The integration baseline is `90f834134ecf04e2adff305d66c06069ccfa768e`.
The unrelated runtime-diagnostics commit `9c0a00fa` is retained on
`codex/runtime-diagnostics-workflow`; it is not included in this candidate.

`app/domain/service_settings_projection.py` owns five Admin-safe projections
and the display boundary metadata. It uses no session, decryption, or external
service. `service_settings_values.py` owns shared identifiers/defaults and four
pure normalizers, avoiding a dependency back into the service. The service
imports these values so existing service-setting callers retain their imports.
The service's read and mutation responses call the same projection functions;
old serializer methods were removed rather than retained as a second path.

No endpoint, schema, persistence, credential decryption, provider call, payment,
email delivery, or WordPress ownership semantics changed. The main service
moves from 1,209 to 1,027 lines; this is a responsibility separation, not a claim
of smaller total code or faster runtime. Projection logic can now be tested
without constructing a service or database.

## Verification

- Original API/settings and media-schedule suite: 19 passed before and after.
- New pure projection tests: 7 passed, covering credential masking, unchanged
  inputs, missing-setting defaults, media normalization, and disabled FX rates.
- One-off old/new comparison: 805 projections matched over missing rows,
  enabled/disabled flags, four statuses, five configs, credential presence, and
  timestamps. This is bounded equivalence evidence, not exhaustive proof.
- Ruff full selected-file check, targeted mypy (3 app files), diff whitespace,
  Cloud anti-drift, and provider-env retirement checks passed.
- The initial API collection failed because the local environment lacked the
  declared `markdown-it-py` dependency. Installing the existing project/dev
  dependencies repaired the environment without changing manifests.
- Local tests used the existing Python 3.14 environment. M4's container tests
  provide the separate runtime evidence; no authoring-Mac Docker was used.

M4 candidate source uses branch `codex/settings-read-projection`, baseline SHA
above plus the four task source/test paths, bundle SHA256
`62aad65a05829d330f1091af044489d337f13228acdf93377ded5d65584c5758`.
A Tailscale relay source sync succeeded with no image build or migration.
M4 focused tests (the three files listed above) passed: 26 tests in 9.89s
under Python 3.14.7. Only the existing Starlette/httpx deprecation warning
was reported. This test duration is not the end-to-end feedback duration.
The prior diagnostics candidate was replaced by this branch's candidate;
that candidate's source commit remains preserved on its original branch.

## Remaining scope and stop conditions

This batch does not complete the overall phased goal. Next, inspect and handle
one module per batch in this order:

1. `observability/plugin_events.py`: separate pure report/health projection
   from ingestion, consent, retention, and attention-state mutation only after
   examining the dependency graph and existing behavior tests.
2. `site_ops_analysis/service.py`: reassess benefit first. It is approximately
   700 lines and already contains pure functions; the earlier low-risk/high-
   benefit ranking was not established by a source review.
3. `provider_connections/service.py`: bound the read-only candidate after
   separating credential, network, model authorization and mutation concerns.
4. `usage/service.py`: inspect summary/projection ownership without moving
   billing, ledger, locks, or transaction semantics.

Do not treat this queue as authorization to mechanically split every file.
For each module, either deliver a tested independent responsibility or record
an evidence-based pause under the structural remediation standard. Re-evaluate
against current source before editing, and keep the overall goal open until
each phase has implementation/verification or a justified pause decision.

The remaining settings service retains mutation, external testing, and runtime
configuration reads. Further separation is deferred because this batch already
removes projection coupling; widening into credential/runtime behavior needs a
separate risk envelope. No public compatibility facade was added.

Rollback: revert this module's commit and sync the desired preserved source
candidate. No migration or data repair is required. Publication/merge and
production are outside the authorized development lane.

M4_OBSERVATION_RECEIPT date=2026-09-09; route=Pgy SSH + Tailscale relay; sync=not measured (relay upload 4s/download 4s); focused=not measured (pytest 9.89s); promotion=not occurred; operations=sync 1/deploy 0; stable_502=not measured; m4_only=not occurred; coordination=prior candidate replaced, source preserved
