# Reading-task abstention v2

Status: development candidate; requires the accompanying real-article/M4 receipt.

The frozen `related_content.v1` / `internal_links.v1` controls retain their
original scorers and `apply_recommendation_quality_controls` implementation.
The current runtime reports `related_content.v2` / `internal_links.v2` in
`result_grouping.ranking_version`. There is no caller-controlled bypass to v1.

v2 runs the unchanged scorer, then qualifies candidates before document dedup
and Top K. Weights, tie breaks, result limits, embeddings, index visibility,
anchor generation and anchor-eligibility v2 are unchanged. It requires:

0. Exclude only the internal reserved `Npcink Abilities Toolkit Smoke <UUID>`
   title namespace before qualification/deduplication. Ordinary smoke-testing
   tutorials remain eligible. No article-ID denylist or index deletion is added.
1. A finite existing semantic-score field of at least 0.75. This field can
   already include the existing bounded search lexical bonus; it is not a
   probability or a portable cosine calibration between embedding models.
2. Title/subject evidence, a longer body phrase/named term, or functional task
   evidence. Taxonomies, generic platform/development words and exact anchor
   matches alone are insufficient. English generic terms adjoining Chinese
   text are stripped too; product identifiers are not matched by substring.
3. For demonstrated ambiguities, functional evidence in the bounded target
   title/body: onboarding, custom fields, book management, category URL paths,
   interview preparation, related posts, photography/portfolio, image hosting
   and debugging/performance. Alternatives can meet a task without sharing a
   project name. These bounded multilingual guards contain no article IDs or
   target allowlists. Consumer offers also require both offer action and subject;
   a milk-tea/coffee theme is not a matching promotion. Food content is not banned.
   These are development rules, not a general semantic judge.

No qualifying document means a successful empty result, never a weak-result
backfill. `status=ready` and retrieval readiness retain their real meanings;
provider/HTTP/schema failures still fail and must not become abstentions.
`result_grouping.recommendation_quality` adds `policy_version=reading_task_abstention.v2`,
`below_evidence_floor`, `insufficient_task_evidence`, aggregate
`reserved_test_documents_suppressed`, boolean `abstained` and a
bounded `reason` (`insufficient_recommendation_evidence` or
`evidence_candidates_available`). Counts refer to candidate chunks before
deduplication. Returned candidates expose only the bounded evidence kind:
`title_evidence`, `body_evidence` or `functional_task_evidence`.

Feedback accepts both families' v1 and v2 versions under the unchanged
`cloud_agent_feedback.v1`. Empty impressions carry version, no-evidence source
and zero candidate-count reason; no candidate rank is fabricated. No target
text, URL, anchor, score, prompt or Provider output is added to feedback.

Validation uses synthetic developer controls, immutable v1 replay on the same
public index, all 12 source articles and actual signed transport/editor smoke.
AI/developer observations do not enter human gold. A lexical task mention can
still be incidental, and insufficient/truncated body evidence may reject a
useful alternative. Calibration on BGE-M3/Zilliz and actual adoption remain
unmeasured until separately authorized; M4 Qwen/Postgres evidence is not a
production quality claim. Revert the focused PR to restore the old runtime
policy; retained documents, vectors and WordPress content need no rollback.


## Source-anchor correction evidence (2026-10-27)

The bounded source-text guard and reserved-test qualification are correctness
maintenance, not a new recall/ranking strategy. A process-local M4 domain replay
used the frozen 20-source/120-candidate pool from Eval Lab's rejected extra-query
experiment. Seventy-two focused tests passed; shared source hashes stayed unchanged,
temporary tests were removed, and no index or WordPress state was written.
Four anchor relationships changed (URL/CSS evidence rejected), including a
Contact Form 7 anchor moving from a demo URL to body prose. Candidate ranking
was not rerun; this does not prove that normal retrieval finds Contact Form 7.
The reserved-title predicate identified one test document, with suppression
verified by unit test, not a full live search comparison. Generic prose anchors
remain quality debt. See Eval Lab's `docs/link-recommendation-anchor-context-2026-10-27.md`
and its minimized receipt for exact inputs, hashes and limitations.
