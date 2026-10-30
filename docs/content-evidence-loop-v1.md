# Content evidence loop — development delivery

Status: Cloud [#1317](https://github.com/npcink/npcink-ai-cloud/pull/1317) and Addon
[#336](https://github.com/npcink/npcink-cloud-addon/pull/336) merged on 2026-10-30.
Cloud runtime `62a9443e` is accepted on M4. The receipt below separates source,
runtime, packaging and remaining customer acceptance. No production deployment.

## Product and ownership

The loop is source input → sanitized indexing → site-scoped retrieval →
evidence-aware AI suggestion → client result and existing run/feedback evidence.
WordPress owns source permissions, Ability metadata, task instructions, schemas,
approval and final writes. Cloud executes a declared task and owns its derived
index, provider execution and result evidence. Addon signs and transports the
local contract. There is no new task registry, chat endpoint, CMS or write path.

## Implementation against the six improvements

| Improvement | Current implementation and acceptance boundary |
| --- | --- |
| Text delivery | Addon post/page `content_excerpt` carries sanitized body up to 48,000 UTF-8 bytes with v2 byte/character counters. Legacy v1 1,800-byte evidence remains readable. Wire batching uses escaped JSON bytes; dispatch retains its final 900,000-byte guard. Bodies beyond the cap explicitly remain partial. |
| Factual answering | Locally registered custom tasks may declare `site_knowledge_evidence`, distinct from optional `site_style_profile`. They require enabled `site_factual_evidence` references, `json_object` and `source_grounded` constraints, and an answer/citations schema. |
| Existing ingestion/lifecycle | Public post/page, approved comments and eligible images retain their existing scoped delivery, explicit withdrawal, exclusion/restore and preserve-on-failed-refresh paths. Known run identities release duplicate payload snapshots; lost responses retain exact replay bytes. This does not add PDF/Word/video or private upload support. |
| Image vectors | Reuse master #1310/#1311: local Qwen3-VL text/image vectors, 4096 dimensions; image pixel input and metadata-only migration are distinct. No model replacement or production profile change in this batch. M4 inventory now has 2,364 matching 4096D chunks; 69 legacy media chunks remain explicitly metadata-only because their originals were unavailable. They are not pixel-retrieval success. |
| Evidence outcomes | `available` / `partial` on usable factual context; `grounded_answer.no_evidence`, `.retrieval_unavailable`, `.retrieval_failed` are independent failed-run outcomes before the answering provider. Optional style behavior remains unchanged. |
| Quality evidence | Deterministic long-tail retrieval, UTF-8/wire bounds, current-chunk/hash checks, wrong-site metadata exclusion, missing evidence, forged quotes/IDs, queued failure and no-store coverage. Existing multimodal and refresh safety suites are reused. Run IDs, usage and bounded feedback remain the correlation path; no paid calls manufacture observations. |

## Full-body delivery contract

`site_knowledge_sync.v1`, `site_knowledge_delivery_evidence.v1` and the existing
`content_excerpt` field remain. New projection `wordpress_public_text_bytes.v2`
has `max_bytes=48000`; legacy `wordpress_public_text_bytes.v1` requires 1800.
Counters describe sanitized public text before and after byte limiting. UTF-8
boundary trimming removes at most three trailing bytes. Exact bytes, characters,
cap and truncation relationships are validated by Cloud.

Post/page projection expansion does not expand comments or image descriptions.
At 48,000 bytes the current 50,000-character / 64-chunk Cloud limits still bound
the received body. Quotas may independently prevent a replacement; existing
refresh preserves the previous source when preparing new chunks fails.

Full delivery plans IDs against 600 KB of escaped manifest JSON, leaving space
for transport fields, comments and content changes. The final 900 KB check is
still authoritative. Substantial growth after planning, a large comment set,
large restore selection, or durability pressure can still produce an explicit
retry/blocked result. This change does not claim lossless unbounded ingestion.
Full planning drops temporary body memo entries instead of retaining 10,000
expanded bodies in PHP memory. Batch counts remain stable after dispatch starts.

## Required factual context

The local Ability owns task name and registration. For example, a registered
Ability may project this metadata through
`npcink_cloud_addon_execute_registered_ai_task_runtime()`:

```json
{
  "task": "site_answer",
  "task_family": "analysis",
  "context_requirements": ["site_knowledge_evidence"],
  "constraints": ["json_object", "source_grounded"]
}
```

Its local output schema must define an object with `answer` (string) and
`citations` (array of objects with string `id` and `quote` fields). The normal
schema validation and schema hash rules remain authoritative. Addon supplies
`site_knowledge_reference={enabled:true,mode:"site_factual_evidence"}` when absent;
explicit disabled or style-only references are rejected. No built-in title or
summary task is switched to factual answering.

Cloud retrieves up to six public post/page chunks for the authenticated site,
using `writing_context`, score floor 0.35, required source count 1 and abstention.
The context holds at most 6,000 passage characters. Retrieved text must match a
current SQL chunk whose content hash matches its current public source. Stale
vector text, excluded/stale/nonpublic roots and other-site rows cannot supply
this evidence. Comments and media pixels are not factual answer context in this
candidate; image similarity and existing vision tasks remain separate paths.

Sources are explicitly untrusted data. Cloud adds execution/evidence constraints;
local task instructions remain local. The provider returns JSON, for example:

```json
{
  "answer": "蓝鲸计划明年启动。",
  "citations": [{"id": "sk:post:42:0:…", "quote": "蓝鲸计划将在明年启动，首批覆盖三个城市。"}]
}
```

Every citation must identify the exact retrieved passage and contain an exact
quote of 8–1,200 characters. Empty citations, unknown IDs, invented excerpts and
unexpected citation fields fail the existing output-quality gate. Cloud returns
`output.grounded_evidence` alongside the normal model output, with contract
`grounded_answer_evidence.v1`, status and cited source identities, title, URL,
chunk index, content hash and modified time. URLs and identity come from the
index, not the model. No full source text is copied into that evidence manifest.

The context is snapshotted on the in-memory run before provider execution and
removed from provider metadata/transport fields. The snapshot is used for output
validation; provider-added evidence cannot replace it. No-store results omit
answer/citation evidence from durable result JSON using the existing omission
contract. Existing expiry, site isolation and encrypted queued input rules apply.

`available` means the referenced source delivery is known untruncated.
`partial` means at least one source was truncated or has no validated delivery
completeness evidence. Neither status asserts whole-site coverage or semantic
correctness. Exact quote/identity validation does not prove that every answer
claim follows from the quote. Real answer relevance, claim support and resistance
to prompt injection still require a representative evaluation and human review.

## Rollout and remaining acceptance

1. Land Cloud reader/grounding contracts, then the paired Addon producer. Earlier
   Cloud rejects v2 projection evidence, so do not activate the producer first.
2. Refresh selected long documents through the existing path; verify late facts,
   source revisions and partial diagnostics in the candidate runtime. This code
   does not silently refresh all old content.
3. For image vectors, follow the existing [multimodal runbook](m4-preview-development-v1.md#unified-local-multimodal-embedding-2026-10-29).
   Stage/checkpoint and atomically activate the target index only after capacity
   and same-space checks. Metadata-only records are not pixel retrieval evidence.
   Do not reuse destructive manual rebuild as a safe model-migration substitute.
4. The local Ability owner selects any actual product entrypoint and schema. This
   batch adds capability transport/execution; it does not register a new customer
   UI, resume paused features or prove natural adoption.
5. The Admin chat released the shared lane before this integration. Cloud then
   landed before Addon and was promoted from clean master. Production still
   requires exact human deployment authorization. Keep real relevance and
   natural editor adoption separate from deterministic regression gates.

Rollback: revert the Addon producer first if necessary; Cloud can retain the
additive v1/v2 reader. Stop invoking the new locally declared evidence context to
roll back factual answering. Existing content/indexes are not deleted by rollback.

## Historical builder verification receipt

Local evidence on 2026-10-30:

- Cloud combined connector, Site Knowledge API/domain and multimodal suites:
  476 passed. After final citation/source-type review, the affected grounded
  API/domain cases were rerun: 24 passed. The existing test client emits its
  Starlette/httpx deprecation warning.
- Changed Python Ruff and targeted mypy: passed. Lightweight release-policy
  gate and whitespace checks: passed.
- Paired Addon `composer test:all`, PHPStan and WordPress.org review guard:
  passed. Playground WP 7.0.4 / PHP 8.2 activation and ordered reconciliation
  through 51 same-second posts: passed on isolated port 9427.
- Builder review checked contract ownership, strict schema/citation failures,
  current hash/type matching, bounded memory/bytes, preservation of unknown
  writer payloads, and no-store omission. Quote validation remains syntactic
  provenance evidence, not a semantic entailment evaluator.

CI: not published. M4: not changed or accepted for this candidate. Production:
not deployed. Human relevance/adoption: not established. Shared lane remains
with the Admin hierarchy delivery until its explicit release receipt.

Central cross-repo matrix was run from Toolbox with explicit worktree overrides
for Cloud `39fe5ab7` and Addon `1f66aa9`: both were clean; Addon gates passed;
Cloud was `blocked_environment` (exit 75) because exact-SHA GitHub CI evidence was
unavailable for the unpublished source commit. No M4 gate was requested. This
is an outstanding source-delivery gate, not a passing cross-repo closeout.


## Merged development receipt — 2026-10-30

- Cloud #1317 merged as `62a9443e54fa2d129e5ce7ec9c08454eb8d85a5b`.
  Exact source head `9e2fbdcd7b1a6aa879ec7bdf4fa5a6ce4a6499a7` passed the
  complete GitHub rollup, including all targeted backend contract shards,
  impacted tests, static analysis and security checks. Initial CI found twelve
  line-length violations missed by the narrow local subset; formatting was
  corrected, full-repository Ruff passed and the final head was reviewed again.
- Addon #336 merged as `f0c6bd276a418ace73b28c716cb2692d1c4183de`.
  Exact source head `0a500f576ef106965126d6c010c64ac4c1c14ccc` passed all PHP
  contracts, PHPStan, WordPress AI blocking compatibility lanes and Release
  static gates. Local Qwen reviews for both repositories were triaged in their
  PR bodies against exact committed diffs. No required checks were bypassed.
- Candidate M4 connector/grounding/source-evidence tests: 274 passed in 64.56s.
  Clean-master promotion for #1317 reports `acceptance_state=accepted`,
  `source_dirty=false`, runtime `62a9443e`; unchanged frontend remains
  `a813b729`. All eight services run and `/` plus `/health/live` return 200.
- A real Addon PHP projection delivered 5,847 UTF-8 bytes, including a late
  Chinese fact beyond the old 1,800-byte cap. M4's actual PostgreSQL and local
  Qwen3-VL embedded it into three 4096D chunks and retrieved that late fact.
  Current-source exact citations passed, invented quotes were rejected and
  another site returned no passages. The transaction was rolled back and source
  counts restored. Candidate probe: 16.56s; accepted-master probe: 13.31s.
  These probes called the real embedding provider and deterministic output
  validation; they did not call an answering model or measure human relevance.
- Read-only M4 inventory: 2,132 documents / 2,364 chunks, all in the selected
  Qwen3-VL 4096D space. Of these, 2,295 text chunks use `text.v1`; 69 media
  chunks use `metadata_text.v1` / `unavailable_legacy_source`. Original recovery
  and pixel upgrade for those 69 remain outstanding. Existing pixel ingestion,
  same-space upgrade and preserve-on-source-failure behavior remain covered;
  matching dimensions alone are not proof of image-pixel retrieval.
- Central Toolbox `quality:matrix:run`, with explicit clean Cloud/AddOn source
  worktrees at `9e2fbdcd` / `0a500f5`, returned zero failures: exact-SHA GitHub
  Cloud checks and Addon `composer test:all` passed. M4 acceptance is evidenced
  separately above; the optional full M4 matrix mode was not repeated.
- Addon package and manifest verification passed for 54 files; ZIP SHA-256
  `48637a60296639a5c84f94c4b0d83a9dc02e24814c61e9585006e291a8c508b4`.
  POT/PO source references were refreshed, retaining all 710 active translations.
  This receipt does not claim that package is installed: the shared Local
  WordPress mount still points to the separate source checkout at `fc9bdc8`.
- Addon HTTPS transfer failed and the available SSH deploy key was read-only.
  After publisher attempts, the documented Git Data API recovery replayed the
  exact source commits with identical SHAs, then the completed template body and
  head-matched protected squash auto-merge were used. No source or CI gate was
  weakened for the transport recovery.

Remaining product acceptance: register/choose the factual-answer entrypoint in
its local Ability owner, evaluate actual answering-model relevance and claim
support with representative content, recover the 69 original images, and verify
natural customer/editor adoption. Generic/private document ingestion remains
outside this batch. Production vector selection and production deployment are
unchanged and are not authorized by this development receipt.
