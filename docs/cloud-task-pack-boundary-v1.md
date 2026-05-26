# Cloud Task Pack Boundary v1

## Scope

This document defines the responsibility boundary for Cloud-hosted **task packs**.
Task packs are suggestion-and-draft engines that help WordPress-side users grow
content, products, or sites. They are **not** control planes and do **not**
hold canonical truth.

## Current Task Packs

| Pack | ID | Status |
|------|-----|--------|
| WooCommerce Growth Pack | `woocommerce-growth` | v1 implemented |

## Capabilities

### WooCommerce Growth Pack v1

- **Product title suggestions** — generate alternative titles based on heuristics
- **Short / long description drafts** — produce description variants for review
- **Attribute completion suggestions** — recommend missing attributes
- **Multi-language localization suggestions** — draft localized content
- **SEO/GEO-ready Product Schema suggestions** — recommend structured-data fields
- **Batch task plan summary** — summarize growth tasks across a product list

## Hard Boundaries

1. **Cloud only outputs suggestions, drafts, reports, and pending changes.**
   - Cloud must never mutate a WooCommerce product directly.
   - Cloud must never hold product catalog truth.

2. **Every response must express `requires_local_approval: true` (or equivalent).**
   - The local plugin / WooCommerce addon is the only owner of the approval
     and write path.

3. **Response text must never claim a write to WooCommerce.**
   - Forbidden phrases include (but are not limited to):
     - "已写入 WooCommerce"
     - "written to WooCommerce"
     - "product updated"
     - "changes applied"
   - Preferred phrasing:
     - "requires local approval"
     - "draft generated for review"
     - "suggestion only; not written"

4. **Task packs must not create Cloud workflow truth.**
   - No persistent workflow state, execution graph, or run history owned by
     the task pack.
   - Task packs may use transient compute; they may not become a second
     workflow engine or second control plane.

5. **Local plugin remains the only control plane.**
   - Final approval and all WordPress writes stay local.

## API Surface

| Method | Path | Scope | Idempotent |
|--------|------|-------|------------|
| POST | `/v1/task-packs/woocommerce-growth/analyze` | `task_pack:write` | Yes |
| POST | `/v1/task-packs/woocommerce-growth/batch-plan` | `task_pack:write` | Yes |

## Files

- `app/domain/task_packs/models.py` — domain models
- `app/domain/task_packs/service.py` — suggestion engine
- `app/api/routes/task_packs.py` — REST routes
- `tests/domain/test_task_packs.py` — domain unit tests
- `tests/api/test_task_pack_routes.py` — route integration tests

## Verification

Run:

```bash
pnpm run test:domain
pnpm run test:api
pnpm run check:perimeter
```

All tests must pass, including assertions for:
- `requires_local_approval: true`
- Absence of "已写入 WooCommerce" or "written to WooCommerce"
