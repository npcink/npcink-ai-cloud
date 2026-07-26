# Public Frontend Release Code Closeout — 2026-07-26

Status: frontend source closeout candidate.

## Purpose

Freeze the public and authentication frontend at the current v1 information
architecture and close the remaining source-level release gaps without adding
new pages, a page builder, a second commercial truth, or a second WordPress
control plane.

This record covers code and visual-regression evidence. It is not production,
QQ review, legal, or GA approval.

## Scope

Included:

- public plan-catalog failure and partial-availability behavior;
- desktop and 390 px mobile visual contracts for login and registration;
- a current anonymous Admin login-gate visual contract;
- removal of obsolete Magick-era and unreachable authenticated Portal
  screenshots;
- release-checklist evidence that separates code completion from operator and
  deployment acceptance.

Excluded:

- new public or Portal features;
- changes to prices, plan ownership, entitlement activation, or site cooldown;
- changes to email, QQ, payment, or compliance configuration;
- production deployment and external review.

## Decisions

### Package actions fail closed with package truth

When `/open/plan-catalog` fails, is empty, or omits a tier, the frontend must
not display a stale price or retain an active Free, Plus, or Pro package
selection action. The affected tier renders `Not available / 暂未开放`.

Agency remains a quote-based support path. Its action stays available because
it does not invent a public price or start self-service checkout.

### Authentication visual truth follows current source

The old Portal login baseline showed retired Magick branding and preview-era
magic-link language. The broad legacy visual suite also expected authenticated
Portal, Billing, and Admin content without establishing a deterministic
authenticated state. Anonymous requests now correctly reach the current login
gates, so those screenshots were unreachable and no longer protected current
behavior.

The replacement contract covers:

- current Npcink AI user-service-center branding;
- QQ and email-code entry;
- account creation without site or credit provisioning;
- Free activation only after the WordPress Addon connects;
- desktop and 390 px mobile layouts.

Protected Portal routes now assert their redirect to the current login entry.
The Admin surface keeps one deterministic anonymous login-gate screenshot.

## Boundary review

- WordPress remains the ability, workflow, prompt, approval, final-write, and
  publishing control plane.
- Cloud remains hosted runtime and customer-visible service detail.
- Published plan versions and offers remain commercial truth.
- The frontend only projects current public plan facts and fails closed when
  they are unavailable.
- No new infrastructure, registry, workflow engine, or Cloud-side WordPress
  write path is introduced.

## Verification

Focused browser gates:

```bash
node ../scripts/run-cloud-frontend-playwright.js test \
  -c playwright.config.ts \
  tests/e2e/marketing-home.spec.ts

node ../scripts/run-cloud-frontend-playwright.js test \
  -c playwright.config.ts \
  tests/e2e/portal-login.spec.ts
```

Repository closeout also requires:

```bash
pnpm --dir frontend run type-check
pnpm --dir frontend run lint
pnpm --dir frontend run test:contracts
pnpm --dir frontend run build
```

GitHub required checks remain merge authority. M4 evidence is accepted only
after clean current `master` promotion and the relevant smoke.

## Remaining operator gates

The frontend must stay release-pending until the operator separately completes:

1. publication of the real operating entity, monitored contact, retention,
   deletion, refund, and third-party-service facts;
2. email delivery verification on the real public domain;
3. QQ callback and review-path validation on the dedicated review deployment;
4. clean merged-source M4 promotion;
5. production release smoke and external acceptance.

These facts must not be guessed, copied from development fixtures, or inferred
from a green frontend build.

## Change policy after closeout

Treat the current public and authentication frontend as frozen v1:

- accept release blockers, accessibility defects, broken links, inaccurate
  copy, and evidence-backed user-journey failures;
- do not add new homepage sections, dashboards, CMS/page-builder machinery, or
  thick Portal control features without repeated real-user evidence and a new
  bounded proposal.
