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
- Current observation: [WordPress Editor Acceptance Observation — 2026-08-24](history/engineering/2026/wordpress-editor-acceptance-observation-2026-08-24.md)

When this standard conflicts with an active runtime contract, security policy,
release policy, or current code/test authority, the active authority wins and
this document must be updated.

## 10. Native AI feature audits and prompt-role regressions

When auditing the official WordPress AI editor, use the existing
[capability matrix](wordpress-ai-capability-compatibility-matrix-v1.md) as the
source-projection ledger. Record the installed AI version, Ability registration,
Addon scene mapping, source/context/instruction roles, output shape, local
review/write consumer, and evidence state separately. An enabled experiment,
available text model, historical smoke, or HTTP 200 is insufficient to mark a
new or changed Ability supported and useful.

First fix common reproducible failures, then validate a bounded family. For
each multi-action family, cover every semantic action through validation,
projection and provider input. For resizing this means shorten, expand and
rephrase; a generic rewrite happy path cannot prove all three. Check that
default token budgets support the requested operation while preserving explicit
caller budgets, model capacity, completeness guards and output ceilings.

Compare the installed upstream message roles with the adapter's assumptions
after an AI upgrade. Preserve opaque upstream source messages and additional
context; do not parse tags or relocate article text into the instruction role.
Include a source longer than the instruction cap to expose role duplication.
Check final composed instructions for contradictory task/length/serialization
requirements. JSON transport serialization and plain-text field content must
have an explicit interpretation without rewriting locally owned prompts.

Use real installed WordPress Abilities with synthetic inputs and intercepted
HTTP for deterministic role/action/result tests, failing closed on unexpected
outbound requests. Record article/meta fingerprints before/after. This proves
local integration only. Keep browser review/adoption, live Cloud/provider
execution, semantic quality, M4, merge and production as separate evidence;
never issue paid calls just to fill an evidence row. Cover browser adoption
when changing its consumer, and review any write-capable upstream consumer
separately rather than inferring safety from a suggestion-only backend.

The [2026-11-17 audit](history/engineering/2026/wordpress-editor-feature-audit-2026-11-17.md)
records the initial failures and remaining draft-context, regeneration and
unmapped-feature limits. Future batches must update dispositions rather than
copy historical acceptance labels onto current source.


## 11. Native editor saves and follow-up completion

For a write-capable WordPress consumer, a resolved `savePost()` promise is not
proof of persistence: core may resolve `undefined` after a failed or skipped
save. Confirm the native failure state, post identity and saved raw content
against the generated snapshot before retiring Notes or showing AI success.
Keep generated content recoverable in the editor after an unconfirmed save.

Do not silently include an existing unsaved draft in an AI-triggered whole-post
save. Require the author to save first; stage generated blocks and recheck the
post/content/dirty state before adoption. Guard rapid duplicate clicks, and
release native save/autosave locks on every exit. Incomplete Notes pagination
must abort the apply operation instead of acting on a partial instruction set.

Partial block success and Note-completion failure are different outcomes:
report saved/failed counts and a concrete reason, keep failed Notes pending,
and expose the native Notes and revisions actions. Clear prior batch warnings
when a new batch begins. Keep save consequences and failures visible; do not
hide them in help text. Cover resolved-but-failed saves, partial generation,
concurrent typing, duplicate clicks and failed completion in regression tests.

Repair saves in the owning WordPress plugin, never in the Cloud connector.
For a local upstream patch, retain the exact release base, source/test diff,
asset hashes, original assets and rebuild/rollback procedure. Upstream upgrades
may overwrite it; never label a local patch an official release. See the
[editorial save batch](history/engineering/2026/wordpress-editorial-save-correctness-2026-11-17.md).


For translation, source-language inheritance must not override the local Ability's
explicit target language, including legacy callers that supply it only in their
system instruction. Test the complete composed input using predominantly Chinese
source with English, another non-Chinese language and Traditional Chinese targets.
A target-language metadata assertion alone cannot detect contradictory trailing
instructions. Keep the existing source-language behavior for non-translation tasks.
