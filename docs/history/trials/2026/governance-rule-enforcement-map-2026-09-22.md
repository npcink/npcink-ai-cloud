# Governance Inventory: Rule-to-Executor Map - 2026-09-22

Status: read-only planning evidence collected for a governance review. Not a
contract, standard, or authority. Nothing was reconfigured or re-run.

Source: rule statements in `AGENTS.md` and `README.md` (Development
Workflow / M4 / Release sections) mapped against the repository's executor
inventory (package.json scripts, `scripts/`, `.github/workflows/`,
`.github/scripts/`, Makefile). Collected at `origin/master` revision
`1d6100f6` on branch `codex/governance-inventory-20260922`.

Classes: **ENFORCES** = a tool exits nonzero, blocks merge, or blocks
publish; **PARTIAL** = a tool covers part of the rule or only a checkpoint;
**REPORTS** = a tool produces evidence but blocks nothing; **SELF** =
agent/operator discipline only.

## Map

| Rule cluster (source) | Executor | Class |
| --- | --- | --- |
| Session startup protocol (git status, read README/boundary docs, report before editing) | none | SELF |
| Compact change envelope before editing | `ai:task:plan`/`ai:task:verify` exist but adoption is optional per session | PARTIAL |
| Workflow lanes (development/merge/release declared, not path-authorized) | `check:changed --workflow-lane` flag records the lane; honesty of declaration | PARTIAL |
| Narrowest-gate-first, no duplicate broad gates | `check:changed` planner/`verify:local` | PARTIAL (planner advises; choice is SELF) |
| `check:fast` as repository integration gate | `pnpm run check:fast` (contract + domain suites) | ENFORCES (when run; CI runs the sharded equivalent) |
| Time budgets (45/90/120 min split-and-report) | `timing:acceptance` measures single commands | REPORTS |
| Provider-call budget / no manufactured observation data | `provider:call-ledger` gates real-Provider dispatches | ENFORCES (dispatch gate) |
| Worktree discipline (one aux worktree, lock with codex reason, audit) | `worktree:audit` computes lock state and dispositions | REPORTS (lock itself is SELF) |
| No `git add -A`, stage exact files, clean tree at commit | `pr:publish` requires clean worktree before publishing | PARTIAL (publish-time only) |
| PR template Scope/Boundary/Verification/Risk | `publish-pr.sh` + `.github/scripts/check_pr_body_contract.py` (CI job) | ENFORCES |
| Dependabot trusted-bot contract (identity, branch, dependency-only files, from/to statement) | `check_pr_body_contract.py` | ENFORCES |
| Production PR operator-approval sentence; production base/head rules | `publish-pr.sh`, `check-production-pr-base.py`, `production-promotion-preflight.py` | ENFORCES |
| Frozen release envelope (no unrelated changes after promotion starts) | base/head and evidence preflights | PARTIAL (content scope is SELF) |
| No secrets/`.env.deploy`/keys in commits | `secret-scan` (gitleaks) in CI; `check:release-policy` rejects retired files | ENFORCES |
| No direct production source edits on server | deploy workflow is typed-confirmation + SHA-bound; break-glass path | PARTIAL (workflow-gated; server-side edits undetectable) |
| Release policy markers (~70 files, compose image seams, dependabot config, cutover order, no QUIC) | `check:release-policy.sh` (1323 lines) + compose protocol guard | ENFORCES |
| Anti-drift (contract-file for cloud tasks, forbidden high-risk tokens, no active k8s, metadata projection doc) | `check-cloud-anti-drift.js` | ENFORCES |
| Provider env retirement (no provider creds in env/scripts) | `check-provider-env-retirement.js` | ENFORCES |
| Perimeter (prod compose renders closed, health contract holds) | `check:perimeter` (`check-cloud-perimeter.sh`) | ENFORCES |
| Doc index reachability (no orphan docs) | `check:doc-reachability` (CI job `doc-reachability`) | ENFORCES |
| Boundary-doc reading before seam edits | `check:changed --plan` names the boundary docs for the seam | PARTIAL (router suggests; reading is SELF) |
| Admin UI standards (manifest, shared primitives, tokens, no route-local overlays, no border-dashed) | `check:admin-ui*` family (~20 contract tests + visual gates) | ENFORCES |
| M4 protocol (no lock seizure, candidate vs accepted states, promote only merged PR) | `m4:preview:promote --pr` gates on PR merge; status verifies source state | PARTIAL (operation discipline is SELF) |
| M4 observation receipt in every M4 task report | none (conversation-level output) | SELF |
| Production timing receipt per promotion | `release:timing*` compute evidence | REPORTS (writing the receipt is SELF) |
| Credential/customer-content redaction in docs and PR bodies | gitleaks covers secret shapes | PARTIAL |
| One module per session | none | SELF |
| Report the highest evidence state actually reached | none | SELF |

## Summary count

Of 28 rule clusters: 12 ENFORCES, 8 PARTIAL, 3 REPORTS, 5 SELF.

The load-bearing observation: the repository enforces **publication- and
merge-shaped rules** extremely well (PR contracts, release policy, secrets,
anti-drift, perimeter, doc reachability), while **session-shaped rules**
(change envelope, lane honesty, budgets, receipt writing, worktree locking)
have at most reporting tools. That matches the failure mode the rules were
written against: drift at publish/merge time is blocked mechanically, drift
inside a session is caught only by review or retrospective.

## Checker candidates (narrow, low-cost)

1. **Worktree lock enforcement**: `worktree:audit` already computes lock
   state; a `--require-locked` fail-closed mode could run at closeout so an
   unlocked auxiliary worktree fails the task instead of relying on recall.
2. **ADR numbering integrity**: missing/duplicate numbers (044 gap, double
   028) are a trivial scan; fold into `check:doc-reachability` or the
   docs-only CI lane.
3. **Dated-file-at-root lint**: any new dated file at `docs/` root requires
   an explicit README retention entry; turns the 144-file root backlog into
   a non-growing debt.
4. **Change-envelope presence**: `ai:task:verify` already records planned
   gates per task; making `verify:local` emit the envelope file when absent
   would convert the envelope rule from SELF to PARTIAL without new
   machinery.

Rules that should stay SELF (mechanically unenforceable or not worth the
machinery): receipt prose quality, "report the highest evidence state",
one-module-per-session, boundary-doc comprehension.
