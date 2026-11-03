# Article language review runtime v1

For the compatible logic/risk extension candidate, see [context runtime](article-review-context-runtime-v1.md). The language-only behavior below remains the compatibility baseline.

Historical source checkpoint, 2026-10-30. Cloud backend only; not merged or
production-deployed. Addon facade and Toolbox editor integration now exist on separate candidates;
this document does not certify their installation or signed live acceptance.
The broader consumer draft in Toolbox includes future logic/content-risk checks;
this implementation accepts **only Chinese language checks**.

## Product behavior and ownership

Formatting changes layout only and preserves original text, symbols, punctuation,
links and multimedia. This independent review task returns hints for the author
to consider. It never returns replacement/action fields, writes WordPress,
automatically corrects content, saves/publishes, or blocks publication.

Cloud owns bounded hosted execution and verified result projection. The runtime
identity below is not a WordPress ability registration or a second ability
registry. Addon owns the fixed transport facade; Toolbox owns collection,
editor snapshot freshness, location navigation and display. Authors make all
content corrections themselves. No frontend behavior is delivered by this slice.

## Existing signed runtime transport

Use the existing signed `POST /v1/runtime/resolve` and `/v1/runtime/execute`
transport and its site authorization, routing, admission, metering and
idempotency rules. No new endpoint, database, queue, registry or model binding.

| Outer field | Required value |
| --- | --- |
| `ability_name` | `npcink-toolbox/review-article` |
| `contract_version` | `article_review_cloud_request.v1` |
| `profile_id` | `wp-ai.editorial` |
| `execution_kind` / ability family | `text` |
| `execution_pattern` | `inline` |
| `data_classification` / `storage_mode` | `pii` / `no_store` |
| `retention_ttl` / `retry_max` | `0` / `0` |
| `timeout_seconds` | integer 1–30 |
| `policy` | exactly `{"allow_fallback":false}` |
| callback / task backend | absent |

Service/profile/commercial policy must not widen storage, retention, retries,
fallback, callback or backend dispatch. Invalid review input is rejected before
provider invocation. Model availability remains subject to the existing catalog
and allowlist. This task does not silently select another profile or provider.

`input` has exactly these fields:

```json
{
  "snapshot_sha256": "<canonical lowercase SHA-256>",
  "language": "zh-CN",
  "checks": ["language"],
  "offset_unit": "utf16_code_units",
  "blocks": [{"block_ref":"b1","kind":"body","text":"😀原文，，保留。"}]
}
```

Hash compact UTF-8 JSON, unescaped Unicode and no normalization, of:

```json
["article_review_cloud_request.v1","zh-CN",["language"],[["b1","body","😀原文，，保留。"]]]
```

Block order is significant. References are unique `b1`–`b9999` without leading
zeros; kinds are `title`, `excerpt`, `body`. Limits: 1–80 blocks, nonblank text,
1,600 UTF-16 units per block, 30,000 total units and 100,000 total UTF-8 bytes.
Invalid Unicode, duplicate references, hash mismatch, extra fields and requests
for logic/content-risk checks fail closed. Send plain selected text only, no
HTML, URLs as separate fields, post metadata or multimedia bodies. Handling
oversized/unsupported editor blocks belongs to the later consumer slice; do not
silently label excluded text as checked.

## Model output and independent evidence verification

Cloud constructs a fixed Chinese read-only review prompt, treats blocks as
untrusted data, and disables automatic search/enrichment for this task. Provider
input contains only bounded `messages` and fixed `params` (temperature 0,
max output tokens 2,400, low thinking budget); the original structured snapshot
stays transiently in the current execution for verification.

The model returns only this JSON shape:

```json
{"findings":[{"kind":"punctuation","evidence":[{"block_ref":"b1","quote":"，，","occurrence":0}],"reason":"两个逗号连续出现，疑似标点重复。","review_direction":"请作者核对是否有意保留。"}]}
```

Kinds: `sentence`, `punctuation`, `reference`, `redundancy`. At most 12 findings,
1–3 evidence quotes each. Quote length ≤240 UTF-16 units, reason ≤600 and review
direction ≤400. The zero-based occurrence selects nonoverlapping exact matches
from left to right. The program computes UTF-16 start-inclusive/end-exclusive
spans; the example above yields `[4,6)`, accounting for the emoji.

The result is `article_review_cloud_result.v1` with the original
`snapshot_sha256`, `checks`, `findings`, `invalid_finding_count` and
`result_limit_reached`. Each finding contains a generated `id`, `check=language`,
`kind`, `severity=warning`, verified `evidence` (`block_ref`, `start`, `end`,
`quote`), `reason`, `review_direction`, `uncertainty=context_needed`, and
`action_policy=operator_review_only_no_insert`.

