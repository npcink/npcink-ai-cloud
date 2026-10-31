# Article review context extension v1

Status: development source candidate, 2026-11-01; runtime, merge and model
acceptance are separate evidence states. Extends the existing signed article
review runtime and keeps language-only requests/results compatible.

## Contract and compatibility

No new endpoint, ability, profile, registry, database, retry or model binding.
Keep `npcink-toolbox/review-article`, `wp-ai.editorial`,
`article_review_cloud_request.v1` / `article_review_cloud_result.v1`.
`checks` is a nonempty, unique ordered subset of `language,logic,content_risk`.
Canonical JSON SHA-256 includes this exact selection. Unsorted/unknown/duplicate
checks fail before signing/provider execution. Existing language-only clients
retain their old finding shape and `not_checked/not_supported` for other checks.
New clients need all three updated source components; an older server/Addon
fails closed with the advisory section unavailable, without automatic fallback
or silently claiming a completed language/logic/risk check.

The original bounded exact-text/UTF-16/hash, pii/no_store, inline 30-second,
retry-zero, fallback-disabled policies and output limits remain unchanged.
No external search, fact checking, WordPress write, saving, publishing, policy
approval, publication blocking or automatic correction is added.

## Extended analysis and strict output

Language kinds remain sentence/punctuation/reference/redundancy. The prompt
suppresses subjective unnaturalness, modifier/coordination preferences and
style-only improvements without a concrete language defect. Preserve the
observed normal-sentence false alarm as a regression, plus fresh controls.

Logic kinds: contradiction, numeric_consistency, inference_gap,
needs_verification. Every logic finding requires `scope=within_block` or
`across_blocks`. Contradiction/numeric/inference findings require at least two
different exact quotes. Across-block scope requires two distinct body blocks;
within-block scope must reference one block. Numeric explanations must consider
period, unit, base and population/sample. Needs-verification asks the author to
check a concrete unsupported claim; it does not certify outside facts.
Evidence constraints verify structure, not the model's semantic judgment.

Risk kind: sexual_context_review only, with required context in
medical/educational/news/literary/commercial/unknown. Sensitive words alone do
not justify a finding. Normal medicine, health education, news and literary
analysis need negative controls. There is no safe/unsafe publication verdict.

For requests other than exactly `["language"]`, provider JSON has exactly
`checks` and `findings`. Checks contains exactly the requested categories;
each status/reason pair is completed/none, partial/analysis_incomplete, or
refused/provider_refused. Language-only provider JSON stays findings-only.
Findings retain kind/evidence/reason/review_direction, adding only `scope` for
logic or `context` for risk. Cloud computes check/id/UTF-16 locations and the
fixed warning/context_needed/operator_review_only_no_insert fields.
No finding may belong to an unrequested or refused category. Unknown/action
fields reject the whole result. Missing quotes, inadequate distinct evidence
or wrong scope hide the entire finding and mark its category partial/invalid_output.
Other categories preserve their status. Model completion is bounded self-report,
not exhaustive coverage or calibrated certainty.

Toolbox independently validates category, schema, exact quote, scope and context.
Each unique body quote has a read-only Locate action. Existing monotonic edit
invalidation also disables every cross-paragraph location after any edit/Undo.
Partial, refused, timeout and unavailable are disclosed; local preflight stays
usable. No empty response can become a statement that the article is correct,
safe, externally verified or approved for publication.

## Acceptance plan and evidence limits

Freeze synthetic cases before model calls, including useful logic/risk positives,
normal differing periods/units/samples, medical/educational/news/literary controls,
prompt injection, old language-only input and normal modifier/coordination prose.
Record every invocation and initial outcome. Do not selectively retry quality
failures or relabel correct controls. Use exact run_id and source identities.
Source tests cover privacy persistence and old/new signed API behavior; model
and browser acceptance use separate receipts. Customer articles, OSS real writes
and production deployment remain outside this task.
