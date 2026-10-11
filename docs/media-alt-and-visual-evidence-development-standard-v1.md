# Media Fingerprints, Visual Evidence, and Article ALT Development Standard v1

Status: active engineering reference.

Date: 2026-09-04.

Purpose: record the development lessons and confirmed product decisions for
WordPress article-image ALT, media compression, visual evidence reuse, and
media mutation handling. This document is a cross-repository reference for
future implementation work. It does not replace the runtime contracts or
accepted ADRs listed in the documentation index.

## 1. Product Goal

Article-image ALT exists to improve accessibility and help search engines
understand an image's role in the current article. It is not a bulk rewrite of
the media library and it is not a keyword-stuffing feature.

The smallest useful user journey is:

```text
Open an article
  -> run SEO/Discoverability checks
  -> review missing-ALT candidates
  -> apply selected ALT values to article image blocks
  -> save through the normal WordPress editor
```

The feature should prefer a useful local result over a paid vision request.
Cloud vision is a bounded fallback for cases where article context is not
enough and the user explicitly continues recognition.

## 2. Ownership Boundary

WordPress owns:

- attachment IDs, current files, current file revisions, and permissions;
- article blocks, image occurrences, ALT values, captions, and decorative
  image markers;
- review, approval, editor state, and the final WordPress save.

The Toolbox owns:

- collecting article-local image occurrences and nearby text context;
- composing contextual ALT candidates;
- rendering review controls and applying confirmed changes to native block
  attributes;
- the internal article-ALT flow used by the SEO/Discoverability surface;
- the single local media-recognition continuation, including changed-file
  confirmation, locking, retry, and recovery state.

The Cloud Addon owns:

- authenticated transport to Cloud;
- read-only projection of verified-connection and Site Knowledge delivery
  readiness;
- bounded artifact and runtime transport after Toolbox has obtained explicit
  operator consent.

The Cloud Addon does not own the weekly scan, recognition continuation,
confirmation state, locks, retry cursor, or changed-attachment list.

Cloud owns:

- hosted vision execution and normalized visual facts;
- rebuildable visual evidence and optional vector projections;
- short-lived artifacts and usage evidence.

Cloud does not own WordPress writes, article approval, the local ability or
workflow registry, or the final ALT/audit truth.

## 3. Identity and Freshness

An attachment ID identifies a WordPress object. It does not prove that the
bytes currently stored for that object are the same bytes that produced an
older visual description.

The freshness rule is therefore:

> Reuse visual evidence only when the current exact media fingerprint matches
> the fingerprint stored with that evidence.

The current fingerprint must be obtained from the current local file when the
media is available. An attachment ID may be used to locate the file and query
the projection, but it cannot be the sole cache key.

If an administrator or a third-party plugin replaces a same-named file while
keeping the attachment ID, the changed bytes are treated as a new media
version. Old visual evidence is not reused merely because the ID, filename,
dimensions, or URL stayed the same.

## 4. Compression and Derivative Facts

Media compression and format conversion are allowed to produce a new file for
the same attachment, subject to the local review and replacement policy. The
derivative result should expose facts that let consumers verify what changed,
including:

- source and output SHA-256 checksums;
- source and output format, MIME type, dimensions, file size, and frame count;
- source and output transparency and whether alpha was preserved;
- whether crop, resize, or watermark was applied;
- encoding mode and size savings.

These `transform_facts` describe the transformation. They do not prove that
the output is semantically identical to the source, and they do not authorize
automatic reuse of old visual evidence.

The derivative result uses `old_media_fingerprint` and
`new_media_fingerprint` as the canonical lineage fields. The existing
`derived_from_media_fingerprint` and `media_fingerprint` names remain emitted
as compatibility aliases for current Addon and Toolbox consumers.

The default reuse policy is conservative:

