# Media Intelligence Milestone A Inventory And Gate — 2026-07-29

Status: Milestone A evidence and the local Artifact pilot seam are implemented
and M4 candidate-validated; charged execution remains gated.

Related plan:
[Media Intelligence And Attachment Indexing Next-Stage Plan](media-intelligence-and-attachment-indexing-next-stage-plan-v1.md).

## 1. Outcome

The operator explicitly reopened media work for Milestone A only on
2026-07-29. The read-only inventory and bounded-corpus definition are complete.
No attachment, post, metadata, plugin, Cloud runtime state, or Provider state
was changed.

The selected site is usable for local inventory but not for the existing
public-URL image evidence pilot:

- `magick-ai.local` resolves only to `127.0.0.1` and `::1`;
- its home page returned HTTP `200` from the operator Mac;
- an upstream vision Provider cannot fetch those Local-only URLs;
- therefore the current corpus has `0` Provider-eligible public images even
  though `58` local image candidates meet the format and dimension rules.

The operator confirmed on 2026-07-29 that the current media-library images
contain no sensitive information and approved a bounded local Artifact pilot.
This removes the public-URL requirement for the pilot without exposing the
Local site: WordPress uploads selected bytes into same-site short-TTL Cloud
artifacts and Cloud constructs Provider input only at the private Provider
edge.

## 2. Change Envelope

Focused modules:

- read-only WordPress attachment inventory and media-pilot gating evidence;
- additive image-context evidence input through existing short-TTL media
  artifacts;
- operator-only Addon pilot transport with no WordPress writes.

Repositories and runtimes inspected:

- Cloud documentation in this repository;
- Local WordPress at `/Users/muze/Local Sites/magick-ai/app/public`;
- the actual Cloud Addon mount, resolved without changing its symlink.

Explicit non-goals:

- no charged visual-model or embedding call;
- no text extraction;
- no persistent media index or new vector database;
- no media metadata write;
- no delete, optimization, import, or WordPress content write;
- no Provider configuration, production change, or billing change.

Rollback:

- remove this evidence record and the related plan if the proposal is
  abandoned; no runtime or WordPress state needs rollback.

## 3. Environment And Ownership Evidence

| Item | Point-in-time evidence |
| --- | --- |
| Environment | Local development WordPress, not production |
| Site URL | `https://magick-ai.local` |
| WordPress version | `7.1-beta3-62891` |
| Multisite signal | No multisite constant was reported |
| Cloud Addon mount | Symlink to `/Users/muze/gitee/npcink-cloud-addon-local-suggest-reply` |
| Mounted branch and revision | `codex/local-suggest-reply-acceptance`, `d92dfef` |
| Mounted worktree | Dirty before inventory; left untouched |
| Cloud ownership | Runtime execution and rebuildable evidence only |
| WordPress ownership | Attachment identity, visibility, review, use, write, and deletion truth |

The runtime mount was resolved before inspection because the Local site does
not use the Addon checkout implied by the Cloud terminal working directory.

## 4. Hosted Text Checkpoint

The repository already records a bounded hosted-text checkpoint in
[Hosted GPT-5.5 WordPress Short Text Closeout](hosted-gpt55-wordpress-short-text-closeout-and-development-retrospective-2026-07-28.md):

- real Local WordPress user path verified;
- WordPress Ability, Addon, Cloud, hosted GPT-5.5, review, insert, and explicit
  local save verified;
- PR `#325` merged and revision `318c2c4b...` accepted on M4;
- production unchanged and GA not claimed.

Milestone A therefore does not replace an unfinished text-loop investigation.
The repository focus lock still applies: media work remains a bounded evidence
pilot, not a new main product track.

## 5. Read-Only Attachment Inventory

Inventory time: 2026-07-29 Asia/Shanghai.

The inventory used WP-CLI through the Local site's PHP configuration and MySQL
socket. It read attachment posts, metadata, original-file presence and size,
published-content references, featured-image references, and SHA-256 hashes.
It did not emit attachment titles, filenames, URLs, post bodies, or individual
attachment IDs into this document.

