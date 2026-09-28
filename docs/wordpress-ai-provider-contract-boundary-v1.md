# WordPress AI Provider contract boundary v1

This document defines the contract provenance path for the WordPress AI Provider integration:

```text
WordPress Abilities API / npcink-abilities-toolkit
  -> npcink-cloud-addon projection
  -> npcink-ai-cloud validation and runtime evidence
  -> npcink-eval-lab offline acceptance
```

## Sources of truth

- `ai/*` abilities are defined by the WordPress Abilities API and the official WordPress AI plugin. The Addon projects their registered input/output schemas.
- `npcink-abilities-toolkit/*` abilities use the Toolkit contract endpoint as their contract source. The Toolkit exposes stable schema hashes and `contract_source=npcink_abilities_toolkit`.
- The Addon is a projection and validation boundary. It does not register a second Ability catalog, change prompts, or own WordPress writes.
- Cloud validates and records the optional provenance fields `ability_id`, `contract_source`, `contract_version`, and `schema_hash`. Cloud does not register Abilities or override local schemas.
- Eval Lab consumes Addon acceptance reports. It never calls a Provider, registers an Ability, or writes WordPress.

## Contract status

The Addon and Cloud use these development verification states:

- `registered`: local Ability was discovered.
- `mapped`: a local task projection exists.
- `schema_valid`: input/output schemas and hash validate.
- `mapping_current`: the projection is ready for runtime execution.
- `contract_drift`: the local contract and mapped projection disagree.
- `unsupported`: no valid projection exists.

A missing source, invalid schema, or hash mismatch fails closed before the Cloud Provider call. WordPress receives its normal connector error shape; detailed provenance is kept in development acceptance evidence.

## Compatibility rule

Provenance metadata is additive. Requests that predate these fields remain valid with the WordPress Abilities API default. When provenance is present, Cloud validates the source and verification vocabulary and records it in runtime metadata. This preserves existing official-plugin behavior while making contract drift diagnosable.

## Change procedure

When an Ability schema or write posture changes:

1. Update the owning local source (WordPress Ability or Toolkit contract).
2. Recompute the stable schema hash.
3. Run Toolkit, Addon, Cloud, and Eval Lab contract tests in that order.
4. Run the Addon WP-CLI acceptance report without WordPress writes.
5. Promote only the merged Cloud revision to M4 and verify `acceptance_state=accepted`.

Cloud and Eval Lab must not become a replacement registry or approval plane.