- Valid empty findings: language `completed` / reason `none`; this is not proof
  of error-free content. Logic and content risk stay `not_checked` /
  `not_supported` in every successful report.
- Missing/forged quotes, unknown references or oversized quote/reason/direction:
  discard the affected finding; language becomes `partial` / `invalid_output`.
- Extra correction/action fields, invalid types, duplicate JSON keys, NaN,
  Markdown fences, malformed JSON, >12 findings or >24,000 output UTF-8 bytes:
  fail the run with `article_review.invalid_output` and no raw output.
- At 12 returned findings, `result_limit_reached=true` conservatively signals
  the cap. It does not claim all potential issues were covered.

The strict schema cannot prove the semantic quality of the free-text reason or
direction. Consumers must render them as escaped text with no insertion/action
control. Keep the author in charge even when a model sounds certain. Before
showing/navigating any report, Toolbox must verify article identity, block
identity, original full editor snapshot, current submitted hash and editor change
generation. Any intervening edit invalidates the report even if Undo restores
the same text. Cloud cannot observe live editor changes.

## Privacy, failures and replay

No-store uses existing durable input/result omission; the snapshot and verified
report exist transiently for the initial response. Validation errors use constant
content-free messages. Upstream provider exception prose/usage context is
suppressed for this identity before recording errors, since it may echo input.
Safe usage counts, cost and normalized error codes remain. No automatic retry
or fallback. A same-key replay returns the existing omitted-result marker and
must not invoke the model again; an intentional fresh check needs a new key.

These controls cover Cloud persistence, not third-party provider retention.
Provider-side retention policy is unverified; do not market end-to-end zero
retention. This candidate is not authorization to send real customer articles.

## Development evidence and limitations

A bounded screen used six synthetic seeds × two methods through the existing
`wp-ai.editorial` profile on M4 source `412a9b558107b3ea321bac897ed4ee1db75c5fba`.
All 12 calls succeeded using `gpt-6.1-sol` without retries/fallback. It preceded
the new task implementation and therefore is **not a live test of this new
interface or its final prompt**. No real customer article was sent.

Offline verification: both methods gave expected kinds on four positive seeds
and no hints on two negatives; all evidence matched exactly, including the
emoji UTF-16 span. Quote-alignment outputs also passed this candidate's strict
result parser. Model-offset median elapsed time 5,259 ms (max 6,613); quote
alignment 4,492 ms (max 5,044). Six sequential examples do not establish method
superiority, independent accuracy, holdout acceptance or a latency SLO. Choose
quote alignment to make location verification deterministic and reduce the
model's responsibilities.

Cloud's read-only database audit found 12 pii/no_store runs, omitted input and
result for all, no retries/fallback, 3,518 input and 889 output tokens. Cloud
metering reported cost 0; upstream billing was not independently verified.
The earlier `text.ai` attempt stopped at `routing.no_candidates`: its bound
`gpt-5.5` was outside the provider's current allowlist. No allowlist or binding
was changed to obtain evidence.

Local ignored evidence: Eval Lab
`editor-followup/generated/article-review-editorial-screen-2026-10-30/` contains
plan, requests/results, runtime metadata, offline validator and per-case report.
The prior stopped `article-review-screen-2026-10-30/` is preserved separately.

Focused source tests: `tests/domain/test_article_review_contract.py`,
`tests/api/test_article_review_runtime.py`, plus existing
`tests/domain/test_runtime_result_normalization.py`. API tests exercise signed
transport with a fake provider, verified/partial/failed output, private failure
metadata, rejection before provider invocation and no-store idempotent replay.
M4 candidate/accepted, merged, live-model interface, frontend and production
states must be recorded separately. The Addon facade and Toolbox read-only
report integration are now separate candidates. Next acceptance: exact-SHA CI,
real signed Addon transport and bounded synthetic Chinese model checks.
Logic and contextual content-risk evaluation remain disabled and deferred.

### Candidate checkpoint — 2026-10-30

- Local `verify:local` passed: release-policy/whitespace checks, changed Python
  quality gates, targeted mypy and 42 review domain/API tests. Existing result
  normalization regression: 12 passed separately. One existing Starlette/httpx
  deprecation warning remains unrelated.
- M4 sync completed at 10:10 UTC from clean source `aa4127c9` on
  `codex/article-review-language`; the candidate runtime and frontend were
  healthy. Focused M4 tests passed: 54 tests, one unrelated Starlette/httpx
  deprecation warning. The candidate remains unmerged and non-production.
- At this historical checkpoint, no production operation, merge, Addon facade, editor connection, or new-task
  live-provider smoke has occurred. Preserve the clean local candidate until
  the runtime lane is available; then sync this revision and run the three
  focused test files above. The earlier live-model screen cannot substitute
  for this candidate check.