### 5.1 Counts And Original Bytes

| Class | Count | Notes |
| --- | ---: | --- |
| All attachments | 70 | All had `inherit` status |
| Images | 65 | 51 JPEG, 8 PNG, 5 WebP, 1 GIF |
| Documents | 2 | 1 DOCX, 1 XLSX |
| Audio | 1 | MP3 |
| Video | 2 | MP4 and QuickTime |
| Missing original files | 0 | File-presence check passed for all attachments |
| All original bytes | 62,149,711 | About 59.27 MiB |
| Image original bytes | 19,535,091 | About 18.63 MiB |

Image size bands:

| Original size | Count |
| --- | ---: |
| Below 100 KiB | 17 |
| 100 KiB to below 1 MiB | 45 |
| 1 MiB to below 5 MiB | 3 |
| 5 MiB or more | 0 |

### 5.2 Metadata And Use Signals

| Signal | Count | Interpretation |
| --- | ---: | --- |
| Non-empty ALT | 48 / 65 | 73.8%; a useful review baseline, not proof of quality |
| Non-empty caption | 35 / 65 | 53.8%; a useful review baseline, not proof of quality |
| Dimensions present | 61 / 65 | Four supported-format images lacked usable dimensions |
| Parent attachment signal | 40 / 65 | Weak use evidence only |
| Featured-image signal | 7 / 65 | Stronger local reference evidence |
| Published-content reference signal | 7 / 65 | Based on ID, URL, or attached-file references |
| No observed use signal | 24 / 65 | Not equivalent to unused or safe to delete |

The content-reference scan is deliberately conservative. Theme options,
serialized plugin state, CSS, external embeds, revisions, custom tables, and
runtime-generated references may still use an attachment. Cleanup must not use
this inventory as deletion authority.

### 5.3 Exact Duplicates

Original-file SHA-256 grouping found:

- 6 exact image duplicate groups;
- 12 image attachments across those groups;
- at most 1,382,267 original bytes, about 1.32 MiB, represented by duplicate
  copies beyond one copy per group.

This is grouping evidence, not a delete proposal. WordPress references,
metadata, attribution, derived sizes, and operator intent must be reviewed
before any cleanup action.

## 6. Frozen Bounded Corpus

The image selection rule is deterministic:

1. MIME is JPEG, PNG, or WebP;
2. original file exists;
3. width and height are each at least 256 pixels;
4. WordPress can resolve an attachment URL.

The first pass excludes the GIF and defers unsupported or missing dimensions.

| Cohort | Count | Aggregate fingerprint |
| --- | ---: | --- |
| Local image candidates | 58 | `897961b1d724e7a668bb7ae5bb779734debb4d4aeff20f11d5f502e9e178b21c` |
| Initial text-document candidate | 1 DOCX | `2d6e29c073bce4f01d51de49d34ebe63c596d408f4e826a47873bad88e51f4b5` |
| Provider-eligible public images | 0 | Blocked by Local-only URLs |

The fingerprints are SHA-256 digests over sorted
`attachment ID | MIME | original-file SHA-256` rows. Individual rows remain
local WordPress truth and are not copied into Cloud documentation.

The latest modified GMT timestamp in the image cohort was
`2026-07-07 03:55:49`. Recompute the cohort fingerprint before any later pilot;
a mismatch means the corpus changed and must be reviewed again.

The XLSX attachment is inventory-only. Spreadsheet extraction and semantic
chunking are not part of the initial text-document pilot.

## 7. Consent And Data Classification

The operator's approval covers:

- read-only inspection of the controlled Local WordPress site;
- aggregate evidence and non-reversible cohort fingerprints in this
  repository;
- planning the next bounded pilot.

It does not yet approve:

- exposing Local media through a public tunnel;
- copying files to a public bucket;
- persistent vectorization;
- WordPress metadata changes or deletion.

The operator confirmed that the current image cohort has no sensitive
information and approved its bounded visual-evidence use. The transport
classification remains `internal`; this confirmation does not reclassify the
media as public, authorize unrelated Provider use, or approve persistent
storage.

