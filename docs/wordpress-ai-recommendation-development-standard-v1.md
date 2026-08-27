# WordPress AI Recommendation Development Standard v1

Status: active development standard.

Purpose: consolidate the WordPress-first Site Knowledge, related-article,
internal-link, editor UX, and delivery-efficiency lessons into one operational
reference. This document describes how to develop and validate the feature; it
does not authorize production deployment or automatic WordPress writes.

## 1. Product Goal

When an editor is writing or revising an article, the system may suggest:

- related articles for reader navigation;
- internal-link targets for a selected phrase or paragraph;
- supporting SEO/content-review evidence where the local workflow already owns
  the final decision.

The intended relevance source is Cloud Site Knowledge vector retrieval. Local
rules may validate shape, exclude the current article, or apply bounded safety
constraints, but must not be presented as vector or AI evidence.

## 2. Ownership Boundary

| Surface | Owns | Must not own |
| --- | --- | --- |
| Cloud | embeddings, retrieval, candidate evidence, coverage detail, runtime health | WordPress approval, editor state, final content writes, local workflow truth |
| Cloud Addon | transport, site-scoped request shaping, read-only detail projection | a second knowledge registry or write executor |
| WordPress Toolbox | editor controls, candidate presentation, review actions, local context | automatic anchor insertion, post-content patching, publication |
| Native editor | visible review and final Save/Update/Publish | hidden Cloud mutation |

Every recommendation response must make these facts observable:

- `retrieval_status`;
- `candidate_source`;
- candidate count and Cloud result count;
- whether fallback was used;
- `direct_wordpress_write=false`.

`cloud_vector_evidence`/`cloud_vector` is valid vector evidence. `local_fallback`
and `cloud_unavailable` are operational states, not AI results.

## 3. Phased Delivery Model

### Phase 0: clarify the editor job

Separate “what should the reader read next?” from “where should this sentence
link?”. Related articles are document-level recommendations; internal links are
sentence/paragraph-level candidates. Do not combine both into one generic list.

### Phase 1: stabilize the contract

Define the Cloud runtime payload, coverage semantics, candidate contracts, and
no-write boundary before polishing the UI. Incomplete coverage evidence is
`unknown`, not “nothing is indexed”. Ability-specific limits must remain local
to the ability; do not raise a generic list limit to fix one endpoint.

### Phase 2: validate the real consumer

Test the complete path:

```text
WordPress editor -> Toolbox REST -> Addon transport -> Cloud vector runtime
                 -> review-only candidate projection -> native editor
```

Backend `200` is insufficient. Verify the editor display, Chinese translations,
empty states, candidate source labels, and that the sampled post remains
unchanged.

### Phase 3: remove invalid acceptance runs

Run the read-only readiness gate before editor requests. It checks WordPress,
WP-CLI, database socket, site URL, Addon, Toolbox, and Cloud health. A failed
readiness result stops recommendation quality validation.

Record bounded command duration with `npcink.acceptance_timing.v1`. Do not
estimate time after the fact and do not automatically retry a failed command.

### Phase 4: establish a repeatable editor smoke

Use `pnpm run wordpress:editor:acceptance -- --limit 3` after readiness. It:

- samples existing posts only;
- invokes `related_articles` and `internal_links`;
- records per-request latency and evidence state;
- checks the post content hash and modified timestamp before/after;
- fails if a direct WordPress write is reported.

The smoke is diagnostic evidence, not a recommendation-quality score.

### Phase 5: observe before optimizing

Collect at least five natural samples before changing performance code. Use:

```bash
pnpm run wordpress:editor:acceptance:summary -- \
  .tmp/editor-acceptance-samples/*.json
```

Report p50, maximum, mean, first-request latency, evidence-state counts,
fallbacks, non-200 responses, write-boundary failures, and unchanged-post
counts. Do not clear caches or add cache-busting solely to manufacture a cold
sample. Treat the first observation as a hypothesis about cold/warm paths, not
as a causal performance conclusion.

## 4. Editor UX Rules

