# Site Media Recommendation Engineering Standard v1

Status: active engineering and product standard.

Purpose: define the smallest trustworthy architecture for recommending
existing WordPress media while an editor is writing. This standard consolidates
the product discussion, repository investigation, current implementation
lessons, and relevant open-source patterns reviewed through 2026-08-27.

This document does not approve implementation, Provider spend, production
deployment, automatic WordPress writes, or a permanent Cloud media library.
The canonical runtime and data-handling contracts remain authoritative. When
this standard conflicts with an accepted ADR or runtime contract, the newest
accepted contract takes precedence.

## 1. Product Outcome

The ordinary user journey must be:

```text
Open an article
  -> choose AI recommended featured image
  -> review 3 to 5 relevant candidates
  -> set one existing attachment as the featured image
```

The first-use journey may add one bounded initialization action:

```text
Choose Enable site media recommendations
  -> WordPress authorizes a bounded inventory
  -> the first useful cohort is prepared immediately
  -> remaining eligible media is completed in the background
```

Users must not need to understand or configure embeddings, vector databases,
recognition models, thresholds, index refreshes, Provider routes, or off-peak
windows. An explicit repair or diagnostics surface may disclose those details,
but ordinary use must remain automatic.

The short product rule is:

> Prepare a useful first result quickly, improve coverage in the background,
> and return no result rather than filling the gallery with weak matches.

## 2. Ownership Boundary

WordPress remains the only source of truth for:

- the connected site's current attachment inventory;
- attachment identity, file revision, visibility, and deletion;
- the current operator's permission to inspect or use an attachment;
- media metadata and published-content references;
- review, adoption, featured-image assignment, insertion, and final writes.

Cloud may own:

- bounded image-recognition execution;
- derived visual evidence, image and text embeddings, ranking, and quality
  evidence;
- temporary site-scoped artifacts needed to recognize private or local media;
- a rebuildable site-scoped retrieval projection;
- suggestion-only attachment candidates and read-only diagnostics.

Cloud must not crawl an arbitrary site or trust a browser-supplied `site_id`.
The authenticated runtime credential resolves the site identity. WordPress
enumerates eligible media and sends opaque attachment references plus bounded
inputs. Cloud must not infer that a reachable URL is authorized media.

Cloud must not become a second attachment registry, gallery, DAM, CDN,
WordPress write owner, or deletion authority. Every displayed or adopted
candidate is re-read and reauthorized locally.

## 3. End-to-End Architecture

```text
WordPress attachment and permission truth
       |
       v
Bounded local inventory and deterministic screening
       |
       v
Temporary fidelity-preserving recognition proxy
       |
       +--> image embedding
       +--> structured visual evidence
       +--> OCR when useful
       |
       v
Cloud rebuildable media projection
       |
Article context -> concrete visual brief -> text/image-space query
       |
       v
Candidate recall -> policy filters -> rerank -> dedupe -> abstain
       |
       v
Attachment IDs and evidence -> WordPress revalidation -> human adoption
```

Recognition, retrieval, explanation, and mutation are separate stages. A
successful recognition or high retrieval score grants no WordPress write
authority.

## 4. Local Inventory and First-Pass Screening

The first pass should use cheap deterministic evidence before a paid or
resource-intensive model call.

Required local signals include:

- positive attachment ID and supported image MIME confirmed from the file;
- current local URL or an available short-TTL artifact source;
- original-file SHA-256 or an equivalent verified file fingerprint;
- dimensions, file size, orientation, and transparency where available;
- WordPress derivative relationships and current attachment revision;
- bounded title, ALT, caption, and description metadata;
- current featured-image and published-content use signals when available.

The deterministic pass should exclude or group:

- tracking pixels, empty files, decode failures, and very small images;
- unsupported animation and vector formats in the first release;
- WordPress-generated size variants of one original;
- exact duplicate bytes, while preserving every local attachment identity;
- obvious favicon, icon, avatar, sprite, and logo-sized candidates;
- extreme aspect ratios that cannot satisfy the current recommendation role.

Dimensions alone must not decide that an image is decorative. Large
backgrounds and small but legitimate diagrams are counterexamples. A later
classifier may add `decorative`, `logo_or_icon`, `low_information`, or
`uncertain` evidence, but uncertain media is downranked or held for review
rather than silently deleted.

## 5. Recognition Input Preparation

