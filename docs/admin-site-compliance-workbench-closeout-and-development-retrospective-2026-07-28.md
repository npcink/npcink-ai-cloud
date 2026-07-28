# Admin Site Compliance Workbench Closeout and Development Retrospective - 2026-07-28

Status: merged into `master` and accepted on M4 Preview through PR
[#338](https://github.com/npcink/npcink-ai-cloud/pull/338).

This is an engineering closeout record. M4 acceptance proves the exact
development source and preview runtime described below; it is not production
deployment or GA evidence.

## Purpose

This document records the bounded redesign and delivery of
`/admin/site-compliance`, including:

- safe recovery of an existing candidate while the main checkout contained
  unrelated dirty work;
- the operator-facing layout and action-hierarchy decisions;
- focused local, visual, CI, and M4 verification;
- recovery from a slow private source relay by an explicit LAN direct
  fallback;
- the distinction between a candidate preview and accepted `master`;
- reusable guidance for later Admin workspace closeouts.

The work followed:

- [Development Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Admin Information Architecture](cloud-admin-information-architecture-v2.md)
- [Cloud Admin UI Standard](cloud-admin-ui-standard-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)

## Boundary and Scope

The session was deliberately locked to one route:

```text
/admin/site-compliance
```

The change did not modify:

- backend routes, validation services, or persistence;
- database schemas or migrations;
- public compliance-content interfaces;
- Cloud and WordPress ownership;
- Admin navigation or another Admin route;
- credit-pack, plan, entitlement, or billing truth;
- production deployment configuration.

Cloud remained the hosted runtime and service-plane enhancement layer. The
Admin page continued to edit the existing versioned Cloud compliance payload;
it did not become a second WordPress control plane or public-content write
owner.

The merged source changed only:

- `frontend/src/app/admin/site-compliance/page.tsx`
- `frontend/tests/unit/admin-site-compliance-contract.mjs`
- `frontend/tests/e2e/admin-site-compliance-workspace.spec.ts`
- `package.json`

## Starting State

The main checkout contained unrelated tracked and untracked changes. It was
treated as read-only throughout the task: no reset, stash, checkout, broad
staging, or overwrite was used.

An existing candidate branch and worktree already contained the page work:

```text
branch: codex/admin-site-compliance-workspace
worktree: /Users/muze/gitee/.worktrees/npcink-ai-cloud-site-compliance-workspace
```

The candidate initially lagged `origin/master`. Its work was preserved with
exact-file checkpoint commits and rebased onto the current base. Only the four
task files were ever part of the candidate diff; staging used explicit paths
instead of `git add -A`.

`origin/master` moved more than once during the session because other accepted
Admin and Portal work landed. Each movement was re-fetched and checked before
the candidate continued. Changes outside the four task files were not pulled
into the work envelope by assumption; the branch was rebased only after
confirming there was no overlapping change.

## Product and UI Decision

### Problem

The previous presentation used a broad header area whose right side was empty.
At desktop width, the empty area consumed attention without helping the
operator. Save and publish were also presented together near the top, which
weakened the distinction between routine draft work and gated public
publication.

The intended operator job was simpler:

1. identify the current compliance state;
2. choose one configuration area;
3. edit and save the draft;
4. resolve publication checks;
5. publish only when the existing gate allows it.

### Resulting layout

The accepted page uses:

- a short `BackofficePrimaryPanel` header;
- the long description behind an information hint;
- a compact, flat `BackofficeSummaryStrip`;
- one continuous bordered workbench;
- a desktop section directory on the left;
- a mobile section selector at the top;
- one active editing area on the right;
- contextual validation near the affected editing area;
- a bottom-right save action within editable sections;
- a secondary publish action only inside `发布检查`;
- validation codes and QQ external steps behind collapsed details;
- version and readiness evidence in compact tables.

The design reused existing Admin primitives. It did not add another shared
abstraction merely to make this single route resemble
`/admin/service-settings`.

### Action hierarchy

`保存草稿` is the only primary action.

`发布到公开页面` is secondary and appears only in the publication-check
section. It remains disabled when:

- the draft has unsaved changes;
- another action is running;
- validation is not ready to publish.

This makes the visual hierarchy match the underlying state machine instead of
placing two differently risky actions beside each other.

### State and recovery behavior retained

The redesign preserved:

- dirty state while switching sections;
- `beforeunload` protection;
- guarded navigation through the existing confirmation modal;
- loading and initial-load failure recovery;
- failed validation and warning evidence;
- long Chinese labels and values;
- mobile overflow safety;
- read-only version history;
- the existing save and publish API calls.

No route-local dialog, credential surface, or new navigation entry was added.

## Verification Strategy

Verification was layered so that each gate answered a distinct question.

### Focused local contracts

The narrow contract checks proved:

- the existing bounded API methods were unchanged;
- the page had one compact header and status strip;
- the section directory and active editor formed one workbench;
- editors remained mutually exclusive;
- publish stayed secondary and gated;
- save stayed primary;
- unsaved navigation protection remained present;
- no credential fields were introduced.

### Admin static and type gate

```bash
pnpm run check:admin-ui
```

This passed the Admin governance contracts, type-check, and scoped ESLint
checks.

### Focused desktop and mobile E2E

```bash
pnpm --dir frontend run test:e2e -- \
  tests/e2e/admin-site-compliance-workspace.spec.ts
```

Result:

```text
2 passed
```

The scenarios proved:

- only one editor was mounted;
- draft values survived section switches;
- saving revalidated the draft;
- publish did not appear in ordinary edit sections;
- publish stayed disabled until the saved validation gate passed;
- validation, QQ readiness, and version tables remained available;
- desktop and 390px layouts had no horizontal document overflow.

### Admin visual regression gate

```bash
pnpm run check:admin-ui:visual
```

Result:

```text
22 passed
```

This was run once at PR closeout because the change affected layout and shared
Admin visual expectations. It was not repeatedly run during every inner-loop
edit.

### Real-browser preview

The M4 candidate was inspected with an authenticated browser at:

```text
1440x900
390x844
```

Observed evidence included:

- exact viewport width matched document scroll width;
- desktop directory and active editor stayed in one continuous surface;
- mobile used the section selector and hid the desktop directory;
- save remained at the form bottom rather than becoming a fixed overlay;
- publish appeared only in the publication-check area;
- technical details were collapsed by default.

## M4 Candidate Delivery

### Do not confuse the currently visible preview with the candidate

Port `18010` is shared. During the task, M4 was promoted by another accepted PR,
so the previously visible site-compliance candidate disappeared. A screenshot
of `18010` therefore could not be treated as proof that the topic branch was
still deployed.

The source-of-truth check was:

```text
acceptance_state
source_revision
source_branch
source_dirty
source_dirty_paths
```

Only after these fields named the site-compliance branch was the page treated
as the candidate under review.

### Private relay failure

The ordinary M4 source lane first used the private Tailscale relay. The source
bundle was about 6.4 MB. Upload to the relay succeeded, but the M4 download
repeatedly timed out after 120 seconds with only part of the bundle received.

The script exhausted its bounded retries and exited without partially applying
the candidate. A status check confirmed that M4 still held the prior accepted
`master`, with healthy services and no false candidate claim.

The correct response was not to:

- claim that layout implementation itself was slow;
- silently switch transfer modes;
- seize a relay or deployment lock;
- use the public relay maintenance address;
- report the old accepted page as the new candidate.

### Explicit LAN direct fallback

The operator identified the M4 LAN address:

```text
192.168.10.200
```

Read-only checks proved:

- SSH port 22 was reachable;
- the host was `Muze-For-Mac-mini.local`;
- the remote user was `muze`;
- the architecture was `arm64`;
- the same managed Ollama listener owned `127.0.0.1:11434`.

The bounded, operator-selected fallback used:

```bash
NPCINK_CLOUD_M4_SSH_HOST=muze@192.168.10.200 \
NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct \
pnpm run m4:preview:sync
```

This override remained visible and task-local. It did not replace the
repository default or turn direct transfer into an automatic fallback.

### Why sync became deploy

The candidate changed `package.json` to register the focused Admin test. The M4
fingerprint gate therefore reported:

```text
dependency inputs require m4:preview:deploy
```

The task followed that output instead of forcing source sync. M4 built the
runtime and frontend images locally, restarted the bounded Compose services,
and recorded a clean candidate.

After a later copy-only review fix, the image inputs were unchanged, so a LAN
direct source sync was sufficient.

## Review, PR, and Merge

The final pre-PR inspection proved:

- the worktree was clean;
- the diff contained exactly four task files;
- the cached diff was empty before final staging;
- no credit-pack or unrelated Admin work was present.

The PR was published through the repository policy wrapper:

```bash
pnpm run pr:publish -- \
  --title "Refine site compliance admin workspace" \
  --body-file <completed-template>
```

PR [#338](https://github.com/npcink/npcink-ai-cloud/pull/338) requested protected
squash auto-merge. No required check was bypassed.

### Review finding

A five-axis pre-merge review found one misleading sentence:

```text
保存前请处理此区域的 N 个检查项
```

Saving is the action that re-runs validation, so the sentence could imply that
save itself was blocked. It was changed to:

```text
此区域有 N 个发布检查项
```

The fix changed no layout or gate logic. Focused contract, E2E, ESLint, and
whitespace checks were rerun, the new commit was pushed, and the current M4
candidate was re-synced.

### Required CI

Required CI passed, including:

- PR body contract;
- frontend;
- Secret scan;
- Python dependency audit;
- backend scope and targeted fast gate;
- JavaScript/TypeScript and Python analysis;
- CodeQL;
- CI observability.

The backend targeted job took more than eight minutes. It was allowed to
finish normally; local suites were not repeatedly rerun while GitHub CI was
already answering the integration question.

The protected workflow merged PR #338 as:

```text
5297fcb4a4a09fc29fbd26f967bebfc0e109af0b
```

## M4 Promotion and Accepted Evidence

Promotion must come from a clean, current `master`, not merely from equivalent
topic-branch content.

The dirty main checkout already owned the local `master` branch. A detached
temporary worktree was attempted, but the promotion tool correctly rejected
it:

```text
promotion requires the master branch; current branch is detached
```

The recovery was an isolated temporary clone from GitHub with a clean
`master`. It proved:

```text
HEAD = origin/master = 5297fcb4
```

Promotion then used PR #338 and the explicitly authorized LAN direct transfer.
The final status recorded:

```text
acceptance_state=accepted
promotion_pr=338
source_revision=5297fcb4a4a09fc29fbd26f967bebfc0e109af0b
source_branch=master
source_dirty=false
source_dirty_paths=0
source_transfer_mode=direct
```

API, frontend, proxy, PostgreSQL, Redis, and required workers were running;
API and frontend health checks were healthy; Alembic was at
`20260728_0076 (head)`.

The temporary promotion clone was moved to Trash after its clean state was
verified. It did not affect the shared dirty checkout or another worktree.

## Development Lessons

### 1. Freeze the module before improving it

A strict route-level scope lock prevented the session from absorbing
`/admin/credit-packs`, `/admin/plans/[planId]`, or broad Admin cleanup. This
made the diff, verification story, PR, and rollback independently auditable.

### 2. Preserve candidate work before making it clean

Cleanliness is not more important than user work. Exact-file checkpoint
commits, conflict inspection, and rebase preserved the existing candidate.
Reset, stash, and broad staging were unnecessary.

### 3. Design around the operator state machine

The useful hierarchy was not a prettier hero. It was:

```text
status -> choose section -> edit -> save -> check -> publish
```

The sole primary action should represent the routine reversible step. A rarer,
externally visible action belongs near its gate and should remain secondary.

### 4. Empty space can be an information-architecture defect

The large empty header was not fixed by adding decorative content. The header
was shortened, explanatory text moved behind a hint, state became a flat strip,
and the workbench moved up. Removing unused visual territory improved task
density without inventing new information.

### 5. Preview status is stronger evidence than a remembered screenshot

A shared preview can be overwritten by another accepted source. The visible
page, tunnel liveness, or HTTP `200` does not identify its source. Always read
the recorded branch, revision, dirty state, and acceptance state.

### 6. Separate implementation time from delivery time

The layout and local verification finished quickly. Most elapsed time came from
the relay transfer and required CI. Reporting these separately makes the true
bottleneck visible and prevents unnecessary UI rewrites.

### 7. Direct transfer is a recovery lane, not a new default

LAN direct transfer was appropriate because the operator explicitly selected
it after verifying the exact M4 host. It must remain bounded and observable.
An agent must not silently choose it whenever the relay is slow.

### 8. Let fingerprints decide sync versus deploy

A test-script change in `package.json` can be part of the image input even when
the visible feature is only frontend source. The deployment tool, not human
intuition about change size, decides whether sync is valid.

### 9. Test user-visible invariants

The strongest E2E assertions covered one active editor, retained dirty values,
publish absence or disablement, save/publish separation, and overflow. These
survive class-name and visual-token changes better than assertions tied to
incidental markup.

### 10. Review copy as behavior

State guidance affects operator decisions. The final review caught a sentence
that contradicted the save/revalidation workflow even though every functional
test passed. UX copy belongs in correctness review, not only visual polish.

### 11. Accepted M4 requires an unbroken source chain

The accepted chain was:

```text
focused local evidence
-> candidate preview
-> human visual confirmation
-> protected PR and required CI
-> merged origin/master
-> clean master promotion
-> accepted M4 status
```

Skipping any arrow changes what can honestly be claimed.

## Guidance for the Next Admin Candidate

Use the same closeout shape for another already-started Admin candidate:

1. open a separate route-locked session;
2. revalidate the real branch, worktree registration, and current
   `origin/master`;
3. preserve candidate changes before rebasing;
4. write a change envelope before editing;
5. keep one active operator task and one primary action;
6. run the narrowest route contract and E2E first;
7. dispatch an M4 candidate only after a coherent local checkpoint;
8. stop for visual confirmation;
9. publish an independent PR through the repository wrapper;
10. promote only clean current `master`.

An existing candidate is a reason to finish a route. It is not permission to
mix several Admin pages into one session or PR.

## Final Classification

| Layer | Evidence |
| --- | --- |
| Local | Focused contracts, Admin static/type gate, E2E, visual matrix, diff check |
| M4 candidate | Topic branch, clean source, real-browser desktop/mobile acceptance |
| PR/CI | PR #338, protected auto-merge, required checks passed |
| Merged | `origin/master` at `5297fcb4` |
| M4 accepted | PR #338, `master`, clean source, revision `5297fcb4` |
| Production / GA | Not established by this work |
