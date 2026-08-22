# Single-Operator AI Development, M4 Validation, and Production Release Playbook v1

Status: active engineering playbook.

Purpose: consolidate the lessons from the Portal UX, user-problem diagnosis,
observation/cohort, CI, M4, release, and production-preparation work into one
repeatable operating method for the current project: one operator, AI-assisted
development, a local authoring Mac, an office M4 Docker runtime, GitHub, local
WordPress consumers, and a separately protected production server.

This playbook is a synthesis and routing guide. Normative ownership, M4,
release, privacy, and security details remain in the linked standards. Dated
closeouts are evidence records, not permanent present truth.

## 1. The core model

The project has four different questions, answered by four different surfaces:

| Question | Authority | Result |
| --- | --- | --- |
| Did the changed source pass the smallest useful checks? | Authoring Mac | `local verified` |
| Does the changed Cloud behavior work in a realistic Docker/runtime consumer? | M4 | `M4 candidate validated` |
| Can the clean revision be integrated safely? | GitHub PR/CI | `PR verified` / `merged into master` |
| May the formal service be changed? | Production release policy + operator | `production validated` |

Never collapse these into a single “done” state. A screenshot, an HTTP 200, a
green CI job, an M4 candidate, a merged commit, and a production deployment
prove different things.

The ownership boundary is stable:

- WordPress/local Npcink owns abilities, workflows, prompts, presets, approval,
  preflight, final audit truth, object mutation, and publication.
- Cloud owns hosted execution, provider adapters, usage/entitlement evidence,
  health diagnostics, artifacts, and bounded read-only runtime projections.
- M4 owns disposable Docker/runtime/migration/preview evidence.
- Git owns source truth; production owns the deployed release state.

Cloud must not become a second WordPress control plane, workflow registry,
prompt/router truth, approval system, or final-write owner.

## 2. What the historical work taught us

### 2.1 Product and Portal UX

The original user-facing issues were not isolated visual defects. They exposed
state-ownership and recovery problems:

- login could succeed while the visible Portal context remained stale;
- account-level entitlements were easy to confuse with site-level usage;
- site selection changed real account, quota, usage, and support scope and could
  not be deleted merely because the UI looked repetitive;
- a single-site account needed a recoverable selection path when an old
  `selected_context` was empty or invalid;
- no-site, multi-site, inactive-site, quota, permission, error, and session
  recovery states needed deterministic coverage.

The durable design lesson is to simplify the visible UI without deleting the
underlying state transition. Keep one clear management-site selector, explain
what it controls, and preserve server-side authorization and recovery behavior.

### 2.2 Observation, cohort, and telemetry

Monitoring and cohort data answer different questions:

- monitoring is an operational collection/projection mechanism;
- a cohort identifies an observation group or period, not a permanent business
  identity;
- site/account identity must remain explicit and protected, while observation
  labels remain bounded metadata.

The useful default is privacy-safe, metadata-only evidence: event type, state,
timing, error class, site/account scope where authorized, and quality outcome.
Do not retain prompts, generated text, article content, credentials, provider
keys, or unnecessary user identifiers.

Always report these quantities separately:

`Provider calls`, `AI credits`, `Cloud runs`, `plugin events`, `quality
sessions`, `technical task receipts`, `M4 evidence`, and `human-value evidence`.

Do not infer human value from plugin events, CI success, M4 acceptance, merged
code, or an empty buffer. `observability buffer=0` and `quality pending=0` are
useful closure signals, not proof of product benefit.

### 2.3 M4 and local development

M4 is the remote Docker integration environment for local development. It is
valuable because it can expose Docker, PostgreSQL, Redis, worker, callback,
proxy, browser, and WordPress-consumer behavior that source checks cannot.

M4 is not:

- a source repository;
- a place to edit or commit code;
- a replacement for GitHub CI;
- a production deployment controller;
- a second WordPress control plane.

Use the smallest M4 lane:

| Change | M4 action |
| --- | --- |
| docs, CI-only, local-only tests, WordPress-only behavior | no M4 by default |
| ordinary Cloud/API/frontend/worker/runtime source | `m4:preview:sync` |
| Dockerfile, Compose, dependency, proxy, image, deployment input | `m4:preview:deploy` |

