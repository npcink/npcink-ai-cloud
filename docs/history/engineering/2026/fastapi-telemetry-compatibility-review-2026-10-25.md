# FastAPI telemetry compatibility review — 2026-10-25

Status: historical preparation and local-verification evidence. This record
does not establish PR checks, merge, M4 acceptance, or production deployment.

## Upgrade risk and bounded correction

The FastAPI dependency proposal advances 0.141.1 to 0.150.0 within the existing
declared range. New native telemetry defaults are relevant even when
`auto_configure` is false: the application already configures an OpenTelemetry
provider before constructing FastAPI. Native tracing can therefore add server
and operation spans alongside the project's custom request tracing and export
callback query parameters. This is a production-capable runtime-code concern;
live production exposure was not verified.

Both the runtime and setup constructors explicitly disable native tracing,
metrics, logs, operation spans, and automatic configuration. The existing
custom middleware retains HTTP tracing ownership, inbound context propagation,
path-only URL evidence, and stable exception-type events. No exporter,
provider, secret configuration, or commercial feature is added.

FastAPI's changed missing-parameter extraction also requires explicit
`validate_default=True` on the existing entitlement `object_id` query field.
This preserves the previous omitted/empty-value 422 behavior and schema/default
metadata. A valid identifier still reaches the existing authorization path;
authentication and entitlement scope checks are unchanged.

## Local evidence and its limits

The dependency lock was regenerated with pinned uv 0.12.10 against the then-current
master manifests, upgrading only FastAPI's package version and adding its
dependency on the already present OpenTelemetry API. Lock revision advances
from 2 to 3. The resolver also removes Greenlet wheels for s390x/riscv64;
supported amd64/arm64 Alpine wheels remain. No Ruff upgrade is included.

Frozen dev dependency synchronization and lock consistency passed. Full Ruff
passed, and mypy found no issues in 340 application source files. The focused
tracing, entitlement, tracing-configuration, and setup suite passed 51 tests
without skips. Its upstream TestClient/httpx deprecation warning remains visible;
it was not suppressed or counted as a test failure.

The telemetry regressions use a real SDK provider, span processor, and in-memory
exporter. A default-native positive control proves that the SDK can observe
FastAPI's instrumentation. Application tests require one custom SERVER span,
preserved remote parent context, no callback code/state/token sentinels in
exported JSON, and no raw exception message. Setup checks require zero spans
and verify all five native configuration flags. No OTLP endpoint or paid
provider call is needed. The entitlement matrix covers omitted, empty, and
valid identifiers under authorized, anonymous, and wrong-scope requests.

These checks establish local behavior. M4 must separately build this locked
runtime and validate relevant consumers, and protected CI and independent
review must pass before integration. A clean-master M4 promotion and smoke
then establish accepted development state. None of those states proves
production behavior or authorizes a production deployment.

## Reusable decisions

1. Review framework defaults and initialization order, not only manifest ranges
   and green historical checks. Disabling auto-configuration alone does not
   disable instrumentation that can use an existing global provider.
2. Test telemetry boundaries with a real exporter and an observable positive
   control. A fake tracer alone cannot detect newly added native spans.
3. Follow query extraction through default validation and authorization when
   reviewing framework upgrades. Test omission separately from explicit empty.
4. Regenerate from current manifests with the repository's pinned resolver;
   inspect non-version lock changes and retain supported deployment platforms.
5. Keep independent review, local, candidate, CI, merged, accepted, and
   production evidence separate. The earlier frontend dependency history is
   recorded in [its own retrospective](frontend-security-dependency-reconciliation-2026-10-25.md).
