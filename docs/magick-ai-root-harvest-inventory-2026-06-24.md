# Magick AI Root Harvest Inventory

Date: 2026-06-24

## Purpose

`/Users/muze/gitee/magick-ai-root` is an old aggregate workspace. The current
Npcink repositories have already split the active responsibilities across:

- `npcink-ai-cloud`
- `npcink-cloud-addon`
- `npcink-abilities-toolkit`
- `npcink-governance-core`
- `npcink-ai-client-adapter`
- `npcink-toolbox`
- `npcink-eval-lab`

This inventory records what is still worth learning from the old workspace
before deleting it. The rule is: migrate contract ideas and test expectations,
not old code wholesale. Old `magick-ai/*` names must be translated into current
Npcink contracts and tested against the active repositories.

## Already Migrated Into Cloud Docs

The following boundary references were copied into
`docs/legacy-contracts/magick-ai-root/`:

- `magick-ai/docs/contracts/cloud-responsibility-boundary-v1.md`
- `magick-ai/docs/contracts/hosted-model-runtime-v1.md`
- `magick-ai/docs/contracts/cloud-skill-execution-v1.md`
- `magick-ai/docs/contracts/channel-delivery-matrix-v1.md`
- `magick-ai/docs/contracts/local-product-surface-layering-v1.md`
- `ai/docs/contracts/cloud-service-layering-matrix-v1.md`
- `ai/docs/contracts/cloud-technical-stack-guardrails-v1.md`
- `ai/docs/contracts/cloud-addon-ui-ownership-matrix-v1.md`

These are the most important reusable Cloud/Core/Addon boundary documents.

## Cleaned From Old Workspace

The old workspace no longer needs dependency, build, cache, or test output
directories for inspection. The following regenerable directories were removed:

- `/Users/muze/gitee/magick-ai-root/node_modules`
- `/Users/muze/gitee/magick-ai-root/dist`
- `/Users/muze/gitee/magick-ai-root/.opencode/node_modules`
- `/Users/muze/gitee/magick-ai-root/magick-ai/node_modules`
- `/Users/muze/gitee/magick-ai-root/magick-ai/vendor`
- `/Users/muze/gitee/magick-ai-root/magick-ai/.phpstan.cache`
- `/Users/muze/gitee/magick-ai-root/magick-ai/coverage`
- `/Users/muze/gitee/magick-ai-root/magick-ai/test-results`
- `/Users/muze/gitee/magick-ai-root/magick-ai/.ai-cache`
- `/Users/muze/gitee/magick-ai-root/magick-ai-content-assistant/test-results`

After cleanup, `/Users/muze/gitee/magick-ai-root` is about 342M.

## Migrate Or Re-express

These items are worth turning into current Npcink docs, tests, or migration
maps when their target repo is touched.

| Old source | Value | Target |
| --- | --- | --- |
| `magick-ai-content-assistant/docs/domain-capability-backlog-v1.md` | Product-layer backlog for article, comment, and media assistance. It keeps Core out of SEO/comment/media roadmaps and keeps local features suggest-first. | `npcink-toolbox`, `npcink-abilities-toolkit`, `npcink-eval-lab` |
| `magick-ai-cloud-addon/docs/commercial-minimal-seam-v1.md` | Good Cloud Addon commercial boundary: addon displays entitlement and handoff only; Cloud owns billing truth. | `npcink-cloud-addon`, `npcink-ai-cloud` |
| `magick-ai-woocommerce-addon/includes/capabilities/abilities-commerce.php` and related tests | Commerce ability shape, Woo availability checks, normalization, and future namespace migration clues. | Separate commerce ability namespace migration map, then `npcink-abilities-toolkit` or future Woo addon |
| `magick-ai/docs/contracts/bridge-plugin-spec-v1.md` | Bridge declaration, redaction, and governed write chain. The fixed chain is `proposal -> approval -> commit`. | `npcink-governance-core`, `npcink-ai-client-adapter`, `npcink-abilities-toolkit` |
| `magick-ai/docs/contracts/open-api-route-access-v1.md` | Useful public catalog vs app-auth route boundary, but old route names use `/wp-json/magick-ai/open/v1`. | Re-express against current `/npcink/open/v1` routes before copying |
| `magick-ai/docs/contracts/mcp-prompts-resources-v1.md` | Strong MCP projection boundary: prompts/resources derive from governed workflow truth, not a second MCP registry. | Keep for future MCP/prompt/resource projection work |
| `magick-ai/docs/contracts/managed-geo-intelligence-v1.md` | Managed GEO stays cloud-enhanced intelligence; local adopt/apply remains local truth. | `npcink-ai-cloud`, `npcink-toolbox`, possible GEO task pack |
| `magick-ai/docs/contracts/router-performance-snapshot-cloud-projection-v1.md` | Cloud projection is bounded; WordPress remains router snapshot and apply truth. | `npcink-ai-cloud`, `npcink-governance-core` |
| `ai/docs/design/cloud-service-operator-design-system-v1.md` | Useful operator UI standard: diagnostic/admin surfaces should show scope, severity, reason, and status without becoming customer SaaS UI. | `npcink-ai-cloud` admin UI docs when admin UI is next touched |
| `ai/docs/migration/local-wordpress-cloud-integration-audit-v1.md` | Useful integration checklist, but naming and evidence paths are old. | Re-express only if documenting current `npcink-cloud-addon` + Cloud hosted runtime smoke path |

## Keep As Reference Only

These are useful context, but should not be migrated immediately:

- `magick-ai/docs/contracts/channel-delivery-matrix-v1.md`: already copied
  into legacy contracts; use it as the source for channel projection language.
- `magick-ai/skills/*`: harvest workflow ideas such as contract drift audit,
  PHP contract ratchet, targeted gate selection, review packs, session closeout,
  and WordPress article task flows. Do not copy old skill code directly.
- `magick-ai/docs/rules/dependency-security-audit.md`: useful as a security
  review checklist if dependency audit work restarts.
- Old runtime/application code under the aggregate workspace: inspect only when
  a specific feature gap appears in an active repo.

## Discard

These have no meaningful migration value:

- dependency directories, caches, coverage, build output, and test output
- old generated artifacts
- stale monorepo wiring that duplicates active split repositories
- old `magick-ai/*` route names or ability ids without a current namespace map

## Delete Gate

Before deleting `/Users/muze/gitee/magick-ai-root`, complete this checklist:

- [x] Push the already committed Cloud documentation updates.
- [x] Remove nested regenerable dependency/cache/build/test-output directories.
- [x] Write this harvest inventory.
- [ ] Review this inventory and decide whether any listed item should be copied
  now into a target repo.
- [ ] Run a final reference search for `/Users/muze/gitee/magick-ai-root` in the
  active repos and local agent skills.
- [ ] Decide the old workspace Git state: archive it, or intentionally discard
  its local-only commits and dirty files.

Current old workspace Git note: `/Users/muze/gitee/magick-ai-root` is still a
Git repo with local-only history and dirty files. Treat deletion as an explicit
discard/archive decision, not a mechanical cleanup step.
