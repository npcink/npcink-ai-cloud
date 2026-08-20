# Site Knowledge Search Architecture Standard v1

Status: active engineering standard.

Purpose: define how Npcink AI Cloud selects, evaluates, and evolves lexical,
vector, and hybrid retrieval for Site Knowledge. This standard records the
reasoning behind the current architecture and prevents a search product or a
new indexing service from being added without measured need.

This document does not change the canonical
[Site Knowledge Runtime Contract](site-knowledge-runtime-contract-v1.md),
approve Meilisearch for production, or authorize a new Cloud control plane.
When this standard conflicts with the runtime contract or an accepted ADR, the
runtime contract and newest accepted ADR take precedence.

## 1. Decision Summary

Npcink AI Cloud uses semantic vector retrieval as the primary Site Knowledge
retrieval path. The current implementation already adds bounded lexical
signals, evidence filtering, document grouping, and optional reranking, so it
must be treated as a lightweight hybrid system rather than a pure vector
search.

Meilisearch is not part of the default Site Knowledge stack. It may be
evaluated later as a bounded lexical-retrieval adapter only when real query
evidence demonstrates a material gap that cannot be addressed safely in the
existing retrieval path.

The short rule is:

> Use vector retrieval for meaning, lexical retrieval for exact language, and
> add another search service only after measured user queries prove that the
> existing hybrid path is the principal bottleneck.

## 2. Product and Ownership Boundary

WordPress remains the source of truth for public content, delivery consent,
local settings, approval, preflight, and final writes. Cloud may own derived
chunks, embeddings, retrieval indexes, ranking, quality evidence, and
suggestion-only results.

Any lexical or vector index is a rebuildable Cloud read model. It must not
become:

- a second WordPress content store;
- a workflow, ability, prompt, preset, or routing registry;
- an embedding-profile truth separate from the fixed Site Knowledge profile;
- an approval or publication authority;
- a source from which Cloud writes WordPress content directly.

Adding a search engine does not change these ownership rules. Deleting and
rebuilding every search index from the Cloud-owned projection must remain a
supported recovery model.

## 3. Retrieval Models

### 3.1 Lexical retrieval

Lexical retrieval uses tokens, terms, prefixes, and field-level matches. A
specialized engine such as Meilisearch is strongest when the user's wording is
expected to appear in the indexed document.

Typical strengths:

- exact names, identifiers, product terms, titles, and quoted phrases;
- typo tolerance and prefix-as-you-type search;
- filters, facets, sorting, and user-visible result navigation;
- low-latency interactive search over structured documents;
- relevance explanations based on matched terms and fields.

Typical weaknesses:

- weak recall when the query and document express the same idea with different
  words;
- language-specific tokenization and synonym maintenance;
- limited support for broad conceptual similarity without vector features;
- pressure to create manual synonym, boost, and ranking configuration truth.

### 3.2 Vector retrieval

Vector retrieval embeds a query and candidate text into one model-specific
vector space and ranks candidates by similarity.

Typical strengths:

- natural-language questions and paraphrases;
- multilingual or cross-expression semantic matching when the embedding model
  supports it;
- related-content, duplicate-risk, writing-context, and recommendation flows;
- retrieval-augmented generation where evidence is selected by meaning rather
  than exact wording.

Typical weaknesses:

- exact identifiers and rare proper nouns may rank poorly;
- embedding generation adds latency, provider cost, lifecycle, and telemetry;
- results are less directly explainable than term matches;
- incompatible embedding spaces cannot be compared safely;
- vector similarity alone does not guarantee factual relevance or sufficient
  evidence quality.

### 3.3 Hybrid retrieval

Hybrid retrieval combines semantic and lexical signals, then applies evidence
policy, grouping, and optional reranking. It is preferred when both conceptual
recall and exact-term precision are important.

Hybrid does not require two independent search services. It can begin with:

1. vector candidate retrieval;
2. bounded exact-title, phrase, and token bonuses;
3. evidence thresholds and source filters;
4. document-level deduplication;
5. an optional reranker over a bounded candidate set.

Only introduce a second retrieval engine when the required lexical behavior
cannot be delivered or scaled within this smaller architecture.

## 4. Current Npcink Baseline

The canonical Site Knowledge profile is currently:

