# Magick AI Root Legacy Contracts

Status: reference-only migration snapshot.

These files were copied out of `/Users/muze/gitee/magick-ai-root` on
2026-06-24 before considering further cleanup of that legacy workspace. They are
kept here so Npcink Cloud and related local agents can review the old boundary
contracts without depending on the large historical `magick-ai-root` checkout.

The documents in this folder are not active Npcink package identities. They are
legacy boundary references used for review, migration context, and guardrails.

## Migrated Documents

| Legacy source | Local copy | Use |
| --- | --- | --- |
| `magick-ai/docs/contracts/cloud-responsibility-boundary-v1.md` | `magick-ai/docs/contracts/cloud-responsibility-boundary-v1.md` | Cloud must remain runtime/detail enhancement, not a second local control plane. |
| `magick-ai/docs/contracts/hosted-model-runtime-v1.md` | `magick-ai/docs/contracts/hosted-model-runtime-v1.md` | Hosted runtime, callback, routing profile, and local-vs-cloud execution boundary. |
| `magick-ai/docs/contracts/cloud-skill-execution-v1.md` | `magick-ai/docs/contracts/cloud-skill-execution-v1.md` | Retired local-gate note for Cloud skill execution ownership. |
| `magick-ai/docs/contracts/channel-delivery-matrix-v1.md` | `magick-ai/docs/contracts/channel-delivery-matrix-v1.md` | Channel delivery and exposure boundary. |
| `magick-ai/docs/contracts/local-product-surface-layering-v1.md` | `magick-ai/docs/contracts/local-product-surface-layering-v1.md` | Local product surface layering reference. |
| `ai/docs/contracts/cloud-service-layering-matrix-v1.md` | `ai/docs/contracts/cloud-service-layering-matrix-v1.md` | Service layering pointer for Cloud-owned layering. |
| `ai/docs/contracts/cloud-technical-stack-guardrails-v1.md` | `ai/docs/contracts/cloud-technical-stack-guardrails-v1.md` | Cloud stack guardrails and forbidden infrastructure expansion. |
| `ai/docs/contracts/cloud-addon-ui-ownership-matrix-v1.md` | `ai/docs/contracts/cloud-addon-ui-ownership-matrix-v1.md` | Cloud Addon UI ownership and detail-surface boundary. |

## Missing At Migration Time

Some older local skills referenced these paths, but they were not present in the
current `magick-ai-root` checkout when this snapshot was created:

- `magick-ai/docs/contracts/settings-shell-feedback-hierarchy-v1.md`
- `magick-ai/docs/rules/settings-shell-component-reuse-rules.md`
- `ai/docs/workflow/local-plugin-cloud-simplification-v2-plan.md`
- `ai/docs/design/settings-shell-panel-classification-v1.md`

If those references matter again, recover them from Git history instead of
assuming they still exist in the old local checkout.

## Current Policy

- New Npcink development must use the canonical repositories and package names.
- Do not copy retired `magick-ai/*` ids into active runtime calls.
- Treat these files as historical guardrails until their relevant parts are
  rewritten as current Npcink contracts.
