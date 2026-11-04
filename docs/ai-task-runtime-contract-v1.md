# AI Task Runtime Contract v1

Status: active; aligned with the P1 connector reset.
Updated: 2026-10-20.

## Decision

Cloud consumes the active `ai_task_contract.v1` projection inside the
`request` of a `wordpress_operation.v1` operation. The WordPress operation is
carried by the neutral Cloud connector envelope:

- outer ability: `npcink-cloud/connector-runtime`;
- outer contract: `cloud_connector_runtime.v1`;
- channel: `editor`;
- required connector fields: `site_url`, `platform_kind=wordpress`,
  `connector_id=npcink-cloud-addon`, `connector_version`, and
  `suggestion_only=true`;
- operation contract: `wordpress_operation.v1` with a task and a bounded
  scene request.

There is one active connector envelope. The superseded WordPress-shaped
envelope, validator, aliases, and legacy compatibility path are not part of
the current contract.

## Projection Shape

The `task_contract` remains an optional field inside the WordPress operation's
scene request. When present, it projects only:

- the registered local Ability name and task identifier;
- one allowlisted task family;
- allowlisted context requirements and output constraints;
- the Ability-owned output JSON Schema;
- the mandatory `suggestion_only` write posture.

The projected task must match the enclosing WordPress operation task. Cloud
validates the bounded vocabulary and JSON Schema size, then uses those runtime
facts for hosted provider preparation and result normalization. A valid task
projection can describe a registered task without adding a Cloud-side Ability
registry.

The current fixed WordPress operation allowlist may omit `task_contract`.
That is a current `wordpress_operation.v1` mode, not an alias or fallback to a
superseded connector envelope.

## P2 Text Scene Input

The fixed `title_generation`, `content_summary`, and `content_rewrite` tasks use
one text scene input shape:

- `request.source_text` is required, must be a string that remains nonempty
  after trimming, and is limited to 12,000 characters after trimming;
- `request.prompt` is forbidden for these three tasks; there is no prompt and
  `source_text` dual-read or compatibility path;
- `request.system_instruction` is optional; when present it must be a string,
  is trimmed before execution, may be empty after trimming, and is limited to
  12,000 characters after trimming. It carries the local Ability-owned
  instruction projection separately from the source text.
- `request.existing_title` is optional and allowed only for `title_generation`;
  it carries the current WordPress title as bounded read-only context so Cloud
  can avoid returning the unchanged title.

Contract failures use stable `wordpress_operation.*` errors:

- missing, blank, or non-string `source_text`:
  `wordpress_operation.source_text_required`;
- source text above the limit: `wordpress_operation.source_text_too_large`;
- any `request.prompt` field on these tasks:
  `wordpress_operation.prompt_forbidden`;
- non-string `system_instruction`:
  `wordpress_operation.system_instruction_invalid`;
- system instruction above the limit:
  `wordpress_operation.system_instruction_too_large`.
- invalid or oversized existing title context:
  `wordpress_operation.existing_title_invalid` or
  `wordpress_operation.existing_title_too_large`.

For title and summary tasks, WordPress projects the relevant current content as
`source_text`. For a rewrite task, WordPress projects only the selected text.
Cloud treats embedded markers such as `<content>` or `<block-content>` as opaque
text. It validates the bound, sends the normalized source text once as the
provider scene input, and does not parse the markers or create prompt truth.

## Ownership Boundary

WordPress owns Ability discovery, permission callbacks, input/output schemas,
instructions, user interaction, review, approval, audit, and final writes.
Cloud owns hosted execution, bounded context retrieval detail, provider
routing, usage and entitlement evidence, observability, and result
normalization.

This contract must not become a second Ability, prompt, workflow, or channel
registry. Public operation input rejects generic messages, tools, streams,
credentials, signed headers, connector control fields, and direct WordPress
write controls.

Cloud returns `cloud_connector_result.v1` suggestion evidence. It never treats
runtime success as approval or applies the result to WordPress.

## Result Usage Projection

`cloud_connector_result.v1` may carry a top-level `usage` object that is a
**sibling of `output`** (never nested under `output`):

```json
{
  "contract_version": "cloud_connector_result.v1",
  "output": { "output_text": "…" },
  "usage": {
    "tokens_in": 24,
    "tokens_out": 8,
    "total_tokens": 32
  }
}
```

Rules:

- Source of truth is provider-call evidence (`tokens_in` / `tokens_out` on
  recorded provider calls), not raw provider `output.usage`.
- Aggregation sums **all** provider calls for the run (primary text/vision plus
  any side calls that recorded evidence), not the primary call alone.
- When at least one provider-call row exists, Cloud includes `usage` with
  nonnegative integers even if both totals are zero. When no provider-call
  evidence exists, `usage` is omitted.
- `usage` stays outside `output` so `no_store` omission of durable `output`
  content does not drop loggable token totals on the execute response or on the
  durable envelope.
- `cost` is not projected onto the WordPress suggestion envelope.
- Addon mapping for AI request logs: `usage.tokens_in` → `tokens_input`,
  `usage.tokens_out` → `tokens_output`.

## Title Generation Quality Floor

For `title_generation`, Cloud applies a small deterministic output floor after
provider normalization. It rejects empty or unusable suggestions when they:

- exceed the 80-character title boundary;
- repeat the current title or a supplied scene heading;
- contain boilerplate, only vague filler, or repeated punctuation;
- introduce an explicit version or year claim that is absent from the scene
  input; or
- fail the declared title output schema.

Mixed Chinese and Latin text is recorded as a review finding rather than
rejected, because product and project names such as WordPress and Typecho are
valid in Chinese titles. Rejection reasons use the existing
`provider.output_quality_rejected` error and its `output_quality_reason`
usage evidence. Accepted suggestions keep the official WordPress result shape
unchanged; any non-blocking title finding is retained only in internal provider
call evidence and is not added to the `title` result field.

Cloud does not claim to decide whether a title is publish-worthy. WordPress
continues to own the editable suggestion, human review, and final write.

## Change And Rollback Rule

Changing or removing `ai_task_contract.v1` requires one coordinated update to
the local producer, `wordpress_operation.v1` validation, Cloud runtime tests,
and the consuming addon. Rollback restores that coordinated version; it must
not restore the superseded connector envelope or introduce dual reads.


### Bounded schema validation for connector results

The title-only Provider projection retains the Ability-owned `title` property.
Cloud validates its existing string type, enum and min/max length constraints
on the raw title value and again on the normalized text returned for review.
Trimming or Markdown cleanup must not return a value outside those constraints.
Other root fields are not added to this title-only projection as new required
Provider output; the original Ability schema is preserved unchanged.

The existing JSON-object matcher checks numeric `minimum`/`maximum` bounds
recursively for number/integer fields (including comment-analysis scores).
Booleans do not count as numbers. Non-finite floats and non-JSON numeric tokens,
including exponent overflow in open fields, are rejected; arbitrary-precision
integers do not require conversion to float.

These are bounded connector-side checks, not a full JSON Schema implementation
or verified Provider-native constrained generation. `pattern`, combinators such
as `oneOf`, and other unimplemented schema keywords are not new guarantees.
The existing transport format-hint compatibility retry, runtime retry/fallback,
usage accounting and WordPress review/write ownership remain unchanged.
