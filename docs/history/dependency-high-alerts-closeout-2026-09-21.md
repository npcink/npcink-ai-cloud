# Default branch 高依赖告警收口记录 — 2026-09-21

Status: historical evidence. This record documents the merged dependency fix and
its M4 acceptance; it is not a production-release authorization.

## Scope and root cause

GitHub default branch 的两个 high Dependabot 告警来自仓库自己在
`pnpm-workspace.yaml` 中声明的精确 overrides，而不是普通传递依赖：

| Alert | Package | Vulnerable range | Patched version | Root cause |
| --- | --- | --- | --- | --- |
| #87 / GHSA-2883-xcg3-v3hh | `js-yaml` | `>=4.0.0, <4.3.2` | `4.3.2` | workspace override pinned `4.3.1` |
| #84 / GHSA-rgj7-g3m4-5g8c | `sharp` | `<0.35.4` | `0.35.4` | workspace override pinned `0.35.3` |

Because the repository-owned overrides held resolution on vulnerable versions,
waiting for a normal Dependabot update was insufficient. The fix kept exact
version pinning and changed only the two overrides plus the corresponding lock
resolution and native `sharp` artifacts.

## Merged implementation

- PR: [Cloud #969](https://github.com/npcink/npcink-ai-cloud/pull/969)
- Merge commit: `7123484200abf950389bdc4bbdeb7ba7a4cd110b`
- Changed files: `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- No runtime API, business, WordPress, provider, or production-control change.

## Verification evidence

The merged PR recorded the following evidence:

- `pnpm install` with the pinned pnpm version completed.
- `pnpm run check:frontend-locks`, `pnpm run verify:local`, frontend type-check,
  lint, and contract tests passed.
- `pnpm audit --audit-level high` reported no known high vulnerabilities.
- Local probes passed for `js-yaml 4.3.2` merge parsing and `sharp 0.35.4`
  PNG/WebP processing.
- Lockfile review was limited to `js-yaml`, `sharp`, and required `@img/sharp-*`
  and `@img/sharp-libvips-*` artifacts.
- M4 Linux/ARM64 probes passed for the patched native image stack, including
  PNG resize, WebP, and AVIF round trips.
- M4 contract suite passed: `1109 passed, 10 skipped`, with no failures.
- Clean-master M4 promotion completed with:
  `acceptance_state=accepted`, `promotion_pr=969`,
  `source_revision=7123484200abf950389bdc4bbdeb7ba7a4cd110b`,
  `source_branch=master`, and `source_dirty=false`.
- M4 HTTP smoke checks for `/`, `/health/live`, `/admin/login`, and
  `/portal/login` returned HTTP 200.
- The GitHub alert list was rechecked after the dependency graph refresh and
  was empty.

Later documentation and runtime merges advanced `origin/master`; that does not
invalidate the dependency fix. The long-lived M4 operations worktree may remain
at an earlier accepted runtime revision while it is intentionally retained for
operations, provided the revision is identified before any new promotion.

## Operational rules retained

1. A repository-owned exact override is a manual security-update trigger; do not
   wait for Dependabot to rewrite it.
2. A dependency or lockfile change is a build/runtime change and uses the M4
   deploy lane, not source-only sync.
3. Verify the merged master revision, native runtime probe, contract smoke, and
   refreshed GitHub alert state before calling the fix complete.
4. Do not infer production authorization from a green dependency PR or accepted
   M4 preview. Production remains governed by
   `docs/cloud-production-release-policy-v1.md`.

## Current disposition

This item is complete. No code change is required now. Future work is limited to
normal dependency monitoring and to repeating the same evidence chain when a
new security update changes a dependency or lockfile.
