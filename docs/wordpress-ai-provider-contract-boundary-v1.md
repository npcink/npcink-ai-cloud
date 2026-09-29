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
- For accepted connector runs, Cloud keeps a content-free `ability_contract` summary
  inside the runtime policy evidence. It contains only the Ability identifier,
  contract source/version, schema hash, and verification state; input/output
  schemas, prompts, and WordPress content never enter this summary.
- Eval Lab consumes Addon acceptance reports. It never calls a Provider, registers an Ability, or writes WordPress.

## Contract status

The Addon and Cloud use these development verification states:

- `registered`: local Ability was discovered.
- `mapped`: a local task projection exists.
- `schema_valid`: input/output schemas and hash validate.
- `mapping_current`: the projection is ready for runtime execution.
- `contract_drift`: the local contract and mapped projection disagree.
- `unsupported`: no valid projection exists.

A missing source, invalid schema, or hash mismatch is a contract error. The Addon now fails closed before the Cloud Provider call for Toolkit contract absence, schema drift, identity/version drift, permission drift, and any non-current verification state. Detailed provenance remains in development acceptance evidence.

## Compatibility rule

Provenance metadata is additive at the Cloud boundary. Requests that predate these fields remain valid with the WordPress Abilities API default for backward compatibility. When provenance is present, Cloud validates the source and verification vocabulary and records the metadata supplied by the connector. The Addon performs the local baseline comparison: Toolkit-owned abilities are checked against the Toolkit contract source, while `ai/*` abilities remain sourced from the WordPress Abilities API.

## Change procedure

When an Ability schema or write posture changes:

1. Update the owning local source (WordPress Ability or Toolkit contract).
2. Recompute the stable schema hash.
3. Run Toolkit, Addon, Cloud, and Eval Lab contract tests in that order.
4. Run the Addon WP-CLI acceptance report without WordPress writes.
5. Promote only the merged Cloud revision to M4 and verify `acceptance_state=accepted`.

Cloud and Eval Lab must not become a replacement registry or approval plane.
