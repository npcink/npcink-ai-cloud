# Next.js security update — 2026-11-18

Status: locally verified development change and M4 candidate evidence. No PR,
CI, merge, clean-master acceptance, human acceptance, or production deployment
is claimed.

## Scope and decision

Upgrade Next.js and eslint-config-next from 16.4.1 to 16.4.6, including matching
Next env, ESLint plugin and platform SWC entries in the single root lockfile.
The final lock diff is 50 additions / 50 removals; unrelated dependencies,
React, workspace overrides, application configuration and public contracts stay
unchanged. Existing image capability and Admin UI edits remain in the mixed
worktree. No addon or WordPress source is changed by this security maintenance.
No paid model calls were made.

Production dependency audit before the upgrade reported two moderate Next.js
advisories, both fixed in 16.4.5:

- [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h),
  CVE-2026-119790: root-parameter cache race involving `use cache` and
  `unstable_cache`.
- [GHSA-vc7v-qv4w-wrv8](https://github.com/advisories/GHSA-vc7v-qv4w-wrv8),
  CVE-2026-119351: nested `use cache` root-parameter streaming metadata.

The inspected frontend source and Next config contain no `use cache`,
`unstable_cache`, `cacheComponents` or `rootParams` usage. The advisories are
dependency findings, not evidence of exploitation or data disclosure here.
The stable [16.4.6 release](https://github.com/vercel/next.js/releases/tag/v16.4.6)
preserves the minor version and includes the 16.4.5 fixes. Its route-handler
compression change warrants checking actual proxy HTTP responses as well as
mocked browser consumers.

## Precursor verification (mixed candidate)

The broad build, unit and browser evidence in this section was collected before
isolating the four security-maintenance files onto `codex/next-security-update`
from `origin/master`. It includes the separately tracked image-capability UI
changes and is not an exact-tree receipt for the isolated security PR. The
translation-family fix mentioned below stays in that separate UI change.

- Pinned pnpm 10.33.0 frozen installation and `check:frontend-locks` passed.
  Installed Next.js and eslint-config-next both report 16.4.6.
- Production audit: 217 dependencies, zero findings after the update, compared
  with two moderate findings before it.
- Full audit remains nonzero: one high-severity
  [picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
  matches two development-tool dependency paths: ESLint's micromatch/picomatch
  2.3.2 and resolver/tinyglobby/picomatch 4.0.7. GitHub's advisory API reports
  `first_patched_version: null` at this check. This is not a production bundle
  finding. No incompatible override, audit exclusion or suppression was added.
- Build and full lint passed; 85 unit files / 1,182 tests passed. The build
  reports Next.js 16.4.6 and contains no security warning.
- All frontend contract scripts passed using the project's Python 3.12 venv.
  The initial default macOS Python 3.9 failed at `zip(strict=True)`; no product
  code was changed for that environment mismatch.
- The broad contract run also caught two dynamic translation families omitted
  in the preceding capability UI work. Registering `admin.model_capabilities.`
  and `admin.image_capabilities.` with their bounded source sites fixes that
  omission while preserving every contract assertion.
- Compiled-browser checks: 44 login, binding and session cases passed, plus
  12 Admin login recovery and capability UI cases. Browser business responses
  are mocked; these checks do not establish real account or paid-provider
  behavior.

Four additional `portal-account-sessions.spec.ts` boundary Retry cases fail
in both the upgraded build and an isolated copy of the same source with the
original frozen 16.4.1 dependencies. Each expects three session reads and sees
four after recovery, across English/Chinese and light/dark variants. The old
build produces compiled artifacts before its security nudge aborts; those
artifacts were used only for the loopback baseline comparison. This reproduces
an inherited failure, not a green baseline. No test was weakened, skipped in
the original run, or changed to hide it. Diagnosis and repair remain separate
from this dependency update.

## M4 candidate

Dependency-aware `m4:preview:deploy` rebuilt the frontend image and refreshed
the protected dependency volume. The candidate reports:

- Deployed at `2026-11-18T02:27:02Z`, branch `codex/wp-ai-image-editing`,
  source revision `f17354f234d2852baa41a8b27e07bf73e081c5f7`, dirty source;
  acceptance state `candidate`, promotion PR `none`.
- Source bundle SHA256
  `9c7431156a204791612af1e13a9a08ff51dcc6f7c79158306f52400856397a8f`.
- Frontend source SHA256
  `a7b50af60e84a5e2741d1b4e787c06883fe5c5b693e0484e2a913c0c6624c7c6`.
- Frontend image
  `sha256:bab8fcd65f330d3349745a578be361ce8890028a0d53ed0cc9c66673925eac79`.
- Container-installed Next.js and eslint-config-next are both 16.4.6,
  Node is 22.23.4. Build and running-server logs independently report Next.js
  16.4.6, compilation success and readiness, without the old security warning.
- API, frontend and proxy are healthy. Alembic stays at `20261103_0092`.
  The managed Ollama PID remained unchanged across deployment.
- Live anonymous HTTP checks: Portal/Admin login return 200; Portal session,
  session directory and Admin session return 401 with the expected bounded
  error envelopes. All five responses include `no-store`. Requested gzip
  responses decompress successfully into valid HTML or JSON.
- The first compiled M4 browser batch passed all 54 selected PC cases, with
  zero retries or skips. Business/API responses in that batch are mocked;
  the live anonymous HTTP checks above provide separate proxy evidence.
  A separate two-case supplier-draft/retry check at PC widths 1056 and 1440
  also passed: 56 distinct browser cases passed on M4 in total.

The local standalone server has no live API backend: its Portal session check
returns 502. The live 401/no-store result above comes from M4, not that local
server. Mocked browser coverage and live anonymous HTTP evidence remain
separate.

Ignored evidence is under `.runtime/next-security-update/`: before/after
audits, upstream advisory/release JSON, frozen-install/build/contract logs,
old/new Retry comparison, browser results, deploy identity, installed/runtime
versions and HTTP observations. This dated closeout is written after the
candidate bundle and is not part of its source hash.

## Remaining work and rollback

At initial closeout, the unpatched development-tool picomatch advisory and
four-case Retry failure remained open; see the follow-up below for the resolved
test mismatch. Publication, protected CI, merge and clean-master
M4 acceptance require their own evidence; production remains separately
authorized. The compatibility matrix needs no version-floor change because
no cross-repository public contract changed.

For a focused rollback, restore only this task's frontend manifest and root
lockfile from their before-task copies, frozen-install and redeploy the M4
candidate. Preserve the preceding source edits and translation-family fix.
Returning to 16.4.1 also reintroduces the known Next.js findings, so prefer a
verified forward repair when practical. Stop the disposable loopback baseline
and upgraded test servers after collecting evidence.

## Same-day follow-up: Retry fixture resolved; picomatch still upstream-blocked

The user authorized handling both remaining items. Tracing the fourth GET
establishes its owner: after boundary recovery, `PortalTotpSettings` mounts and
`portalTotpClient.getSession()` performs a separate management-session safety
read with `Accept: application/json`. The three boundary reads use the ordinary
Portal client. Neither a duplicate Retry nor a Next.js regression caused the
fourth request. The original fixture counted both consumers together and
returned a bootstrap-only payload to the management parser.

The boundary fixture now separates the management read and deliberately makes
that ancillary check unavailable with 503. It asserts zero management reads
before recovery, exactly one afterwards, and still exactly three boundary
reads and two challenge reads. The held second read, double click, zero writes,
unhandled-rejection and overflow assertions remain. All four English/Chinese,
light/dark cases pass against the compiled M4 candidate, with no retries or
skips. Focused ESLint and `git diff --check` pass. This is a test-only correction;
no runtime source or dependency changed in the follow-up, so another image
deployment is unnecessary. Dedicated TOTP tests retain management-projection
ownership; this boundary test does not claim successful TOTP management.

Fresh registry and advisory reads still identify picomatch 4.0.7 as the latest
published version and no first patched version. Candidate upstream fixes,
including [PR #266](https://github.com/micromatch/picomatch/pull/266) and
[v2 PR #265](https://github.com/micromatch/picomatch/pull/265), remain open and
unmerged at this check. The latest micromatch 4.0.8 still consumes picomatch
`^2.3.1`; an ordinary parent update therefore does not remove the affected copy.

A bounded child-process reproducer resolves both actually installed versions,
2.3.2 and 4.0.7. Matching `+(*a)` against 24 `a` characters followed by `b`
takes approximately 268–299 ms; 30 characters reaches the one-second process
timeout on both copies. Each child is terminated at its deadline. The finding
is real and must not be dismissed as an inaccurate version match. The current
dependency paths are development tools (ESLint, Tailwind, Vite/Vitest and their
glob consumers); no direct application-source use was found. Production
dependency audit remains clean. This establishes development-tool scope, not
a proof that every possible development invocation is safe.

No compatible published package can currently close the picomatch finding.
No global major override, unmerged upstream code, locally maintained parser
fork, audit ignore or alert dismissal was introduced. The finding remains
explicitly open. Closure requires a reviewed published fix admitted by its
parents, then frozen install, bounded reproducer and real lint/build/test
consumer checks. This follow-up does not claim that security repair is done.

Ignored follow-up evidence is in `.runtime/security-followups/`: corrected
four-case browser results, bounded picomatch timings, registry metadata,
advisory and PR state, and fresh production/full audit receipts. No paid model,
external message, production action, PR or merge was performed.

## Isolated security PR verification

The final four-file tree on `codex/next-security-update` contains only the
Next manifest/lock update, the Retry fixture correction and this record.
A fresh frozen install, lock synchronization check, TypeScript check, focused
ESLint, production build and all 85 unit files / 1,178 tests pass on this
isolated tree. The fresh production audit again reports 217 dependencies and
zero findings. The smaller test total versus the mixed precursor is expected:
the separate capability UI tests are absent here. Exact logs are retained in
`.runtime/security-release/`. The earlier M4 browser results remain candidate
evidence, not clean-master or production acceptance.
