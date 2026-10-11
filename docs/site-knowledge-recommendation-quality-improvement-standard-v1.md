# Site Knowledge Recommendation Quality Improvement Standard v1

Status: active development standard.

Date established: 2026-08-25.

Purpose: consolidate the lessons from the related-article and internal-link
work into one repeatable quality loop for a small team or a single operator.
This standard covers recommendation quality, evidence, evaluation, and
feedback. It does not authorize automatic WordPress writes, production
deployment, prompt mutation, or model training from unreviewed behavior.

## 1. The Core Distinction

There are three different questions, and they require different evidence:

| Question | Useful evidence | What it can prove |
| --- | --- | --- |
| Is the target relevant to the current article or paragraph? | Independent human gold or a carefully reviewed sample | Content relevance for the reviewed sample |
| Is the recommendation usable in the editor? | Exact source match, natural-anchor check, Apply/save/undo behavior | Local applicability and operator friction |
| Is the ranking better than the previous ranking? | Same cases evaluated under multiple strategies, with a stable labeled set | Comparative quality for that evaluation set |

Vector similarity, article coverage, latency, a click, or an Apply action alone
does not answer all three questions. In particular, user behavior is useful
feedback but is not automatically a relevance label.

## 2. Ownership Boundary

Cloud owns the runtime read model and quality detail:

- vector retrieval and optional provider reranking;
- bounded lexical, topic, and source-anchor evidence;
- candidate ordering and ranking explanations;
- aggregate, metadata-only feedback summaries;
- offline comparison inputs and quality-state reporting in Eval Lab.

WordPress, Toolbox, and Toolkit retain local truth:

- visible editor context and current block content;
- exact source matching and natural-anchor Apply eligibility;
- human review, Apply, Save/Update/Publish, and Undo;
- final WordPress writes, approval, preflight, and audit truth.

Eval Lab measures already-ranked lists. It must not become a second runtime
ranker. Cloud feedback storage must not become a second WordPress control
plane, and behavior events must not mutate prompts, routers, profiles, or
production weights automatically.

## 3. Recommendation Jobs Must Stay Separate

Related articles and internal links are not the same feature:

- Related articles answer: “What might this reader want to read next?” They
  are document-level suggestions.
- Internal links answer: “Which existing article can this sentence or paragraph
  safely point to?” They require current editor context, a usable target, and a
  natural anchor.

The two jobs may share vector retrieval and telemetry infrastructure, but they
must keep separate intents, evidence rules, UI actions, and evaluation metrics.

## 4. Current Ranking Pattern

For `internal_links`, the current bounded pattern is:

```text
vector retrieval
  -> evidence policy
  -> optional provider rerank
  -> bounded lexical/topic/anchor evidence
  -> document dedupe
  -> local WordPress source-match and Apply gate
```

The local evidence is deliberately bounded:

- shared query terms: at most `0.05`;
- synced category/tag overlap: at most `0.04`;
- exact source-passage anchor evidence: at most `0.06`;
- total local evidence bonus: at most `0.15`.

The ranking response reports the score source and component evidence. Provider
rerank scores and vector scores are not treated as directly comparable across
their score-source groups. Exact query matches remain a separate higher-
priority group. A large semantic difference must not be overturned by a small
lexical bonus.

For other intents, this internal-link strategy must not silently change their
ranking behavior.

## 5. Natural Anchor Safety Gate

An internal-link candidate is eligible for local Apply only when:

1. the proposed phrase appears exactly in current visible editor text;
2. the match is not inside a heading or title block;
3. the phrase is specific enough to be useful;
4. generic phrases such as “文章”, “文章内容”, “相关内容”, “article”, or
   “content” are rejected;
5. the target title is never used as a fallback anchor merely because it is a
   title;
6. WordPress performs its own second check before Apply.

Cloud can return evidence and a suggested phrase. It cannot declare that the
current editor state is safe to mutate. An empty or rejected anchor is an
expected fail-closed result, not a reason to invent a title-based fallback.

## 6. Feedback Data: What It Is And Is Not

The current editor loop can emit metadata-only recommendation sessions for
impression, open, copy, ignore, Apply, saved unchanged, saved edited, and Undo.
The Cloud summary deduplicates by site plus random recommendation-session ID.
Actions without an impression are reported as orphan sessions and excluded
from impression-based rates.

