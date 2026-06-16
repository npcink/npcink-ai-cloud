# Nightly Inspection Real-Site Trial Record: magick-ai.local - 2026-06-17

Status: completed first controlled local Cloud inspection run.

Purpose: record the first local controlled-trial attempt for Nightly Site
Inspection / Morning Brief on `magick-ai.local`. This record follows
`docs/nightly-inspection-real-site-operator-trial-2026-06-17.md`.

This is a local development trial record. It is not external production
evidence, but it does count as the first successful local controlled real-site
cycle for the current development stage.

## Trial Site

- Date: 2026-06-17
- Operator: Codex local operator
- WordPress site URL: `https://magick-ai.local`
- Cloud base URL: local Cloud development worktree evidence only
- Site ID: not confirmed from the WordPress admin HTML in this pass
- Account ID: not confirmed from the WordPress admin HTML in this pass
- Declared use case: local Nightly Inspection / Morning Brief operator trial
- Site category decision: local development site, approved for smoke only
- Cloud API key verified: yes, Cloud entitlement and runtime submission passed
- Toolbox Pro Cloud Runtime visible: yes, authenticated admin HTML exposed Run
  Cloud inspection, Refresh Cloud quota, quota, and Core handoff UI signals
- Operator briefed on review-only boundary: yes

## Nightly Inspection Runs

One real Cloud inspection run was submitted in this attempt through the local
WordPress / Toolbox Cloud Batch E2E path. The run used a bounded metadata-only
snapshot and returned a mergeable Morning Brief result.

| Run date | Cloud run ID | Status | Items scanned | Reviewable | Critical | Warnings | Avg score | Operator reviewed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-17 | `run_a14776eeb51043b7a1e016c5300b7aa6` | succeeded | 5 | 5 | 3 | 2 | 62.2 | yes |

## Morning Brief Review

- Did the priority queue identify the right first items: yes for smoke; first
  priority was a critical page review item with score `45`
- Useful issue groups: 4 groups returned; useful enough for the first trial
- Noisy issue groups: none flagged in this pass
- Missing context: none blocking the smoke; output remained metadata-only
- Confusing labels or copy: none flagged in this pass
- Did the brief save editorial time: likely yes, because the priority queue
  reduced 5 scanned items to 3 merged local priorities for review
- Did the operator need Core handoff: yes, the result preserved review-in-Core
  posture without creating a Core proposal automatically
- Any attempted Cloud write or direct mutation: no

## Feedback Loop

- Feedback events submitted: 1
- Accepted items: first priority item `action_002`
- Rejected items: none
- Wrong priority labels: none
- Already handled labels: none
- Evidence weak labels: none
- Wrong next step labels: none
- Top rejected reason codes: none
- Feedback summary checked in Cloud: individual receipt accepted for eval
- Feedback receipt: `status=ok`, `accepted_for_eval=true`,
  `feedback_event_id=5616`, `production_mutation=false`
- Feedback labels: `evidence_useful`, `operator_confidence_high`

## Boundary Review

- WordPress direct write absent: yes
- Cloud article generation absent: yes
- Bulk article generation absent: yes
- Local/Core final approval owner preserved: yes
- Secrets, cookies, nonces, or passwords absent from feedback: yes
- Runtime submission remained bounded: yes, metadata-only batch with no direct
  WordPress write, no Cloud scheduler truth, no automatic Core proposal
- Any support or abuse concern: none observed in this local development pass

## Evidence

Cloud clean worktree:

- Branch/worktree: `/tmp/magick-ai-cloud-local-trial`
- Base commit: `a4153db Add nightly inspection feedback loop`
- `make lint-changed`: passed, no changed Cloud Python files
- `.venv/bin/pytest tests/api/test_cloud_batch_runtime.py tests/api/test_agent_feedback_routes.py tests/contract/test_nightly_site_inspection_contract.py`: 19 passed
- `pnpm run check:agent-feedback-quality`: passed, including 12 API/regression
  tests, targeted Python lint, Cloud admin type check, targeted Cloud admin
  lint, and read-only dashboard boundary contract

