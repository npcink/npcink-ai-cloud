# Cloud Admin Frontend Remediation Final Closeout

Status: time-bounded Admin historical evidence; not current Admin UI authority.

Current authority: [Admin UI Standard](../../../../cloud-admin-ui-standard-v1.md),
[Admin Frontend Engineering Standard](../../../../cloud-admin-frontend-engineering-standard-v1.md),
and [Admin Information Architecture](../../../../cloud-admin-information-architecture-v2.md).

Original status: accepted and frozen pending new operator evidence.

Date: 2026-07-29.

Final accepted revision:
`0b3119c3725550ccf737a78b966b707ce2d68db7` through PR #356.

## 1. Purpose

This document closes the bounded Cloud Admin frontend remediation sequence that
started with a code-and-test distribution audit and the question of whether an
Ant Design-like component system would solve the observed problems.

The answer is evidence-based:

- the main problems were state ownership, backend pagination, request
  lifecycle, behavior evidence, and large route responsibility;
- the repository already had an accepted visual system and shared Admin
  primitives;
- a broad component-library migration would not have fixed the backend or
  state-ownership causes;
- individual headless capabilities are acceptable only when measured burden
  removal justifies their cost.

The stage is complete. This document does not authorize another implementation
stage automatically.

## 2. Original Goal And Success Criteria

The goal was to reduce correctness risk and maintenance cost without:

- replacing the accepted Cloud Admin information architecture or visual
  language;
- making Cloud a second WordPress control plane;
- introducing a second API client, schema truth, error system, i18n system, or
  global client store;
- performing a broad table, form, route, or component migration;
- confusing local checks, candidate M4 behavior, merged source, M4 acceptance,
  production deployment, and human acceptance.

Success required a narrow change sequence, focused behavior tests, measured
bundle cost, protected PR checks, exact staging, and clean-current-`master` M4
promotion for runtime changes.

## 3. Evidence-Led Delivery History

| Stage | Problem addressed | Accepted evidence |
| --- | --- | --- |
| Behavior gate | Existing Vitest behavior tests were not part of default frontend CI | PR #348, `c9f2a6265f245de4ec995bc12beb10a660cdc1cf` |
| First Query pilot | Portal users owned duplicated request lifecycle and route-local server state | PR #349, `87702f6634a41e2ea65c2afc7f139fa9b3136a5d` |
| Pilot closeout | Coverage and route-bundle cost needed explicit evidence | PR #350, `b2a0eb6396ffd5c7ea0967fd878c44b3391b3e96` |
| Backend prerequisite | Portal users still filtered, counted, and paged a fully hydrated directory in memory | PR #352, `69a195fc6a568f67e330963f38e00055358182bc` |
| Query reuse | Support requests repeated request, refresh, stale-result, and mutation lifecycle | PR #353, `4532c53341a8685501822add55ccea4ff1d84286` |
| Form decision | Account creation accepted whitespace-only values and mixed field, submit, trim, payload, and request concerns | PR #356, `0b3119c3725550ccf737a78b966b707ce2d68db7` |

The accepted result is:

- Portal users filtering, counts, stable ordering, pagination, and page
  selection are repository-owned SQL operations;
- Portal users and Support requests reuse the project Query provider through
  feature-owned modules;
- stale or placeholder Support result scopes are visible but read-only;
- the account-create form owns its validation and submit lifecycle behind a
  dependency-free feature boundary;
- structural contracts remain architecture guards, while Vitest and
  Playwright prove behavior;
- no complete visual component library, headless table library, form library,
  global store, backend migration, or production deployment was added.

## 4. Dependency And Bundle Decisions

The first Query pilot made the shared provider cost visible. The Support
requests reuse added `4,220` gzip bytes over the accepted shared-provider
control and removed duplicated lifecycle behavior. That was accepted for two
bounded queues, not as permission for repository-wide conversion.

The account-create form tested React Hook Form plus the Zod resolver:

| Account route build | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| Accepted baseline | 931,859 | 243,678 |
| Form-library candidate | 1,233,069 | 319,062 |
| Retained dependency-free form | 933,131 | 244,133 |

The library candidate added `75,384` gzip bytes, about 31%, for five fields.
It failed the proportionality stop condition and was removed. The retained
solution added only `455` gzip bytes, about 0.19%, while preserving trimming,
required-field validation, typed payload mapping, submit state, accessibility,
and tests.

The rule is:

> Dependency adoption is not the objective. Simpler ownership with measured,
> proportionate cost is the objective.

## 5. Final Acceptance State

PR #356 passed protected GitHub checks and clean current `master` was promoted:

```text
acceptance_state=accepted
promotion_pr=356
source_revision=0b3119c3725550ccf737a78b966b707ce2d68db7
source_branch=master
source_dirty=false
```

The M4 API and frontend were healthy after promotion. Local authenticated
browser validation confirmed that whitespace-only Account ID and Name show
localized errors, both controls become invalid, and the customer list remains
unchanged. No real account was created during that validation.

This is M4 acceptance, not production deployment, GA, or external human
acceptance. No production deployment was performed.

## 6. Work Review Report

### Original objective

Inspect the runtime/test code distribution, identify the actual frontend
problems, decide whether a component library would solve them, implement the
approved issues sequentially, and leave durable rules that prevent later AI
sessions from restarting a broad migration.

### Completion

- [x] Code and test distribution were measured and interpreted as navigation
  evidence rather than a quality score.
