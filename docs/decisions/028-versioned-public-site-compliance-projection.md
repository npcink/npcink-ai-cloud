# ADR-028: Versioned Public Site Compliance Projection

## Status

Accepted.

## Date

2026-07-25.

## Context

The public privacy policy, service terms, help page, and QQ Connect review
materials need the real Cloud operator, contact, refund, retention, and
third-party service facts. Some facts already exist in executable
configuration or runtime contracts, while others can only be confirmed by the
operator:

- the runtime result time-to-live and plugin observability cleanup window have
  enforcement evidence;
- the current product contract supplies a 14-day refund-request default and
  does not currently implement automatic renewal;
- enabled QQ, SMTP, Alipay, and hosted provider connections identify
  third-party disclosure candidates;
- the legal operator name, public support commitment, refund processing time,
  provider legal entities, processing regions, and several actual
  retention/deletion periods cannot be inferred safely from source.

Hard-coding guesses in public pages would turn samples and implementation
defaults into unsupported legal promises. Publishing an incomplete admin form
directly would expose drafts. A second CMS or control plane would be
disproportionate and would blur the Cloud/WordPress boundary.

## Decision

Use the existing Cloud-owned `service_settings` store with
`setting_id=site_compliance` for one bounded, versioned compliance workspace.
Its non-secret JSON contains:

- one editable draft and its validation result;
- one immutable published snapshot;
- up to 20 superseded published snapshots;
- no credentials, provider tokens, callback state, or customer content.

The admin service derives safe defaults and current service/provider candidates
from executable Cloud configuration. Loopback, private-address, and local
hostnames default to self-hosted rather than third-party disclosure. The
operator can correct that classification and must confirm every retention
class plus the legal operator, privacy URL, and processing region for every
candidate classified as an external third party before publication.

Publication is an explicit idempotent admin mutation. Anonymous
`GET /open/compliance` returns only the current published projection. The
privacy, terms, and help pages retain their maintained baseline copy and append
the projection only when a published version exists. Drafts, validation
messages, review notes, history, and credentials never enter the public
projection.

This surface documents Cloud's own public service facts only. It does not:

- become a general page or menu CMS;
- own WordPress settings, content, abilities, workflows, approval, or writes;
- mutate runtime retention or deletion behavior;
- make legal decisions or represent a legal review;
- submit QQ qualifications or perform external platform acceptance.

## Alternatives Considered

### Hard-code the missing facts in public pages

Rejected. The repository does not contain a trustworthy real operator,
monitored public contact, provider legal-entity list, or complete enforced
retention schedule.

### Publish every admin edit immediately

Rejected. Partial edits and validation state would become customer-visible,
and an operator could not review one coherent version before publication.

### Add dedicated compliance tables and migrations

Rejected for this bounded first version. The existing `service_settings`
record already supports encrypted-secret separation and flexible non-secret
configuration. A separate relational model is warranted only if independent
documents, scheduled publication, multi-operator approvals, or unbounded
history become real requirements.

### Build a general page-management system first

Rejected. The immediate need is structured, validated service disclosure and
QQ review evidence. A general CMS expands layout, routing, content-security,
revision, and permission scope without improving the truth of these facts.

## Consequences

- Existing enforceable values can be prefilled without pretending every
  default is an enforced policy.
- Unknown operator facts remain visible blockers or warnings instead of being
  silently guessed.
- Public legal/help pages fail soft to maintained baseline copy if the
  projection is unavailable.
- Published changes are versioned and admin mutations are recorded without
  copying disclosure text into audit payloads.
- The current JSON snapshot is intentionally bounded. Future independent
  document workflows may require a new ADR and relational model.
- QQ Connect qualifications, real OAuth login, and external acceptance remain
  human/external gates on a deployed review environment.

## Rollback

Revert the admin routes, public projection route, frontend workspace, public
append component, tests, and this ADR through the normal GitHub workflow.
Existing `site_compliance` rows may remain ignored and contain no secrets.
Do not delete the shared `service_settings` table or other service-setting
records. The maintained baseline privacy, terms, and help copy remains
available without a published projection.
