# Site Capacity Rework Production Release Retrospective (2026-08-08)

Status: dated engineering retrospective for the 2026-08-08 production
deployment of the site-capacity semantics rework (PRs #577-#584) to
`cloud.npc.ink`.

Purpose: record what the release actually cost (node-by-node timing), why it
took the time it did, and the concrete process changes that reduce the next
release's latency. This document does not change Cloud product scope or
release authority.

## 1. Outcome

- Deployed successfully to `cloud.npc.ink` (Deploy Production run succeeded;
  `/health/live` 200, `/portal` login redirect verified).
- Promotion path: `master` → `production` via promote PRs #581 and #584,
  with `deploy-production.yml` operator-gated execution.
- Constituent PRs: #577 (capacity semantics), #578 (pre-existing test
  fix), #579 (activation/quota alignment), #580 (single-session workflow
  standard), #582 (bind-ceiling edge cases), #583 (frontend CVE allowlist
  governance), plus promote PRs #581/#584.

## 2. Timing Log (elapsed 14:11 → 17:00, ~2h50m)

| # | Event | Elapsed |
| --- | --- | --- |
| 1 | Promote branch + merge (conflict resolution) | 0-2 min |
| 2 | Promote CI (full backend-pytest) | 2-12 min |
| 3 | Codex review on #581: 3 P2 findings → fix batch #582 (master PR + CI + merge) | 12-46 min |
| 4 | Promote update re-run CI + merge #581 | 46-65 min |
| 5 | Deploy attempt 1 (approval wait + scan) → blocked by frontend node CVE gate | 65-92 min |
| 6 | CVE governance: allowlist + fail-closed contract + first-install gate sync (#583, incl. 2 codex rounds) | 92-144 min |
| 7 | Promote #584 + CI + merge | 144-157 min |
| 8 | Deploy attempt 2 → immediate fail (push-event CI not yet green) | 157-158 min |
| 9 | Wait for production push-event CI (full) | 158-174 min |
| 10 | Deploy attempt 3 → success + health verification | 174-177 min |

## 3. Why It Cost What It Cost

1. **Review findings surfaced at promote time, not at master-PR time.**
   Four codex-connector reviews across #581/#582/#583 all found real
   defects (same-account reconnect bypass, unsynchronized capacity checks,
   fail-closed CVE contract and governed-set drift). Each finding forced a
   master fix + re-promote + full CI re-run.
2. **Production promotes force the full backend suite.** Every promote CI
   ran the complete backend-pytest (10-20 min); four such rounds dominated
   the timeline.
3. **Deploy gate ordering was not self-synchronizing.** The deploy
   workflow requires a successful push-event CI on the `production` commit,
   but a promote merge triggers that CI asynchronously; the second deploy
   failed immediately instead of waiting.
4. **Environment approval was manual and discovered late.** The
   `production` environment requires an operator approval; the workflow sat
   in `waiting` until the approval was submitted.
5. **CVE governance is intentionally fail-closed across two layers.**
   Adding an allowlist entry requires synchronizing the supply-contract
   exact-set test and the first-install CVE gate governed set; the
   synchronization itself is not documented as a checklist.

## 4. Optimizations to Apply (concrete)

1. **Pre-merge review on master.** For capacity/concurrency/contract/
   security changes, run the same review rules locally before publishing
   the master PR (serialization of count-then-mutate checks, state-machine
   transitions, fail-closed contract sets, governed allowlist sync). Goal:
   zero review findings at promote time.
2. **Deploy workflow waits for the push-event CI.** In
   `deploy-production.yml`, replace the immediate "require successful CI"
   check with a bounded wait loop on the `production` head-SHA push CI
   before proceeding (or gate on a status check instead of an API poll).
3. **Approve the environment immediately after triggering.** The deploy
   workflow should be approved (or the approval step documented) right
   after `workflow run`, not discovered by polling `waiting`.
4. **Document the CVE allowlist change checklist.** Allowlist entry →
   update `tests/contract/test_container_image_supply_contract.py` exact
   set + reason templates → update `scripts/check-first-install-cve-gate.py`
   governed set → run `tests/contract/`. (The reason templates and
   governed set now live in canonical dicts to make this mechanical.)
5. **Batch promote updates.** A promote branch should merge master only
   after all intended fixes are merged, so a promote CI round runs once.

## 5. Follow-Ups

- Upgrade the frontend `node:22-alpine` image to v22.23.2 (or newer),
  repin the digest, rebuild, rescan, and remove
  `CVE-2026-56846` / `CVE-2026-56848` / `CVE-2026-58043` from the
  allowlist before 2026-08-11 expiration.
- Apply optimization 2 (deploy ↔ CI wait) in `deploy-production.yml` as a
  small master PR.
