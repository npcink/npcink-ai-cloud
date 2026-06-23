# Cloud Addon UI Ownership Matrix v1

> Status: active
> Canonical Source: this AI contract front door.

## Scope

This file freezes the navigation-level ownership rule for Cloud addon UI work until a deeper product contract is promoted under `magick-ai/docs/contracts/`.

## Rules

- `magick-ai-cloud-addon/**` owns hosted credential entry, addon status, addon-local compatibility notices, and links into the Cloud service.
- Core `magick-ai` owns the final local control plane, WordPress permission checks, model routing enablement truth, and any canonical run/status/result seam.
- Cloud service UI owns hosted account, billing, service health, and service-plane operations.
- A Cloud addon UI change must not create a second control plane for abilities, workflows, MCP, Agent Gateway, or WordPress writes.

## Verify

- Use `pnpm run check:cloud:addon-seam` for addon seam changes.
- Use `pnpm run check:risk` when a change crosses credentials, transport, permissions, or public contract boundaries.