- Keep the default panel concise; move low-frequency evidence behind a clear
  disclosure.
- Use complete Chinese translations for labels, statuses, errors, empty states,
  and action feedback. Do not leave mixed-language technical labels in the
  primary workflow.
- Never link a title merely because it is a title. A title link is appropriate
  only when it is the reviewed target for a related-article or internal-link
  candidate and the editor can reject it.
- Explain “no recommendation” distinctly from “Cloud unavailable” and “not
  indexed”.
- Preserve the human editor as the placement owner. Open/copy/ignore/manual
  apply are acceptable; automatic insertion is not.

## 5. Validation Ladder

| Evidence | Proves | Does not prove |
| --- | --- | --- |
| readiness `ready` | local prerequisites are available | vector relevance or quality |
| coverage `601/601` | the compared manifest is indexed, when complete evidence is returned | recommendation quality |
| Cloud vector evidence | the candidate came from the declared vector path | that the candidate is useful to an editor |
| editor smoke | consumer contract and no-write behavior for sampled posts | production readiness or broad quality |
| human review | usefulness for the sampled task | general statistical quality |

Quality work requires a labelled evaluation set. A practical first threshold is
30 articles with separate Precision@5 review for related articles and internal
links. Do not claim SEO impact from coverage or latency measurements alone.

## 6. Common Failure Modes And Responses

| Symptom | First check | Correct response |
| --- | --- | --- |
| no related articles | Cloud status, retrieval fields, current-post exclusion | distinguish empty, unavailable, and incomplete evidence |
| short “topic” or title label | editor job and context length | use article context; do not rely on a tiny keyword |
| recommendation panel missing | real REST consumer path and editor assets | trace the full path before changing ranking |
| all articles appear indexed | complete manifest comparison | treat as coverage only, not relevance proof |
| first request is slow | natural sample summary | observe cold/warm repeatability before adding cache code |
| Chinese text is incomplete | translation catalog and rendered consumer | fix the owning translation source, then rerun the editor gate |
| fallback looks like AI | `retrieval_status` and `candidate_source` | label fallback explicitly and exclude it from vector metrics |
| desire to support Ghost/Typecho/Astro | WordPress loop maturity | defer adapters until WordPress quality and contracts are stable |

## 7. Single-Operator Delivery Rules

For one developer, keep one coherent change envelope:

1. inspect the current worktree and relevant contract;
2. make one bounded change;
3. run the narrowest useful gate;
4. run the real consumer only when source evidence cannot answer the question;
5. record the evidence and stop when the stated question is answered;
6. commit only the intended files and preserve unrelated worktree changes.

Do not add a second timing system, recommendation algorithm, local index, or
cross-CMS adapter while the current WordPress loop is still being observed.
When a second independent blocker appears, preserve the first evidence and
split the unrelated repair into a follow-up.

## 8. Stop Conditions And Next Work

Stop feature expansion for the current slice when:

- Cloud vector evidence is consistently observable;
- fallback and no-write boundaries are explicit;
- readiness and editor smoke are repeatable;
- the observation window has enough samples to identify a real bottleneck;
- the remaining question is recommendation usefulness rather than plumbing.

Only then consider one isolated optimization or a labelled quality trial. Other
CMS adapters, automatic insertion, broad SEO automation, and new orchestration
remain deferred.

## 9. Authority Map

- Cloud runtime fields and limits: [Site Knowledge Runtime Contract](site-knowledge-runtime-contract-v1.md)
- Vector/coverage development lessons: [Site Knowledge Recommendation Development Record](site-knowledge-recommendation-development-record-v1.md)
- Local prerequisites and editor smoke: [WordPress Editor Readiness Runbook](wordpress-editor-readiness-runbook-v1.md)
- Timing and delivery evidence: [Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md)
- Current observation: [WordPress Editor Acceptance Observation — 2026-08-24](wordpress-editor-acceptance-observation-2026-08-24.md)

When this standard conflicts with an active runtime contract, security policy,
release policy, or current code/test authority, the active authority wins and
this document must be updated.
