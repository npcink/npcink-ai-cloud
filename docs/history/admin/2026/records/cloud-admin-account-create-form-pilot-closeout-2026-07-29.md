# Cloud Admin Account Create Form Pilot Closeout

Status: time-bounded Admin historical evidence; not current Admin UI authority.

Current authority: [Admin UI Standard](../../../../cloud-admin-ui-standard-v1.md),
[Admin Frontend Engineering Standard](../../../../cloud-admin-frontend-engineering-standard-v1.md),
and [Admin Information Architecture](../../../../cloud-admin-information-architecture-v2.md).

Original status: accepted dependency-free form baseline.

Date: 2026-07-29.

## Scope

The pilot covers only the create-customer form on `/admin/accounts`.
It does not change the Accounts directory query model, backend API, Free-package
default, audit behavior, visual system, or any other form.

The prior route owned a five-field object, five field-specific update closures,
submit state, trimming, optional metadata projection, request dispatch, Toast,
dialog close, and refresh in one component. Native `required` validation also
accepted whitespace-only identifiers and names.

## Decision

Keep the extracted `CreateAccountForm` and its feature-owned validation and
payload model. Do not adopt React Hook Form or its Zod resolver for this form.

The retained implementation uses native controls and `FormData`. One validation
function trims all strings, rejects whitespace-only required values, and returns
a typed submit value. One payload function omits blank optional metadata. The
form owns field errors and async submit state; the route continues to own the
authoritative API request, Toast, close, and reload.

No new production dependency remains.

## Measured Evidence

The route was measured from production builds with the same command:

```text
pnpm run frontend:measure:route-bundle -- \
  --build-dir frontend/.next \
  --route /admin/accounts
```

| Build | Raw bytes | Gzip bytes | Delta from baseline |
| --- | ---: | ---: | ---: |
| Accepted Stage 2 baseline | 931,859 | 243,678 | — |
| React Hook Form + Zod resolver candidate | 1,233,069 | 319,062 | +301,210 / +75,384 |
| Retained dependency-free boundary | 933,131 | 244,133 | +1,272 / +455 |

The library candidate increased this route by about 31% gzip for five fields.
That cost did not match the burden removed, so the dependency was removed under
the engineering standard's stop condition. The retained solution adds about
0.19% gzip.

## Behavior Evidence

- whitespace-only Account ID and Name are rejected before transport;
- both errors are associated with their inputs and announced as alerts;
- invalid submission performs zero create requests;
- valid values are trimmed and blank optional metadata is omitted;
- the explicit `bind_default_free` choice and existing success semantics remain
  unchanged;
- unit model tests, structural contract, type-check, lint, focused Accounts
  Playwright, full frontend contracts, and production build pass locally.

An early interaction test found that nesting an error inside a `<label>` changed
the input's accessible name. The final markup uses `htmlFor`, stable IDs, and
`aria-describedby`. Future field errors must not mutate the label text exposed
to assistive technology or browser selectors.

## Acceptance Boundary

PR #356 passed the protected GitHub checks, merged, and was promoted from clean
current `master`:

```text
acceptance_state=accepted
promotion_pr=356
source_revision=0b3119c3725550ccf737a78b966b707ce2d68db7
source_branch=master
source_dirty=false
```

This proves reviewed source and M4 acceptance. It does not prove production
deployment, GA, or external human acceptance. No production deployment was
performed.
