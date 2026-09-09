# Background Evidence and Natural Cron Delivery Handoff

Status: candidate validated; natural journey delivery pending. Updated 2026-09-09.

## Ownership and Scope

The current task owns the Cloud background-evidence projection and the Local
`magick-ai` natural Cron delivery observation. Reuse the Addon
`docs/wordpress-ai-acceptance-and-release-handoff-2026-09-08.md` and
`docs/wordpress-ai-acceptance-standard-v1.md`; do not repeat model calls or
article writes to reproduce their evidence. Nano and semantic-segmentation
expansion remain paused. Production is outside this work.

## Reused Acceptance

- Draft `281071`, original `280982`: title generation, exact adoption and save
  recorded for `run_21969d96e26041bb8ac5713ca6846c09`, official log
  `18320642-b742-4360-963e-6dd96f1d2280`. Original article preserved.
- Image generation, native import and featured-image draft adoption are recorded
  for `run_7859b9d0f7eb4e6bb727cb94e351e110`, attachment `281073`.
- Addon log/capability fixes were merged in #142; #143–#145 record acceptance
  and its repeatable standard. These are existing records, not new UI tests.
- Normal journey batch recovery: 14 sent, 11 stored, 3 duplicate, buffer 0.
  The 24-record backup and 10 quarantined fake-run events remain in option
  `npcink_acceptance_journey_backup_20260908_281071`; do not replay them.

## Background Evidence Candidate

Implementation contract: [Generation Context Evidence v1](generation-context-evidence-v1.md).
Authoring worktree: `/Users/muze/gitee/.worktrees/npcink-cloud-generation-context`.
Branch: `codex/generation-context-evidence`, locked for this task.
Base/current fetched `origin/master`: `e19afb17dafc1b17fbc9f650860365b9571561ed`.

The 2026-09-09 read-only M4 check still reports `acceptance_state=candidate`,
`promotion_pr=none`, `source_dirty=true`, and bundle
`c52ad49687ae5bb2ea7b588a01daf18913d3015cc4f0f6d8420a376090e3a458`.
API, frontend, proxy and storage health checks passed; required workers run.
No source changes or new M4 sync were needed during this handoff.

Reused exact-scope validation from the preceding implementation turn:

- Local domain tests: 67 passed; Ruff and targeted mypy passed; diff and
  lightweight release-policy checks passed.
- Local API collection was blocked by missing `markdown_it`; it was not a
  passing local API run. M4 supplied the complete runtime test environment.
- M4 focused suite: 252 passed, 2 failed in 131.98 seconds. The failures were
  the old exact-key assertion and a test expecting forged metadata to pass
  admission. Updated tests preserve strict admission. A follow-up found a
  reused trace ID rejected by anti-replay; using a distinct trace fixed it.
- The two failed cases subsequently passed in focused reruns (one in the
  two-case rerun, the remaining one in 1.65 seconds). Thus all 254 selected
  cases have passing evidence, not one uninterrupted green full-suite run.
- No real model calls. No DB migration, image rebuild, UI or Addon source change.

Source/test SHA-256 at handoff:

| File | SHA-256 |
| --- | --- |
| `app/domain/runtime/service.py` | `487db02347608822969bdfcacd1fae08ba2f79c06bd23e45225a87db63c17d2b` |
| `app/domain/wordpress_ai_connector/generation_context.py` | `a0a49c8a7217e51820c87c6ab66a53f05f552183eee2c44f9f3455dc91f4418c` |
| `app/domain/wordpress_ai_connector/runtime.py` | `6bd6cbf8bc75679ca148453a83e374828358c95918cf16359d58b964926d446e` |
| `tests/api/test_wordpress_ai_connector_runtime.py` | `45905565410327951648ed5ba208faa4be1b730bd172a217bf143ac9ecb732cc` |
| `tests/domain/test_wordpress_ai_generation_context.py` | `0a09e63f8d7d1f6002e47c1913f6111588a7ec3c9e588002c035a1262055f63d` |

The original checkout's unsafe `provider_execution.py` experiment was removed
after saving its exact diff to
`/Users/muze/gitee/npcink-ai-cloud/.runtime/generation-context-evidence-superseded.patch`.
Only that known task hunk was removed; unrelated edits remain. Do not restore
this obsolete unvalidated projection or merge it alongside the snapshot design.

## Natural Cron Observation

At `2026-09-09T01:04:46Z`, read-only database inspection confirmed:

- site URL `http://magick-ai.local`, `DISABLE_WP_CRON=false`;
- `npcink_cloud_addon_flush_observability` scheduled hourly, next due
  `2026-09-09T01:42:04Z`;
- journey buffer empty; observability buffer also empty at `01:06:44Z`;
- observability status: last success `2026-09-08T13:42:06Z`, total sent 4,
  latest outcome failed because `127.0.0.1:18010` had no listener.

The site returned HTTP 200. The initial WP-CLI DB error came from the default
CLI socket, not proof of a stopped site; using the Local `s63K4c8XP` MySQL socket
resolved it. The existing foreground `m4:preview:auto` command from the stable
operations worktree restored a healthy LAN tunnel. No manual flush, Cron
reschedule, fake event, settings change or model call was used. A normal home
page read occurred during diagnosis and may trigger WordPress's normal due-Cron
spawn; it is not evidence that a nonempty journey batch reached Cloud.

The observability status option belongs to plugin observability. It cannot
prove customer-journey delivery: the journey callback has its own buffer and
does not persist that callback's return receipt. An empty journey buffer alone
is also insufficient, including after the next Cron time advances.

Accept natural journey delivery only when a real event was observed pending,
ordinary WP-Cron execution advances the schedule, and Cloud receipt for the
same event/run can be correlated with buffer removal. Do not call
`wp cron event run`, `flush_buffer`, replay backup events, or generate paid
model requests to manufacture this evidence. If no real event exists, keep
the state `pending_no_real_event`; continue bounded observation during normal use.

## Remaining Closeout

The code is uncommitted and not merged; candidate validation does not close
Git delivery. Publication requires the merge lane, protected checks and clean
master M4 promotion. Preserve the locked task worktree until that chain finishes.
Natural Cron remains independently pending; neither merge nor health grants
upload acceptance. Do not archive the observation while it still has no proof.

Use the existing foreground tunnel during active Local observation. Stop only
the tunnel owned by this task when observation ends; do not add a tunnel daemon.
No production promotion, global branch cleanup or cross-repository release is
implied by this handoff.

Observation continuation: heartbeat `wordpress-cron` was created in this task
on 2026-09-09, hourly and read-only. It stays quiet without changes, pauses on
success or after 24 hours without a real sample, and never manufactures traffic
or model calls. Foreground tunnel session `56006` uses the existing auto route
and reported `tunnel_ready=true` via LAN. Its continued availability must be
checked rather than assumed. Merge-lane scope confirmation was requested;
until an answer arrives, no commit, push, PR or promotion is authorized here.
