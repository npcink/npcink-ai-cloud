# Content evidence loop — local implementation candidate

Status: builder candidate dated 2026-10-30. This document specifies the bounded
text/evidence changes on `codex/content-evidence-loop-20261030`, paired with the
same Addon branch. It does not record merged, M4 accepted or production evidence.

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
| Image vectors | Reuse master #1310/#1311: local Qwen3-VL text/image vectors, 4096 dimensions; image pixel input and metadata-only migration are distinct. No model replacement or production profile change in this batch. Full M4 index migration remains pending shared-environment access and capacity checks. |
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
5. Shared merge/M4 lane stays with the Admin delivery chat until explicit release.
   Local tests are not M4 acceptance. Production requires exact human deployment
   authorization. Keep real relevance and natural editor adoption as separate
   evidence from deterministic regression gates.

Rollback: revert the Addon producer first if necessary; Cloud can retain the
additive v1/v2 reader. Stop invoking the new locally declared evidence context to
roll back factual answering. Existing content/indexes are not deleted by rollback.

## Builder verification receipt

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
