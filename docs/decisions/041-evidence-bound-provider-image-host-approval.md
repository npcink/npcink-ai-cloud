# ADR-041: Bind provider image host approval to persisted runtime evidence

## Status

Accepted.

## Date

2026-08-11.

## Context

Some image-generation providers return a short-lived HTTPS URL instead of
inline image bytes. Cloud downloads that URL only when its exact hostname is
present in the Provider connection's `image_output_hosts` allowlist. This
fail-closed boundary prevents provider responses from turning Cloud into an
arbitrary URL fetcher.

When an otherwise valid image-generation run returned an unknown host, the
runtime previously retained only a redacted log record. The Admin operator saw
`provider image host is not allowlisted`, but had to discover and copy the
hostname manually. Trusting a hostname sent back by the browser, automatically
learning hosts from ordinary provider responses, or accepting wildcard domains
would weaken the fetch boundary.

## Decision

On `host_not_allowlisted`, image materialization records one sanitized repair
projection in the existing Provider connection metadata:

- exact Provider connection ID;
- reason code;
- normalized hostname only;
- runtime run ID and Provider ID;
- observation time and review state.

No signed URL, query string, credential, response body, or image content is
persisted in this projection.

Admin exposes the contextual action:

```text
POST /internal/service/admin/provider-connections/{connection_id}/approve-image-host
```

The request carries only `evidence_run_id`. The server re-reads the current
pending projection and the referenced run, verifies that both identify the
same Provider as the connection, normalizes the recorded exact hostname, and
then appends it to the existing `image_output_hosts` configuration. The action
is idempotent at the host-list level and uses the existing Provider connection
audit and operator-receipt path.

The runtime never approves a host automatically. Manual exact-host editing
remains an advanced fallback.

SiliconFlow is treated as image-generation capable by the Provider preset and
by the compatibility projection for existing connections. This compatibility
rule does not choose a model or create a new routing truth; hosted runtime
profiles and the existing Provider catalog remain authoritative for candidate
selection.

## Alternatives Considered

### Automatically learn every returned host

Rejected. A compromised or malformed upstream response could expand the
network trust boundary without operator review.

### Allow provider-domain wildcards

Rejected. Wildcards make the approved fetch perimeter difficult to inspect and
can unintentionally trust unrelated tenant or storage hosts.

### Let the browser submit the hostname to approve

Rejected. Browser input is not trusted runtime evidence and could approve an
arbitrary public host.

### Add a separate repair table or host registry

Rejected. The latest actionable failure belongs to one existing Provider
connection and does not justify another registry, migration, or control plane.

## Consequences

- Unknown hosts continue to fail closed on the first run.
- Admin can repair the exact observed host with one contextual action.
- Approval remains explicit, audited, and bound to a durable run.
- Provider connection metadata stores only the latest bounded repair
  projection; it is diagnostic evidence, not a general event history.
- WordPress approval and final media-library writes remain local and unchanged.
- Cloud does not gain a second ability, workflow, prompt, preset, or WordPress
  write authority.

## Verification

- Domain tests cover safe evidence persistence, Provider/run matching,
  hostname normalization, append/deduplication, and stale evidence rejection.
- API tests cover authorization-path integration, audit receipt, and secret
  redaction.
- Admin contracts and PC browser evidence cover the detected-host state and
  contextual approval action.
