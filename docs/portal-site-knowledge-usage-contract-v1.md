# Account Site Knowledge usage breakdown v1

`GET /portal/v1/account/site-knowledge-usage?source_type=media` extends the
existing account usage detail URL. Authentication, account membership, visible
site permissions and archived-site exclusion are unchanged. It is read-only.

`source_type` defaults to `text`. Accepted values are `text`, `media`, `video`,
`pdf` (case-insensitive, surrounding whitespace ignored). Unknown or explicitly
empty values return HTTP 400 with
`portal.site_knowledge_usage.source_type_invalid`; oversized input is rejected
by query validation (422).

The normal Portal envelope contains:

```json
{
  "source_type": "media",
  "metering_unit": "image",
  "total_used": 3,
  "generated_at": "2026-10-23T00:00:00+00:00",
  "items": [
    {
      "site_id": "site_example",
      "site_name": "Example",
      "status": "active",
      "used": 3,
      "last_indexed_at": "2026-10-23T00:00:00+00:00"
    }
  ]
}
```

| source_type | metering_unit | Meaning of `used` |
| --- | --- | --- |
| text | document | Indexed non-media document records, including posts/comments; legacy vector_documents scope |
| media | image | Indexed media document records, one per image source, not chunks, vectors, bytes or generated images |
| video | video | Reserved count of video source records (not seconds/frames); currently empty |
| pdf | pdf | Reserved count of PDF source records (not pages); currently empty |

`total_used` sums the rows. Rows sort by site name then site ID.
`last_indexed_at` is the latest indexed timestamp within the requested bucket,
empty string when absent. Image rows with zero usage are omitted: no media
records means `items: []`. No visible sites also means `items: []`.

For backwards compatibility, text includes zero-usage visible sites and keeps
`sites` (alias of `items`), per-row `indexed_document_count` (alias of `used`),
`total_indexed_document_count` (alias of `total_used`), and
`indexed_document_limit` (the existing entitlement read). Text continues to
count **all non-media** source types exactly as before; future video/PDF
activation must explicitly reconcile this legacy scope with entitlement
semantics. Video/PDF currently return empty lists, without enabling ingestion
or changing capacity. Image/video/PDF limits continue to come from entitlements,
not this endpoint. No plan numbers or pricing change.

Frontend: existing `portalClient.getAccountSiteKnowledgeUsage()` keeps its text
return type. Use `getAccountSiteKnowledgeUsageByType('media')` for the image
list and render `data.items`, `row.used` and `data.metering_unit`. Video/PDF use
the same method/URL when implemented. This contract does not change Portal CSS,
click targets or empty-state visuals (handled separately in PR #1199).

Verification: `tests/api/test_portal_site_knowledge_usage.py` checks real SQLite
aggregation through the authenticated API, default/text compatibility, mixed
resources, multi-site counts, foreign-account exclusion, empty sites, invalid
types, reserved buckets and generated OpenAPI. Existing quota tests remain
applicable. OpenAPI documents the query and response fields at the existing URL.