| Change | Visual evidence policy |
| --- | --- |
| Same bytes and same exact fingerprint | Reuse matching evidence |
| Compression or quality change | Treat as a new fingerprint; re-check and normally re-identify |
| Format conversion | Treat as a new fingerprint; re-check and normally re-identify |
| Crop, resize, or aspect-ratio change | Re-identify |
| Watermark or visible overlay | Re-identify |
| Unknown or unverifiable transformation | Do not reuse |

The system does not infer semantic equivalence from a label such as
"lossless", unchanged dimensions, or a high vector similarity score.

## 5. Visual Evidence Lifecycle

The intended consumer flow is:

```text
Locate attachment by ID
  -> calculate current exact fingerprint
  -> query Site Knowledge evidence for ID + fingerprint
  -> reuse only an eligible matching record
  -> otherwise mark recognition as required
  -> recognize the current bytes only after explicit operator consent
  -> store suggestion-only evidence with the current fingerprint
```

The same flow should serve media recommendation and article ALT. A new ALT
path must not create a second cache or bypass the existing cache-first helper.
Vector embeddings may improve retrieval, but a nearest vector is not a
current-image description and must never be copied directly into ALT.

Recognition evidence is suggestion-only. It may be used to draft a candidate,
but a human remains responsible for deciding whether the image is informative,
decorative, or unsuitable for the article context.

## 6. Third-Party Media Changes

Hooks from the Toolkit cover controlled replacements made through the governed
WordPress path. They cannot observe every plugin or administrator that writes
directly to the uploads directory.

The required fallback is:

1. Recompute or verify the current fingerprint immediately before ALT,
   recommendation, or recognition use.
2. If it differs from the stored evidence fingerprint, mark the evidence
   stale and require a new recognition decision.
3. Run a bounded weekly media scan across recently referenced, recently used,
   or already evidenced attachments.
4. Put changed attachment IDs into the existing Toolbox continuation's
   `awaiting_confirmation` state; scanning and Hooks do not call Provider.

Real-time filesystem monitoring is not required for the WordPress product
surface. It is cross-host and operationally fragile, and it would create a
second change-detection subsystem.

## 7. Article ALT Rules

The article ALT workflow follows these rules:

- Fill only an explicitly empty ALT; never overwrite an existing ALT
  automatically.
- Treat weak or generic existing ALT as a review warning, not as permission
  to replace it.
- Use caption, nearest heading, and adjacent article text before visual
  recognition.
- If context is insufficient, use current-fingerprint-matched visual evidence
  or ask for an explicit bounded recognition fallback.
- Mark decorative images explicitly and persist that state on the image block;
  a confirmed decorative image is valid with an empty ALT.
- Apply changes only after review and explicit user confirmation.
- Apply only confirmed values on supported native `core/image` occurrences.
- Show non-`core/image` occurrences as review-only unless a separate governed
  write path exists.
- Do not include featured-image metadata or media-library global ALT in the
  article occurrence workflow.
- Do not send an external image URL to Cloud when article context is
  insufficient and the URL is not an authorized local source.
- Process all occurrences through pagination; a fixed page size must never
  silently discard images after the first page.

Article ALT has no independent user entry. The internal flow is invoked from
SEO/Discoverability so that the operator does not have to learn a separate ALT
subsystem.

## 8. Complexity Boundary

The ALT MVP needs only these capabilities:

1. collect current article occurrences;
2. generate local contextual candidates;
3. check current fingerprint and reuse matching evidence;
4. mark cache misses without Provider work, then recognize at most ten current
   misses only after explicit consent;
5. let the user review and apply empty ALT values.

The following are deliberately deferred unless measured evidence justifies
them:

- perceptual-hash or similarity-based evidence reuse;
- guessing that a lossless conversion is semantically identical;
- real-time filesystem watchers;
- a separate media asset registry or vector database;
- complex cross-version lineage graphs beyond source/output facts;
- automatic rewriting of existing or weak ALT;
- broad media-library governance bundled into the article editor action.

## 8.1 Three-stage delivery plan

### Stage 1: exact fingerprint and cache-first foundation

Deliver the smallest measurable loop:

