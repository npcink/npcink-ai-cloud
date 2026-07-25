# Public Plan Catalog And Homepage Display v1

Status: active.

## Purpose

The public homepage must explain the four customer package levels without
creating a second commercial source of truth in frontend code or a future page
management system.

Public package order and aliases are:

`Free < Plus < Pro < Agency`

## Source Of Truth

- Published `plan_versions` own package limits and entitlements.
- Active global `plan_offers` own public Plus and Pro prices.
- Free is an included, zero-price entry package.
- Agency remains account-bound and quote-based. The anonymous public surface
  must never invent or expose a fixed Agency price.
- Page-management content may own headings, positioning copy, FAQs, and menu
  placement. It must not own package prices, limits, purchase mode, or trial
  eligibility.

`GET /open/plan-catalog` is the bounded anonymous read projection. It exposes
only public aliases, published comparison fields, active global offer amounts,
and the shared trial posture. It does not expose account context, internal
metadata, provider configuration, costs, or mutation controls.

## Failure Posture

- A missing or retired Plus/Pro offer renders as unavailable instead of falling
  back to a hard-coded price.
- Missing published limits render as unavailable.
- Agency continues to render as a request/quote path and does not become
  anonymous checkout.
- The Portal remains the authenticated place for eligibility, checkout,
  account-specific quotes, and the final commercial decision.

## Homepage Contract

The homepage:

- includes a `套餐 / Plans` navigation anchor;
- compares Free, Plus, Pro, and Agency in that order;
- shows AI credits, connected sites, concurrent runs, and batch size;
- marks Pro with a text `推荐 / Recommended` label rather than color alone;
- explains that Plus, Pro, and Agency share one paid-plan trial;
- routes Free, Plus, and Pro toward registration and Agency toward the
  authenticated support/request path.

## Verification

- API test confirms the anonymous endpoint needs no Portal session and does not
  expose account fields.
- frontend type-check and lint pass;
- the marketing-home browser test stubs the public catalog and verifies all four
  prices/rights states;
- desktop and mobile screenshots are reviewed before deployment.
