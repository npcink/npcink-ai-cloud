# ADR-043: Structured Site-Lifecycle Recovery Between Cloud and Addon

## Status

Accepted.

## Date

2026-08-13.

## Context

The Cloud Addon reported `auth.site_inactive` as “签名验证失败”, even though
the site was correctly bound and the credential was valid. This collapsed two
independent facts—credential authentication and service activation—into one
technical message. Users could not tell whether to reconnect, rotate a key,
or activate the site in Cloud.

The correction crosses two repositories and therefore needs one ownership
decision. Cloud knows the authoritative lifecycle and entitlement facts;
Addon knows the WordPress locale, settings surface, and recovery interaction.
Neither side should become the other side's control plane.

## Decision

Cloud exposes a bounded, additive recovery contract for an authenticated
inactive site:

- stable code: `auth.site_inactive`;
- contract: `cloud_site_activation_recovery.v1`;
- facts: `site_status=inactive`, `activation_required=true`,
  `action=activate_site`;
- configured `portal_url` when available.

The Addon preserves these fields and owns the localized presentation:

- “Connected, activation required”;
- “Activate this site in Cloud”;
- “Check activation again”.

The site remains fail-closed until activation and a later successful signed
probe. Credential ownership, expiry, revocation, scope, and lifecycle detail
are checked in that order; invalid credentials never learn lifecycle state.

## Alternatives considered

### Put all copy in Cloud

Rejected. Cloud would become responsible for WordPress localization, product
surface wording, and presentation compatibility. It also makes Addon releases
less independent.

### Let the Addon invent the lifecycle state from the English message

Rejected. Message parsing is brittle, not localizable, and risks treating a
different authorization failure as activation-required. The Addon must use the
stable error code.

### Automatically activate or swap sites from the Addon

Rejected. Activation and account-wide replacement are Cloud/Portal operations;
silent changes could interrupt another site and would turn the Addon into a
second account control plane.

### Keep the generic signature-failure message

Rejected. It is technically safe but operationally ambiguous and increases
support cost without improving security.

## Consequences

- Users receive an actionable recovery path without weakening authorization.
- Cloud and Addon can evolve independently behind a versioned contract.
- Older Addons remain safe through a generic fallback.
- The contract requires coordinated Cloud-first then Addon release ordering.
- A merged Cloud change and an M4-accepted Cloud runtime still do not publish
  the Addon package; package release is a separate closeout step.

## Verification

Cloud PR [#695](https://github.com/npcink/npcink-ai-cloud/pull/695) passed all
required checks and merged to `master` at
`372d7e841ec38adcc413362b055a76e10451d0db`.
The inactive-site focused test passed on the M4 candidate. The later
clean-master M4 promotion was accepted with healthy API/frontend services and
clean accepted-source status.

Addon PR [#87](https://github.com/npcink/npcink-cloud-addon/pull/87) passed its
PHP, i18n, release, and behavior gates and merged at
`23d1e6fb64501e1e7622286e9991ab4893901322`.

The remaining release requirement is packaging/publishing the Addon version
that contains the UX change. That is intentionally separate from this Cloud
documentation change.

## Rollback

Revert the Cloud and Addon PRs through normal reviewed changes. Preserve site
bindings, keys, usage, and audit history. Never bypass inactive-site rejection
or repair production state with direct database edits.