Do not send full original photography files to a recognition Provider by
default. Generate a temporary, fidelity-preserving proxy after hashing the
original.

The default proxy policy is:

- apply EXIF orientation before inference;
- preserve aspect ratio and avoid semantic cropping;
- use a longest edge of approximately 1280 to 1536 pixels for ordinary photos;
- permit approximately 1600 to 2048 pixels for screenshots, diagrams, or
  text-bearing images when the selected Provider benefits from it;
- use a supported JPEG, PNG, or WebP representation with bounded quality;
- preserve meaningful transparency or composite it onto a documented neutral
  background;
- remove EXIF, GPS, camera, and other unnecessary metadata;
- delete the proxy when the short-TTL recognition artifact is no longer
  needed.

Do not beautify, sharpen aggressively, blur, watermark, stretch, or force a
square crop. Those transformations change the evidence used to judge subject,
composition, and editorial suitability.

Model-specific preprocessing remains the Provider adapter's responsibility.
For example, a CLIP-family encoder may resize and center-crop to its trained
input geometry after it receives the bounded proxy. The proxy policy and model
transform are different layers and must not be conflated.

## 6. Visual Intelligence Is Multi-Signal

Accurate manually maintained descriptions are useful but must not be a product
prerequisite. The retrieval design uses several independent signals.

### 6.1 Deterministic metadata

Title, ALT, caption, filename, dimensions, orientation, attachment use, and
exact or perceptual hashes provide cheap evidence. ALT remains accessibility
text, not a keyword-stuffing field for recommendation quality.

### 6.2 Cross-modal image embedding

An image encoder maps the pixels into an embedding space. A compatible text
encoder maps the article's visual brief into the same space. This supports
text-to-image recall without requiring a generated caption to mention every
useful visual property.

Image and text embeddings may be compared only when their model, revision,
dimension, preprocessing contract, and vector-space identity are compatible.
The media embedding profile may reuse the existing Site Knowledge vector
infrastructure, isolation, lifecycle, and backend, but it must be a distinct
typed embedding space. Do not compare it directly with `BAAI/bge-m3` text
vectors merely because both are vectors.

The current production Site Knowledge profile remains fixed to
`site-knowledge.zh.v1` and `BAAI/bge-m3`. This standard does not change that
contract or admit a production cross-modal profile. Cross-modal retrieval is an
evaluation candidate only until a measured result justifies an explicit update
to the Site Knowledge runtime contract, the search architecture standard, and
an accepted ADR. Implementation code must not create an undeclared second
embedding-profile truth.

No new vector database is authorized. A pilot should extend the existing
vector subsystem through a typed media profile, collection, or field only
after evaluation proves that cross-modal recall materially improves the user
job and the required contract decision is accepted.

### 6.3 Structured visual evidence

A vision-language model may produce bounded structured evidence such as:

```json
{
  "image_type": "diagram",
  "subjects": ["workflow", "human review", "admin interface"],
  "scene": "software workflow management interface",
  "style": ["clean", "technical", "light"],
  "visible_text": [],
  "orientation": "landscape",
  "decorative_probability": 0.08,
  "featured_image_suitability": 0.82,
  "summary": "A software workflow interface with automation and human review nodes"
}
```

The accepted schema must be bounded, versioned, validated, and suggestion-only.
Free-form captions alone are insufficient because they often omit style,
composition, secondary subjects, visible text, and intended editorial use.

### 6.4 OCR

OCR is a separate signal. It is useful for screenshots, posters, slides, and
diagrams, but it should be skipped for ordinary photographs when it adds no
retrieval value. OCR text must remain bounded and must not turn private image
content into an unreviewed permanent document store.

## 7. Rebuildable Projection Contract

Persistent Cloud media evidence should be sufficient to rebuild retrieval and
diagnose model provenance without retaining raw image bytes.

The logical projection should include at least:

```text
site_id
attachment_id
media_fingerprint
current_url_projection
content_hash
title / alt / caption / description
image_type / subjects / scene / style / visible_text
orientation / dimensions
decorative_probability / editorial_suitability
exact_hash / bounded perceptual_hash evidence
recognition_contract / model / revision
embedding_profile / model / dimension / revision
recognition_status / indexed_at
```

`attachment_id + site_id` identifies the local object. `media_fingerprint`
identifies the current file revision. A URL is a replaceable display or
transport projection, not attachment identity.

