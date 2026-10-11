# Provider Budget Settings Closeout Retrospective — 2026-10-11

Status: dated engineering record. It captures the delivery of PR #1092 and
the reusable procedures learned while closing it out. It is not production,
release, or product-enabling authority.

## Summary

PR #1092 (`feat(admin): provider account spend budget settings surface`,
squash merge `2419fdd5`) shipped the ADR-055 operator surface: the
`/admin/service-settings` provider-budget group (per-provider day/month USD
caps, warning ratio, unpriced-model reserve, missing-configuration policy,
read-only current-period projection), the validated PATCH route with audit
events, the plan cost-budget field moved behind an advanced disclosure, and
the admin-home watch deep link to `?tab=provider-budget`. Limit edits apply
to the live counter without resetting reserved usage.

Final evidence chain: all required GitHub checks green on `ead81721`,
all 26+ review threads resolved, protected merge by owner-admin precedent,
M4 `acceptance_state=accepted` (`promotion_pr=1092`, `source_branch=master`,
`source_revision=2419fdd5`, `source_dirty=false`), and a bounded smoke on the
accepted runtime (provider_budget projection with default config, ten real
connections, UTC periods; `/` and `/health/live` 200; Alembic head).

Product boundary preserved: users keep credit-only views; plan sales price
and credits stay independent; provider cost protection is operator-only.
**The guard ships disabled** — enabling it per provider connection is an
operator product decision required before paid provider traffic.

## Reusable procedures

### Linux golden-baseline regeneration

CI uploads no screenshot artifacts, so a red Linux golden previously
required an operator to read images from the GitHub UI. The working local
recipe:

1. Run the production standalone frontend on the authoring Mac
   (`pnpm --dir frontend run build`, assemble `.next/standalone` exactly as
   `playwright.config.ts` webServer does, bind `HOSTNAME=0.0.0.0`).
2. Run the exact spec inside the official `mcr.microsoft.com/playwright:v<exact>-noble`
   image matching the frontend's pinned Playwright version, with
   `NPCINK_CLOUD_FRONTEND_BASE_URL` pointing at the Mac and
   `--update-snapshots`.
3. **Match the browser origin to CI**: a plain `host.docker.internal` origin
   produces exactly the known 566-pixel origin-dependent delta (the page
   infers a public base URL from non-loopback origins; see the a511257f
   precedent). A node TCP forwarder listening on container `127.0.0.1:3301`
   and piping to `host.docker.internal:3301` removes it.
4. Calibrate before pushing: a naive PIL diff of the new Linux baseline vs
   the committed one must span the same footprint as the accepted Darwin
   pair (here bbox x228–1420 / y190–569). A footprint mismatch means the
   pipeline is unfaithful — do not commit.
5. CI acceptance of the committed image is the final machine proof; the
   operator can still veto by reverting the test commits.

### M4 host recovery over 蒲公英

The ADR-052 direct route (`muze@172.16.3.35`) allowed full remote recovery
when `m4:preview:sync` failed twice with `Docker Desktop is unable to start`:

- Docker Desktop GUI processes can exist while the daemon is dead; a remote
  `osascript -e 'quit app "Docker"'` + `open -a Docker` restart restored it.
- Root cause was a 98%-full data volume (5.8 GiB free). `docker builder prune`
  plus dangling-image prune reclaimed 23 GB (sparse `Docker.raw` shrank
  accordingly; disk now 88%, 26 GiB free). Treat a nearly-full M4 volume as
  a standing risk to the next image rebuild.

### Protected-merge mechanics for bot-reviewed PRs

master protection requires review approval AND all conversation threads
resolved. The advisory code-review bot opens NEW unresolved threads on
every push, and unresolved threads block even admin merges. The converging
flow that worked: triage findings → push real fixes → reply with a
disposition and resolve each thread (GraphQL reply needs
`pullRequestReviewThreadId`, not `threadId`) → record acceptable/style
findings with reasons instead of chasing cosmetic loops → merge with
`--squash --admin` only after every required check is green. Squash-merged
branches need `git branch -D`; GitHub auto-deleted the remote head.

## Validation lessons

- The `check:changed` router does not list `test:unit` (vitest). Any change
  under `frontend/src/features/**` models must run vitest manually; a
  projection-shape gap otherwise surfaces only in CI.
- `scripts/check-changed-python-quality.sh` checks a ruff correctness/import
  subset; the CI static lane runs full rules (E501 line width was caught
  only in CI). Run plain `ruff check <files>` before pushing Python.
- Next's build type-check is stricter than standalone `tsc --noEmit` for JSX
  prop literal unions — a helper returning `string` passed tsc and failed
  the build.

## Evidence limits and follow-ups

- Not production: production remains at its own revision; no deployment
  claim is made here.
- The budget guard is merged but disabled. Follow-ups recorded separately:
  enabling per-provider limits before paid traffic, user-side credit-source
  presentation, and the UTC vs local period-boundary decision.
- The 2.3 px diagnostics-tooltip flake (unrelated route) passed in
  isolation twice; it remains a known sub-pixel flake, not a defect.
