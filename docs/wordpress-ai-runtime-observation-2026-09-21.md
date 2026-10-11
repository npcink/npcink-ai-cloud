# WordPress AI Runtime 持续观察记录 — 2026-09-21

Status: active observation. This record separates work that is complete from
facts that require normal usage, human review, or an external decision. It
does not authorize a production release or manufacture Provider traffic.

## Current classification

| Item | Current action | Evidence/state |
| --- | --- | --- |
| Natural-traffic pilot | Continue observation | Seven-day window and at least 50 real observations remain required; current natural sample count is 0 |
| Browser and protocol edge cases | Complete deterministic technical checks now; retain missing browser cases | Cloud focused suite: 105 tests passed; Addon fake journeys passed; empty/long/mixed-input and real timeout/429/5xx browser evidence is still missing |
| Semantic quality | Human review during normal use | Local Ollama proved the technical path only; title relevance, summary fidelity, and rewrite preservation remain unjudged |
| Upstream gateway Responses behavior | External follow-up and bounded recheck | ADR-054 fail-closed boundary is merged; historical gateway reasoning-only/instruction-like output remains an external mapping issue |
| Cross-repository matrix | Completed in the correct environment | `composer quality:matrix:run` passed for Cloud Addon and Cloud after setting `BASH_ENV`, fallback Git, and the repository family root |
| Branch protection compatibility gate | Record for operator decision | Addon compatibility job passed after rerun, but is not listed in current required contexts; no protection change was made |
| Production and paid Provider pilot | Continue policy pause | Production promotion remains paused; no production deployment or paid call was made |

## Observation protocol

Use the existing official WordPress AI editor path and normal operator actions.
Do not create synthetic sessions, replay events, flush queues manually, or
generate paid calls to reach a sample target. Keep WordPress content, prompts,
generated text, post IDs, user IDs, URLs, credentials, and Provider payloads out
of committed records.

For every naturally occurring sample, record only:

- date, environment, WordPress/AI/Addon/Cloud revisions;
- task category and a non-sensitive sample identifier;
- Cloud run correlation and whether the generation was presented;
- human assessment: accurate, inaccurate, or unable to judge;
- modification amount, adoption/save state, and whether feedback joined;
- total and editing time, or `not measured`;
- technical error category and cleanup result.

The detailed title-specific form is in
[title-quality-observation-2026-09.md](title-quality-observation-2026-09.md).
The cross-task lifecycle and attribution contract is in
[wordpress-ai-runtime-validation-rollout-plan-v1.md](wordpress-ai-runtime-validation-rollout-plan-v1.md).

## Exit gates

Do not start a pilot decision until all of these are true:

1. seven calendar days of normal observation are available;
2. at least 50 real observations are available, preferably from more than one
   site;
3. generation, run, provider-call, presentation, and save evidence joins are
   complete or explicitly unknown;
4. a human has reviewed representative title, summary, and rewrite samples;
5. no unauthorized WordPress write, credential disclosure, cross-site
   attribution, or silent Responses-to-Chat-Completions downgrade occurred;
6. any routing change is manual, versioned, and followed by a new observation
   window.

Insufficient samples mean `continue_observation`, not a quality pass. A
semantic failure, attribution gap, or boundary violation stops the affected
pilot path and opens a focused engineering task.

## Immediate technical checks completed on 2026-09-21

- Cloud `test_openai_provider.py`, `test_wordpress_operation_runtime.py`, and
  `test_entitlement_routes.py`: `105 passed`, one existing Starlette warning.
- The central matrix was first falsely reported as “not a git repository”
  because its nested login shell did not inherit the fallback Git environment.
  Re-running with `BASH_ENV=/tmp/codex-bash-env`, fallback Git, and
  `NPCINK_REPO_FAMILY_ROOT=/Users/muze/gitee` produced `passed` for both
  `composer test:all` (Addon) and the exact-SHA GitHub CI gate (Cloud).
- This technical pass does not convert the missing natural, semantic, or
  production evidence into a pass.

## Next observation review

At the first 5–10 human-reviewed scenarios, summarize problem categories and
evidence limitations. At the seven-day/50-observation gate, choose exactly one
decision: continue observing, fix one evidenced defect, or run one explicitly
budgeted routing comparison. Do not add a new AI surface, automatic routing,
or a broad dashboard before that decision.
