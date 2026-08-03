# Media Intelligence First-20 Image Pilot — 2026-07-29

Status: runtime execution complete on M4; operator human-review confirmation
remains open.

This record covers the first 20 images from the deterministic Local WordPress
media cohort. It is bounded evaluation evidence, not production, GA, persistent
vector indexing, attachment metadata mutation, or approval to scan the
remaining media library.

## 1. Boundary And Change Envelope

- Target runtime: M4 Preview.
- Local source: the controlled `magick-ai.local` WordPress media library.
- Cloud scope: short-TTL Artifact upload, hosted vision execution, structured
  evidence, and Provider usage records.
- WordPress scope: read attachment identity, original bytes, dimensions, title,
  ALT, and caption for evaluation only.
- Explicit non-goals: no WordPress write, no ALT/caption update, no attachment
  deletion, no persistent vector, no new public media URL, no production
  deployment, and no `vision.ai` Admin configuration surface.
- Rollback: no product state was changed; temporary Artifact objects remain
  subject to their normal TTL lifecycle.

## 2. Frozen Corpus

The cohort was recomputed immediately before execution using the existing
deterministic rules:

1. MIME is JPEG, PNG, or WebP;
2. original file exists;
3. width and height are each at least 256 pixels;
4. WordPress resolves an attachment URL;
5. eligible rows are sorted by numeric attachment ID and the first 20 are used.

| Evidence | Result |
| --- | --- |
| Eligible image count | 58 |
| Aggregate fingerprint | `897961b1d724e7a668bb7ae5bb779734debb4d4aeff20f11d5f502e9e178b21c` |
| Previous Milestone A fingerprint | exact match |
| Selected images | first 20 deterministic rows |
| Selected original bytes | 5,241,734 bytes, about 5.00 MiB |
| Supported formats in selected set | 20 JPEG |

Individual attachment IDs, titles, filenames, URLs, and local paths remain
local WordPress truth and are not copied into this Cloud evidence document.

## 3. Resolved Runtime And Cost

| Field | Result |
| --- | --- |
| Profile | `vision.ai` |
| Connection | `mqzj` |
| Provider adapter identity | `openai` |
| Model | `gpt-5.4-mini` |
| Instance | `openai-global-gpt-5-4-mini` |
| Fallback | disabled; 0 fallback runs |
| Pricing basis | official OpenAI standard tariff recorded in Provider metadata |
| Result contract | `image_context_evidence.v1` |

Measured Provider evidence:

| Metric | Result |
| --- | ---: |
| Requested runs | 20 |
| Succeeded runs | 20 |
| Provider calls | 20 |
| Parseable structured results | 20 / 20 |
| Attachment/result ID matches | 20 / 20 |
| Input tokens | 45,982 |
| Output tokens | 3,679 |
| Estimated cost | USD 0.051044 |
| Conservative budget comparison | below CNY 0.52 even at CNY 10 per USD |
| Operator hard ceiling | CNY 50 |
| Mean Provider latency | 6,894.9 ms |
| Median Provider latency | 6,574 ms |
| Maximum Provider latency | 11,683 ms |
| Provider error calls | 0 |

The cost is a model-price estimate, not an MQZJ invoice, gateway-settlement
record, tax amount, margin calculation, or customer AI-credit policy.

## 4. Runtime Run Evidence

The 20 successful run IDs, in deterministic sample order:

1. `run_8421d45802ec41388e5a2f13b5ff5dfd`
2. `run_8f8550ba2e9a44909894aa0fb5f89e89`
3. `run_3043ce2aab594f2f8de54cc86b5acfa1`
4. `run_ac9b5e970082422daff0dd2c656b595d`
5. `run_68b5e57516654439b81f59368ad3d746`
6. `run_23cf07b8bcbd4199a416993404f7527e`
7. `run_bf35f0c629ec481b92965d351796311e`
8. `run_eaab059a44b3481c93768dd6f93c0d56`
9. `run_471338d436c4477ca186f4af6751ac2e`
10. `run_c9b15e790b2f47379afe7fcfede73a32`
11. `run_64081f76dfe74d809624034fcebf53cf`
12. `run_2df167d4d5ee4ab8b6f0f783a850b1a5`
13. `run_ba3e764848734cfe89db28a08ddcfb9d`
14. `run_bc1435a3c1c1451d9ba792966f14d2a6`
15. `run_4183ecc2baa846bc96134aabe7dbf878`
16. `run_e4c1053577ac4fa2aba53b1ba30c8fcb`
17. `run_c830389d0f1c4c90bcb7ecff5306c754`
18. `run_10d3cbf7c72440d08d6e460959f79bc7`
19. `run_d370dd2edf624fe9a8b672bcda0ef979`
20. `run_93ce49ccd3d24e13bc5825b03e5d4366`

## 5. Preliminary Visual Review

This is an AI-assisted evaluator pass against the original local image bytes
and existing title/ALT/caption baseline. It is not a substitute for the
operator human-review requirement.

Scoring uses the frozen 0/1/2 rubric. OCR is scored only when visible text is
present.

