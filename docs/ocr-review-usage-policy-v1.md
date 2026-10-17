# Cloud OpenCodeReview Usage Policy v1

Status: active, operator-requested cost-control policy (2026-10-12).

Scope: Cloud's advisory OCR workflow and local review cadence. This is a
repository-specific override of the cadence/retry defaults in Toolbox's
`docs/platform/ai-code-review-standard-v1.md`; it does not change other
repositories, deterministic checks, Cloud runtime, or production authority.

## Execution and quota

OpenCodeReview is a local CLI, not a local model server. The CLI on the Mac
and the CLI installed on a GitHub runner both call the configured remote
model API. A new key on the same Provider account may share the same quota;
rotation alone does not create more capacity.

The historical GLM Provider response was HTTP 429, code 1310: weekly/monthly
usage limit reached, reset reported as `2026-10-17 09:13:12` (Provider timezone
not verified). A later local GLM run returned code 1113 (insufficient balance
or no available resource package). Neither response establishes the current
Qwen key's quota or connectivity; HTTP 429 alone does not identify a five-hour
quota window. Read the Provider error and account quota state before retrying.

## Ordinary review flow

1. Develop and run focused deterministic checks with the PR in draft.
2. At a coherent checkpoint, mark it ready. A trusted human's non-draft
   `opened` or `ready_for_review` event can run one bounded review.
   Pushes, reopens, draft/closed PRs, and bot-authored PR events do not run
   model reviews. Untrusted PR authors do not auto-spend quota; a maintainer
   can request a review of their PRs or bot PRs explicitly.
3. Read findings, fix real defects, and record accepted findings. After
   substantive fixes, request one `/open-code-review` when the changes are
   ready. Unrelated comments and bots cannot trigger review.
4. Prefer the CI review as the single model-backed review path. Do not also
   review the same range locally by default. Use a local pass only for a
   distinct declared risk question, with the bounded command in AGENTS.md.

There is no automatic review per save/push, routine whole-repository `ocr scan`,
or extra model call solely to test quota. Deterministic checks still decide
technical eligibility; OCR does not approve merging or production deployment.

## Per-run controls and limits

The workflow invokes the pinned action once, with CLI `1.12.13`, `effort=low`,
one concurrent review task, an eight-minute task timeout, a fifteen-minute
action ceiling, and `max_tokens_budget=80000` for input plus output tokens.
The action's overhead and failure reporting have a twenty-minute job ceiling.

The review job sets `OCR_NO_UPDATE=1` before the composite action starts.
The npm launcher's default background updater can invoke a global npm
reinstall even from `ocr version`; the entry point can disappear between
configuration commands despite a successful version check. Replaying that
replacement window reproduces the `Cannot find module /usr/local/bin/ocr`
failure signature observed on PR #1120. Disabling
the updater keeps the explicit CLI pin stable throughout install validation,
configuration, range resolution, and review. Upgrades remain deliberate pin
changes; do not repair this race with retries or an unpinned latest install.

`OCR Startup Check` exercises the same pinned CLI on the same runner image,
using a fresh runner, no repository checkout, no secrets, an invalid example
endpoint, and configuration commands only. It verifies the version again
after configuration and rejects an updater timestamp. It can run on a PR or
via manual dispatch; it makes no model call and does not access M4. Because
`pull_request_target` uses the trusted base workflow, a PR changing the review
workflow itself still runs the old reviewer until merged; the separate
credential-free startup check validates the candidate without exposing secrets to it.

The operator selected this bounded increase on 2026-10-13. The earlier 40,000
budget stopped PR #1107 before any model request: the single workflow diff
was estimated at 49,916 tokens, with zero actual tokens consumed. The 80,000
budget leaves headroom for that size of diff; it does not promise complete
coverage for every PR. A multi-million-token budget is not the default for
one advisory review. Local Cloud reviews use the same explicit 80,000 budget,
`--concurrency 1`, `--effort low`, and `--timeout 8`; the machine-level Provider
configuration alone does not set these CLI review limits. Preview the exact
scope before dispatch, and use `--commit <sha>` when reviewing one commit.

The token budget is soft: OCR checks before rounds, and an in-flight round plus
a final findings-submission round can exceed it. Partial findings can be
published with CLI exit 0. The workflow accepts complete or zero-selection
skipped results; partial/failed/unknown results, missing summary delivery, and
failed comment delivery are incomplete advisory evidence. Inspect artifacts before
claiming coverage. Split an oversized PR rather than automatically increasing
the budget. This policy is not a hard dollar cap or a monthly quota limiter.

Checkpointing reuses complete reviewed ranges: an unchanged head can be a
no-op, while later explicit requests review new commits when the checkpoint
is valid. Changed base/configuration, force-push, missing checkpoint, or a
`ready_for_review` event can require full-range review. Partial reviews do
not advance the upstream checkpoint.

Eligible runs are serialized within Cloud without cancelling an active review.
GitHub may replace an older pending run with a newer one in that group; this
is advisory scheduling, not a guaranteed queue. This does not serialize other
repositories or local CLI calls sharing an account.

## Failure and key handling

The workflow has no outer retry ladder. On 429/quota exhaustion, stop manual
and agent-initiated retries until the operator resolves quota or configuration.
The pinned upstream action/CLI may still retry individual requests internally;
this change does not promise zero internal 429 retries. Do not add an extra
model health probe. Preserve the failure marker/artifact and record missing or
partial AI evidence if proceeding through otherwise valid deterministic gates.

The operator enters a replacement key in GitHub Secret `OCR_LLM_AUTH_TOKEN`.
For Qwen compatible mode, set Secret `OCR_LLM_URL` to the exact compatible-mode
endpoint supplied by the Qwen console, Variable `OCR_LLM_MODEL` to the exact
model identifier, and keep `OCR_LLM_USE_ANTHROPIC=false`; the workflow passes
`llm_protocol: openai` explicitly. Do not put keys in chat,
argv, source, logs, artifacts, or PR descriptions. Local CLI configuration is
separate and does not update when GitHub secrets change.

Cloud's local `qwen-shared` Provider and this repository's GitHub configuration
use `qwen3.8-max` and the same operator-supplied OCR key and endpoint. The
operator can supply those values in a private machine-level JSON file outside
Git, then copy them into `~/.opencodereview/config.json` and the two GitHub
secrets through standard input. GitHub secrets cannot be read back; local and
CI remain separate copies, so future credential rotation must update both.
The local CLI configuration is machine-wide; this repository's enrollment
does not update other repositories' GitHub secrets. Local and CI calls share
the configured key's Provider capacity, so keep CI as the ordinary review
path and use local review only for a declared separate question.

Prefer separate OCR and product Provider budgets/accounts where available;
separate keys are insufficient if the Provider pools their quota. Other
repositories enrolled with the shared template still need separate adoption
of this cadence before account-wide consumption is controlled.

## Validation and rollback

Validate workflow syntax/expressions and mocked draft, closed, failure, partial,
and success paths without model calls. Run the changed-file router's focused
policy gates. Actual GitHub delivery with a new key remains separate evidence.
Rollback only the OCR workflow, its AGENTS.md cadence section, and this policy;
secrets remain operator-managed. Do not couple rollback to production changes.