## 8. Frozen Evaluation Rubric And Cost Gate

The future image-evidence pilot must compare the visual evidence against the
existing filename, title, ALT, and caption baseline.

Human reviewers score each eligible result:

| Dimension | Score |
| --- | --- |
| Attachment/result identity match | Pass/fail; any mismatch stops the pilot |
| Visual-summary fidelity | 0 incorrect, 1 partial, 2 useful and grounded |
| Subject/scene tag usefulness | 0 unusable, 1 mixed, 2 useful for retrieval |
| Visible-text/OCR quality | 0 incorrect, 1 partial, 2 useful, or N/A |
| ALT/caption review usefulness | 0 unusable, 1 needs major edits, 2 useful basis |
| Article-recommendation usefulness | 0 worse than metadata, 1 similar, 2 materially better |

Pilot acceptance remains:

- at least 95% parseable, attachment-matched evidence;
- zero cross-attachment association;
- zero raw URL, secret, or Provider payload in ordinary diagnostics;
- at least 70% of reviewed rows useful for semantic retrieval or ALT/caption
  review;
- measured relevance must beat the metadata-only baseline.

The experiment cap is CNY 50 equivalent for the entire cohort. This is a hard
operator ceiling, not an expected charge. Before the first charged call, record
the resolved `vision.ai` connection, normalized Provider ID, model ID,
price-estimate mode, and stop if trusted price or actual call-ledger evidence
cannot be obtained.

Read-only M4 resolution on 2026-07-29 found:

- connection: `mqzj`;
- adapter/provider identity: `openai` / `openai_compatible`;
- endpoint: `https://api.mqzj.top/v1`;
- `vision.ai` routing revision:
  `catalog-20260728030322347708-9edade36`;
- healthy candidate models:
  `Qwen/Qwen3-Omni-30B-A3B-Captioner`,
  `Qwen/Qwen3-Omni-30B-A3B-Instruct`, and
  `Qwen/Qwen3-Omni-30B-A3B-Thinking`;
- `price_input=null` and `price_output=null` for every candidate.

The Provider/model identity is now known, but trusted price evidence is not.
The cost gate therefore stopped the experiment before dispatch.

Observed Milestone A Provider cost: CNY 0. No Provider call was made.

## 9. Gate Decision And Next Action

Milestone A is complete for inventory, cohort rules, consent boundary, rubric,
cost cap, and the local Artifact transport seam. Charged Milestone B execution
remains closed until trusted price or actual call-ledger evidence is available.

Next actions, in order:

1. obtain trusted tariff or bounded call-ledger evidence for the resolved
   candidate models;
2. recompute the frozen corpus fingerprint and select the first 20 rows;
3. run the 20-image evidence pilot under the CNY 50 cap and stop conditions;
4. only if it passes, expand to the remaining frozen cohort;
5. only if the cohort passes, propose a rebuildable projection in the existing Site
   Knowledge vector subsystem.

Do not solve the Local visibility blocker with an ad hoc public tunnel, signed
admin URL, new object store, or private-media contract shortcut.

## 10. Verification

Passed on 2026-07-29:

- Local site root and actual Addon symlink target resolved read-only;
- WordPress core detection and site URL query;
- attachment MIME/status aggregation;
- original-file existence and size aggregation;
- metadata/use-signal aggregation;
- exact original-file SHA-256 duplicate grouping;
- deterministic bounded-corpus fingerprinting;
- Local HTTP liveness and loopback-only resolution check;
- Cloud focused Artifact evidence tests: 7 passed on M4;
- Cloud local contract/domain tests: completed successfully;
- Addon `composer run test:all`;
- Addon WordPress Playground smoke on WordPress 7.0.2 and PHP 8.2;
- M4 candidate deploy with healthy API/frontend and Alembic
  `20260728_0076 (head)`.

The M4 result is a dirty-source candidate preview, not accepted `master`,
production, or GA evidence. The Local WordPress mount and production runtime
were not changed.