The feedback payload must not contain article body text, raw anchor text,
provider output, public URLs, WordPress post IDs, user IDs, prompts, or saved
article content. The summary is a read-only quality projection; it is not a
training corpus and it does not own final adoption truth.

Behavior is best treated as a weak signal, with an explicit denominator:

- `impression` is the session denominator; an action without an impression is
  an orphan and is excluded from impression-based rates;
- the current Toolbox contract records only explicit actions. Closing a panel,
  refreshing, or leaving the editor is not an `ignore` event;
- `ignore` means that the operator skipped this displayed recommendation. It
  is not deletion, permanent suppression, or a relevance label.

- Apply and Save are stronger than Open or Copy, but can still reflect button
  placement or convenience;
- Undo is a useful negative signal, but may reflect later editorial changes;
- no click is not proof that a candidate was wrong.

The first operational threshold is 20 impression sessions for a recommendation
kind. Below that, report `sample_status=insufficient` and do not claim a stable
rate.

## 7. Single-Operator Delivery Model

A single developer should not block all quality work on a 30-item gold set, and
should not use one person's behavior as universal truth. Use three stages:

### Stage A: now, before enough real usage

- keep vector retrieval as the semantic base;
- run synthetic and adversarial cases to catch obvious ranking and anchor bugs;
- use the default GPT + Grok cross-judge offline to identify clear false
  positives, unsafe anchors, duplicates, and abstention cases;
- compare the current and proposed orders in Eval Lab;
- change safety rules and explanations before changing global weights;
- keep the result labeled as `insufficient_real_gold`.

### Stage B: one-site observation

- collect at least 20 impression sessions;
- review 5–10 saved, edited, rejected, or undone cases manually;
- compare before/after windows for Apply, save-confirmation, edit, and undo;
- use the AI reviewers to prioritize disagreements, not to manufacture gold;
- make one bounded ranking change at a time and record the revision.

### Stage C: broader quality claim

- create an independent, human-reviewed gold set;
- use exactly 30 complete samples as the first formal comparison gate;
- require per-sample annotator and review-time evidence;
- compare vector-only, hybrid-evidence, and anchor-gated lists using fixed
  Precision@5/Recall@5 and natural-anchor metrics;
- only then consider a broader weight change or learning-to-rank experiment.

The 30-sample gate is a claim-quality gate, not a prerequisite for fixing an
obvious safety defect or improving a single site's workflow.

## 8. Minimum Viable Quality Loop

The complete quality roadmap is intentionally not the default implementation
scope for a one-person project. The current high-return, low-complexity slice
is only:

1. improve `related_content` with document-level dedupe, current-document
   exclusion, and bounded title/topic evidence;
2. compare the old vector order and the bounded hybrid order on 10–20 small,
   representative offline cases;
3. stop and observe rather than adding a new model, vector service, or generic
   ranking framework.

This slice does not promise a universal relevance gain. Its expected benefit is
more concrete: fewer duplicate results, no self-recommendation, fewer obvious
topic drifts, and easier explanation when a result is shown. It reuses the
existing Cloud vector path, evidence policy, document grouping, and Eval Lab
contracts, so it has a smaller operational and rollback surface.

Do not start the following work in the same slice:

- real-time multi-AI voting, model-to-model training, or a third model;
- a universal vector-quality abstraction shared by every intent;
- a new vector database or search service;
- embedding-model replacement or Learning-to-Rank;
- automatic production weight changes from one site's behavior.

Only promote one of these deferred items when the current loop exposes a
measured gap that the smaller path cannot address. This is a deliberate return
on effort decision, not a claim that the deferred techniques are ineffective.

## 9. Multi-AI Review Protocol

Multiple models can improve the review process, but “models agreeing with each
other” is not the same as training. Use them as an offline review panel:

1. Cloud produces a bounded top-five or top-ten candidate list.
2. GPT and Grok independently review relevance and the intent-specific safety
   checks. Each returns explicit labels, not an opaque numeric score.
3. A deterministic aggregator records pass, reject, abstain, provider error,
   invalid output, and disagreement.
4. Disagreement, ties, and boundary failures go to human review. They are not
   silently resolved by averaging the two providers.

Do not average provider scores from different models. Normalize to explicit
labels and preserve disagreement. A candidate should be promoted only when it
passes the relevant checks; disagreement should remain visible for human
review.

