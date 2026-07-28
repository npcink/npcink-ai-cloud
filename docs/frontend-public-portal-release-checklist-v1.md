# Frontend Public and Portal Release Checklist v1

Status: active.

## Purpose

This checklist governs the customer-visible Cloud website, Portal
authentication, package presentation, and external acceptance preparation. It
does not move WordPress content, settings, abilities, workflows, final
approval, or publishing truth into Cloud.

## Commercial truth

- `/open/plan-catalog` is the public package comparison projection.
- Portal package choices come from the current canonical account-accessible
  offers and published plan versions.
- Plus and Pro self-service checkout must use the canonical global offer IDs.
  Legacy account-scoped Plus or Pro rows must not override the published
  public price or remain directly purchasable.
- Customer sales amounts are stored and returned in CNY. Portal formatting
  must use each offer or order currency explicitly and must not reinterpret a
  CNY amount as USD.
- Payment and subscription orders retain their purchase-time amount and plan
  snapshots. Later price changes must not rewrite historical orders.
- Any change to package pricing must verify the same amount on the public
  package section, Portal package dialog, payment confirmation action, and
  newly created order.

## Authentication and package intent

- Public Plus and Pro actions use `plan=plus` or `plan=pro`.
- Registration validates that query value and preserves it through existing
  sessions, email verification, and QQ authorization.
- The post-authentication target is
  `/portal/billing?plan=<tier>&action=upgrade`; the package dialog opens with
  that tier selected, but payment still requires an explicit confirmation.
- Portal return paths must use the validated `redirect` parameter. External
  return URLs are not allowed.
- A sole active site may be selected automatically as the session context.
  Multiple active sites still require an explicit user choice.

## QQ login

- Keep QQ as a first-class action on the public entry, login, and registration
  surfaces.
- Use the unmodified standard QQ Connect mark bundled with the frontend. Keep
  one accessible button name; the decorative image has an empty alternative.
- Do not expose QQ client secrets, access tokens, callback state, or internal
  identity IDs in the browser.
- External QQ review still requires operator evidence: approved application
  details, registered callback domain, working privacy and terms URLs, a test
  account or documented review path, and screenshots from the deployed review
  environment.

## Public information and accessibility

- Mobile visitors must be able to reach capabilities, operating boundary,
  plans, service status, help, and sign-in without relying on desktop
  navigation.
- Public status reports only customer-verifiable availability, impact, and
  next steps. Account, site, provider, and run diagnostics remain authorized
  Portal projections.
- Public and Portal shells provide a skip link, keyboard-operable controls,
  visible focus behavior, and a single accessible name for icon or image
  buttons.
- Each public legal/help/auth route has distinct metadata. The sitemap and
  robots sitemap URL derive from `CLOUD_PUBLIC_BASE_URL`.
- The favicon and Open Graph image use the existing Npcink AI Cloud brand
  treatment; they do not introduce a separate logo system.

## Legal and human acceptance

Engineering may publish accurate product behavior and data-flow descriptions,
but it must not invent the legal operator, registered address, public contact,
retention period, refund promise, or regulatory qualification.

The platform-admin workspace at `/admin/site-compliance` is the canonical
entry point for these Cloud-owned public facts:

1. the service derives safe defaults from executable runtime/configuration
   evidence and lists currently enabled QQ, email, payment, and hosted-provider
   disclosure candidates;
2. the operator fills or corrects the real operator, contact, refund,
   retention, and third-party details;
3. **Save draft** stores a non-public version and reruns blockers/warnings;
4. **Publish to public pages** is available only for a saved draft with no
   blockers;
5. `/open/compliance` exposes only the published snapshot, which the privacy,
   terms, and help pages append to their maintained baseline copy;
6. a later publication supersedes the prior snapshot and retains bounded
   version history.

Do not enter secrets, provider tokens, customer data, qualifications, identity
documents, or payment credentials in this workspace. QQ App ID/secret,
callback, SMTP, and Alipay credentials remain under
`/admin/service-settings`. Qualification documents remain in the relevant
external platform.

The following current defaults have different evidence strength and must not
be flattened into one legal promise:

