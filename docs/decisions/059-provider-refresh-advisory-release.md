# ADR-059: Existing-Catalog Provider Refresh Is Advisory During Release

## Status

Proposed development candidate on 2026-10-14. This decision does not authorize
production deployment or provider credential changes.

## Context

Provider catalog refresh currently runs during an application cutover. A
temporary provider authentication failure, such as an expired API key, aborts
the whole release before the new API and workers can start. That couples the
ability to change application code with the availability of every configured
upstream credential. It also leaves the operator unable to reach the admin
surface needed to replace the key.

## Decision

- The refresh command remains **strict by default**. Strict mode is used by
  ad-hoc and non-production invocations and fails on any provider error.
- The production release workflow explicitly selects `best-effort` mode.
- Best-effort mode is allowed only when a non-bootstrap catalog revision and at
  least one historical catalog instance are present. It refreshes each provider
  independently, retains the previous projection for failed providers, and
  writes a mode-0600, key-free result record under the release state directory.
- Bootstrap, missing catalog, or an inability to establish the historical
  projection remains a hard failure. A release cannot create its first usable
  routing catalog through best-effort mode.
- A degraded result is passed only as a transient cutover flag. Internal
  readiness may accept `stale` or `attention` provider freshness when all
  worker, cadence, dependency, and provider-operational checks pass and there
  is at least one provider instance. `missing`, `unknown`, unhealthy providers,
  and zero instances continue to fail readiness.
- Runtime routing and provider calls remain fail-closed for invalid credentials.
  This change does not retry calls, relax budgets, or mark an unavailable
  provider healthy. The operator repairs or disables the provider through the
  admin surface after the release.

The result record contains provider IDs, status, revision and bounded failure
type labels only. It never contains credentials, response bodies, or exception
messages from upstream services.

## Consequences

Application and admin fixes can reach an existing installation while one
provider is unavailable. The deployment receipt must call out a degraded
provider refresh separately from application readiness; a successful cutover
does not mean provider acceptance is complete. The next provider refresh or
credential update restores fresh evidence.

## Rollback

Revert the deployment-script, workflow, test and documentation changes through
reviewed Git. Strict refresh behavior remains the safe fallback. No database
rollback or provider credential mutation is required by this decision.