GPT/Grok output is silver evidence only. AI reviewers may generate provisional
labels and adversarial cases. They must not silently rewrite runtime weights,
prompt ownership, router truth, or WordPress content. Their output is
especially weak when all reviewers share the same model family or see one
another's prior answer.

## 10. Third-Party Open-Source References

Reference open-source projects for mechanisms and test ideas, not as an
automatic replacement for the current architecture. Useful concepts include:

- hybrid lexical/vector retrieval;
- Reciprocal Rank Fusion (RRF) for combining ordered lists without assuming
  score-scale compatibility;
- bounded cross-encoder reranking over the top candidates;
- pairwise ranking and learning-to-rank after real labels exist;
- implicit-feedback debiasing so visibility is not confused with relevance.

Before adopting a dependency, record its license, operational cost, language
and Chinese-tokenization behavior, score semantics, data transfer, and recovery
path. Do not add a second search service, local index, or ranking control plane
while the existing vector-plus-evidence path remains sufficient.

## 11. Evaluation Contracts And Stop Conditions

Eval Lab accepts three already-ranked lists:

- `vector_only`;
- `hybrid_evidence`;
- `hybrid_anchor_gate`.

It measures target Precision@5/Recall@5, Apply-eligible Precision@5/Recall@5,
natural-anchor accuracy, and no-gold counts. Synthetic or partial data must
remain `insufficient_real_gold`. A complete state requires exactly 30 samples
plus per-sample `annotator` and valid `reviewed_at` evidence.

Stop the current quality slice when:

- retrieval source and fallback state are observable;
- natural-anchor safety is fail-closed;
- behavior telemetry is metadata-only and deduplicated;
- the current question can be answered with the available evidence;
- a new change would require unmeasured global weight claims.

At that point, accumulate real sessions instead of adding more ranking knobs.

## 12. Implementation Map

| Concern | Owning location | Authority |
| --- | --- | --- |
| Cloud retrieval and ranking | `npcink-ai-cloud/app/domain/site_knowledge/` | Site Knowledge Runtime Contract |
| Local anchor and Apply gate | `npcink-abilities-toolkit/includes/Packages/Read_Traits/` | Internal-link recommendation standard |
| Editor behavior telemetry | `npcink-workflow-toolbox/assets/editor-content-support.js` | Cloud Agent Feedback Contract |
| Offline comparison | `npcink-eval-lab/link-recommendation/` | Eval Lab data contracts |

When this standard conflicts with active code, tests, runtime contracts,
security policy, or release policy, the active authority wins and this standard
must be updated.

## 13. Delivery Reconciliation (2026-08-31)

The bounded delivery is now present in `master`:

- PR #875 (`b8640927`) separated `internal_links` and `related_content`
  ranking, added document-level dedupe/current-document exclusion, bounded
  evidence, and fail-closed anchor safeguards. Its review fixes covered
  multi-chunk uniqueness, post-over-comment taxonomy precedence, two-character
  CJK evidence, and ASCII token boundaries.
- PR #876 (`00860609`) is the separate image-prompt translation line. It keeps
  the reviewed Chinese prompt distinct from the Provider execution prompt and
  fails closed before image generation when translation fails. It is not part
  of recommendation ranking quality.
- Toolbox PR #120 (`4aadcb7694bbc987c0a6ccd0fad4fd0f50ba0fab`) supplies
  metadata-only recommendation impressions and explicit actions. Eval Lab PR
  #58 (`c7f1160e60b871d44a35b951459e8ab8dffb72aa`) supplies the GPT + Grok
  cross-judge and keeps AI results as silver evidence.

These merges establish implementation and observability contracts, not a
production quality claim. Real usage must still reach the impression threshold,
and a formal claim still requires independently reviewed human gold.

## 14. Historical Outcome

The first quality slice completed the bounded lexical/topic/anchor ranking,
natural-anchor safety gate, related-content document dedupe, separated
feedback rollups, and three-strategy offline comparison. The next action is
observation: collect explicit impression sessions, inspect a small sample of
adoption and undo outcomes, and use GPT/Grok disagreements to prioritize human
review. Model replacement, a third reviewer, and learning-to-rank remain
deferred until a measured gap and sufficient real evidence exist. No synthetic
fixture is evidence of production quality, and no single-user behavior window
is a universal ranking proof.