- calculate and verify the current exact fingerprint at the local source;
- persist source/output fingerprints and bounded transformation facts for
  derivatives;
- reuse only evidence whose attachment and exact fingerprint still match;
- use a temporary, bounded recognition proxy and process cache misses in the
  background through the Toolbox-owned continuation after confirmation;
- measure cache hits, avoided Provider calls, stale-evidence rejections, and
  recommendation latency.

Cloud owns the typed derivative facts and temporary artifacts. Toolbox remains
responsible for local attachment freshness checks, confirmation, and the
recommendation/ALT consumer path; Addon remains transport/readiness only.

### Stage 2: explicit transformation lineage

After Stage 1 produces real observations, add a bounded lineage contract:

```text
new_media_fingerprint
derived_from_media_fingerprint
transform_type
visual_reuse_policy
```

Use it to distinguish encoding-only changes, declared semantic-preserving
compression, and semantic changes such as crop, watermark, or replacement.
Unknown transformations remain invalidating by default. This stage must not
create a second media registry or bypass current-fingerprint validation.

### Stage 3: measured similarity and advanced retrieval

Only when Stage 1 and Stage 2 data justify it, evaluate perceptual hashes,
cross-modal embeddings, candidate reranking, and richer diversity controls.
These are optimization and quality experiments, not freshness authority. They
must remain versioned, site-scoped, rebuildable, and suggestion-only, with no
new vector database or automatic WordPress write path without an accepted
contract decision.

This boundary keeps the feature accountable without turning ALT into a second
Digital Asset Management system.

## 9. Current Implementation Status

The following foundation is confirmed by the current repositories:

- Cloud derivative processing emits source/output checksums and transformation
  facts.
- Addon transport validates derivative artifact integrity.
- Toolkit-controlled media replacement and restore emit a media-version event.
- Site-media recommendation code has a current-fingerprint cache-first path.

The accepted completion contract for the corresponding Toolbox and Addon
changes is:

- article ALT uses the same current-fingerprint cache-first resolver and does
  not call Provider for an unconfirmed miss;
- Toolbox performs a weekly bounded fingerprint scan when Addon readiness is
  true; `DISABLE_WP_CRON` is not treated as proof that server cron is absent;
- scan and replacement Hooks merge IDs into one Toolbox
  `awaiting_confirmation` continuation state;
- ALT uses ten-occurrence pages, retains edits and decorative markers across
  pages, and applies all reviewed empty `core/image` values only after final
  confirmation;
- external `core/image` occurrences may use local article context, but their
  remote image bytes or URL are never sent for visual recognition;
- the user-facing entry exists only in SEO/Discoverability.

These bullets describe implemented behavior only after the corresponding
Toolbox and Addon revisions have passed their repository gates and merged.
Before that acceptance point they are requirements, not evidence about
`master`.

## 10. Development and Verification Checklist

Before changing this area, confirm the change envelope and the owning boundary
documents. Then verify at least:

- same attachment and same fingerprint reuse evidence without a new recognition
  request;
- changed fingerprint never reuses the old evidence;
- crop, resize, watermark, and format conversion are treated as re-checks;
- direct file replacement is detected before use;
- empty ALT can be reviewed and applied without changing existing ALT;
- decorative and non-native image cases remain reviewable;
- more than one page of image occurrences is fully processed;
- Cloud responses remain suggestion-only and contain no WordPress write fields.

Use the narrowest repository gates for the changed seam, then run the relevant
cross-repository smoke or contract checks. A green compression test proves
derivative integrity; it does not prove the ALT visual-evidence lifecycle.

## 11. Related Authority

- [Site Media Recommendation Engineering Standard](site-media-recommendation-engineering-standard-v1.md)
- [Cloud Image Context Evidence Runtime Contract](cloud-image-context-evidence-runtime-contract-v1.md)
- [Media Runtime Boundary](media-runtime-boundary-v1.md)
- [Media Derivative Operations Runbook](media-derivative-operations-runbook-v1.md)
