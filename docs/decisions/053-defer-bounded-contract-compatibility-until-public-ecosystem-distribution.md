# ADR-053: Defer Bounded Contract Compatibility Until Public Ecosystem Distribution

## Status

Proposed — awaiting operator acceptance. This ADR changes no code; it records a
future lifecycle switch and its trigger.

## Date

2026-09-18.

## Context

`docs/refactor-master-plan-v1.md` rules 9-10 define `NO_COMPATIBILITY_LAYER`
and `ONE_ACTIVE_CONTRACT_VERSION`, and ADR-004 freezes both. The master plan
states its own scope explicitly: "Npcink AI Cloud is under active development
and has no external users. This is the lowest-cost point to remove obsolete
contracts." The no-external-user premise is what makes same-milestone deletion
correct; the rules were never written as permanent ecosystem policy.

The current implementation matches this strictly:

- `app/domain/wordpress_ai_connector/contracts.py:182` and `:343` accept
  exactly one `contract_version` string per contract family and reject
  everything else with a structured error;
- the repository contains no `upgrade_required`, `minimum_supported_contract_version`,
  or `minimum_supported_connector_version` mechanism anywhere;
- `npcink-cloud-addon` hardcodes its contract version strings
  (`wordpress_operation.v1`, `cloud_connector_runtime.v1`,
  `ai_task_contract.v1`, and others).

Once the Addon or self-hosted Cloud is publicly distributed, version skew
becomes the normal state and arrives from two directions:

| Direction | Cause | Failure |
| --- | --- | --- |
| Old Addon → newer hosted Cloud | WordPress users disable auto-update; addon updates lag weeks to months | Hosted Cloud upgrade deletes the replaced contract version in the same milestone; old addon requests fail |
| Newer Addon → older self-hosted Cloud | Self-hosted operators skip upgrades | New addon sends a version the old Cloud never knew; requests fail |

The failure today is not silent — Cloud returns a structured version-mismatch
error code — but nothing maps those codes to an actionable upgrade prompt, so
the WordPress end user experiences a broken editor feature.

## Decision

1. **Keep `ONE_ACTIVE_CONTRACT_VERSION` as the active rule now.** No
   compatibility layer, no parallel contract versions, no compatibility code
   is written in the pre-public stage.

2. **Define the switch trigger in advance.** The compatibility lifecycle
   activates at the earliest of:
   - the Addon becomes publicly distributed (wordpress.org or open public
     download, not hand-installed trial copies);
   - self-hosted Npcink AI Cloud distribution opens beyond operator-run
     instances;
   - a managed customer base exists that the operator does not personally
     update.

3. **At the trigger, replace the rule with `BOUNDED_COMPATIBILITY_WINDOW`:**
   - at most two protocol generations per contract family (current + previous);
   - a declared `minimum_supported_contract_version` (and, where meaningful,
     `minimum_supported_connector_version`) per contract family;
   - a version inside the window but older than current receives a stable
     `upgrade_required`-class structured error code, not a generic rejection;
   - a version below the minimum receives the existing
     version-not-supported class of error;
   - a replaced contract version is removed only when the compatibility
     window closes, not in the same milestone as its replacement.

4. **Cheap pre-positioning, no protocol change:** version-mismatch error
   codes are already structured and stable in practice; this ADR declares
   them public surface. The Addon may map them to an upgrade prompt at any
   time without a Cloud change.

5. **The trigger is a recorded state change, not a date.** When any trigger
   condition is met, the distribution decision record must state that
   ADR-053's compatibility lifecycle is activated, and the master plan rules
   9-10 and ADR-004 receive a scoped amendment in the same change.

## Alternatives considered

### Keep `ONE_ACTIVE_CONTRACT_VERSION` permanently

Rejected. With real WordPress sites, every Cloud breaking change becomes a
simultaneous multi-site outage for lagging addons, and self-hosted Cloud
installations break against newer Addons.

### Adopt the compatibility window now

Rejected. There are no external consumers of old contract versions. Building
the window now adds dead code, test burden, and slower deletion velocity with
zero benefit in the current stage. The master plan's own premise — remove
obsolete contracts while no external users exist — remains the cheapest path.

### Switch on a date instead of a distribution state

Rejected. Time does not create version skew; distribution does. A date
trigger either fires too early (before real users exist) or too late (after
public sites already depend on old versions).

### Build a server-driven capability/version handshake now

Rejected as premature. The structured error codes already carry the minimum
signal an Addon needs ("this version is not supported"). A proactive
handshake endpoint is additive and can be introduced with the compatibility
window itself if evidence shows error-driven detection is insufficient.

## Consequences

- Breaking contract changes continue to delete replaced versions in the same
  milestone until the trigger fires. Nothing in current development practice
  changes.
- `tests/contract/test_refactor_target_contract.py` assertions on ADR-004 and
  the master plan remain valid; this ADR does not edit those files. The
  trigger-day amendment is expected to touch them plus the contract tests.
- Version-mismatch error codes must not be renamed casually from now on;
  they are declared public surface ahead of the compatibility window.
- The operator must remember the trigger exists. The practical carrier is the
  distribution decision itself: any closeout that publishes the Addon or
  opens self-hosted Cloud must check this ADR.

## Verification

Documentation-only change: no code, schema, route, or test modification.
Verification is limited to duplicate-free ADR numbering (053 is unique in
`docs/decisions/`) and an index line in `docs/README.md` so the decision is
reachable.

## Rollback

Before acceptance: delete this file and its `docs/README.md` index line.
After acceptance: mark it `Superseded` and record the successor; never delete
accepted ADR history.
