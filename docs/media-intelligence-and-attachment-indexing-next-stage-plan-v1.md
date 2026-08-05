# Media Intelligence And Attachment Indexing Next-Stage Plan v1

Status: proposed development plan; media implementation remains paused until
the bounded pilot is explicitly opened.

Date: 2026-07-29.

## 1. Purpose

This document consolidates the investigation and planning history for:

- AI visual recognition of WordPress media-library images;
- semantic image recommendations while an editor writes an article;
- media metadata, duplicate, optimization, and cleanup review;
- later indexing of PDF, office-document, audio, video, and other attachment
  types;
- recognition, vectorization, storage, and operating-cost boundaries.

It turns those findings into the smallest next-stage plan that fits the current
repository. It is not a runtime contract, implementation approval, production
release, pricing policy, AI-credit tariff, or authorization for automatic media
writes or deletion.

The current product focus remains the real WordPress hosted text loop described
in [README](../README.md) and the
[system-refactor handoff](system-refactor-phase-closeout-and-feature-iteration-handoff-2026-07-26.md).
Media work may begin only as a bounded evidence pilot after an operator
deliberately reopens it. It must not displace the current text-loop evidence
work with another broad architecture program.

## 2. Executive Decision

Do not scan and vectorize every WordPress attachment type now.

When the pilot is opened, use this order:

1. public or explicitly selected images;
2. text-bearing PDF, DOCX, PPTX, and similar documents through local text
   extraction and text embeddings;
3. scanned-document OCR only when a measured use case exists;
4. audio transcription only for podcast, interview, course, or meeting-heavy
   sites;
5. video understanding only after separate product demand and a reviewed media
   contract;
6. no AI execution for archives, executables, or unknown binary attachments.

The first product outcome is **reuse of existing site media while writing**,
not a Cloud media library and not automatic cleanup.

The durable shape is:

```text
WordPress attachment and usage truth
  -> bounded local inventory and revision
  -> temporary Cloud recognition input
  -> normalized suggestion-only evidence
  -> rebuildable semantic-search projection
  -> attachment-id candidates
  -> current local permission and revision recheck
  -> editor review or Core-governed proposal
  -> local WordPress write, if separately approved
```

## 3. Current Repository Evidence

The project is not starting from zero.

| Existing seam | Current evidence | Reuse decision |
| --- | --- | --- |
| Image context | `app/domain/image_context_evidence/**` and [Cloud Image Context Evidence Runtime Contract](cloud-image-context-evidence-runtime-contract-v1.md) already return visual summary, visible text, subject tags, ALT/caption basis, confidence, and uncertainty | Reuse for a bounded public-image evaluation; do not treat v1 as a full private media index |
| Hosted vision routing | Stable `vision.ai` profile and provider execution accounting already exist | Reuse; do not create another model router |
| Temporary media transport | [Media Runtime Boundary](media-runtime-boundary-v1.md) already provides typed uploads, temporary artifacts, artifact-referenced vision input, signed pull, TTL, and local-write separation | Reuse for any later private or unpublished image path |
| Site Knowledge | Existing contracts, services, embeddings, reranking, metrics, and vector backends already exist | Extend a separate rebuildable media projection only after the pilot; do not add another vector database |
| Media batch planning | `app/domain/media_batch_plans/**` already returns plan-only derivative work with Core handoff | Keep optimization separate from recognition and search |
| WordPress local abilities | The adjacent Abilities Toolkit already exposes bounded media inventory, cleanup opportunities, ALT/caption review sets, optimization plans, and governed destructive actions | Compose existing abilities; do not move media enumeration or write truth into Cloud |
| Editor image flow | The adjacent Workflow Toolbox already has article-context image recommendation and reviewed adoption surfaces | Add a local-library source only after retrieval quality is proved |

Two current limitations matter:

1. `image_context_evidence_request.v1` is inline, accepts 1 to 10 items, uses
   public image URLs, and classifies the request as
   `public_site_media_metadata`. It is suitable for a bounded public-image
   trial, not for silently indexing private or unpublished attachments.
