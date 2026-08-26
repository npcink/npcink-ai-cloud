# Site Knowledge Recommendation Development Record v1

Status: active engineering record.

Purpose: preserve the reusable lessons from the WordPress Site Knowledge
coverage, related-article, and internal-link work. This is a development
record, not a replacement for the runtime contract or production policy.

## 1. Product Boundary

Cloud owns the runtime facts needed to index public WordPress content, create
embeddings, search, merge document hits, optionally rerank, and report index
coverage. Cloud does not own WordPress titles, URLs, publication state,
approval, editor state, or final writes.

WordPress and its local plugins remain responsible for the local public-post
manifest, operator-facing labels, article display, editor review, and normal
Save/Update/Publish actions. No Cloud result may be presented as a WordPress
write instruction.

## 2. Decisions Recorded

### 2.1 Vector evidence is the relevance source

Related articles and internal-link candidates use Cloud Site Knowledge vector
evidence. Keyword matching, title overlap, taxonomy, freshness, and link-graph
signals may constrain or reorder candidates only after semantic retrieval;
they must not be described as AI relevance when no vector evidence exists.

### 2.2 Related articles and internal links are different jobs

Related articles answer what a reader may want to read next. Internal links
answer which target is appropriate for a specific sentence or paragraph.
They may share Cloud retrieval, but their final ranking and review controls
must remain separate.

### 2.3 Coverage comparison fails closed

The local side sends one bounded, most-recently-modified public post/page
manifest. Cloud returns matching indexed IDs and the normalized requested
count. The local side may show `not_indexed` only when the returned count
matches the manifest count. Missing or incomplete Cloud evidence means
`unknown`, not absence.

The public status contract allows up to 1000 `post_ids`. The outer runtime
shape validator must preserve that ability-specific allowance while keeping
the generic list limit unchanged for every other ability and every other
nested list.

### 2.4 Suggestions remain review-only

The editor may open, copy, ignore, or manually apply a candidate to the visible
editor state. The system must not automatically insert anchors, save content,
publish content, or create a frontend related-articles block.

## 3. Reusable Debugging Lessons

1. Trace the whole consumer path before changing the UI. A zero-result panel
   can be caused by an outer request validator, a connector projection, or a
   Cloud query; do not assume the vector search is at fault.
2. Reproduce with the smallest request first, then compare the same request at
   the full manifest size. In this case, five IDs succeeded while 601 IDs
   exposed the inconsistent outer 200-item list guard.
3. Keep contract limits single-sourced. The service already accepted 1000 IDs,
   so the correct fix was a field- and ability-specific validator exception,
   not a global limit increase.
4. Treat incomplete comparison evidence as a first-class state. Rendering an
   empty list from an incomplete response creates a false operational claim.
5. Validate the actual WordPress consumer after backend tests. API success alone
   did not prove that the article list, filters, pagination, or editor panel
   displayed correctly.
6. Separate a default empty filter from a broken result. The `not_indexed`
   filter is intentionally useful when missing articles exist; with zero
   missing articles it correctly shows an empty state while `All` still shows
   the complete comparison.

## 4. Evidence And Verification Ladder

For runtime-bearing changes, record evidence separately:

| Level | Required evidence |
| --- | --- |
| Local | focused API tests, validator regression tests, Ruff/mypy, diff check |
| M4 candidate | source sync and focused runtime test; never call this accepted M4 |
| WordPress consumer | coverage summary, filters, 50-row pagination, empty state, editor recommendation result |
| Merge/acceptance | only after the requested publication lane, clean master, and governed promotion |

The minimum regression set for coverage changes is:

- 1000 IDs accepted for `site_knowledge_status.v1`;
- 1001 IDs rejected;
- generic runtime lists remain capped at 200;
- incomplete Cloud comparison fails closed;
- current article is excluded from related-article results;
- no-result diagnostics distinguish unavailable, no evidence, and current-only hits.

## 5. Current Quality Strategy

The first quality slice now uses a bounded hybrid path for `internal_links`:
vector retrieval remains the semantic base, while shared terms, synced
taxonomy overlap, and exact source-passage anchor evidence provide capped local
signals. Provider-rerank and vector score sources are kept separate, and the
Toolbox/Toolkit side remains the final natural-anchor and Apply gate.

The editor already emits metadata-only recommendation-session behavior for
impression, open, copy, ignore, Apply, saved unchanged, saved edited, and Undo.
These events are useful weak feedback, not a relevance gold set. A single
operator may use them for local before/after diagnosis after at least 20
impression sessions, but must not use them as universal evidence or automatic
weight-training input.

When real behavior is sparse, an offline panel of independent AI reviewers may
check relevance, anchor naturalness, and adversarial false positives. This is
provisional review, not mutual model training. Eval Lab must preserve
disagreement and keep synthetic or partial data in `insufficient_real_gold`.

Third-party open-source projects may be consulted for RRF, cross-encoder
reranking, hybrid retrieval, and implicit-feedback debiasing. A new dependency
or search service requires measured evidence of a gap, license and data-flow
review, and an explicit architecture decision.

For the current single-operator phase, the recommended next slice is smaller:
improve `related_content` with document-level dedupe, current-document
exclusion, and bounded title/topic evidence, then compare the old vector order
with the hybrid order on 10–20 representative offline cases. Do not begin a
real-time multi-AI panel, a universal vector framework, a new search service,
an embedding-model replacement, or Learning-to-Rank in the same slice.

See the [Site Knowledge Recommendation Quality Improvement
Standard](site-knowledge-recommendation-quality-improvement-standard-v1.md)
for the complete single-operator progression and stop conditions.

## 6. Current Limits And Open Work

- A real missing-article browser case still requires an isolated test fixture;
  a site where every article is indexed cannot prove the missing-row action.
- Formal ranking claims need a labelled set of at least 30 articles and
  separate Precision@5 evaluation for related articles and internal links;
  this is not a prerequisite for fixing obvious local safety defects.
- Feedback records only bounded recommendation-session metadata; it must not
  store article body text, raw anchor text, public URLs, WordPress post IDs,
  provider raw output, or saved article content for this purpose.
- Cross-platform adapters remain deferred until the WordPress loop has quality
  evidence and a stable contract.

## 6. Authority Map

- Runtime fields and limits: this repository's
  [Site Knowledge Runtime Contract](site-knowledge-runtime-contract-v1.md).
- WordPress connector and coverage UI: repository
  `npcink-cloud-addon`, file
  `docs/site-knowledge-vector-operations.md`, together with its connector
  record.
- Editor candidate behavior and SEO/internal-link rules: repository
  `npcink-workflow-toolbox`, file
  `docs/related-article-and-internal-link-recommendation-standard-v1.md`.

When this record conflicts with code, tests, an active boundary, or a release
policy, those current authorities win and this record should be updated.
