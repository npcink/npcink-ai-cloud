# Production release preparation — 2026-11-03

Status: release preparation, not production promotion, deployment or acceptance.
The operator requested sequential implementation of the readiness findings.
Production mutation, exact-SHA promotion/deployment, real payments and full
formal smoke remain separately authorized operations.

## Installed baseline and read-only checks

At 2026-11-03 10:42:34 UTC, the operator-provided protected SSH identity read
the managed current manifest and running containers. No application/configuration
file, database row or service was changed. The initial workstation default and
old identity were rejected; the first successful connection used an older system
Python, so the probe was repeated with the existing `/usr/bin/python3.11`.

- Actual installed source: `b8cc6049da7d1c33cbfffc9f8e5521f332a1adb5`.
- Installed source tree: `7e442d74579d4eeb0a7d97f514fa8ca3e3af8347`.
- Manifest schema: `npcink.release-bundle.v2`; platform: `linux/amd64`;
  package extras: `[zilliz]`.
- Manifest SHA-256:
  `cbcff299459647277eee19b35a5fee39c721246386ae71c0945897fddad2bb3f`.
- Installation: complete; no pending-install or failed-cutover marker.
- Alembic: `20261008_0087 (head)`; all seven inspected services running;
  frontend and Redis healthchecks healthy. Other inspected services have no
  Docker health status, which is not a failed healthcheck.
