# M4 Single-Lane Dependency Risk Register - 2026-09-23

Status: planning evidence from the 2026-09-22 governance review follow-up.
Not a contract, standard, or authority; it authorizes nothing and changes no
policy. Its purpose is to make the M4 single-host dependency explicit so the
operator can price the residual risk instead of discovering it during an
outage.

## What M4 is, in one paragraph

M4 is the single Mac mini that owns routine Cloud Docker build, execution,
migration, and focused integration evidence (ADR-025). The authoring Mac owns
source, Git, and operator commands; GitHub owns required PR checks; the
production host is deployed by a GitHub-hosted runner over SSH. M4 is a
development-evidence lane, not a source, CI, or production dependency.

## Blocked and not blocked during an M4 outage

Not blocked (verified paths):

- source edits, commits, branch and PR publication (authoring Mac + GitHub);
- local static and unit evidence: ruff, mypy subset, and the pytest lanes
  that run from a local venv (proven 2026-09-22: 37 contract tests plus the
  full 33-test encryption-cutover suite ran on the authoring Mac);
- all GitHub required checks (backend shards, CodeQL, release-policy,
  doc-reachability) and merge into `master`;
- production deployment (`deploy-production.yml` runs on a GitHub-hosted
  runner and SSHes to the production host; M4 is not on that path).

Blocked until M4 returns:

- `m4:preview:sync` / `deploy` candidate previews and any runtime behavior
  evidence they would prove;
- `m4:preview:test` focused integration runs on the real Compose stack;
- `m4:preview:promote` — so merged PRs cannot reach `acceptance_state=accepted`,
  and the M4 acceptance queue stalls;
- `m4:frontend:*` slot operations;
- the ordinary-loop M4 observation receipts.

Policy that stays fixed during an outage: the authoring Mac must not become a
substitute Cloud Docker runtime, and commands fail closed rather than silently
switching transport (ADR-052; M4 standard). An outage therefore degrades
evidence latency, not evidence honesty: work is reported as
`local/CI-merged, promotion pending M4`, never as accepted.

## Failure-surface inventory and existing coverage

| Surface | Existing coverage |
| --- | --- |
| Network path to M4 (tunnel) | Three-route automatic fallback: office LAN -> Pgy overlay -> Tailscale (ADR-052) |
| Transfer mode failure | Explicit relay mode with bounded 15-minute transfer and SHA-256 verification (ADR-051); operator-selected, never silent |
| M4 Docker/Compose state after restart | `pnpm run m4:preview:recover` container recovery |
| Relay host failure | Relay is only a transport buffer for recovery mode; direct transfer is the default path |
| M4 host hardware / long outage | **No coverage.** Single host, single operator, no substitute runtime permitted |

## Uncovered scenario and its real cost

A multi-day M4 outage (hardware failure, repair, relocation) blocks all
runtime acceptance evidence. Source work continues and merges; what
accumulates is unpromoted PRs and a growing gap between `merged` and `M4
accepted`. The cost is bounded evidence latency for a single-operator
workflow - no customer-facing or production system depends on M4 - but the
acceptance backlog makes every subsequent promotion slower to trust.

## Decision framing (for the operator, not decided here)

1. **Accept (current posture).** Zero recurring cost; outage cost is evidence
   latency only. Revisit trigger: any single outage that blocks a needed
   acceptance for more than one working day.
2. **Second runtime lane (second Mac mini or equivalent host).** Removes the
   single point of failure; costs hardware plus a second M4 standards update
   (route table, lock ownership, observation table writer). ADR work exists
   to copy from.
3. **Time-boxed local-Docker degraded mode.** Would require amending the M4
   standard and AGENTS.md, which currently forbid it. Only worth drafting if
   outages become recurring; it trades policy clarity for convenience.
4. **CI-hosted runtime lane.** Out of scope by policy: M4 credentials must
   not enter GitHub-hosted CI (AGENTS.md), so this option is listed only to
   record that it was considered and rejected.

Recommendation recorded in this register: keep option 1 with its revisit
trigger; revisit the register whenever an actual outage occurs so the cost
estimate gets replaced by measured experience.
