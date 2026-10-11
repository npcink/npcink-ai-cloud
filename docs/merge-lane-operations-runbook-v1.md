# Merge-Lane Operations Runbook v1

Status: active operational runbook.

Purpose: record how to drive pull requests through the protected `master`
merge lane reliably — the gates that exist, the failure modes observed, and
the working protocol that kept 11 PRs merging on 2026-10-04/05 without
bypassing any protection. This is operational knowledge, not release
authority; the dependency lane stays governed by
[pr-and-dependency-update-policy-v1.md](pr-and-dependency-update-policy-v1.md).

## The merge gates on `master`

1. **Required checks, strict mode.** `backend`, `frontend`, `PR body
   contract`, `Secret scan`, `Analyze (python)`, `Analyze
   (javascript-typescript)`; "require branches up to date" is ON. Every
   master merge makes every other open PR `BEHIND` until it is rebased.
2. **Required conversation resolution.** Every review thread must be
   resolved before merging. The advisory OpenCodeReview bot posts threads on
   every push, so an all-green PR can sit `BLOCKED` purely on unresolved
   advisory threads.
3. **No approving reviews required; `enforce_admins` ON.** Administrators
   are not exempt from either gate.
4. **Auto-delete head branches (enabled 2026-10-05).** Merged branches
   disappear automatically; remote head cleanup is no longer manual.

## Working protocol

- **Merge serially.** Land one PR at a time; everything else goes `BEHIND`
  after each merge. Pipelining more than two or three PRs just multiplies
  rebase/CI cycles.
- **Human branches:** rebase onto current `origin/master`, push with
  `--force-with-lease`, then confirm with `gh pr checks`. Publish through
  `pnpm run pr:publish` (it refuses stale-base branches — rebase and rerun).
- **Dependabot branches:** comment `@dependabot rebase` (server-side rebase
  that preserves bot authorship; never `gh pr update-branch` on a bot PR),
  then `gh pr merge N --squash --auto`. Expect one extra rebase round per
  intervening merge.
- **Advisory bot threads:** fix real defects when the finding is valid;
  otherwise reply with verifiable evidence and resolve the thread (GraphQL
   `resolveReviewThread` or the UI). The bot's world knowledge can be stale
  — it flagged zod 4.6.5 as "not published" while the frozen-lockfile
  install lane was green, and misread a SHA-pinned action as a mutable tag.
  Evidence-backed resolution is the intended path; ignoring threads is not.
- **Security patches merge before routine version bumps** (dependency
  policy rule 4).

## Known failure modes and remedies

- **CVE recheck window expiry.** `Authoritative CVE range precheck` fails
  with "recheck window expired" for every new run once `recheck_after`
  (seven-day cadence) passes. Renewal runbook below. Also check whether a
  newer CPython security release exists — a real exposure needs an image
  version bump, not a date renewal (2026-10: CVE-2026-19445 affects
  3.14.x < 3.14.8 while the image pins 3.14.7).
- **`backend-targeted (static)` cache-save failure (fixed in #1063).**
  Symptom: `Path Validation Error` in `Post Setup Node` on PRs that change
  `pnpm-lock.yaml` without frontend-only classification — the lane exits
  without any `pnpm install`, so setup-node's cache save fails the job when
  the lockfile key misses. Fixed by materializing the store path
  (`mkdir -p "$(pnpm store path)"`). Do not remove the cache inputs
  instead: the frontend lock contract test requires them.
- **Runner cancellations.** `backend-scope` cancelled mid-run fails the
  umbrella `backend` job. After the run completes, `gh run rerun <id>
  --failed` re-executes just the cancelled jobs; queued reruns can wait a
  long time on runner congestion. With auto-merge already enabled, a
  self-completing PR is a valid hand-off state.
- **Flaky paths to github.com.** SSH (port 22) resets and HTTPS SSL
  timeouts can coexist with a healthy `api.github.com`: keep driving state
  through `gh` (comments, merges, thread resolution) while git transport
  retries; `pr:publish` carries a Git Data API fallback that reproduces
  local commit SHAs when direct push fails.

## CVE recheck window renewal (weekly cadence)

1. Verify online that each entry's CNA record is unchanged (the check
   script does this against `cveawg.mitre.org`).
2. Set `verified_on`/`recheck_after` (+7 days) in
   `deploy/image-lock/authoritative-not-affected.json`.
3. Recompute the file's sha256 and update
   `scan_policy.authoritative_not_affected_sha256` in
   `deploy/image-lock/production-images.json` **surgically** — a full JSON
   rewrite reformats the file and pollutes the diff.
4. Local gate: `python3 scripts/check-authoritative-cve-ranges.py` must
   print `status: passed`.
5. Publish the lock-only PR; every pending CI run unblocks once it lands.

## Evidence

Distilled from the 2026-10-04/05 session: #1059 (renewal), #1063 (static
cache fix), #1058/#1062 (security bumps), #1061 (feature port through four
advisory review rounds), #975/#976/#980/#981 (routine bumps), #1066 (pin
comment pair), plus #1034 closed as superseded by #1035.
