# Reading-task abstention v2

Status: development candidate; requires the accompanying real-article/M4 receipt.

The frozen `related_content.v1` / `internal_links.v1` controls retain their
original scorers and `apply_recommendation_quality_controls` implementation.
The current runtime reports `related_content.v2` / `internal_links.v2` in
`result_grouping.ranking_version`. There is no caller-controlled bypass to v1.

v2 runs the unchanged scorer, then qualifies candidates before document dedup
and Top K. Weights, tie breaks, result limits, embeddings, index visibility,
anchor generation and anchor-eligibility v2 are unchanged. It requires:

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
   target allowlists. They are development rules, not a general semantic judge.

No qualifying document means a successful empty result, never a weak-result
backfill. `status=ready` and retrieval readiness retain their real meanings;
provider/HTTP/schema failures still fail and must not become abstentions.
`result_grouping.recommendation_quality` adds `policy_version=reading_task_abstention.v2`,
`below_evidence_floor`, `insufficient_task_evidence`, boolean `abstained` and a
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
