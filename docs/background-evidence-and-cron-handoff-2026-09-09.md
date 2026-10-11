# Background Evidence and Natural Cron Delivery Handoff

Status: complete. Cloud evidence merged and accepted on M4; natural journey
delivery accepted. Updated 2026-09-09.

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

## Background Evidence Delivery

Implementation contract: [Generation Context Evidence v1](generation-context-evidence-v1.md).
Cloud PR [#929](https://github.com/npcink/npcink-ai-cloud/pull/929)
merged to `master` as `d8b1343e1d9bb67e18c7dbd2aa35b30443d9229d`.
The clean stable operations worktree promoted that PR and reports
`acceptance_state=accepted`, `promotion_pr=929`, `source_branch=master`, and
`source_dirty=false`. API, database, Redis, frontend, proxy, and required
workers were healthy. Production was not changed.

The merged implementation passed 67 focused local domain tests, Ruff, targeted
mypy, GitHub required checks, and the recorded M4 focused suite. The two
test-only failures described below were corrected and passed in focused reruns
before publication.

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

### Real post-merge evidence

On 2026-09-09, one bounded WordPress `ai/title-generation` request used the
existing dedicated draft `281071`. It returned a suggestion without saving or
publishing the draft and created Cloud run
`run_47770a0caa4c4080b7e8ec02efb7f1c1`. The signed result read projected:

- `contract_version=generation_context_evidence.v1`;
- `status=applied`, `mode=site_title_style`, `reason=references_applied`;
- `reference_count=1`, `context_chars=120`.

This proves bounded site-title background was assembled into that run. It does
not prove automatic adoption, publishing, or general output quality.

## Natural Cron Observation

Initial read-only inspection confirmed:

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

At `2026-09-09T04:03Z`, the bounded title request above created two real local
events. `journey_event_7ea08934ea5649d585a7abeaaf6ed9c9` records `started`;
`journey_event_6e4e340baa604ee6a25a1f9a9756b4a3` records `succeeded` and correlates
to `run_47770a0caa4c4080b7e8ec02efb7f1c1`. Both remained pending until the
hourly WP-Cron cycle due after `2026-09-09T04:42:04Z`. A pre-delivery Cloud
query found neither event, establishing the before state without flushing the
buffer.

Existing normal WordPress traffic triggered the due cycle without a Cron
endpoint, WP-CLI Cron runner, manual flush, fake event, or reschedule. A
separately scheduled ordinary site-home request occurred at
`2026-09-09T04:42:11Z`, six seconds after Cloud had already received the batch,
so it is not claimed as the trigger. The schedule advanced to
`2026-09-09T05:42:04Z` and the local journey buffer became empty. Cloud stored
both events with received time `2026-09-09T04:42:05.580169Z`. As required by
the active privacy contract,
Cloud stores `SHA-256(site_id|event_id)` rather than the raw event ID. The
expected and stored values matched exactly:

- started: `18825c6e3266556d05b56b8efcfe896e3e32e651d2c52fdd6eca3a33bf3480f2`;
- succeeded: `c5efbf197223349959fdca7c6ce3aac8ea99aef668635ee950c863e075b16de7`.

The succeeded row retained `run_47770a0caa4c4080b7e8ec02efb7f1c1`.
Natural customer-journey delivery is accepted.

## Closeout

Cloud code delivery, clean-master M4 acceptance, real generation-context
evidence, and natural Cron delivery are complete. The clean merged task
worktree and its local and remote topic branch were removed after PR merge was
confirmed. The Addon inspector was extended separately to display the expected
site-scoped Cloud hash for future correlation without exposing site identity or
credentials.

Use the existing foreground tunnel during active Local observation. Stop only
the tunnel owned by this task when observation ends; do not add a tunnel daemon.
No production promotion, global branch cleanup or cross-repository release is
implied by this handoff.

The temporary `wordpress-cron` heartbeat and foreground M4 tunnel can be
stopped after this receipt is committed. No production promotion occurred.