A matching file fingerprint and recognition revision allow visual evidence to
be reused. Metadata-only changes rebuild the text-derived projection without
another visual Provider call. A changed image, recognition model, or
preprocessing contract invalidates the relevant derived evidence.

## 8. Article Context to Visual Brief

Do not send an abstract article title directly to media search and call the
result an image recommendation. Build a bounded internal visual brief from:

- title and excerpt;
- a bounded article summary;
- selected paragraph for paragraph-image recommendations;
- the requested use, such as featured, paragraph, or inline image;
- explicit operator instructions;
- desired composition and orientation;
- subjects, scenes, or visual elements to prefer or avoid.

Example:

```text
Article topic: adding human review to an AI workflow

Visual brief: landscape editorial image for a technical article; software
workflow interface with automated and human-review nodes; clean professional
composition; avoid generic scenery, logos, and dense unreadable text.
```

The brief is internal by default. Users may edit a human-readable scene
description only when the automatic recommendation is unsatisfactory. Do not
expose model prompts, vector settings, or routing details as ordinary controls.

## 9. Retrieval, Ranking, and Abstention

The default candidate path is:

1. encode the visual brief in the compatible cross-modal text space;
2. recall a bounded candidate pool, normally 20 to 30 items;
3. apply site, attachment-state, MIME, image-role, orientation, and evidence
   filters;
4. combine cross-modal similarity with bounded metadata and structured visual
   evidence;
5. optionally rerank only the bounded pool;
6. collapse exact duplicates, WordPress derivatives, and measured near
   duplicates;
7. enforce a calibrated minimum relevance and candidate-diversity policy;
8. return 3 to 5 candidates or abstain.

Do not freeze arbitrary production weights before a versioned evaluation.
Candidate count, thresholds, lexical bonuses, image-role penalties, and
reranker behavior must be calibrated against the same fixed corpus and real
user job.

The system must be allowed to say that no suitable site image exists. The UI
then offers external search or hosted generation as separate sources. It must
not fill nine slots with weakly related images.

## 10. Duplicate Handling

Deduplication has three levels:

1. canonical WordPress derivative URL or metadata relationships collapse
   generated sizes of one attachment;
2. exact file hashes group byte-identical originals while retaining local
   attachment identities;
3. perceptual hashes or compatible image embeddings identify visually similar
   files for result diversity and human review.

Near-duplicate evidence is not deletion authority. Recommendation may show one
representative candidate, but cleanup remains a separate governed WordPress
workflow.

## 11. Match Explanations

Do not show a static statement such as "the indexed visual evidence matches."
Every user-visible reason must be derived from bounded evidence actually used
for that candidate, for example:

> Contains workflow nodes and an admin interface that match the article's
> human-review automation scene.

The explanation may cite matched subjects, scene, image type, orientation, or
visible text. It must not claim that pixels were recognized when the candidate
has metadata-only evidence. Raw similarity scores remain diagnostics, not
uncalibrated labels such as "highly relevant."

## 12. Scheduling and Cost Policy

Media preparation is divided by user latency rather than by file type alone.
The first release uses one small Platform Admin policy surface instead of
dynamic Provider-price optimization.

### 12.1 Immediate lane

Run immediately when a user is waiting:

- the first small cohort after feature enablement;
- a newly uploaded image needed by the current editor session;
- an explicit single-image refresh;
- a bounded recovery needed to produce the current recommendation.

The first cohort should favor previously used featured images, images already
referenced in published content, recent eligible uploads, suitable landscape
images, and items with useful existing metadata.

### 12.2 Background lane

Queue without blocking the editor:

- the remaining first-use media library;
- ordinary incremental uploads not needed by the current article;
- metadata-only embedding rebuilds;
- bounded retries and coverage repair.

### 12.3 Off-peak lane

Delay only non-urgent work:

- historical-library backfill;
- recognition- or embedding-model revision rebuilds;
- detailed captions or structured evidence not needed for first recall;
- similarity analysis and non-urgent retry.

For the first release, Platform Admin configures only:

- one already verified vision or embedding model from the Cloud catalog;
- one site-scoped or platform-default execution window, expressed in the
  configured operating timezone;
- a bounded daily item or cost ceiling already supported by the runtime.