Toolbox local workspace:

- `composer smoke:nightly-inspection-cloud-ui`: passed
- `composer smoke:nightly-inspection-cloud-batch-merge`: passed
- `php -l tests/smoke-nightly-inspection-cloud-ui-contract.php`: passed
- `php -l tests/run.php`: passed
- `composer test:all`: passed, 1685 static contract checks plus Nightly
  Inspection smoke checks

Browser and WordPress site checks:

- Local.app and Local MySQL were running.
- `mysqladmin --defaults-file="/Users/muze/Library/Application Support/Local/run/NPb24Zg9g/conf/mysql/my.cnf" ping`:
  `mysqld is alive`.
- The default WP-CLI connection still failed because the CLI PHP process used
  the wrong local MySQL socket.
- WP-CLI succeeded with a temporary local-only `DB_HOST=127.0.0.1:10004`
  bootstrap file.
- WordPress `siteurl`: `https://magick-ai.local`.
- WordPress `home`: `https://magick-ai.local`.
- Published post/page count: `608`.
- Active runtime-related plugins included `npcink-governance-core`,
  `npcink-abilities-toolkit`, `npcink-ai-client-adapter`,
  `npcink-cloud-addon`, and `npcink-toolbox`.
- Authenticated admin HTML was fetched using a short-lived local operator auth
  cookie generated through WP-CLI for this smoke pass. The captured page did
  not contain the login form and did contain the WordPress admin bar for
  `codexadmin`.
- The Toolbox admin HTML exposed the Advanced / Cloud Runtime operator surface,
  including `Run Cloud inspection`, `Refresh Cloud quota`, quota, and Core
  handoff signals.
- `wp eval-file tests/smoke-nightly-inspection-cloud-e2e.php`: passed against
  `magick-ai.local`; run id
  `run_a14776eeb51043b7a1e016c5300b7aa6`.
- Cloud entitlement exposed the Nightly Site Inspection runtime feature and
  allowed Pro Nightly Inspection batch submit.
- Cloud runtime worker processed the batch to `succeeded`.
- Cloud result contract: `cloud_batch_runtime_result.v1`.
- Toolbox normalized the Morning Brief Cloud merge patch and returned a merged
  Morning Brief preview.
- Morning Brief summary: 5 items scanned, 5 reviewable, 3 critical, 2 warnings,
  average score 62.2, score version `nightly_content_quality_score.v2`.
- First priority: `action_002`, page `155`, title `Page with comments`, score
  45, severity `critical`, next action `review_update_brief`.
- Feedback receipt accepted for eval with event id `5616`; production mutation
  remained false and final write truth remained `wordpress_local`.

## Decision

- Go/no-go: go for continuing development trials
- Continue unchanged / adjust scoring / adjust Morning Brief copy / pause site:
  continue unchanged for now; do not tune scoring from one successful smoke run,
  but begin collecting more varied cases
- Follow-up implementation task: none for Cloud/Toolbox feature code from this
  pass; the main environment issue was local WP-CLI DB socket configuration
- Weekly review notes: collect at least a few more real-site runs before tuning
  scoring weights, Morning Brief grouping, or feedback labels

## Next Attempt Checklist

Before the next local trial batch:

1. Use the Local MySQL port/socket-aware WP-CLI bootstrap when checking
   `magick-ai.local` from the terminal.
2. Run one larger metadata-only batch from the admin UI path, not only WP-CLI,
   to validate the browser operator loop.
3. Run one excerpt-mode batch to verify privacy toggle behavior and quality
   lift.
4. Submit both accepted and rejected feedback labels across different priority
   items.
5. Record run ids, Morning Brief summaries, feedback receipts, and boundary
   checks.
