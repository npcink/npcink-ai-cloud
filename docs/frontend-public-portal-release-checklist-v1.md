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

## Required verification

At minimum for a related change:

```bash
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
