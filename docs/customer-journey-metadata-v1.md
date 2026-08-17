# Customer Journey Metadata v1

Status: active contract.

## Purpose and boundary

This contract records bounded product-journey metadata so non-technical user
trials can be diagnosed without asking users to describe technical failures.
Cloud owns only metadata ingestion, retention, funnel summaries, anomalous
session references, and diagnostic defect candidates. WordPress remains the
owner of content, prompts, approval, preflight, and final writes.

The signed endpoints are:

- `POST /v1/customer-journey/events`
- `GET /v1/customer-journey/summary`

The authenticated Portal producer endpoint is:

- `POST /portal/v1/sites/{site_id}/customer-journey/events`

Both require the existing site HMAC contract and `stats:read`. Writes also
require `Idempotency-Key`. The authenticated site is authoritative; no client
site identifier is accepted.

The Portal endpoint uses the existing Portal session/bearer authentication,
same-origin and write guards, idempotency replay, and site-membership
authorization. It accepts only `surface=portal` and the Portal-owned `login`,
`site_connect`, and `support` journeys; the path site is authoritative.
The initial browser producer records one site-scoped authenticated
`login/succeeded` event per browser session and `site_connect/succeeded` after
the addon connection is issued. Delivery is best-effort and cannot block the
Portal action or redirect.

## Event contract

`contract_version` is `customer_journey_event.v1`. A batch contains 1–100
events. Every event contains only allowlisted scalar metadata:

- stable `event_id`;
- optional trial `cohort_id`;
- rotating opaque `anonymous_session_id`;
- `surface`: `portal` or `wordpress_editor`;
- bounded `journey` and `step` enums;
- optional bounded error category/code and duration;
- optional Cloud `run_id`, accepted only when it belongs to the authenticated site;
- optional coarse browser family and desktop/mobile viewport class;
- `occurred_at`, limited to 31 days in the past and five minutes in the future.

Cloud hashes both event and session identifiers with the authenticated site
before storage. Their raw values are never persisted or returned. Summary
session references expose only a short prefix of the server-side session hash.

## Forbidden data

The schema is closed and rejects unknown fields. It cannot carry:

- prompt, input, generated text, edited text, post/comment body, ALT text;
- email, username, WordPress user id, cookie, nonce, token, key, or secret;
- arbitrary URL, query string, route parameters, DOM, form values;
- arbitrary exception message, stack trace, request, or response body;
- approval, preflight, publishing, router, preset, or WordPress write controls.

## Retention and use

Raw events are retained for 30 days by default and purged by the existing ops
retention cadence. Read models may expose bounded funnels, error counts,
anomalous session references, and P1/P2 defect candidates. Candidates are
diagnostic suggestions only and never authorize an automatic product change,
approval, publication, or WordPress write.

Initial rules combine absolute counts and rates because early trial cohorts are
small. Examples include repeated failures, success below 80% with at least
three attempts, the same bounded error at least three times, accepted
generation without an explicit save, three retries, and interactions over five
seconds. Abandonment-style candidates wait for a 30-minute session settlement
window. Summaries are explicitly bounded to the newest 20,000 events and report
when that sample was truncated.

## Consent and product disclosure

WordPress collection is site-level and opt-in. A WordPress administrator must
explicitly enable metadata-only monitoring, may disable it at any time, and is
shown that the data can be associated with the connected site. An ordinary
editor does not grant or manage this site authorization during a task.

The disclosure must state in plain language that monitoring is used to improve
reliability and product usability, and that it does not collect article text,
prompts, account identity, or free-form error messages. The data must not be
used for advertising, individual employee scoring, automatic approval, or an
automatic WordPress write.

Portal events use authenticated site membership and the existing Portal
privacy notice. They remain bounded product-operation metadata; authentication
does not widen the event schema.

## Initial operating model

The initial observation surface is the existing read-only summary. Do not add
a dashboard, clickstream platform, user profile, or automated remediation loop
before real cohort evidence demonstrates that the bounded summary is
insufficient. The operator reviews funnels, recovery rates, accepted-then-save
rates, bounded errors, and anomalous sessions manually and opens a normal
defect or product-change task when the evidence justifies one.

One event, one session, or one successful path cannot establish product value.
Keep these evidence states separate:

1. source implementation and deterministic contract checks;
2. M4 candidate preview and accepted `master` revision;
3. production source and deployed runtime revision;
4. Addon package release and the revision actually installed by a site;
5. consenting non-author user behavior and bounded human observations.

## Implementation and release evidence

The initial Cloud implementation reached `master` through PR `#750`, merge
commit `95db18f8`. Site-scoped Portal producers reached `master` through PR
`#751`, merge commit `6063d0b7`. M4 accepted the latter `master` revision after
promotion of PR `#751`.

The WordPress producer reached the Addon `master` branch through PR `#99`,
merge commit `8cb0b9b`; translation and consent-copy corrections followed in
PRs `#100` and `#101`, ending at `8355b1b` on the evidence date recorded in
the pre-user closeout.

These source and M4 facts do not prove production availability. Before a
formal non-author cohort begins, verify independently that:

- the intended Cloud revision is promoted to `production`, deployed, and
  projected by live runtime health;
- the Addon revision containing the producer and current disclosure is
  available through the intended distribution channel and installed on each
  cohort site;
- the public privacy notice matches the shipped behavior;
- the site administrator has explicitly enabled monitoring;
- each editor has consented to the bounded cohort observation;
- the read-only summary returns events for the exact site and observation
  window without prohibited fields.

Production promotion, Addon publication, public-site publication, and human
recruitment each require their own authorization and evidence. No source merge
or documentation change grants that authorization.
