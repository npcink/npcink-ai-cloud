# Preview sync ≠ deploy and session closeout (2026-10-23)

Date: 2026-10-23 (Asia/Shanghai).

Status: dated session closeout and evidence index. Not current M4 operations,
acceptance, production, or product authority.

## Outcome

- Merged [#1200](https://github.com/npcink/npcink-ai-cloud/pull/1200)
  (`8f47e4d5`): exclude `addon.editor_assist.*` from
  `plugin_observability.latency_high` / site-connection attention.
- Natural Cron and quota observation work from the same window stayed
  evidence-local (see index below); no further product PR in this closeout.
- [#1183](https://github.com/npcink/npcink-ai-cloud/pull/1183) open-PR warning
  promote gate: keep Cloud-only until **≥3 real open-PR samples** are observed;
  Addon / Toolbox promotion stays deferred until that bar is met.

## Lesson: sync ≠ deploy

`pnpm run m4:preview:sync` against clean `master` @ `8f47e4d5` reported PASS,
but the live preview process remained on older `d566744`. Spot-check of
`site_magick-ai-local` still showed 「站点连接需要关注」 /
`latency_high` driven by assist latency. Only after authorized
`m4:preview:ollama:install` (port `11434`) and `m4:preview:deploy` did
`/health/live` reach a tip containing #1200 (`8b1daa8b…`) and the banner clear
(PASS). Cross-ref:
[m4-preview-ai-development-standard-v1.md](../../../m4-preview-ai-development-standard-v1.md)
(`sync` ≠ `deploy` callout in §4).

## Portal §1.10

Folded complete backlog text from worktree tip `a5e4bb97`
(`docs/engineering-follow-up-queue-v1.md` §1.10 Portal 自助进阶能力) into the
same docs PR. Not deferred.

## /workspace evidence index (do not copy large artifacts into the repo)

| File | Role |
| --- | --- |
| `preview-sync-1200-2026-10-23.md` | sync PASS + stale-runtime FAIL context |
| `preview-1200-redeploy-spotcheck-2026-10-23.md` | deploy + spot-check PASS |
| `pr-1200-merged-2026-10-23.md` / `pr-1200-exclude-editor-assist-latency-high-2026-10-23.md` | #1200 merge / patch notes |
| `pr-1183-merged-2026-10-22.md` / `pr-1183-zero-overlap-2026-10-22.md` | open-PR warning |
| `natural-cron-evidence-2026-10-22.md` / `natural-cron-evidence-2026-10-22-round2.md` | natural Cron |
| `quota-exceeded-evidence-2026-10-22.md` | quota |
| `magick-ai-crontab-2026-10-23.md` | crontab snapshot |
| `closeout-worktree-cleanup-2026-10-23.md` | §2 safe worktree/branch cleanup |
| `closeout-docs-pr-2026-10-23.md` | this docs PR evidence note |

Deferred this round (unchanged): editor clickable billing, portal Option B
re-label, #1183 cross-repo promote PRs.
