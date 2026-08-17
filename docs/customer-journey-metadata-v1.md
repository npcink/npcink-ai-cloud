# Customer Journey Metadata v1

Status: candidate contract.

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
