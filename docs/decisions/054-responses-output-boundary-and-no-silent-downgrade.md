# ADR-054: Responses Output Boundary and No Silent Endpoint Downgrade

## Status

Accepted. This decision applies while the official WordPress AI pilot is in
technical validation and before natural traffic is enabled.

## Date

2026-09-20.

## Context

The configured upstream gateway can expose OpenAI-compatible Responses output,
but the gateway's response shape, completion status, and reported model are
not under Cloud's control. Earlier adapter behavior treated several upstream
shapes as interchangeable: it could select reasoning text before the final
message, accept incomplete envelopes, apply gateway-wide thinking defaults to
Responses, or silently retry a missing Responses endpoint as Chat Completions.
Those choices made a technically successful HTTP request look like a usable
WordPress suggestion and made provider evidence impossible to interpret.

The WordPress connector has a stricter contract than the upstream transport:
it needs a final usable answer, must preserve local review and write
ownership, and must not expose provider reasoning or raw diagnostic output.

## Decision

1. **Use an endpoint-specific Responses parser.** The adapter accepts final
   text only from a completed typed `message` item containing `output_text`,
   or the top-level `output_text` field. Reasoning items, unknown item types,
   and incomplete message items are not answer text.

2. **Fail closed on unusable completion state.** Responses with `incomplete`,
   `failed`, or `cancelled` status produce the structured
   `provider.output_contract_invalid` error with usage and status context.
   A reasoning-only or otherwise empty response follows the same output
   contract failure path in the connector.

3. **Never silently change endpoint semantics.** A Responses 404 or other
   endpoint incompatibility is reported as a Responses transport/provider
   error. The adapter does not retry the request as Chat Completions.

4. **Keep reasoning controls explicit and endpoint-appropriate.** Provider
   defaults that belong to Chat Completions are not injected into Responses.
   Responses reasoning options are passed only when the request explicitly
   supplies the supported Responses option.

5. **Separate model evidence.** The response keeps the requested model ID and
   the gateway-reported model ID as separate fields. The reported ID is
   evidence, not proof of the physical model used by the gateway.

6. **Sanitize the WordPress projection.** Raw Responses output items and
   response status remain adapter diagnostics. The WordPress-facing result
   contains only the normalized final answer, allowed tool calls, usage, and
   safe attribution fields.

7. **Keep schema validation at the connector boundary.** Title generation
   continues to require the declared strict JSON object schema. Plain text is
   not accepted as a successful title result merely because the upstream
   returned HTTP 200.

## Alternatives considered

### Retry Responses as Chat Completions

Rejected. It hides an endpoint or gateway configuration defect and changes the
requested protocol without an operator decision. It also invalidates provider
and model attribution.

### Prefer any text-like field in `output`

Rejected. Reasoning text and diagnostic fragments are not WordPress content.
Accepting them creates false quality success and can leak internal reasoning.

### Apply one gateway-wide thinking default

Rejected. Provider defaults are not portable across endpoint variants. The
requesting capability must choose an endpoint-compatible option explicitly.

### Treat HTTP success as content success

Rejected. A completed output contract is required for a usable suggestion;
transport status alone cannot establish that contract.

## Consequences

- Upstream gateway/model mapping defects remain visible and actionable rather
  than being hidden by a fallback.
- Some previously accepted responses now fail closed. This is intentional and
  keeps the WordPress review/write boundary safe.
- Natural traffic remains gated until a bounded real-provider run returns
  semantically usable title, summary, and rewrite outputs and passes the save
  checks.
- Future endpoint changes must add endpoint-specific fixtures and preserve
  separate requested/reported model evidence.

## Verification

The implementation is covered by the OpenAI adapter, WordPress connector, and
runtime contract tests. The focused local suite and the M4 candidate focused
suite pass; the rollout plan records the exact commands and the remaining
gateway-side failure.

## Rollback

Revert the Responses adapter and connector changes together with their tests
in one reviewed commit. Do not restore silent endpoint downgrade or a broad
text fallback. If an older gateway must be supported, add an explicit,
versioned compatibility decision with its own fixtures and expiration trigger.
