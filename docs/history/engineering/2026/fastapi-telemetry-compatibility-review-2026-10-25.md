# FastAPI telemetry compatibility review — 2026-10-25

Status: dated preparation, verification, and follow-up evidence. The original
0.150.0 batch reached merged/M4 accepted state below; the separate 0.158.2
follow-up has only the evidence explicitly recorded for that batch. Neither
state establishes production deployment.

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

## Original batch acceptance

PR #1257 merged the 0.150.0 correction as
`5b6d9c25edb20513182d1c0ec35a17bf3ade0e0d`. Its six required checks passed;
independent review found no required correction or unresolved review thread.
The M4 candidate passed 98 focused tests without skips. Clean-master promotion
then recorded accepted state for PR #1257, with 24 postmerge tracing and
entitlement tests and bounded HTTP checks passing. No production operation,
live OAuth exchange, external exporter, or paid provider observation occurred.

## Separate 0.158.2 consumer follow-up

After #1257 merged, Dependabot advanced PR #1104 to 0.158.2 before updating its
title. A title still naming 0.150.0 was therefore insufficient evidence to
close it as a duplicate. The follow-up lock is regenerated from the accepted
Ruff 0.17.1 master, using uv 0.12.10. Only FastAPI changes; revision 3, Ruff,
and the other package records remain intact.

Upstream 0.151 separates an omitted JSON body from explicit `null`, and 0.155
removes arbitrary keyword extras from request-parameter factories. The two
FastAPI constructors, native telemetry implementation, and supported
`validate_default` option remain compatible. This is static source evidence,
not a substitute for running the application consumers.

The existing catalog-route suite adds 21 cases using real required and
optional internal routes, their current models, and real internal-token
authorization. Email delivery and catalog refresh use existing test fakes;
temporary SQLite databases isolate replay evidence. Cases distinguish omitted
content, raw JSON `null`, an empty object, and a valid body. Existing success
and replay tests supply already-covered cells. No new HTTP model or application
compatibility shim is introduced.

Tests preserve required-body rejection before handler authorization and the
optional handler's established defaults. Missing runtime internal tokens return
401; incorrect tokens return 403. The first unexecuted candidate incorrectly
expected 401 for both. An isolated run exposed five failed new assertions,
alongside 508 passing cases and one deliberate M4-only skip. Comparing the
existing authorization implementation corrected the tests; the product
authorization behavior was not changed to satisfy the mistaken expectations.

On the authoring candidate, locked dev-extra synchronization, full Ruff, and
mypy over 340 application files pass. Sixteen consumer suites pass 513 cases;
one concurrent-login case deliberately skips because disposable M4 PostgreSQL
is unavailable in the source lane. The upstream TestClient/httpx warning stays
visible. Locked default and zilliz dependency audits found no known
vulnerabilities. The first audit attempt timed out while uvx fetched the
already cached pip-audit tool; using the cached pinned tool restored the
same canonical audit without disabling its online advisory lookup. Local
verification and documentation reachability checks also pass.

Framework runtime acceptance, independent final review, protected CI,
merge, and clean-master M4 acceptance remain separate follow-up gates. These
results do not establish universal compatibility for every JSON-body route.

The 0.158.2 batch subsequently merged through PR #1258 as
`bb07d309b3af082a127300c9530fd178f1a11d5e`, after independent review and all
six required checks passed. The M4 candidate passed 261 cases with one
disposable-PostgreSQL skip. A separate execution of that concurrent-login test
against a disposable M4 PostgreSQL schema passed without skips. Clean-master
promotion recorded accepted state for #1258, followed by 58 passing focused
tests and bounded HTTP checks. The advisory OpenCodeReview run selected no
files and made no model call; its green skipped result does not establish
recovery of the older HTTP403 failure. Production was not changed.

## Separate 0.159.0 scalar-query follow-up

Dependabot then advanced #1104 again, this time to 0.159.0 and lock revision 5.
Regenerating from the latest master, after frontend PR #1259, with pinned uv
0.12.10 changes only FastAPI's version and two artifact records. Revision 3,
the dependency edges and every other package remain unchanged; no bot lock is
copied over the integrated dependency graph.

The upstream feature concerns optional query/header/cookie parameter models.
The application has no identified direct optional model consumer there, but
does have nullable scalar datetimes, Literal filters, dependency-produced
filters and public query aliases. Eight new tests exercise the actual
subscription route and generated application OpenAPI: omitted and valid UTC
or offset datetimes, empty/invalid dates, invalid enum filters, nullable schema,
pagination constraints and the existing `range` alias. They use isolated
SQLite and existing test credentials; no commercial write or paused feature
execution is introduced. The existing route consumers cover successful enum
filters, authentication, JSON-body/replay behavior, setup and upload cleanup.

Locked dev synchronization and all 16 selected consumer suites pass 445 cases,
with one deliberate disposable-M4-PostgreSQL skip. Full Ruff and mypy over
340 application files pass. Canonical locked default and zilliz dependency
audits report no known vulnerabilities, using the same cached pinned tool
bootstrap and online advisory lookup. These are new 0.159.0 local results;
the earlier 0.158.2 runtime and PostgreSQL evidence does not prove this release.
Independent review, protected CI, M4 candidate execution, merge and clean-master
acceptance remain separate gates for this follow-up.
