# ADR-042: Use an operator-initiated probe to confirm provider image delivery

## Status

Accepted.

## Date

2026-08-11.

## Context

ADR-041 binds exact image-host approval to server-owned runtime evidence, but
an operator configuring a new image Provider should not need to trigger a
normal WordPress generation run merely to discover whether the Provider
returns Base64 bytes or a short-lived URL. Manual hostname guessing is both a
poor setup experience and unreliable because the delivery host can differ from
the Provider API hostname.

The discovery path still crosses the Provider billing and network boundaries.
It therefore must be explicit, must not trust a hostname supplied by the
browser, and must not weaken the existing fail-closed image download policy.

## Decision

Add an Admin-only, operator-initiated action:

```text
POST /internal/service/admin/provider-connections/{connection_id}/image-delivery-probes
```

The server uses the saved Provider connection and the first saved, currently
available image-generation model backed by a healthy `image_generations`
catalog instance. It requests exactly one harmless fixed test image. The UI
states before execution that the Provider may charge for this call.

The probe handles delivery formats as follows:

- Base64 bytes are decoded by the Provider adapter, sanitized, decoded, and
  validated by the existing image materialization boundary.
- A URL whose exact hostname is already allowlisted is fetched through the
  existing SSRF-safe Provider image fetcher and then sanitized and validated.
- A URL with an unknown hostname is not fetched. Only its normalized hostname
  is projected as approval-required evidence for explicit operator review.

The complete Provider URL, query string, signature, image bytes, prompt, and
credential never leave the backend and are not written to audit storage. The
latest bounded probe projection is stored in the existing Provider connection
metadata; no table, registry, queue, or scheduler is added. Approval reuses the
ADR-041 endpoint with `evidence_probe_id`, and still appends only one exact
hostname after server-side evidence revalidation.

URL delivery configuration may be saved without an approved host. That state
remains visibly incomplete and runtime downloads continue to fail closed until
the operator approves an exact observed host. Wildcards and automatic trust
expansion remain forbidden.

If the Provider connection changes while a paid probe is in flight, the
result is rejected as stale and is not persisted as approval evidence.

## Alternatives Considered

### Require a normal WordPress image-generation run

Rejected as the only setup path. It couples Provider configuration diagnosis
to local workflow execution and makes first-time setup harder to understand.
The runtime evidence path remains available for failures found during normal
use.

### Let the browser submit a URL or hostname to test

Rejected. Browser input is not Provider evidence and would create an arbitrary
network-target or trust-expansion seam.

### Automatically approve the hostname returned by the probe

Rejected. Discovery and trust approval are intentionally separate operator
actions. A compromised Provider response must not silently expand Cloud's
download perimeter.

### Maintain a Provider-to-image-host registry

Rejected. Delivery hosts may be deployment-specific or change over time, and
a second registry would introduce another source of truth without removing the
need to validate real delivery.

## Consequences

- Operators can discover the actual delivery format and exact hostname from
  the Provider configuration dialog.
- One probe may create a small Provider charge; development and automated
  verification use mocks and consume no paid Provider budget.
- A newly detected URL host still requires explicit approval and a second
  probe to prove that download and image validation succeed.
- Existing image sanitization, byte limits, DNS/public-address validation,
  HTTPS-only fetching, redirect rejection, and exact-host rules remain the
  enforcement authority.
- Cloud owns hosted Provider execution and diagnostic evidence only. WordPress
  remains the owner of human content approval and media-library writes.

## Verification

- Domain tests cover unknown-host discovery and approval, Base64 validation,
  approved-URL fetching and validation, and URL configuration that remains
  fail closed without a host.
- API tests cover Admin authorization integration, operator receipts, audit
  creation, and removal of media URLs and host details from audit payloads.
- Admin contracts and a `1440x1050` browser path cover the paid-action notice,
  exact-host approval, rerun state, and absence of horizontal overflow.