| Sample | Identity | Fidelity | Tags | OCR | ALT/caption basis | Recommendation vs metadata | Review note |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | pass | 2 | 2 | N/A | 2 | 2 | Replaces a one-word ALT and unrelated placeholder caption with grounded canola-field evidence. |
| 2 | pass | 2 | 2 | N/A | 2 | 2 | Converts filename-only metadata into usable crop-row and farmland concepts. |
| 3 | pass | 2 | 2 | N/A | 2 | 2 | Converts filename-only metadata into usable woodland and grass concepts. |
| 4 | pass | 2 | 2 | N/A | 2 | 1 | Faithful wharf-bell evidence; existing metadata already carried the main subject and location. |
| 5 | pass | 2 | 2 | N/A | 2 | 2 | Adds bridge type, water, hills, and scene concepts beyond the proper-name baseline. |
| 6 | pass | 2 | 2 | N/A | 2 | 1 | Faithful river sunburst evidence; location correctly treated as metadata rather than visual proof. |
| 7 | pass | 2 | 2 | 2 | 2 | 2 | Correctly reads `FISHING BOARDWALK` and adds waterfront/pier retrieval concepts. |
| 8 | pass | 2 | 2 | N/A | 2 | 1 | Faithful marina evidence; broadly similar to the already descriptive baseline. |
| 9 | pass | 2 | 2 | N/A | 2 | 1 | Faithful rain-ripple evidence; broadly similar to existing metadata. |
| 10 | pass | 2 | 2 | N/A | 2 | 1 | Correct bridge identification and added composition terms; existing proper-name metadata was strong. |
| 11 | pass | 2 | 2 | N/A | 2 | 1 | Correct wind-farm sunset evidence; broadly similar to existing metadata. |
| 12 | pass | 2 | 2 | N/A | 2 | 2 | Adds rust, wheels, rods, and machinery-detail retrieval concepts. |
| 13 | pass | 2 | 2 | N/A | 2 | 2 | Correctly identifies lilies where the existing metadata says iris. |
| 14 | pass | 2 | 2 | N/A | 1 | 1 | Visual facts are correct, but ALT/caption basis arrays were coerced into string values instead of a clean scalar shape. |
| 15 | pass | 2 | 2 | N/A | 2 | 2 | Adds shallow water, rocks, coastline, and sky beyond generic metadata. |
| 16 | pass | 2 | 2 | N/A | 2 | 2 | Correctly adds the small waterfall, cliffs, cove, beach, and surf omitted by existing metadata. |
| 17 | pass | 2 | 2 | N/A | 2 | 1 | Faithful foggy windmill evidence; broadly similar to existing metadata. |
| 18 | pass | 2 | 2 | N/A | 2 | 1 | Faithful tropical coastline evidence; broadly similar to the location-rich baseline. |
| 19 | pass | 2 | 2 | N/A | 2 | 2 | Adds sunset, natural rock arch, beach, and people while flagging metadata-derived location. |
| 20 | pass | 2 | 2 | N/A | 2 | 2 | Adds cliffs, vegetation, waves, and water color beyond the location-only baseline. |

Preliminary rollup:

- 20 / 20 identity matches;
- 20 / 20 useful and grounded visual summaries;
- 20 / 20 useful subject/scene tags;
- 1 / 1 applicable OCR result correct;
- 19 / 20 clean ALT/caption bases and 20 / 20 usable after review;
- 11 / 20 materially better than metadata for article recommendation;
- 9 / 20 similar to an already descriptive metadata baseline;
- 0 / 20 worse than metadata.

## 6. Operational Interruption

After the first three successful samples, a concurrent M4 candidate refresh
recreated API containers. The next upload received an Nginx `502`, and the
remaining immediate attempts encountered the upload rate limit (`429`).
The Addon projected those HTML proxy responses as a generic invalid-JSON
transport error.

No failed upload reached the vision Provider and no model charge was recorded
for those attempts. Execution resumed only after M4 returned healthy. The
remaining samples then succeeded with fail-fast sequential dispatch.

This reveals two runtime-operability follow-ups:

1. a bounded batch runner must stop on the first transport failure and resume
   from its deterministic checkpoint;
2. the Addon should preserve safe HTTP status/retry guidance for proxy `429`
   and `502` responses instead of reducing both to invalid JSON.

Neither finding requires a new queue, workflow engine, or `vision.ai`
configuration page.

## 7. Decision

The runtime and cost hypotheses passed:

- structured success and attachment matching exceeded the 95% target;
- Provider calls stayed on the intended model with zero fallback;
- measured cost was far below the CNY 50 ceiling;
- preliminary review exceeded the 70% usefulness target and beat the
  metadata-only baseline without any worse result.

The product gate remains conditionally open rather than fully accepted because
an operator human must confirm the 20 visual-review rows. Do not expand to the
remaining 38 images, persistent vectors, editor recommendations, or metadata
writes until that confirmation is recorded.

Recommended next discussion:

1. operator confirms or edits the first-20 review scores;
2. decide whether to harden resumable batch transport before the remaining
   cohort;
3. only after the full frozen cohort passes, design the rebuildable media
   projection in the existing Site Knowledge vector subsystem;
4. discuss Provider model-metadata maintenance separately from this pilot.