```text
profile_id: site-knowledge.zh.v1
embedding provider: SiliconFlow
embedding model: BAAI/bge-m3
dimensions: 1024
metric: COSINE
production vector backend: Zilliz Cloud
local/test backend: PostgreSQL JSON
```

The current retrieval pipeline already provides:

- site-scoped vector recall;
- post, page, comment, status, and source filtering;
- bounded lexical bonuses and exact-match handling;
- evidence-policy filtering for weak candidates;
- optional Jina reranking;
- chunk or document result granularity;
- document and media duplicate collapse;
- embedding-space compatibility checks;
- retrieval quality, latency, backend, and error evidence without exposing raw
  query text or embeddings.

This baseline is the default comparison point. A proposal must not describe
the existing system as "vector only" or assume that adding Meilisearch is the
first way to obtain hybrid behavior.

## 5. Workload Selection Matrix

| Workload | Default choice | Reason |
| --- | --- | --- |
| Writing context | Vector plus bounded lexical and rerank | Meaning and evidence relevance dominate |
| Related content and topic clusters | Vector plus grouping | Semantic proximity matters more than shared words |
| Duplicate-content warning | Vector plus exact-overlap signals | Both paraphrase and literal overlap matter |
| FAQ and content-gap discovery | Vector plus evidence policy | Queries and source text often use different language |
| Internal-link recommendation | Hybrid retrieval | Semantic target selection benefits from exact anchor/title signals |
| Media evidence search | Existing semantic-plus-bounded-lexical path | Visual descriptions and exact visible terms both matter |
| Exact title, plugin name, ID, or SKU lookup | PostgreSQL or lexical engine | Exact language and field weighting dominate |
| User-visible typeahead search | Lexical engine candidate | Prefix, typo tolerance, facets, and predictable latency dominate |
| Small Admin list search | PostgreSQL first | Avoid infrastructure before query and scale evidence justify it |
| Large public faceted search | Evaluate a dedicated lexical engine | Interactive facets and lexical UX may justify a separate read model |

## 6. Default Engineering Sequence

When retrieval quality is questioned, follow this order:

1. Collect representative real queries and expected evidence documents.
2. Classify failures as semantic recall, exact-term recall, filtering,
   chunking, stale index, evidence threshold, grouping, or reranking problems.
3. Verify index freshness and embedding-space compatibility before tuning
   relevance.
4. Tune the narrowest existing seam: chunk text, candidate count, bounded
   lexical bonus, evidence policy, grouping, or reranker.
5. Re-run the same versioned evaluation set and compare quality, latency, and
   cost.
6. Consider another service only if lexical recall or interactive lexical UX
   remains the principal measured bottleneck.

Do not select infrastructure from feature lists alone. The decision must start
from failed queries and a named user job.

## 7. Meilisearch Admission Gate

Meilisearch may enter a proposal or bounded pilot only when all of the
following are recorded:

### 7.1 Product evidence

- A named user-facing or operator-facing search job exists.
- A versioned query set contains representative Chinese, English, exact-term,
  typo, prefix, semantic, and filtered queries as applicable.
- The existing pipeline's baseline quality and latency are measured.
- The failure set shows that exact-term, typo-tolerant, prefix, or faceted
  retrieval is a material problem.
- Improving that problem has a plausible product benefit rather than only a
  better synthetic relevance score.

### 7.2 Architecture evidence

- PostgreSQL and the existing Site Knowledge retrieval seams were evaluated
  first.
- The proposal identifies one canonical index lifecycle owner.
- Content, embedding profile, workflow, and approval truth remain outside
  Meilisearch.
- The index can be rebuilt from the Cloud-owned Site Knowledge projection.
- Site deletion, document removal, consent removal, and reindex behavior are
  explicitly covered.
- Cross-site isolation is enforced and tested.

### 7.3 Operational evidence

- Capacity, memory, disk, latency, backup, upgrade, and failure budgets are
  stated.
- Index-lag and partial-failure observability are designed.
- Sync retry does not create a second scheduler or workflow truth.
- Production, M4, CI, and local-development ownership are defined.
- The expected quality gain justifies a new service, dependency, secret,
  deployment surface, and recovery runbook.

If any item is absent, the default decision is to continue improving the
existing path.

## 8. Bounded Pilot Shape

An approved pilot should keep Meilisearch behind a small lexical backend
interface. It should not replace the vector backend interface or the fixed
embedding profile.

