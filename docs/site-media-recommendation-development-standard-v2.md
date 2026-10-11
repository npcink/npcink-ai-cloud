# Site Media Recommendation Development Standard v2

Status: active.

Purpose: record the practical design and delivery rules for external image
source recommendations used by the WordPress editor. This standard is the
implementation companion to `site-media-recommendation-engineering-standard-v1.md`.

## Product Rule

The editor should be able to choose a source and search once, then inspect up
to nine stable candidates. Search results are suggestions only. WordPress owns
selection, import, featured-image assignment, attribution persistence, and
all final writes.

## Architecture

1. The editor sends bounded article context: title, excerpt, selected text,
   locale, image purpose, and the user's explicit query.
2. Cloud converts abstract editorial language into concrete visual search
   angles. The UI label is localized; `search_query` is provider-facing.
3. Configured providers are queried in parallel. `fast_first` may return the
   first useful provider for the initial response; `complete` must collect all
   configured providers before merging.
4. Each provider's order remains its relevance signal. Results are filtered
   for missing URLs, insufficient dimensions, obvious high-risk assets, and
   exact duplicates, then merged round-robin for provider fairness.
5. No image bytes are downloaded for ranking and no vision model is called in
   the default path.

## Query Guidance

Do not append generic suffixes to an article title. Extract subject, industry,
objects, actions, and scene, then produce three to five distinct directions.
For abstract topics, use concrete scenes, for example:

```json
{
  "display_label": "移动端社交购物体验",
  "search_query": "mobile social shopping app experience"
}
```

`display_label` is presentation text and must be localized. `search_query` is
the only value sent to an external image provider.

## AI Boundary

Normal image search is deterministic and does not call the text planner.
An AI keyword planner is allowed only after an explicit user action, at most
once per request, with timeout, quota, malformed-output fallback, and a local
deterministic fallback. The planner never owns image selection or WordPress
writes.

## Delivery and Validation

- Test contracts, query transformation, provider timeout/failure, filtering,
  dedupe, round-robin fairness, and stable ordering.
- Validate the Cloud candidate on M4 when runtime code changes; candidate state
  is not accepted or production evidence.
- Validate the editor with real articles rather than manufacturing a labeled
  benchmark. Record only clearly failed examples: title, selected text,
  keywords, and screenshot.
- Do not add a dashboard, AI old/new comparison, vector database, OpenCLIP, or
  visual reranker until repeated real failures justify it.

## Lessons

- A fast provider response is not a fair final result; initial and complete
  response modes must be separate contracts in behavior even when the public
  request contract is unchanged.
- Provider ranking is valuable evidence. Re-sorting by local heuristics can
  destroy relevance; use heuristics to demote obvious risk, not to invent a
  new ranking.
- Abstract business terms rarely work as stock-photo queries. Query
  transformation must name people, objects, actions, and scenes.
- UI stability is part of correctness: reserve nine slots, keep TABs usable,
  and never clear the selected image during background work.
- Locale must be carried end to end: WordPress locale -> visual context ->
  Cloud normalization -> localized display field.
- Third-party projects are references for normalization, pagination, provider
  failure isolation, attribution, and query transformation. Do not copy a
  framework wholesale or introduce a second control plane.

## Stop Conditions

Move to optional visual reranking only when real use repeatedly shows semantic
failures after query transformation, and only with an explicit cost, timeout,
fallback, and contract review. A single weak result is a correction example,
not an excuse to add a new platform.