- [Runtime database readiness](https://github.com/npcink/npcink-ai-cloud/actions/runs/41621127514):
  passed the running API's fresh PostgreSQL/TLS/Alembic check.
- [Ownership inventory](https://github.com/npcink/npcink-ai-cloud/actions/runs/41622357278):
  passed; two active accounts and two active sites, zero ambiguous multi-user
  active sites, invalid bindings or unbound single-member active sites.
- [Certificate readiness](https://github.com/npcink/npcink-ai-cloud/actions/runs/41622466770):
  failed because the renewal-readiness receipt is stale (`age_seconds=1756056`).
  This does not establish an expired serving certificate. Refreshing the
  production receipt is a separate host mutation requiring operator authority.
- An independent public TLS handshake at 11:00:49 UTC verified the hostname
  and certificate chain; the served certificate expires on 2027-01-05
  01:17:36 UTC. This does not replace the renewal-readiness gate.

The production source branch is `16747c401d2d1fc9d07bfbf5c530d3aca4a9cfa4`;
it is not the actual installed revision. The last successful deployment is
[run 39122857578](https://github.com/npcink/npcink-ai-cloud/actions/runs/39122857578),
attempt 1, updated `2026-10-18T11:24:58Z`. Its timing artifact has expired.
The separately reviewed `.github/production-baseline-recovery.json` binds the
live observation to that exact run/attempt/update and expires after seven days.
It cannot override malformed evidence, a newer unproven attempt or a rerun.

## Historical source differences

A normal production/master merge has historical conflicts. The production tree
does not equal a master ancestor because the isolated release intentionally
omitted the following already-reviewed commits:

| Original PR | Commit | Restored content |
| --- | --- | --- |
| #1130 | `65860cc770f11dd436fcd79f2b08d5575fa5cb2b` | bounded rollup statistics |
| #1131 | `b9a173d6f7e1b12730ccaeb30dc2e68d14db9c4c` | local integration tooling and policy |
| #1133 | `36f63e7e992b7aee9fe76c814998ef30a96da0af` | health snapshot lookup index, migration 0088 |
| #1137 | `db4baabd189ad4454787972d4157d3a08b15c14f` | transactional rollup batches |
| #1138 | `878720f53e3c90af96623c921d4b40652fece227` | historical release evidence |
| #1139 | `67a94d6dd19c1671d8e7f468e49d5d569496834f` | bounded commercial reads |

Applying exactly those six binary patches, in that order and without conflict
resolution, to a temporary index loaded from production reconstructs the full
tree of master `5fa1d47ca356b84ad767003315749890c2f412ab`:
`2c4fa9da9fcacecfbd713253981e4bde2ed7b73d`. The historical difference is 24
paths. No unexplained production-only source difference remains in that proof.
`.github/production-baseline-restoration.json` records the exact inputs.
The preparation helper retains complete-tree equality, source ancestry, exact
release paths and atomic ref checks; this is not a production branch update.

## Image candidate and validation boundary

The official Python candidate inspected on this date is `3.14.10`, index
`sha256:eb2c62658b8d51bff0acc408504b76521d02030de56a8a3c1e830083e89b89d2`.
Both production Dockerfile stages and the canonical lock use that digest.
The upstream watcher now reads the governed patch version from the image lock
instead of comparing against the retired hardcoded `3.14.7` value.

The three existing CNA range adjudications were reverified online for the new
package version, with recheck date 2026-11-10. They remain exact scanner/CNA
range adjudications; the ordinary CVE allowlist stays empty. A changed digest
or a passing CNA precheck does not prove the images are vulnerability-free.
Fresh Linux/AMD64 build, scan and exact-bundle replay remain distinct evidence.

For committed source `eb973f5b7229a23e19d06bfcf930645cb215e81c`, the isolated
M4 Linux/AMD64 API and frontend builds passed. The API verified 65 locked
distributions, `pip check` and actual app import; the frontend production build
and TypeScript check passed. The combined build/scan command then failed before
Grype could start because the SSH session could not access Docker Desktop's
credential helper. Preserve that failure as failed, not scan evidence. Recovery
uses a task-private anonymous public-registry client configuration against the
same verified Unix Docker daemon; it does not unlock the login keychain, change
the user's Docker configuration, change image pins or rebuild passed images.
The recovered scan completed with API, Redis and NGINX passing. Frontend failed
on Node `22.23.3` (`CVE-2026-105482`, `CVE-2026-106069`,
`CVE-2026-111497`) and Alpine `musl-utils 1.2.6-r2`
(`CVE-2026-107891`). These are candidate-image scanner findings, not proof of
public production exploitability. The scan database was built on 2026-11-03,
SHA-256 `ab581eb337614de4e5f2f1f944ae78992d98242387632c235b406a51dd4d9cd1`.

The official `node:22-alpine` candidate inspected at 11:06:13 UTC is Node
`22.23.4` on both required platforms, index
`sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914`.
The frontend Dockerfile, lock and policy marker use this replacement. Only
the frontend image requires rebuilding; retain the exact API archive and its
input fingerprint. New scan evaluation and exact-bundle replay remain pending.

The frozen preparation tree differs from the installed source in 984 paths,
including 140 application paths, 435 frontend paths, 172 test paths and five
migrations. The exact path inventory and 205 post-baseline master commit
identities are retained in the external receipt directory. This is an
accumulated release; the preparation PR itself changes only release tooling,
the Python image candidate and their evidence/contracts.

The restored source includes migrations 0088–0092: a concurrent health index,
Portal notifications, session registry, TOTP storage and manual-notice dispatch
history. Keep a verified pre-deploy database backup and exact installed bundle
identities before mutation. Application rollback must retain additive tables,
notifications, dispatch history and accepted data; do not run downgrade as an
ordinary recovery step.

The [session cutover contract](../../../portal-session-registry-v1.md#migration-cutover-and-rollback)
invalidates SID-less tokens and requires users to log in again. Coordinate all
API instances. After session revocation or factor setup, the installed old
JWT-only verifier is **not** an unrestricted rollback target: retain registry
and factor enforcement. Any return to older authentication needs the separate
coordinated plan required by the
[TOTP rollback contract](../../../portal-totp-v1.md#evidence-gates-and-rollback),
with affected issuance/traffic stopped and session invalidation where required.
Hiding setup UI does not disable factor requirements.

Migration downgrade, real refunds, payment callbacks, mail delivery and
independent human quality are not established by local/CI/M4 tests.

## Local verification and proposed production operation

Local release-policy, lint, scope/diff and documentation checks passed, with
152 focused release/baseline/integration/image-contract tests passing. The final
`verify:local` routed 67 focused tests and passed. The five-axis source review
covered exact Git identities, temporary-index isolation, atomic ref updates,
bounded restoration input and recovery expiry; no outstanding source finding
was identified. These are local evidence, not CI or production acceptance.

The concrete next host operation is Production Maintenance on `production`,
action `certificate-readiness-refresh`, with the workflow's exact human input
`Refresh production certificate readiness evidence.`. Its current-release
generator invalidates the stale receipt, checks the renewal timer/service/hook,
runs a real Certbot renewal dry run, executes the persistent deploy hook,
reloads NGINX and proves the served certificate matches before writing a new
protected receipt. It does not deploy application code. This operation has
**not** been authorized or dispatched. Separate production promotion and final
exact-SHA deployment authority are still required.

## Receipt retention and remaining gates

Sanitized observations, original failed commands and subsequent focused results
are retained outside Git in the task receipt directory
`/Users/muze/.codex/visualizations/2026/11/03/production-release-preparation/`.
No production address, private-key value, runtime credential or customer content
is recorded in this document or the two reviewed JSON receipts.

Required later gates remain: exact frozen source review/CI, production certificate
readiness, candidate database preflight, exact bundle build/scan/replay, compatible
connector floors, production PR and exact production-push checks, final exact-SHA
operator authorization and post-deploy acceptance. The full formal smoke keeps
its historical not-passed status; real refund and email acceptance remain with
the operator after a separately authorized deployment.