- [x] The missing behavior-test and bundle evidence was added.
- [x] Portal users pagination was moved to the repository/SQL boundary.
- [x] Support requests became the bounded second Query-first queue.
- [x] One small form pilot was measured; the costly dependency was rejected
  and the useful boundary retained.
- [x] Focused tests, protected PR checks, merge, and clean-master M4 acceptance
  were completed.
- [x] Engineering rules, closeouts, retrospective, and new-session guidance
  were written.
- [ ] Production deployment and external human acceptance were not performed
  because they were outside this stage.

### Problems found

| Severity | Specific problem | Root cause | Correction |
| --- | --- | --- | --- |
| Must correct | Portal users paged after full-directory hydration | The initial frontend pilot exposed but did not own the backend scaling boundary | Move filters, counts, ordering, pagination, and candidate selection into SQL before expanding the frontend pattern |
| Must correct | A retained Support result could look actionable under a different filter scope | Visibility and mutation authority were treated as the same state | Label retained scope and disable status, note, and update actions until the authoritative request key matches |
| Should correct | A structural contract failed after safe feature extraction | It inspected only the route file and confused source shape with behavior | Aggregate declared route and feature sources for architecture guards; use Vitest/Playwright for behavior |
| Should correct | Support URL state could revert after direct history replacement | Next search-parameter state and manual history state had competing ownership | Give URL synchronization one owner and exercise filter/clear/back behavior in a real browser |
| Should correct | Form error text changed the input accessible name | Error text was nested inside the label | Use stable `htmlFor`/ID labels and `aria-describedby` for errors |
| Should correct | The first form-library candidate added 75,384 gzip bytes | A general form stack was tested against only five simple fields | Enforce before/after production bundle measurement and remove dependencies that fail proportionality |
| Suggested improvement | Narrow inner-loop checks did not expose every contract assumption | Focused checks and closeout checks answer different questions | Keep the narrow inner loop, then run the complete frontend contract suite once before publication |
| Suggested improvement | Shared M4 occasionally had another candidate or transfer lock | M4 is a governed shared runtime, not a private per-task machine | Inspect and wait; never seize locks, overwrite candidates, or treat M4 as source truth |

### What worked well

- Dirty user work was preserved through clean isolated worktrees.
- Each dependency decision started with a measurable baseline.
- Backend, remote-state, form, and visual problems were treated as different
  problem classes rather than forced into one component-library answer.
- Focused behavior tests found real URL and accessibility defects.
- Stop conditions allowed the useful form extraction to survive while the
  unjustified library was removed.
- Exact PR, revision, M4, and non-production states were reported separately.

### Focus for the next task

- Do not reopen this remediation sequence without fresh operator evidence.
- Select future work by observed failure, latency, change frequency, or
  responsibility coupling—not file length alone.
- Change one owning seam at a time.
- Revalidate current source and dependency state; historical counts and
  vulnerability findings are not current truth.
- Preserve the accepted Query, SQL pagination, read-only retained scope, and
  dependency-free small-form baselines.

## 7. Durable Engineering Rules

1. Diagnose ownership before choosing a library.
2. Keep route files as composition boundaries.
3. Page large server-owned datasets in the repository/database.
4. Use Query for remote state only; do not mirror query data into local state
   for rendering.
5. Treat stale, retained, or placeholder result scopes as read-only unless
   mutation authority is proven.
6. Prefer semantic native controls and a feature-owned model for small forms.
7. Use source contracts for architecture and forbidden patterns; use behavior
   tests for validation, requests, retry, mutation, focus, and navigation.
8. Measure the production route before and after adding a client dependency.
9. Validate accessible names after helper or error text appears.
10. Preserve separate claims for source, CI, candidate M4, merged `master`, M4
    acceptance, production, and human acceptance.
11. Preserve unrelated dirty work and stage exact files only.
12. A successful pilot may end by rejecting its candidate dependency.

## 8. Freeze And Next-Stage Rule

This phase is closed. The correct next activity is operator observation, not an
automatic Stage 4 refactor.

Start another Admin implementation only when fresh evidence identifies one
bounded problem. If no stronger evidence emerges, the account-detail route may
be inspected read-only, but file size alone is insufficient authorization to
change it.

Any next session must:

1. start from clean current `origin/master`;
2. read `AGENTS.md`, `README.md`,
   [Cloud Admin Frontend Engineering Standard](../../../../cloud-admin-frontend-engineering-standard-v1.md),
   this closeout, the Admin UI standard, and the development-validation model;
3. state the operator problem, state owners, affected contract, non-goals,
   narrow gate, bundle/runtime evidence requirement, and rollback before
   editing;
4. avoid Ant Design, broad component migration, new global state, a table
   library, or a form library unless new measured burden justifies the exact
   capability;
5. stop after one accepted seam and return to observation.

## 9. Document Map

- [Cloud Admin Frontend Engineering Standard](../../../../cloud-admin-frontend-engineering-standard-v1.md)
- [Cloud Admin Query Pilot Closeout](cloud-admin-query-pilot-closeout-2026-07-29.md)
- [Cloud Admin Support Requests Query Closeout](cloud-admin-support-requests-query-closeout-2026-07-29.md)
- [Cloud Admin Account Create Form Pilot Closeout](cloud-admin-account-create-form-pilot-closeout-2026-07-29.md)
- [Cloud Admin Frontend Remediation Retrospective](cloud-admin-frontend-remediation-retrospective-2026-07-29.md)
- [Development and Validation Operating Model](../../../../development-validation-operating-model-v1.md)

Rollback for this documentation closeout is a focused revert of its PR. It does
not require an M4 operation, backend change, data migration, or production
action.
