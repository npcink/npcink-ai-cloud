# Frontend security dependency reconciliation — 2026-10-25

Status: historical development evidence. This record is not production-release
authorization or proof that all repository dependency debt is closed.

## Problem and implementation

The history closeout found security updates mixed with ordinary dependency PRs.
Review the current resolved graph before accepting a bot's version statement:
an exact workspace override can keep the installed dependency vulnerable even
when the frontend manifest declares the patched version.

Next.js [PR #1226](https://github.com/npcink/npcink-ai-cloud/pull/1226) was updated
against current master, independently reviewed, and merged as
`872d6ca1d200c3c0ae845dcce9814d10b8a8619c`. It changes Next.js 16.3.8 to 16.4.1,
including matching env/SWC packages and bounded browser-data deduplication.
The upstream release addresses GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw, and
GHSA-p3m5-59mp-jv5r. Advisory severity is not evidence of production
exploitability or of a production deployment.

The two Vite proposals, [#1181](https://github.com/npcink/npcink-ai-cloud/pull/1181)
and [#1182](https://github.com/npcink/npcink-ai-cloud/pull/1182), do not repair
the repository's `vite: 7.3.5` workspace override. Their manifest/lock changes
alone therefore do not establish a patched installed graph. The replacement
implementation updates the frontend declaration and workspace override to
7.3.7, regenerating the root lock with the pinned package manager. The existing
Vitest 4.1.11 mocker also has advisories fixed in 4.1.12, so Vitest and its
coverage plugin are aligned to 4.1.12 in the same test-tool security change.
No application source, API, product boundary, or snapshot baseline is changed.

## Evidence and limits

For #1226, fresh frozen installation, frontend type-check, and 49 unit files /
422 tests passed. All six required checks passed for exact PR head
`fd30e7fce9c6f41512fca93a9a87425a930e2766`; independent source review was CLEAR.
The M4 candidate built and ran Next.js 16.4.1. Against that compiled candidate,
28 session scenarios and three login/binding scenarios passed without skips,
retries, or flaky results. These browser business responses were mocked; they
are not live account, transaction, or WordPress adoption evidence.

Clean-master M4 promotion for #1226 recorded `acceptance_state=accepted`,
`promotion_pr=1226`, `source_branch=master`, `source_dirty=false`, and source
revision `872d6ca1d200c3c0ae845dcce9814d10b8a8619c`. A post-promotion session
revocation UI smoke passed. Anonymous session discovery returned 401 with
no-store semantics; public login and Admin login returned 200.

The Vite/Vitest implementation passed frozen installation, lock consistency,
type-check, and all 422 unit tests. A separate coverage-enabled run of those
tests also passed, exercising the newly aligned coverage plugin. These local
results do not by themselves prove PR checks, merge, or M4 acceptance.

A fresh registry audit of this candidate still reports Zod 4.6.5 affected by
GHSA-mrhx-c7xc-m3w5, patched in 4.6.6. That is a separate runtime-validation
dependency follow-up; this test-tool patch does not claim a clean audit.
FastAPI, Ruff, Action-wrapper, autoprefixer, tailwind-merge, and historical
asset retirement remain separately tracked. OpenCodeReview HTTP403 is not
resolved merely by updating its Action wrapper.

## Reusable operating rules

1. Compare manifest intent, workspace override, importer, package entries,
   snapshots, and actual installed versions. A consistent lockfile alone does
   not prove that the intended patched version was selected.
2. Security patches precede routine updates. Align tightly coupled test-tool
   peers, and review transitive changes rather than blindly refreshing all
   dependencies. Keep bot proposals open until replacement evidence exists.
3. Preserve frozen-lockfile and integrity checks. Dependency changes use M4
   deploy; candidate, merged, accepted, and production states remain distinct.
4. An orphaned M4 package-proxy helper blocked the first #1226 build by retaining
   its port. Its exact PID, parent, command, working directory, and absence of
   active TCP consumers were checked before SIGTERM. Package cache was retained;
   the next deploy passed. Do not kill all Python processes or wipe caches to
   work around an unidentified listener.
5. Verify independent runtime questions without repeating broad gates by
   habit. Unit execution, coverage-plugin execution, compiled browser consumers,
   and post-merge source identity provide different evidence.

The primary contracts remain the
[dependency update policy](../../../pr-and-dependency-update-policy.md),
[M4 standard](../../../m4-preview-ai-development-standard-v1.md), and
[earlier override remediation lessons](../../dependency-high-alerts-closeout-2026-09-21.md).
