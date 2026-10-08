# Admin validation maintenance closeout — 2026-10-08

Status: focused local source and browser checks passed; PR and M4 acceptance are recorded in the task closeout receipt after merge.

## Scope and boundary

This follow-up closes five accepted engineering limitations from PR #1086:
unused bilingual diagnostics catalog entries, secondary-account fixture identity,
post-disable identity audit evidence, non-pilot visual selection, and help-tip
containment with enlarged root text. The change is L2 / merge because it touches
an existing shared Admin primitive. It changes no API, persisted identity,
Provider configuration, billing, WordPress ownership, migration, dependency, or
production runtime input.

The diagnostic page remains read-only. Its retry/export actions, related links,
shared inspector, and on-demand short help retain their existing ownership and
hierarchy. Fixture data is browser-test evidence, never real customer or
production acceptance evidence.

## Implemented and verified

- Remove five unused `admin.troubleshooting` keys in both catalogs:
  `selected_hint`, `more_tools`, `summary_scope`,
  `run_evidence_failed_status`, and `quality_function_scope_note`.
  Repository reference search found no consumers; i18n completeness passes.
- Give the two existing secondary-account identities account-specific principal,
  membership, and email values. Newly created accounts still have no implicit
  login owner. The focused browser test confirms that disabling the primary
  customer does not change the secondary identity or session version. This is
  bounded identity evidence, not full secondary-account commercial lifecycle
  acceptance.
  Directory and detail fixtures also share the same secondary identity status.
- Reflect a successful primary identity disable in the audit event list and
  disable/event counts. Reopen the real shared audit dialog and assert the new
  event and count; the removed disable action also proves the UI refreshed state.
- A changed Admin source route without a dedicated visual pilot selects the
  complete registered PC suite. A pilot-only change stays focused; a non-Admin
  documentation-only change selects no visual tests. The previous selector
  failed the non-pilot regression by returning zero specs.
- Measure the rendered help bubble width before horizontal clamping. Keep
  the existing 20rem readable width and an explicit 8px viewport gutter.
  Browser checks cover a short viewport, 24px root text at 1280px and 480px,
  above-trigger placement, and Escape dismissal. Existing golden baselines
  are unchanged.

Local evidence: `check:admin-ui`, focused lint, i18n completeness, visual-plan
contract, and four focused Chromium cases passed. The merge uses protected
GitHub checks. Runtime-bearing source requires a candidate sync and clean-master
promotion with relevant smoke; production and paid calls remain separate.
The first coherent checkpoint passed all 87 Linux/M4 visual cases. Local OCR
reviewed five selected files and returned three low-severity suggestions; the
final follow-up deduplicates width measurement, derives audit event count from
the event list, and aligns directory/detail secondary identity status. Final
required CI and relevant M4 smoke validate that follow-up; no broad M4 replay
is needed for these bounded consistency changes.

## Reusable lessons

1. A selector must fail closed when a changed route lacks a pilot mapping;
   registration completeness does not imply changed-route coverage.
2. Test identity and mutation audit evidence together. A success toast alone
   does not prove that refetched state or audit counters changed.
3. Fixture identity belongs to the requested account. Never reuse a primary
   customer's identity or disable state as a generic account fallback.
4. CSS rem dimensions and JavaScript pixel estimates are different units.
   Use rendered geometry when placement depends on the actual bubble size.
5. Keep static, mocked browser, candidate, merged, accepted, production, and
   natural user evidence separate in closeout records.

## Historical preservation and remaining external evidence

The current primary checkout remains protected and unchanged at `dc58be21`.
Its original 93-file source inventory and design brief have dated archive refs
and a verified private bundle. The Portal follow-up stash is classified across
all 17 tracked paths, preserved in that bundle, and retired from the active
stash list. The old `release-fix/2026-10-06-free-trial-promotion` tree exactly
matches its declared source master, which is already an ancestor of master;
its local and remote branch refs were archived/retired with exact-SHA checks.
Production remains `b9d6f02d`; no old release tree is merged back into master.

Resource-query optimization belongs to its original task. Production version
freeze waits for that task's acceptance. Real Provider budget configuration
requires connection names, daily/monthly amounts, and environment. Rollback
readiness requires matching database restore-point and server-backup identifiers;
source SHA alone cannot recover the irreversible migration data changes.
SMTP delivery, natural WordPress adoption feedback, applicable payment evidence,
and ordinary-site-owner trials remain operator-owned. Historical F8 root cause
still needs the original failed response/request ID; current successful reads
cannot explain a missing historical failure.

Archive refs are retained for at least 30 days and bundles for at least 90 days,
with explicit review before expiry cleanup. Retained current/operations/other-task
worktrees are not disposable merely because a feature PR has merged.