2. Existing local cleanup treats a zero attachment parent as
   `possibly_unattached`. That is only an attention signal. An attachment may
   still be referenced by blocks, classic HTML, featured-image metadata,
   galleries, products, custom fields, options, templates, widgets, a CDN, or
   an external page.

## 4. Development Lessons

### 4.1 Recognition, retrieval, and mutation are different products

Visual recognition produces evidence. Vectorization produces a rebuildable
search projection. Insertion, metadata updates, replacement, and deletion are
local governed mutations. A successful recognition or search result grants no
write authority.

### 4.2 AI is not the right tool for every media signal

Use deterministic local evidence where it is stronger:

- SHA-256 for exact duplicate files;
- perceptual hashes plus dimensions and file size for near-duplicate review;
- WordPress reference graphs for likely-use evidence;
- MIME, magic, dimensions, decode checks, and file size for format or quality
  attention;
- ordinary text extraction for text-bearing documents.

Use AI only where semantic interpretation adds value:

- image subjects, scenes, visible text, and likely editorial use;
- document or slide summaries when extraction alone is insufficient;
- OCR for scanned pages;
- ASR for audio;
- selected key-frame understanding for a later video use case.

### 4.3 Cheap model calls do not make a cheap product

At the first thousands of items, model and embedding fees are small. The
larger costs are:

- WordPress inventory and reference correctness;
- privacy consent and data classification;
- transfer, retry, idempotency, and backfill behavior;
- stale-index invalidation and attachment deletion propagation;
- model-revision rebuilds;
- vector-service fixed cost and operations;
- user-facing review, feedback, and support;
- proving that editors actually select the recommendations.

Vectorizing attachments without a real editor, search, or review surface is
not valuable.

### 4.4 Full-library processing must be incremental

Every projection needs a stable local identity and revision:

- `site_id`;
- local `attachment_id`;
- local object revision;
- file SHA-256 or another verified source fingerprint;
- recognition contract and model revision;
- embedding model and dimension;
- generated time and expiry or rebuild state.

Unchanged input at an accepted recognition/model revision must not trigger a
new provider call. Attachment deletion, site disconnect, consent withdrawal,
or a changed file must invalidate the projection.

### 4.5 Preserve one vector subsystem

The existing Site Knowledge embedding and vector backend is the extension
point. Media rows require a distinct source kind, schema, quota, and lifecycle,
but not a second vector store, realtime service, model registry, or workflow
engine.

### 4.6 Do not create a permanent Cloud media library

Raw media remains temporary and site-scoped under the current artifact
contract. Persistent Cloud state may contain bounded derived evidence, vector
data, fingerprints, model revisions, usage/cost evidence, and opaque local
attachment references. It must not expose storage keys or become the canonical
attachment, gallery, publication, or deletion record.

## 5. Attachment-Type Decision Matrix

| Attachment type | Extraction/recognition path | Main value | Current decision |
| --- | --- | --- | --- |
| JPEG, PNG, WebP | bounded thumbnail or temporary artifact -> vision evidence -> text embedding | article-image recommendation, ALT/caption review, semantic grouping | Pilot first |
| GIF, SVG | deterministic metadata and safety inspection; no ordinary visual indexing in the first pilot | inventory and format attention | Defer |
| Text PDF | local text extraction -> chunks -> text embedding | find and reuse downloads, reports, manuals, and references | Pilot after images |
| Scanned PDF | page detection -> selected OCR pages -> text embedding | search otherwise invisible documents | On demand only |
| DOCX, PPTX, ODT | local text extraction -> chunks -> text embedding; optional bounded summary | reuse documents and slides while writing | Pilot after images |
| Audio | asynchronous ASR -> timestamped text chunks -> text embedding | podcast, course, interview, and meeting search | Demand-gated |
| Video | ASR + bounded scene/key-frame sampling + text projection | later media search and reuse | Explicitly deferred |
| ZIP, archives, executables, unknown binaries | deterministic metadata and security policy only | inventory, duplicate hash, download/use evidence | No AI scan |

## 6. Dated Cost Model