The worker runs eligible off-peak jobs inside that window. It does not query
spot prices, forecast Provider waves, switch models automatically, or expose
tariff controls to WordPress users. A configured time window is a capacity and
cost policy, not evidence that the Provider is actually cheaper at that hour.
If a Provider later exposes a trusted batch tariff, that evidence may be added
to the policy without changing the simple UI. Until then, runs record the
selected model, policy window, and measured usage/cost normally.

Reuse the existing FastAPI, PostgreSQL, Redis wake-up, and worker stack.
PostgreSQL remains canonical task/run truth; Redis may wake workers but must not
become a second scheduler truth. No Celery, RabbitMQ, Kafka, Temporal, or second
workflow engine is authorized.

Short-TTL artifacts must not expire while waiting for an off-peak slot. Upload
them just in time when possible, or select a reviewed TTL that covers the
bounded queue delay and delete them immediately after use. Deletion,
disconnect, consent withdrawal, and permission invalidation are immediate
control events and must never wait for a cheap window.

The administrator surface is a bounded runtime policy detail, not a second
workflow or billing control plane. It must consume the Cloud model catalog and
existing runtime worker; it must not create a local model registry, arbitrary
cron expressions, per-user scheduling rules, or a second queue truth. The
minimum useful states are `disabled`, `enabled_window`, `running`, and
`paused_after_limit`.

## 13. Incremental Lifecycle

Ordinary users should not need a recurring Refresh media index action.

- new eligible attachment: add or queue one projection;
- unchanged fingerprint and recognition revision: reuse visual evidence;
- metadata change: rebuild affected text evidence and embedding only;
- file change: invalidate recognition and image embedding;
- attachment deletion: remove the projection promptly;
- site disconnect or consent withdrawal: stop execution and remove or expire
  site-scoped derived state according to the governing retention contract;
- model or preprocessing revision: mark stale and rebuild incrementally;
- failed or partial batch: preserve per-item state and retry only failed work.

Manual refresh remains a diagnostics and recovery action, not the ordinary
product workflow.

## 14. Feedback and Quality Evidence

Search success means that results were returned; it does not prove relevance.
Recommendation quality requires both a fixed evaluation corpus and natural
editor feedback.

Before changing the retrieval architecture, compare at least:

1. current structured-caption and text-embedding retrieval;
2. a compatible multilingual cross-modal image/text embedding;
3. a hybrid of cross-modal recall plus structured visual evidence and bounded
   metadata signals.

Use the same corpus, queries, model revisions, and cutoffs. Minimum measures
include:

- top-5 precision or human relevance;
- expected-image recall at candidate and returned cutoffs;
- negative-query abstention;
- exact and visual duplicate rate;
- metadata-only versus visual-evidence performance;
- Chinese and mixed-language query quality;
- p50 and p95 initialization and search latency;
- bytes transferred, Provider calls, token or image cost, and failed-item rate;
- stale/deleted/private/cross-site exclusion;
- real impression-to-adoption rate with insufficient-sample reporting below
  the existing feedback threshold.

Do not tune ranking from one screenshot or treat Cloud candidates as labels.
Classify repeated failures as query-brief, recognition, embedding recall,
filtering, ranking, dedupe, stale-index, or UI problems before changing weights.

## 15. Open-Source Reference Patterns

These projects are adjacent architecture references, not drop-in WordPress
solutions or implementation authority.

### Immich

