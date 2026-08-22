# Production Release Historical Issues Closeout and Retrospective — 2026-08-14

Status: time-bounded production historical evidence; not current release authorization.

Current authority: [Cloud Production Release Policy](../../../cloud-production-release-policy-v1.md).

Original status: time-bounded closeout and retrospective evidence; not current
production authorization.

## Scope and Authority

This document closes the issue ledger carried by
`npcink-cloud-addon/docs/next-session-handoff-2026-08-08.md` against current
Cloud, Addon, GitHub, WordPress.org, and observed runtime evidence as of
2026-08-14. It also records the corrections made while auditing and releasing
the work.

Future work must recheck current source, protected checks, release policy, and
runtime state. The active method is
[Historical Issue Closure and Release Evidence Standard v1](../../../historical-issue-closure-and-release-evidence-standard-v1.md).

## Original Goal

The handoff named four unfinished outcomes:

1. upgrade the Node image and remove expired allowances for
   `CVE-2026-58043`, `CVE-2026-56846`, and `CVE-2026-56848`;
2. make `deploy-production.yml` wait for the CI conclusion of the exact
   production push SHA;
3. codify the checklist for CVE allowlist changes;
4. publish Addon version `0.1.4` to WordPress.org.

The follow-up also exercised the Cloud consumer paths and investigated issues
found during acceptance.

## Completion Matrix

