# Channel Delivery Matrix Contract v1

> Status: canonical

Contract version: `channel-delivery-matrix-v1`  
Updated: `2026-05-21`
Scope: Unified projection and exposure consistency across OpenAPI/MCP/Agent Gateway/Skills.

Product sentence:

`Agent Gateway calls. Magick AI governs. WordPress stores.`

## 1. Objective

Define one matrix projection contract so every channel consumes the same ability governance truth.

## 2. Required Projection Outputs

`magick_ai_open_platform_get_projection_matrix()` MUST include:

1. `channels.open_api[]`
2. `channels.mcp[]`
3. `channels.agent_gateway_direct[]`
4. `openapi_tools[]`
5. `mcp_tools[]`
6. `agent_gateway_tool_map{}`
7. `skills{}` projection
8. `projection_fallback_trace_id`
9. `projection_fallback_events[]` (`reason_code/trace_id/ability_id/workflow_id/tool_name/dispatch_handler/exception_id/owner/cleanup_due_date/status`)
10. `projection_fallback` governance summary fields in ledger (`open_total/overdue_total/cleared_total/owner_summary[]`)

## 3. Per-Ability Delivery Fields

Every projected ability row SHOULD expose:

1. `ability_id`
2. channel exposure state (`configured/effective/blocked`)
3. channel reason (`reason_code`)
4. write safety (`risk_level/write_mode/requires_confirm`)

Every projected `openapi_tools[]/mcp_tools[]` row SHOULD expose:

1. `ability_id`
2. `title`
3. `description`
4. `risk_level`
5. `requires_confirm`
6. `required_scopes`
7. `parameters_schema` (derived from Ability Catalog `input_schema`)
8. compact canonical usage notes appended onto `description` (`When to use / Not for / Best for / Stopping points`) when those fields exist on the canonical ability/workflow/skill row

## 4. Delivery Matrix Rules

1. Channel exposure MUST be derived from ability governance projection; no channel-local override as truth source.
2. Write-like abilities MUST stay fail-closed when write contract is incomplete.
3. Skills/Agent Gateway are projection targets, not independent ability registries.
4. Agent Gateway static fallback allowlists MAY only backfill missing projected tools and MUST NOT override blocked or missing catalog truth.
5. Every Agent Gateway static fallback row MUST be an explicit temporary exception with `fallback_exception=true`, `exception_id`, `owner`, and `cleanup_due_date`; silent default rows are invalid.
6. Built-in Agent Gateway static fallback rows SHOULD default to empty. Long-lived V1 tools should come from auto projection (`tool_name` / `dispatch_handler` overrides + catalog truth), not from baked-in exception rows.
7. Agent Gateway static fallback rows MAY keep binding-only metadata, but runtime-facing governance fields MUST be rehydrated from Ability Catalog/projection truth before delivery.
8. Skills projection MUST reuse the current compiled ability snapshot when projection/compiler already has it, instead of refetching per-skill ability entries.
9. OpenAPI/MCP projected tool rows MUST reuse Ability Catalog `input_schema` as `parameters_schema`; channel consumers MUST NOT rebuild local schema maps as an alternative truth source.
10. `magick-ai-read` MCP server MUST be sourced from published workflow runtime bridge abilities derived from local workflow truth; it MUST NOT become a hand-maintained workflow tool registry.
11. When one default workflow-backed skill points at a published workflow entry ability whose effective channels include `mcp`, the corresponding workflow runtime bridge id MUST be discoverable on `magick-ai-read`.
12. Workflow delivery ids assigned to `magick-ai-read` MUST NOT silently drift onto `magick-ai-read` or `magick-ai-write`; server assignment remains governed by the published workflow bridge contract, not by channel-local convenience remaps.
13. When one default workflow-backed skill points at a published workflow entry ability whose effective channels include `third_party`, that same `ability_id` MUST be discoverable in both `channels.open_api[]` and `openapi_tools[]`; OpenAPI MUST NOT keep a channel-private workflow id remap or separate workflow tool registry.
14. `openapi_tools[]` rows for published workflow abilities MUST reuse the same canonical `ability_id`, `risk_level`, `requires_confirm`, and `parameters_schema` derived from the compiled ability row; third-party delivery MUST NOT widen exposure or rebuild workflow schema truth locally.
15. MCP/Agent Gateway/OpenAPI tool descriptions MUST stay canonical-first: the leading summary MUST come from the canonical object description, and any compact usage notes MUST be appended from the same canonical row rather than authored as channel-private replacement copy.
16. When one default workflow-backed skill points at a published workflow entry ability, the outward `description` shown in `channels.open_api[]`, `mcp_tools[]`, and `agent_gateway_tool_map{}` MUST align to that canonical published workflow ability row. Skill manifest copy may guide routing, but MUST NOT become a second channel-private description source.
17. REST/OpenAPI, MCP, Agent Gateway, and Content Assistant MAY present the same capability differently, but they MUST point at the same canonical `ability_id` / `workflow/*` truth and MUST NOT invent channel-private schema, workflow step, approval, or write semantics.
18. Agent Gateway remains a projection consumer; `agent_gateway_tool_map{}` is not a stable public tool registry truth and MUST NOT be used to promote a capability without Ability Catalog/projection truth and candidate gate evidence.
19. New ability and skill entries MUST default to the minimum local channel set (`agent`) when `allowed_channels` is absent. `third_party`, `agent_gateway`, and `mcp` exposure requires explicit admission through `allowed_channels`, `mcp_public`, or the relevant projection allowlist/override; no runtime fallback may widen a new entry into external channels.
20. Agent Gateway `wp_*` runtime-facing fields MUST be rehydrated from the compiled projection/Ability Catalog row. WordPress Abilities discovery may confirm availability, but MUST NOT create a second Agent Gateway schema, scope, risk, or confirmation truth.