```text
WordPress public content truth
          |
          v
Cloud Site Knowledge projection and chunks
          |
          +--> Zilliz semantic candidates
          |
          +--> optional Meilisearch lexical candidates
                         |
                         v
             Cloud-owned fusion, evidence policy,
             grouping, rerank, and response contract
```

Pilot constraints:

- begin with one workload and one bounded cohort;
- index only fields already allowed by the Site Knowledge contract;
- return stable source/chunk identifiers, not a second response contract;
- fuse candidates inside the existing Cloud search service;
- use a deterministic fusion policy such as reciprocal rank fusion before
  considering opaque learned weights;
- retain Zilliz as the semantic backend;
- do not use Meilisearch vector features to create a second embedding pipeline;
- record fallback behavior when the lexical backend is unavailable;
- stop the pilot if index consistency or operational burden exceeds the
  measured quality benefit.

## 9. Evaluation Standard

Every material retrieval change needs a before-and-after evaluation using the
same dataset and revisioned configuration.

Minimum query groups:

- exact title, identifier, model, plugin, or product term;
- spelling variation and prefix query where the product surface needs them;
- natural-language question and paraphrase;
- Chinese and English queries representative of the target sites;
- related-content and duplicate-risk queries;
- filtered queries by source type, status, or post type;
- negative queries where no evidence should be returned;
- stale, deleted, private, disallowed, or cross-site content checks.

Minimum measures:

- recall at the candidate cutoff;
- precision or expected-result presence at the returned cutoff;
- no-hit and weak-evidence behavior;
- duplicate rate;
- p50 and p95 latency;
- embedding, reranker, and infrastructure cost;
- index freshness and failed-sync rate;
- cross-site isolation and forbidden-content leakage;
- downstream adoption or successful user task completion when observable.

Do not optimize one aggregate score while regressing exact matches, negative
queries, privacy filters, latency, or cost. Fewer than 20 observations in a
product cohort must be reported as insufficient evidence rather than a trend.

## 10. Common Failure Modes

- Adding Meilisearch because "hybrid search is better" without identifying a
  failed user query.
- Treating connection success as proof that indexed content is searchable.
- Running independent vector pipelines in Zilliz and Meilisearch.
- Comparing embeddings from different provider/model spaces because their
  dimensions match.
- Allowing lexical boosts, synonyms, or facets to become an unreviewed second
  product configuration truth.
- Sending draft, private, credential, payment, or unrestricted comment data to
  a search index.
- Returning low-confidence semantic candidates instead of failing closed.
- Creating a second public search API when the existing Site Knowledge result
  contract can carry the required candidates.
- Adding background watchers or a new scheduler only to synchronize indexes.
- Benchmarking only synthetic English queries for a Chinese-first workload.
- Measuring search relevance without measuring index freshness and deletion.

## 11. Change and Verification Rules

A retrieval architecture change must declare:

- focused workload and intended outcome;
- current failure evidence;
- explicit non-goals;
- truth and lifecycle ownership;
- public contracts and stored fields touched;
- expected files, dependencies, services, and secrets;
- quality, security, cost, and latency gates;
- rollback and full-index rebuild path.

Use the narrowest validation lane that proves the changed seam. Documentation
changes require links, formatting, policy consistency, and `git diff --check`.
Runtime scoring changes require focused domain/API tests and a versioned
evaluation set. Dependency, Compose, Docker, or deployment changes are L2 and
require the governed M4 deployment lane plus required CI before acceptance.

Candidate preview, PR verification, merge, M4 acceptance, production release,
and human product benefit remain separate evidence states.

## 12. Review Checklist

Before approving a retrieval proposal, answer:

- What exact user job and failed queries justify this work?
- Is the problem semantic recall, lexical recall, filtering, freshness,
  grouping, or reranking?
- Can the existing pipeline solve it with less state and fewer services?
- Does WordPress remain content and final-write truth?
- Is every new index a rebuildable Cloud read model?
- Is there one embedding profile and one index lifecycle owner?
- Are site isolation, consent, deletion, and private-content exclusions proven?
- Are quality, latency, cost, and operational burden compared on the same
  evaluation set?
- Is rollback explicit?
- Has the proposal avoided creating a second control plane, registry,
  scheduler, or response truth?

If these questions do not have evidence-backed answers, investigation may
continue, but implementation approval should stop.
