# Runtime observation and diagnostics — development receipt

Date: 2026-10-27. Scope: existing read-only Admin usage and diagnostic surfaces.
Contract: [runtime-observation-diagnostics-v1.md](../runtime-observation-diagnostics-v1.md).

## Delivered

- Runtime profiles are labelled as runtime types; Cloud run counts and retained
  plugin event counts are separated. Task failures do not imply a global health
  conclusion, and succeeded/failed durations are shown separately.
- Missing-call counts, groups, trends and affected records share a settled-run
  cohort. Processing runs are pending evidence. Recorded runs have their own
  comparison view. Call existence checks are independent of call-detail caps.
- A fixed `since` supports post-change review. Explicit issue focus survives an
  absent alert; no traffic, partial evidence and bounded samples do not prove
  recovery. This introduces no repair operation or paid observation traffic.

## Verification

- Local: 20 targeted API/domain tests passed; changed Python quality checks,
  frontend types, targeted ESLint, Admin UI gate, window and diagnostic i18n
  contracts passed. Runtime telemetry Vitest: 7 passed.
- Local browser mocks: both affected suites passed, 21 tests. The short-viewport
  tooltip check now finishes document smooth scrolling before opening help;
  assertions still check above-anchor placement, bounds and Escape dismissal.
- Full frontend unit suite: 657 passed, 1 existing failure before the additional
  telemetry test. `i18n-retired-dead-keys` rejects `active_sites_label`, already
  present in HEAD and used by the preceding customer-operations module. That
  unrelated contract was not changed by this module.
- M4 candidate: dirty development source based on `96f3f7530e93`; all 20 targeted
  API/domain tests passed. API/frontend/proxy healthy. PC 1440×1050 manual checks
  confirmed zero-call affected records, positive-call comparison records, detail
  and Escape focus return, no-traffic review retaining focus, and separate
  succeeded/failed runtime-type durations.
- Observed M4 data included 285 historical missing-call associations; these are
  investigation evidence, not proof of failed supplier requests. Long failed
  text tasks explain the aggregate duration's difference from successful tasks.
- During manual checks the Admin session expired. Reauthentication succeeded;
  the user reported a login button stuck in submission. Login recovery is a
  separate follow-up, not evidence of this diagnostic API failing.

CI, merge, accepted M4, production and human acceptance are not claimed here.
Screenshots and local logs are retained in the task's runtime-observation-clarity
artifact directory; they contain development data, not production proof.