For Portal-only visual work, use a frontend slot when possible. Occupy the
primary `18010` preview only after checking its owner and current revision; do
not overwrite another candidate. A foreground tunnel is an access path, not a
permanent deployment control plane.

### 2.4 CI and development speed

The project initially allowed long GitHub backend shards to become the first
debugging environment. A production-promotion run demonstrated the failure
mode: most checks passed, while one pytest shard reached its 1200-second
timeout and returned exit code 124 without a useful test assertion.

The correction is not to remove safety checks or increase the timeout forever.
Use a local-first sequence:

1. `pnpm run verify:local` selects the narrowest checks from the current diff;
2. M4 supplies runtime evidence only when the Cloud seam requires it;
3. GitHub supplies clean-environment, security, and merge evidence;
4. production has its own exact-SHA release gate.

The pytest scheduler may use natural successful `master` timing artifacts, but
weight refreshes must be observed over multiple natural runs. Do not use a
failed production run as a durable weight source, add a fifth shard, or inflate
timeouts merely to hide imbalance.

### 2.5 Release and production

Production work repeatedly exposed the cost of mixing development fixes into a
frozen promotion. The durable release rules are:

- feature/fix work lands in `master` first;
- promotion targets `production` and contains only the frozen release envelope;
- the exact production SHA, source tree, bundle, scan, rollback, and readiness
  evidence must agree;
- `production:release:preflight` is read-only and must reach `ready`;
- a manual `Deploy Production` authorization is required;
- post-deploy health, WordPress consumer checks, and natural observation are
  separate evidence.

If a release check fails, do not append unrelated Portal, Admin, documentation,
or CI redesign work to the frozen promotion. Close the promotion, repair the
root cause in a separate reviewed change, and regenerate a fresh promotion.

### 2.6 The sequence that led to this playbook

The historical work followed a useful progression:

1. **Portal symptom discovery** — a logged-in user could still see stale or
   ambiguous context. Investigation traced the symptom to session/context and
   account-versus-site ownership rather than treating it as a cosmetic bug.
2. **Portal simplification** — repeated row-level site controls were removed
   from the visible surface, while the underlying site-selection capability and
   permissions were preserved. A single-site recovery path was added after the
   “唯一站点但无法重新选择” P1 was found.
3. **Observation design** — monitoring, cohort labels, site identity, consent,
   buffers, pending quality work, and privacy-safe metadata were separated so
   operational evidence could not silently become business identity or content
   retention.
4. **Local/M4/CI separation** — M4 became the realistic Docker and consumer
   preview environment; GitHub became the clean integration/security authority;
   the authoring Mac stayed source-first.
5. **Release hardening** — incorrect bases, stale branches, CVE evidence,
   production bundle identity, exact SHA, and frozen promotion scope were made
   explicit. Failed promotions were closed rather than patched in place.
6. **Efficiency correction** — the long CI shard failure showed why local
   focused checks must precede GitHub, while natural CI timing evidence—not
   arbitrary timeout increases—should guide scheduler changes.

The recurring engineering pattern is: trace the state owner, reduce the user
surface without removing required capability, validate the smallest meaningful
runtime path, preserve evidence boundaries, and only then widen the gate.

## 3. Standard task workflow

### Phase A — Scope and evidence envelope

Before editing:

1. run `git status --short --branch`;
2. read `README.md`, `AGENTS.md`, the development operating model, the tier
   standard, and only the boundary documents selected by the changed seam;
3. fetch `origin` when the current baseline matters;
4. preserve user changes and use one clean, locked worktree when needed;
5. write a compact change envelope:
   focused module, intended outcome, non-goals, contracts, expected files,
   verification, rollback, and forbidden external systems.

Classify the whole change by its highest-risk seam:

- L0: bounded appearance-only change;
- L1: route composition, interaction placement, responsive or disclosure
  change;
- L2: API, auth, state ownership, persistence, worker, shared primitive,
  dependency, Docker, proxy, migration, or deployment change.

### Phase B — Local-first development

Run:

```bash
pnpm run check:changed -- --plan --workflow-lane development
pnpm run check:changed -- --doctor
pnpm run verify:local
```

Then run the focused browser, contract, API, domain, or type check selected by
the plan. Stop on a failure; reproduce, localize, reduce, fix the root cause,
add a regression guard, and rerun only the meaningful gate.