## 4.1 Canonical Content Capability Matrix

This table is a documentation projection of the machine-readable inventory at
`includes/open-platform/content-capability-inventory.php`. It is not a second
registry.

| Domain | Canonical entry | Content Assistant | REST/OpenAPI | MCP | Agent Gateway | Write/apply owner |
| --- | --- | --- | --- | --- | --- | --- |
| article | `workflow/article_single_optimization_suggest` | local workbench suggest/result | projected ability/tool | projected tool | projected tool when inventory allows | local preview/apply through Magick AI governance |
| article | `workflow/wordpress_article_draft` | local draft flow | projected ability/tool | projected tool | not default | local preview/proposal/apply through Magick AI governance |
| article | `workflow/wordpress_article_production` | local production flow | projected ability/tool | projected tool | not default | local preview/proposal/apply through Magick AI governance |
| comment | `workflow/comment-moderation` | native comment/workbench suggest | projected ability/tool | projected tool | projected tool when inventory allows | WordPress native comment action through Magick AI governance |
| comment | `workflow/comment-mention-reply-suggest` | native comment reply suggest | projected ability/tool | projected tool | not default | local/native confirm before write |
| media | `workflow/media-alt-single-suggest` | single attachment ALT/source preview | REST/local handoff | not default | not default | Content Assistant local preview/apply only |

The matrix intentionally keeps media narrower than article/comment. Batch media
governance, archive-style media task detail, and broad media apply surfaces
belong to cloud/offload or future explicit workbench contracts, not to default
local or Agent Gateway exposure.

## 5. Admin Catalog Consistency

Settings catalogs MUST stay split by surface responsibility:

1. `/admin/settings/capabilities` MUST stay a lightweight directory read model with local final exposure truth only.
2. `/admin/settings/capabilities` MUST NOT require `channel_projection`, `channel_consistency`, or `exposure_matrix` on the hot list path.
3. Local Settings no longer exposes `/admin/settings/functions`; function binding review must use canonical prompt/function and ability sources instead of a separate local directory route.

Skills governance read models SHOULD additionally expose:

1. `allowed_channels`
2. `required_scopes`
3. `governance_channels{}` with per-channel `configured/effective/blocked/reason_code`
4. `effective_channels[]`
5. `blocked_channels[]`
6. `governance_reasons[]`

`audience` / `default_visibility` MAY appear alongside Skills governance rows, but they remain skill-level publish governance metadata, not channel exposure truth.

Local settings `apps_skills` no longer exposes a projection health REST surface. This contract does not require the local panel to foreground publish metadata or render a governance/distribution workspace.

Publish metadata and governance-heavy fields such as `examples`, `sample_input`, `sample_output`, `prompts`, `resources`, `artifacts`, `audience`, `default_visibility`, `governance_channels`, `blocked_channels`, and `governance_reasons` may remain available in lower-level projection/schema compatibility seams without being part of the local settings payload.

## 6. Compatibility

- Additive-only in `v1`.
- Removing/renaming matrix keys requires `v2`.

## 7. Verification

- Contracts:
  - `tests/unit/channel-delivery-matrix-contracts.php`
  - `tests/unit/admin-settings-catalog-rest-contracts.php`
  - `tests/unit/ability-governance-projection-contracts.php`