| Historical item | Source evidence | Release/runtime evidence | State at 2026-08-14 |
| --- | --- | --- | --- |
| Node image and expired CVEs | Cloud PR `#649`, commit `253ad025`; Node `22.23.2` digest `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32` | Present in production; production allowlist contains zero entries for the named CVEs | Closed |
| Exact-SHA production CI wait | Cloud PR `#715`, `master` commit `1313ef3f006038c7c2b32d7a1839f4a4d7b632e4`; wait contract uses `900` seconds and `15`-second polling | Production PR `#716`, production commit `53f0040d1673de581e60b700315db7912a8a08b3`; exact-SHA wait passed in [run 31775691330](https://github.com/npcink/npcink-ai-cloud/actions/runs/31775691330) | Closed |
| CVE allowlist checklist | PR `#715` updated the governed checklist and executable contract together | Release-policy checks passed for the promoted revision | Closed |
| Addon WordPress.org release | The originally requested `0.1.4` was superseded by later releases; Addon PR `#94`, commit `e6d7f80`, fixed duplicate `.png.png`; PR `#95`, commit `2d73b6a`, refreshed translation references | Current published version `0.1.7`, SVN revision `r3646532`, immutable [0.1.7 tag](https://plugins.svn.wordpress.org/npcink-cloud-addon/tags/0.1.7/) | Closed by superseding release |
| Consumer-path acceptance | Text Ability and `image_prompt_generation` used `ai_task_contract.v1`; image output remained suggestion-only | WordPress text Ability → Addon → M4 Cloud → model → local acceptance passed; image artifact download, checksum, and ACK passed with zero WordPress writes | Closed for tested paths |
| Duplicate local image suffix | Addon PR `#94` repaired the import naming defect | A previously created media artifact remains intentionally retained for review | Code defect closed; retained artifact is not an open defect |

No item in the frozen 2026-08-08 handoff ledger remains unresolved. The
formal authenticated production smoke described below remains deferred
evidence, not a reopened source defect.

## Production Release Evidence

Production deployment run `31775691330` completed successfully in 3 minutes
16 seconds. Its recorded timing receipt was:

| Segment | Duration |
| --- | ---: |
| Recorded total | 133 s |
| Remote sequence | 105 s |
| Bundle | 9 s |
| Transfer | 23 s |
| Image load | 16 s |
| Migration | 12 s |
| Cutover | 50 s |
| Health | 23 s |

`/health/live` reported `status=ok`, revision `53f0040d1673`, and
`source_dirty=false`. The small-customer preflight passed.

Formal authenticated smoke was not run because `NPCINK_CLOUD_ADMIN_KEY` and a
one-time Portal login code were unavailable. It is therefore `deferred`, not
`passed`. No Provider call was used to fill this evidence gap.

## Consumer and Cross-Repository Evidence

The exercised text path reached the model through the WordPress Ability,
Addon, and M4 Cloud path, then returned to local acceptance. The
`image_prompt_generation` path projected `ai_task_contract.v1` metadata and
remained suggestion-only. Image artifact creation, download, checksum, and ACK
were observed without a Cloud-owned WordPress write.

The local image import exposed the duplicate `.png.png` suffix and led to the
Addon correction. Media ID `287447` and the old local file
`wp-content/uploads/2026/08/npcink-cloud-adoption-smoke-20260814.png.png` were
intentionally retained for operator review. They are evidence of the old
behavior, not evidence that the current Addon source still has the defect.

## Promotion-Lane Correction

Production PR `#661` was found open, conflicting, and based on an older
production revision. It was closed as superseded before PR `#716` was opened.

The full `master` to `production` delta contained 84 files, while the operator
had authorized only the release-safety repair. The release used a bounded
current-production-based `release-fix/*` branch containing the already-reviewed
`master` commit instead of promoting unrelated accumulated work.

The governed release plan classified the change as:

```text
lane=full
deployment_required=true
migration_required=false
runtime_config_required=false
```

The plan, rather than an assumption that a workflow edit meant `no_deploy`,
determined the required lane.

## Problems Found and Corrections

| Problem | Correction | Durable lesson |
| --- | --- | --- |
| The initial audit read the stale visible branch and concluded the Node/CVE work was unresolved | Fetched and inspected `origin/master` and `origin/production` | A dated handoff and current checkout are not current project truth |
| A change merged to `master` was initially discussed as done before production state was checked | Split source, integration, production, deployment, runtime, and consumer claims | Each lifecycle state requires its own evidence |
| Stale production PR `#661` was discovered only during promotion | Audited and cleared the protected production lane before publishing `#716` | Inspect open target-branch PRs before preparing a promotion |
| The authorized repair sat inside an 84-file branch delta | Released only the reviewed repair from current production | Do not use a narrow repair to smuggle unrelated integration delta into production |
| The workflow change might have been informally treated as non-deploying | Ran and followed the exact governed release plan | Never infer the deployment class |
| A zsh loop assigned to `path`, replacing zsh's special command-search array and causing `git: command not found` | Stopped the command and used a non-special variable name; no project mutation occurred | Use explicit names such as `target_file`; do not reuse shell or system variables |
| Formal smoke credentials were missing | Recorded the smoke as deferred while preserving the green preflight and health evidence | Adjacent green evidence must not turn an unexecuted gate green |

## What Worked Well

- The issue ledger stayed finite and all four handoff items received exact
  source and release evidence.
- Cloud and Addon closure were verified independently rather than inferred
  across repositories.
- The production promotion was narrowed to the authorized repair after the
  84-file delta was measured.
- The workflow waited for the exact production SHA and failed closed by
  contract.
- Runtime acceptance preserved the suggestion-only and zero-WordPress-write
  boundaries.
- Resource use remained bounded: one production deployment, no automatic
  retries, zero Provider calls, and no repeated broad gate for the same risk.

## Next Focus

1. Obtain operator-controlled credentials only when formal authenticated
   production smoke is intentionally scheduled; do not make the deferred smoke
   a hidden prerequisite for unrelated work.
2. Apply the active closure standard to future dated handoffs so remote and
   protected-lane truth are checked before implementation planning.
3. Audit open production PRs at the start of a promotion, not during its final
   publication step.
4. Keep release-plan classification and operation budgets in every production
   change envelope.
5. Preserve old media artifacts as labeled evidence or remove them through an
   explicit operator cleanup task; do not confuse artifact cleanup with source
   correctness.

## Closeout Receipt

```text
Scope: four issues from the 2026-08-08 Addon handoff plus discovered consumer-path defects
Issue ledger: all frozen items closed; formal authenticated smoke remains deferred evidence
Source evidence: Cloud PRs #649 and #715; Addon PRs #94 and #95
Release evidence: Cloud production PR #716 and run 31775691330; Addon 0.1.7 at SVN r3646532
Runtime/consumer evidence: health revision 53f0040d1673; small-customer preflight; text and image consumer paths
Deferred evidence: formal authenticated smoke missing admin key and one-time Portal login code
External-operation budget and actual use: one production deployment, no retry, zero Provider calls
Rollback: protected source revert and redeploy of the last accepted production revision
Final state: frozen historical ledger closed as of 2026-08-14; this receipt is not future release authorization
```

## Related Records

- [Cloud Production Release Policy](../../../cloud-production-release-policy-v1.md)
- [Release Checklist](../../../../deploy/RELEASE_CHECKLIST.md)
- [Cloud Site Capacity Production Release Retrospective — 2026-08-08](../../../cloud-site-capacity-production-release-retrospective-2026-08-08.md)
- [Repository Hygiene and Documentation Lifecycle Standard](../../../repository-hygiene-and-documentation-lifecycle-standard-v1.md)