| Fact | Current source | Publication treatment |
| --- | --- | --- |
| AI runtime result maximum limited retention | runtime execution contract, currently 7 days | prefilled and marked enforced |
| plugin observability events | automated cleanup setting, currently 180 days | prefilled and marked enforced |
| audit evidence, currently 90 days | entitlement/public projection default only | warning until actual cleanup is confirmed |
| account, payment, and support records | maintained policy copy only | warning until actual retention/deletion is confirmed |
| refund request window, currently 14 days | current payment-order/product contract | prefilled; operator may correct before publication |
| automatic renewal, currently false | current product behavior | prefilled; must change if billing behavior changes |
| refund processing business days | no executable source | blocking operator input |
| operator and public contact | no trustworthy repository source | blocking operator input |
| third-party service candidate | enabled Cloud service/provider configuration | automatically suggested; loopback/private endpoints default to self-hosted, while operator classification, legal entity, and privacy details still require confirmation |

Before public production or QQ acceptance, the operator must supply and
approve:

1. legal operator name and any required registration information;
2. a monitored privacy/support contact;
3. final retention and deletion periods by record class;
4. payment, renewal, cancellation, and refund rules for the actual merchant;
5. the final list of authentication, email, payment, infrastructure, and model
   service providers;
6. legal review appropriate to the deployment jurisdiction.

Until those facts are approved, the authenticated ticket flow is the supported
request channel and production/external acceptance remains pending.

Before external self-service payment acceptance, complete one operator-recorded
real merchant exercise for each enabled purchase kind:

1. open the customer-visible package or credit-pack dialog and verify the
   purchase-time amount, validity, Terms, Privacy, and billing-support path;
2. complete payment through the configured merchant sandbox or approved live
   low-value lane;
3. verify that browser return alone grants nothing and that the server-side
   provider confirmation updates the order and entitlement exactly once;
4. exercise cancel, failed-payment, delayed-confirmation, refund-request, and
   authenticated support handoff paths;
5. record the deployment revision, offer/catalog version, order reference,
   provider evidence, screenshots, and operator conclusion without storing
   credentials or full tokens.

Mock browser tests and HTTP `200` responses are engineering evidence only; they
do not satisfy this merchant or external-customer acceptance.

Publication requires confirmed retention enforcement and, for every enabled
third-party candidate, its legal operator, privacy URL, and processing region.
Warnings such as missing filing information, missing service hours, or pending
legal review remain visible to the operator and must still be resolved before
real production/external acceptance even when they are not technical publish
blockers. See
`docs/decisions/028-versioned-public-site-compliance-projection.md`.

## Required verification

Before external onboarding acceptance, recruit 3–5 participants who did not
implement the feature and ask each participant to complete this task without
step-by-step prompting:

`enable Addon -> register or sign in -> bind the WordPress site -> confirm Free activation -> complete one normal hosted AI action in WordPress`

Record the exact deployment revision, participant role, completion result,
time-to-first-success, prompts requested from the observer, blocking step,
recovery result, and participant wording. Do not store submitted content,
credentials, verification codes, or provider payloads. A passing engineering
test is not a substitute for this exercise.

At minimum for a related change:

```bash
uv run pytest tests/domain/test_site_compliance.py -q
uv run pytest tests/api/test_service_routes.py -k site_compliance -q
uv run pytest tests/domain/test_subscription_commerce.py -q
pnpm --dir frontend run type-check
pnpm --dir frontend run lint
pnpm --dir frontend run test:contracts
pnpm --dir frontend run build
```

Run the focused Playwright paths for public, authentication, and Portal
commercial behavior. For Cloud source changes, dispatch the coherent candidate
to M4 with `pnpm run m4:preview:sync`, verify the relevant desktop and 390 px
mobile paths through the local preview tunnel, and inspect
`pnpm run m4:preview:status`.

GitHub required checks remain the merge authority. M4 candidate validation does
not become accepted runtime evidence until the merged PR is promoted from
clean `master`.

## Code closeout state

The 2026-07-26 public-frontend code closeout adds browser evidence for:

- a failed public plan catalog without stale prices or active Free, Plus, or
  Pro package actions;
- a partially available catalog that keeps valid tiers usable while missing or
  retired tiers fail closed;
- current login and registration layouts at desktop and 390 px mobile widths;
- current Admin login-gate layout;
- removal of obsolete Magick-era and unreachable authenticated Portal visual
  baselines.

These checks close frontend source and visual-regression gaps only. They do not
replace:

- operator publication of truthful compliance facts;
- real email delivery and QQ callback validation on the review deployment;
- clean merged-source M4 promotion;
- production release smoke or external acceptance.

See
[Public Frontend Release Code Closeout — 2026-07-26](public-frontend-release-code-closeout-2026-07-26.md).
