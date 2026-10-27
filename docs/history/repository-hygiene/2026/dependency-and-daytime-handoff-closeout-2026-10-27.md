# Dependency and daytime handoff closeout — 2026-10-27

Status: dated engineering evidence. Re-query current GitHub, worktrees and M4
before using this record as present truth. This continues the
[resource/planning closeout](resource-and-planning-closeout-2026-10-27.md)
without rewriting its sealed receipts or activating frozen product expansion.

## Daytime handoff

The customer/commercial-record and authentication-recovery work merged through
[#1297](https://github.com/npcink/npcink-ai-cloud/pull/1297) as `e3ba3cbc`.
Its accepted M4 identity and healthy services were independently checked before
the dependency lane replaced that candidate. Preserve its
[customer-operations record](../../customer-operations-observation-auth-closeout-2026-10-27.md),
[request-recovery standard](../../../frontend-request-recovery-v1.md) and
[diagnostic standard](../../../runtime-observation-diagnostics-v1.md).
The 285 historical invocation-evidence gaps were not backfilled; the first
network-latency trigger remains unproved. These are retained limitations, not
newly completed evidence.

The earlier Cloud #1288, Core #191 and documentation #1296 obligations are
already integrated. The `3a377c09` efficiency-standard delivery was adopted
verbatim in #1296; its frozen checkout and external snapshot remain protected.
Do not reopen superseded CVE failures or extend an exception to obtain green CI.

## Dependency repairs

| PR | Finding and bounded change | Distinct verification |
| --- | --- | --- |
| [#1290 React](https://github.com/npcink/npcink-ai-cloud/pull/1290) | Original update paired React 19.3.1 with React DOM 19.2.5; align both to 19.3.1, preserve types 19.3.0 and current master | Frozen install, 671 tests, type-check, actual server render; M4 production-mode build and login/anonymous redirect smoke; six required checks passed at `778158ed`; merged `9f19f225` |
| [#1289 Vitest](https://github.com/npcink/npcink-ai-cloud/pull/1289) | Original major update retained coverage-v8 4.1.12; align engine and exact peer to 5.0.5 | Major release and Node 22/Vite 7 floor review; all 671 tests in 60 files with V8 coverage enabled, type-check, M4 dependency build and actual container versions at `3a609bea` |
| [#1291 Alembic](https://github.com/npcink/npcink-ai-cloud/pull/1291) | Patch 1.20.0 to 1.20.1; retain application and migration source; refresh obsolete baseline | Official patch release reviewed; full backend CI exposed the separate stale assertion below, rather than an Alembic regression |
| [#1299 telemetry contract](https://github.com/npcink/npcink-ai-cloud/pull/1299) | #1297 added provider-required/pending counters, but one non-AI upload test expected the older exact dictionary; add both zero values | Original failure reproduced on M4; corrected upload/diagnostic/classification selection passed 15 tests; Ruff subset passed; required CI passed at `01b0410e`; merged `b5bc1b36` |

The test repair stays outside the bot PR: the trusted-bot lane permits manifests
and locks, not test source. No assertion was removed, loosened to a subset or
skipped. Frontend manifest/lock updates were serialized so the second preserved
the already merged React graph. Coverage percentages describe that execution;
they are not a new target, proof of production coverage or human-use evidence.

## Resource and evidence disposition

The current successor ledger and logs live outside worktrees under
`~/.codex/task-receipts/npcink-ai-cloud/2026-10-27-dependency-and-handoff-successor/`.
This record does not change the ownership contracts in the predecessor packet.

- Other tasks' source, protected primary checkouts and recovery archives remain
  retained. In the fresh read window, Eval had an untracked destination-evidence
  JSON file and Toolbox had an additional detached link-recall worktree. Neither
  has a release contract here; do not submit or delete them on their owner's behalf.
- The `customer-operations-clarity` checkout is clean and its remote topic is
  absent, but the App has already rejected retirement of its protected primary.
  Do not repeat the attempt or bypass the role protection using Git commands.
- Local sites, cron guards, installation symlinks and production are unchanged.
  Live temporary Git packs with an unknown writer remain retained; no payload
  scan, GC, repack or age-based deletion is authorized by this closeout.
- Natural editor adoption, three Free users, real time saved/rework/cost,
  production and real OAuth/SMTP/transaction evidence remain in their separate
  evidence/authority tracks. July 22 originals remain `NOT_LOCATED`; the bounded
  search is reopened only for a newly named source. Do not fabricate any event.

Engineering integration does not establish those external facts. Resume product
improvements under the current
[Phase 1 value-first decision](../../../engineering/phase-1-scope.md#value-first-development-decision-2026-10-27),
with title/summary/selected-text usefulness prioritized and expansion frozen.

## Reusable lessons

The active [dependency policy](../../../pr-and-dependency-update-policy.md#coupled-packages-and-inherited-failures)
now names coupled renderer/test-tool peers, real coverage execution, separate
source repairs for inherited CI regressions, current-head/body merge checks and
aggregate clean-master M4 acceptance. The
[closeout efficiency standard](../../../engineering/zero-backlog-closeout-efficiency-standard-v1.md)
continues to govern the three completion tracks, bounded retries and one active
ledger. Reusing these rules avoids another unbounded historical rescan while
keeping unresolved evidence visible.
