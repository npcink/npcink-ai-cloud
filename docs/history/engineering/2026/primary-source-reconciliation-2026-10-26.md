# Primary source reconciliation — 2026-10-26

Status: historical source reconciliation. This record is evidence about an
older protected checkout, not current product, runtime, release, or production
authority.

## Scope and source identity

The reviewed source was the protected primary checkout at
`f3e591abfd011244470d9456e7729db7ba913df6`. The comparison base is current
`origin/master` at `635de872b1a5fb0fcb07e8c6e6e69695b21eecc7`. The eleven commits
below are the exact first-parent range `244e9dbf81a087e8d241e99d12be8794d0409dc6..f3e591abfd011244470d9456e7729db7`.

The source branch is not an additional set of eleven outstanding product
deliverables. Later master commits carry several intents forward, two commits
were temporary CI, and the remaining documents are historical handoff material
or lessons already reconciled elsewhere. Patch identity alone was not used to
make these classifications.

## Intent reconciliation

| Source commit | Intent | Current disposition |
| --- | --- | --- |
| `a8457807` | Admin IA v2 and operator surfaces | Delivered by `a6fa69bf` (#1201); retrospective `244cab8f` records the closeout. |
| `e6fe8685` | Temporary Linux snapshot workflow | Retired by `0bdf90e0`; workflow is absent from master. |
| `417531d7` | Temporary PR trigger for that workflow | Retired with the same workflow; no product successor. |
| `0bdf90e0` | Linux visual baselines and workflow removal | Baselines are present in master; the refresh workflow remains retired. |
| `5c66d314` | Site Knowledge capacity / AI-credit dual-boundary documents | The boundary is carried by current runtime and credit contracts; the two source documents are historical-only and absent from master. |
| `f1986ce3` | Unit economics Admin panel | Delivered by `3186192a` (#1229) as read-only economics with browser-local estimates. |
| `3caa75d1` | Account closure and notification inbox | Delivered by `b4af1a41` (#1227), with later session and TOTP successors. |
| `a7e5a53c` | Notification bell IA note | The bell is delivered by #1227; the old exact spec hunk is not current master wording. |
| `26f11085` | Portal implementation patterns and DB write traps | The lessons are carried by successor tests and the 2026-10-25 primary-checkout reconciliation; the old exact files are historical-only. |
| `f8372140` | 2026-10-24 next-stage handoff and backlog | Superseded by the active follow-up queue and later closeout/reconciliation records; the old handoff file is absent from master. |
| `f3e591ab` | Handoff baseline pin and drift warning | Same historical disposition as `f8372140`; no new implementation obligation. |

## Current truth and boundaries

The current quota and credit boundary remains the runtime/credit contract. The
old capacity examples, pricing examples, limits, and suggested dynamic quota
models are not copied here and do not become current authority. The economics
surface remains a read-only projection; browser-local bill drafts are not a
commercial ledger. Portal self-service delivery is evidenced by the merged
successors, while personal-data, notification, session, TOTP, and production
acceptance obligations retain their individually stated verification states.

Nothing in this reconciliation proves a live database migration, browser
acceptance, M4 acceptance, production deployment, payment, or provider call.
Those states remain unverified unless a separate current receipt says otherwise.

## Recoverable source references

The exact source commits, old document blobs, and private recovery index remain
in the local task receipt for this audit:

`/Users/muze/.codex/task-receipts/npcink-ai-cloud/2026-10-26-primary-handoff-audit/`

That private receipt is the recovery pointer; this historical document does not
duplicate the old handoff or its stale commands. The prior reconciliation
record, [主 checkout 九篇历史文档对账与开发经验 — 2026-10-25](primary-checkout-intent-reconciliation-2026-10-25.md),
contains the detailed lesson mapping and source fingerprints.
