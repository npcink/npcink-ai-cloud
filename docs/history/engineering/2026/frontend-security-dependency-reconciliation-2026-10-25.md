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

The Vite/Vitest replacement subsequently merged through
[PR #1255](https://github.com/npcink/npcink-ai-cloud/pull/1255) as
`77baa7f8ced0a2844b7faae06485d053fd423d18`, after six required checks and
independent review passed. M4 recorded accepted, clean master at that revision;
the compiled provider-error consumer passed before and after promotion. The
advisory OpenCodeReview job failed with HTTP403 and was not retried; this is not
a successful advisory review or a repair of the service's configuration.
Both older Vite proposals are closed. Dependabot rewrote their heads during
closeout, so the final heads were re-read and their current version intent
checked against the replacement. Original and final histories were bundled
and verified in an empty bare repository before remote-branch retirement was
considered; both remote branches were already absent, so neither was deleted
by the closeout operator.

Before the separate follow-up below, registry audit reported Zod 4.6.5 affected by
GHSA-mrhx-c7xc-m3w5, patched in 4.6.6. That is a separate runtime-validation
dependency follow-up; this test-tool patch does not claim a clean audit.
FastAPI, Ruff, Action-wrapper, autoprefixer, tailwind-merge, and historical
asset retirement remain separately tracked. OpenCodeReview HTTP403 is not
resolved merely by updating its Action wrapper.

## Separate Zod security follow-up

The later Zod candidate advances the manifest and resolved graph from 4.6.5 to
4.6.7, the current patched version found during preparation. The upstream
4.6.6 security fix rejects oversized bounded arrays/maps/sets before parsing
their elements; it does not impose a universal resource cap on unbounded
collections. The 4.6.7 release lists a version commit. The project's direct
consumer is the server environment schema in `frontend/src/lib/env.ts`, using
object/string/URL/default/optional schemas rather than the affected collection
path. The upstream advisory therefore does not establish an exploitable
public application endpoint here.

Fresh frozen installation, lock consistency, type-check, full lint, and all
422 unit tests passed for this follow-up. Registry audit reports no known
vulnerabilities in that candidate graph. These are candidate-local results;
its review, PR/merge, M4 acceptance, and GitHub default-branch alert refresh
must be established separately.

The upstream 4.6.6 release describes a reverted Git-credential incident and
states that the malicious commits were not published to npm. The reviewed
4.6.6 tarball hashes matched registry metadata and relevant source files matched
the official release; its pre-rewrite provenance commit shared the release's
Git tree. These checks did not include Sigstore signature or transparency-log
verification and do not prove all historical npm releases safe. A fresh
version's package integrity and source identity require their own review;
do not turn either the incident headline or an earlier version's preflight
into a claim about the later package. The separate 4.6.7 preflight matched its
tarball to registry integrity and compared all 840 regular package files with
4.6.6: only package/version metadata changed, while security source and
generated implementation remained identical. Its provenance statement named
the official release commit; the statement was parsed, without cryptographic
signature or transparency-log verification.

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

## Separate routine UI consumer follow-up

After the security changes, the next isolated batch advances tailwind-merge
3.5.0 to 3.7.0 and autoprefixer 10.4.20 to 10.6.1. Tailwind CSS 3.4.17,
PostCSS 8.5.25, workspace overrides and application source remain unchanged.
The lock changes only the frontend importer and those packages' corresponding
transitive records; this is not a general dependency refresh.

Eight added regressions render actual Backoffice/Portal components through
their public props. They exercise customer-directory spacing, compact and
important spacing, base versus desktop panel padding, empty-state vertical
versus horizontal padding, selected/disabled filter pills and light/dark
status capsules. They neither mock class merging nor reproduce its algorithm,
and they do not treat class presence as proof of computed CSS or layout.

Frozen installation, type-check, full lint and all 50 unit files / 430 tests
pass on the upgraded source. Registry audit reports no known vulnerabilities
in that candidate graph. An isolated baseline and upgraded copy each pass the
same four focused consumer files / 17 tests, including the eight added cases.
The upgraded copy initially lacked an offline tarball; a normal integrity-
checked frozen install populated the cache, then its offline frozen install
and focused verification passed. No dependency override or integrity check
was bypassed.

Compiling the actual global CSS with the real Tailwind -> autoprefixer chain
produces byte-identical output for the two versions: the ordered semantic AST,
36 effective browser targets, all 39 prefixed declarations and warning count
(zero) are unchanged. This proves that compilation comparison only. Next.js
image build, compiled browser consumers, UI self-review, independent review,
protected CI, merge and clean-master M4 acceptance remain separate gates for
this batch. No screenshot baseline, product feature or production operation
is changed by the local candidate evidence.