[Immich search](https://github.com/immich-app/immich/blob/main/docs/docs/features/searching.md)
uses CLIP-family contextual search with a PostgreSQL vector index. Its job
pipeline generates thumbnails before Smart Search, OCR, and duplicate
detection, and its CLIP job reads a preview file rather than depending on
manually authored image descriptions. The main lesson is to use a compatible
image/text embedding space for recall and keep the work asynchronous.

### PhotoPrism

[PhotoPrism Vision](https://github.com/photoprism/photoprism/blob/develop/internal/ai/vision/README.md)
separates labels, captions, faces, and safety models, uses model-specific
resolutions, and supports `on-index`, `newly-indexed`, `on-demand`, and
`on-schedule` execution modes. The main lesson is to keep fast indexing work
separate from slow or remote vision calls and to apply explicit label
thresholds.

### Nextcloud Recognize

[Nextcloud Recognize](https://github.com/nextcloud/recognize/blob/main/lib/Classifiers/Classifier.php)
generates bounded temporary previews, currently using a 1024-pixel maximum
dimension, then processes queued classifiers in timed background jobs. The
main lesson is to recognize a disposable proxy, batch work, and clean temporary
files instead of sending originals indiscriminately.

### LibrePhotos

[LibrePhotos jobs](https://github.com/LibrePhotos/librephotos/blob/dev/apps/docs/docs/user-guide/job-system.md)
separates CLIP embeddings, captions, tags, face work, and perceptual-hash
duplicate detection into observable long-running jobs. The main lesson is that
semantic recall, human-readable description, and duplicate detection are
different products with different lifecycle and cost characteristics.

Review third-party licenses before copying code. Reuse architectural lessons
and proven algorithms through compatible dependencies; do not import AGPL or
other restricted implementation code into this repository without an explicit
license review.

## 16. Implementation Sequence

Each phase is a separate change envelope.

### Phase 0 - Evaluation freeze

- freeze the current WordPress corpus and query set;
- measure the current caption/text baseline;
- evaluate one multilingual cross-modal candidate and one hybrid candidate;
- select nothing unless quality, latency, cost, and isolation evidence improve.

### Phase 1 - Local preparation

- add deterministic inventory screening, exact hashes, and proxy generation;
- keep attachment and permission truth local;
- prove no Provider call occurs for excluded or unchanged items.

### Phase 2 - Typed media projection

- if Phase 0 selects cross-modal retrieval, first update the governing runtime
  contract, search architecture standard, and ADR, then add the accepted media
  embedding profile within the existing vector subsystem;
- persist bounded structured evidence and provenance;
- implement incremental invalidation and deletion propagation.

### Phase 3 - Recommendation quality

- create the article-to-visual-brief seam;
- add bounded recall, rerank, dedupe, abstention, and real explanations;
- return 3 to 5 revalidated candidates.

### Phase 4 - Automatic background completion

- make first use fast and continue the remaining coverage asynchronously;
- add a bounded Platform Admin policy for verified model, execution window,
  timezone, and daily ceiling;
- expose progress and actionable failure states without ordinary technical
  controls.

### Phase 5 - Natural adoption evidence

- correlate impressions with real featured-image, paragraph, or import
  adoption;
- review a bounded human-labeled sample;
- tune only repeated, classified quality failures with sufficient evidence.

## 17. Stop Conditions

Stop or split the work when:

- cross-modal or hybrid retrieval does not beat the current fixed-corpus
  baseline;
- the configured model, window, or daily ceiling cannot be validated against
  existing Cloud runtime policy;
- attachment identity or visual evidence cannot be matched reliably;
- private inputs require public exposure or permanent raw-media storage;
- the design requires a new vector database, scheduler, workflow engine,
  Cloud media library, or WordPress write path;
- negative-query abstention, deletion propagation, or cross-site isolation
  cannot be proven;
- the next phase has no visible editor consumer or measurable user outcome.

## 18. Verification and Evidence States

Documentation agreement is not implementation evidence. Each code-bearing
phase follows the repository's L0/L1/L2 classification, focused local gate,
M4 candidate rules when applicable, GitHub merge authority, and clean-master
M4 acceptance protocol.

Provider calls, broad gates, image builds, transfers, and off-peak experiments
are bounded task resources. Reuse valid evidence for the same revision and do
not manufacture calls only to populate metrics.

The final product acceptance chain must keep these states separate:

```text
design documented
  -> fixed-corpus quality proved
  -> local implementation verified
  -> M4 candidate validated when required
  -> merged into master
  -> clean-master M4 accepted when required
  -> production separately authorized and validated
  -> natural user value observed
```

## 19. Related Authority

- [Site Knowledge Runtime Contract](site-knowledge-runtime-contract-v1.md)
- [Site Knowledge Search Architecture Standard](site-knowledge-search-architecture-standard-v1.md)
- [Media Intelligence and Attachment Indexing Next-Stage Plan](media-intelligence-and-attachment-indexing-next-stage-plan-v1.md)
- [Media Runtime Boundary](media-runtime-boundary-v1.md)
- [Cloud Image Context Evidence Runtime Contract](cloud-image-context-evidence-runtime-contract-v1.md)
- [Cloud AI Data Handling Standard](cloud-ai-data-handling-standard-v1.md)
- [Cloud Agent Feedback Contract](cloud-agent-feedback-contract-v1.md)
- [Cloud Agent Feedback Quality Gate](cloud-agent-feedback-quality-gate-v1.md)
