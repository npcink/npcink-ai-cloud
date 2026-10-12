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

The observed Provider response was HTTP 429, code 1310: weekly/monthly usage
limit reached, reset reported as `2026-10-17 09:13:12` (Provider timezone
not verified). Do not repeat connectivity probes to rediscover this failure.

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
action ceiling, and `max_tokens_budget=40000` for input plus output tokens.
The action's overhead and failure reporting have a twenty-minute job ceiling.

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