These figures are planning estimates checked against official list prices on
2026-07-29. They are not the project's upstream gateway settlement price,
customer billing truth, AI-credit policy, tax calculation, or margin evidence.
The actual gateway settlement lifecycle remains deferred under
[Provider Pricing And Cache Economics Revalidation](provider-pricing-and-cache-economics-revalidation-2026-07-25.md).

Assumptions:

- image recognition uses a 768-pixel bounded thumbnail;
- output is a short structured evidence object rather than an essay;
- a text document averages 5,000 extracted tokens;
- a scanned document averages 10 pages;
- an audio item averages 10 minutes;
- embedding uses existing local BGE-M3 when available;
- storage, bandwidth, retries, fixed worker/database cost, tax, and provider
  gateway markup are excluded.

| 1,000-item cohort | Approximate model cost | Interpretation |
| --- | --- | --- |
| Images through Qwen3-VL-Flash | roughly CNY 0.5-2 | Low model cost; use a higher operator cap until real token and invoice evidence exists |
| Images through GPT-4.1 mini | roughly USD 0.8-1.5 | Cost-sensitive external baseline |
| Images through GPT-4.1 | roughly USD 2.3-4 | Higher-cost quality baseline, not the default indexing route |
| Text documents, 5 million embedding tokens | no external token fee with local BGE-M3; roughly USD 0.10 through `text-embedding-3-small`; roughly CNY 2.50 at the cited Bailian text-vector example rate | Extraction and product value dominate cost |
| Scanned PDFs, 10,000 pages | roughly CNY 5-20 or USD 8-20 with a small vision model | Page count and OCR output dominate |
| Audio, about 167 hours | about CNY 100 at the cited CNY 0.6/hour small-package rate | Enable only for sites with an audio use case |

Official dated references:

- [Alibaba Cloud Qwen3-VL-Flash model and price](https://help.aliyun.com/zh/model-studio/qwen3-vl-flash)
- [Alibaba Cloud image-token calculation](https://help.aliyun.com/zh/model-studio/vision/)
- [Alibaba Cloud knowledge-base and text-vector pricing](https://help.aliyun.com/zh/model-studio/billing-for-knowledge-base)
- [Alibaba Cloud discounted ASR package](https://help.aliyun.com/zh/model-studio/purchase-and-use-discount-asr)
- [OpenAI image-token calculation](https://developers.openai.com/api/docs/guides/images-vision#calculating-costs)
- [OpenAI GPT-4.1 family pricing](https://openai.com/index/gpt-4-1/)
- [OpenAI GPT-4.1 model pricing](https://developers.openai.com/api/docs/models/gpt-4.1)
- [OpenAI text-embedding-3-small pricing](https://developers.openai.com/api/docs/models/text-embedding-3-small)

One 1,024-dimension Float32 vector is about 4 KiB before metadata and
approximate-nearest-neighbor index overhead. At 100,000 images, raw vectors are
about 0.4 GiB; practical storage should be budgeted at roughly 1-2 GiB before a
real backend measurement. This scale does not justify a new vector system.

## 7. Privacy And Safety Requirements

The first pilot must:

- require an explicit site/operator start;
- default to published or explicitly selected images;
- not silently send unpublished/private attachments through the public-URL v1
  contract;
- use bounded thumbnails rather than originals where visual detail allows;
- keep raw bytes under the existing temporary-artifact TTL;
- classify OCR and extracted text according to actual content, including PII
  where applicable;
- exclude face identity recognition;
- provide per-item exclusion and site-level disable/delete behavior;
- delete or invalidate projections when the local attachment is deleted,
  consent is withdrawn, or a site disconnects;
- keep provider payloads, signed URLs, storage keys, raw OCR, and user content
  out of ordinary logs;
- return suggestion-only evidence and require a current local object,
  permission, and revision recheck before showing or adopting a candidate.

## 8. Proposed Next-Stage Sequence

The next stage is an evidence program, not full product implementation.

### Milestone A — Reopen And Measure

Owner: operator plus the existing WordPress and Cloud maintainers.

Scope:

1. finish or explicitly checkpoint the current WordPress hosted text-loop
   evidence so the media pilot does not silently replace it;
2. select one controlled real WordPress site;
3. collect read-only attachment counts by MIME, publication/use status, size,
   and visibility;
4. freeze a corpus of at most 500 published images and 100 text-bearing
   documents;
5. set an operator experiment cap before any Provider call; CNY 50 equivalent
   is a conservative pilot ceiling, not an expected charge;
6. confirm the selected `vision.ai` Provider identity and record
   `tokens_in`, `tokens_out`, latency, error code, price-estimate mode, and
   actual invoice evidence separately;
7. define the human relevance rubric before running the corpus.

Exit:

- corpus, consent, data classification, provider route, experiment cap, and
  evaluation rubric are recorded;
- no product write, persistent media index, or user billing change exists.

### Milestone B — Existing-Seam Image Evidence Pilot

Use the current image-context path with either public URLs or same-site,
short-TTL source artifacts. The first local pilot uses `internal` Artifact
references so `magick-ai.local` is not exposed publicly. Do not add permanent
private-media storage, signed WordPress admin URLs, or a generic upload surface.

Measure:

- structured-response success and partial-response rate;
- evidence completeness and unsupported claims;
- subject/scene tag usefulness;
- visible-text and Chinese-text quality;
- latency and retry rate;
- exact token use and observed cost;
- whether a human can produce a good search query from the evidence.

Suggested evaluation targets:

- at least 95% of eligible images return parseable, attachment-matched evidence;
- no returned row is associated with another attachment;
- no raw URL, secret, or provider payload enters ordinary diagnostics;
- the full cohort stays within the operator cap;
- human review finds at least 70% of rows usable for semantic retrieval or
  ALT/caption review.

Failure to meet the value target pauses implementation. It does not authorize
adding a larger model, new vector service, or broader scan.

### Milestone C — Rebuildable Image Retrieval Projection

Status on 2026-07-29: opened as a bounded implementation after the fixed-corpus
evaluation reached Hit@10 1.00 and MRR 0.975 on 20 positive natural-language
queries. Negative-query abstention and real operator adoption remain unproved,
so this is not a general media-intelligence rollout.

Required design work before editing:

- freeze the local attachment identity/revision/fingerprint envelope;
- choose a distinct Site Knowledge media source kind and quota;
- define deletion, disconnect, consent-withdrawal, and model-revision rebuild
  behavior;
- define the exact semantic fields used to build deterministic retrieval text;
- decide whether the existing v1 is replaced or whether a new contract is
  required under `ONE_ACTIVE_CONTRACT_VERSION`;
- define private-image ingress through the existing artifact-referenced media
  path;
- keep attachment enumeration and final candidate validation local.

Implementation order:

1. WordPress produces a bounded local snapshot and current revision;
2. Cloud produces normalized visual evidence;
3. the existing embedding/vector subsystem stores a rebuildable media
   projection;
4. a search result returns opaque attachment references and bounded match
   evidence;
5. WordPress removes stale, missing, private, or unauthorized results before
   display.

The first editor exposure remains manual and bounded: one shared “site media
library” source in featured-image and paragraph-image recommendation surfaces,
with explicit refresh and no automatic article-context search. WordPress
revalidates every returned attachment before display. This does not authorize
background scanning, automatic cleanup, provider-metadata redesign, or other
attachment types.

### Milestone D — Editor Local-Library Recommendations

Add a `Site media library` source to the existing editor image recommendation
surface. Keep external image sources and hosted generation as separate source
types.

The editor supplies article title, excerpt, selected paragraph, and explicit
operator preference. Cloud returns a small candidate set. WordPress revalidates
each attachment and the operator chooses whether to insert it or set it as a
featured image through the existing governed local path.

Acceptance:

- current-article context produces a relevant top-five set on the fixed corpus;
- stale or deleted attachments never appear after local revalidation;
- no new import occurs when the selected image is already local;
- recommendation, review, proposal, approval, and write evidence remain
  distinct;
- real editor feedback shows repeated use, not only evaluator approval.

### Milestone E — Text Attachment Retrieval

Only after image recommendation value is visible:

1. add local extraction adapters for selected text-bearing MIME types;
2. bound document bytes, extracted characters, chunks, and per-site totals;
3. vectorize extracted text through the existing embedding backend;
4. return local attachment references and relevant chunks;
5. expose a narrow editor action such as `Recommend existing download or
   reference`;
6. keep OCR, summarization, and scanned-document handling off by default.

Audio and video remain separate future proposals. They must not be smuggled
into this milestone as generic files.

### Milestone F — Cleanup Evidence, Last

Cleanup follows product reuse and must remain read-first:

1. metadata gaps and source/attribution review;
2. size/format optimization;
3. exact duplicate groups from SHA-256;
4. near-duplicate groups from perceptual hashes and dimensions;
5. local usage/reference evidence;
6. manually reviewed destructive proposals.

AI may explain or group candidates. It may not declare an item unused or safe
to delete. Permanent deletion remains default-off and Core/host approved.

## 9. Future Change Envelopes

Each implementation milestone must be one bounded change envelope.

| Milestone | Likely owning repositories | Minimum gates |
| --- | --- | --- |
| Evidence pilot | Cloud plus the existing Addon/Toolkit request path | focused Cloud contract tests, exact Provider ledger, no M4 unless runtime evidence is required |
| Retrieval projection | Cloud and the local snapshot owner | focused domain/API tests, `check:seam`, M4 candidate sync and focused runtime test |
| Editor recommendation | Workflow Toolbox, Addon, Cloud, Toolkit/Core consumer seams | each repo's focused tests, Local WordPress browser acceptance, central `composer quality:matrix:run` before cross-repo closeout |
| Text attachments | local extraction owner plus Cloud Site Knowledge | parser security tests, quota/PII tests, focused search tests, M4 candidate evidence |
| Cleanup handoff | Toolkit/Core/Toolbox first; Cloud evidence optional | dry-run and destructive-policy tests, local approval/browser evidence, cross-repo matrix |

GitHub required checks remain merge authority. Candidate M4 evidence does not
prove merge or acceptance. Production and real-user acceptance remain separate.

## 10. Stop Conditions

Pause instead of expanding when any of these occurs:

- the text-loop focus has not reached an explicit checkpoint;
- no controlled site or operator consent exists;
- the public-image pilot requires private-media shortcuts;
- Provider identity, price mode, or actual cost cannot be measured;
- evidence cannot be reliably matched back to the source attachment;
- relevance does not beat filename/title/ALT-only retrieval on the fixed
  corpus;
- the proposal requires a new vector database, workflow engine, media library,
  permanent object store, or Cloud write path;
- deletion safety depends on AI confidence or `post_parent=0`;
- the next step has no visible editor or review consumer.

## 11. Recommended Immediate Action

Do not begin persistent indexing code in this documentation task.

Milestone A execution evidence is recorded in
[Media Intelligence Milestone A Inventory And Gate — 2026-07-29](media-intelligence-milestone-a-inventory-and-gate-2026-07-29.md).
That inventory froze 58 Local image candidates. The operator subsequently
confirmed that the cohort contains no sensitive information and approved a
short-TTL Artifact pilot, avoiding public exposure of the loopback-only site.
The initial read-only M4 resolution identified the exact `vision.ai`
connection and three healthy Qwen3-Omni 30B candidates, but all candidate price
fields were null. Charged execution remained closed at that checkpoint pending
trusted tariff or bounded call-ledger evidence.

The trusted-price and single-image compatibility gate is now satisfied by
[MQZJ GPT-5.4 Mini Vision Validation — 2026-07-29](mqzj-gpt54-mini-vision-validation-2026-07-29.md).
The controlled M4 call returned structured, attachment-matched evidence at an
estimated USD `0.00205` using the operator-selected official OpenAI tariff.

The remaining Milestone A actions are:

1. recompute the corpus fingerprint and select the first 20 rows;
2. run the bounded evidence pilot under the frozen rubric and CNY 50 cap;
3. record per-image relevance, attachment matching, latency, token usage, and
   estimated cost before proposing persistent indexing.

This preserves the current product priority, gets real cost and relevance
evidence quickly, and leaves a cheap rollback: discard the corpus projection
and stop without changing WordPress media truth or production.