### Phase C — M4 candidate (when runtime is in scope)

Read M4 status first. Confirm owner, revision, health, and whether `18010` is
occupied. Run `sync` for ordinary Cloud source or `deploy` only for build/runtime
fingerprint changes. Verify one focused runtime/consumer path and record:

- candidate revision;
- route/consumer and viewport;
- exact command and result;
- M4 owner and rollback;
- any omitted checks.

Do not call a candidate merged or production-ready.

### Phase D — Git integration

Review the diff, stage only task files, verify the staged stat and names, commit,
and publish a PR from a clean topic branch. GitHub checks are the merge
authority. For CI/tooling changes, GitHub is the runtime authority and M4 is
normally unnecessary. For Cloud runtime changes, merge and then promote clean
`master` to M4 when the M4 acceptance gate applies.

### Phase E — Production release (only when explicitly requested)

Use a clean release worktree and a frozen promotion. Verify green exact
`master`, release plan, bundle, CVE/security evidence, rollback, and
`production:release:preflight -- --sha <sha>`. Stop and report if any evidence
is missing, stale, or belongs to another revision. Request the exact operator
authorization only after readiness is `ready`.

### Phase F — Post-release observation

After deployment, record health, consumer verification, rollback boundary,
deployment attempt count, and a bounded natural observation window. Do not
manufacture traffic, Provider calls, human scores, or telemetry to fill a
receipt.

## 4. Failure and stop rules

Stop the current lane when:

- a test fails and is not yet reproduced or localized;
- a second independent blocker appears;
- M4 owner/revision/health is unknown;
- a candidate differs from the source being claimed;
- CI runner state is stale or logs are unavailable;
- a cross-site, permission, prohibited-field, or unauthorized-write signal
  appears;
- a budget, Provider, deployment, or external-transfer limit is reached.

Preserve evidence and report the highest state actually proved. Do not repeat a
broad gate for the same revision unless it answers a distinct risk question.
After two consecutive failures with the same external-transfer signature, stop
automatic retries and use the documented recovery lane or request a decision.

## 5. Practical command map

| Need | Command | Mutates |
| --- | --- | --- |
| Plan local checks | `pnpm run check:changed -- --plan` | no |
| Diagnose local prerequisites | `pnpm run check:changed -- --doctor` | no |
| Run local development gate | `pnpm run verify:local` | local evidence only |
| M4 read-only status | `pnpm run m4:preview:status` | no |
| M4 ordinary source candidate | `pnpm run m4:preview:sync` | M4 candidate |
| M4 build/runtime candidate | `pnpm run m4:preview:deploy` | M4 candidate |
| M4 focused test | `pnpm run m4:preview:test -- --focused ...` | M4 test state |
| Production policy check | `pnpm run check:release-policy` | no |
| Exact production preflight | `pnpm run production:release:preflight -- --sha ...` | no |

No command in the development lane authorizes production. No M4 candidate
command makes a production claim.

## 6. Phased improvement plan

1. **Local-first gate** — keep `verify:local` as the normal pre-publish entry
   point and ensure failures are reproducible locally.
2. **Risk-tiered CI** — preserve targeted checks for ordinary PRs, complete
   checks for L2/runtime and release-sensitive changes, and observe pytest
   balance from natural successful `master` runs.
3. **M4 integration discipline** — use M4 for realistic Cloud runtime and
   WordPress-consumer feedback, with explicit owner/revision/TTL and no source
   edits on M4.
4. **Release isolation** — keep promotion frozen, exact-SHA bound, manually
   authorized, and separate from product iteration.
5. **Evidence-based iteration** — after several natural samples, compare local
   time, CI time, M4 time, failure class, and human-value evidence before
   changing the workflow again.

The stopping condition is not “all possible automation exists.” Stop when the
smallest workflow answers the actual risk question, evidence is trustworthy,
and additional gates add more delay than decision value.

## 7. Authoritative references

- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md)
- [Engineering Command Inventory Standard](engineering-command-inventory-standard-v1.md)
- [CI Pytest Sharding](ci-pytest-sharding-v1.md)
- [Early Product Validation and Minimal Telemetry Standard](early-product-validation-and-minimal-telemetry-standard-v1.md)
- [Customer Journey Metadata](customer-journey-metadata-v1.md)
