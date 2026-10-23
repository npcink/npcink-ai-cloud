# Cloud personal data copy v1

Status: implementation contract; runtime acceptance is recorded separately.

This bounded copy belongs to the authenticated Cloud principal and its single
active account membership, revalidated server-side. It is not a complete GDPR
or other legal compliance report. No WordPress data or final-write authority
moves into Cloud. Commercial reads and entitlements remain unchanged.

## Authorization and email

Both same-origin authenticated POST endpoints require a valid original cookie
or Bearer session version. No client-supplied account, principal or target email
is accepted. Multiple active account memberships are unavailable in v1. If a
site is selected, its current account binding must match the membership.

`POST /portal/v1/account/data-export/code` accepts `{ "locale": "en" }` (locale
optional; en / zh-CN / zh-TW). It sends an independent `data_export` code to the
current existing email. There is no persistent email-verified flag: successful
confirmation proves control for this operation only. Invalid/missing email or
an unavailable dedicated sender returns 503. No debug plaintext-code bypass is
supported. A successful response is `{ "data": { "challenge_id": "...",
"expires_in_seconds": 300 } }`; it never returns the email or code.

`POST /portal/v1/account/data-export/confirm` accepts only
`{ "challenge_id": "...", "code": "123456" }`. Codes expire after 300 seconds,
allow at most five failed attempts, and can be reissued no more than once per
60 seconds. Ten requests per principal/purpose per 60-second window are allowed,
including malformed inputs. Query-string payloads and extra fields are invalid.
The code binds principal, current email, account, membership ID/update timestamp,
role, principal/account update timestamps, scope/schema versions and original authenticated session version. Reissue expires the old
code; email, revocation, membership/account changes invalidate the old challenge.

The only writes are purpose-specific `PortalLoginCode` rows, including rate and
attempt counters. Ordinary JSON metadata is replaced as a whole. No migration
or commercial reconciliation is required. Neither endpoint claims a generic
idempotency receipt, even when an Idempotency-Key header is supplied.

## Projection and limits

Successful confirmation returns raw JSON with `schema: cloud-principal-copy.v1`,
`exported_at`, and `data` containing:

- `profile`: own ID, current email/status and public creation/update/login times;
- `membership`: own membership/account ID, role/status and creation/update times;
- `support_requests`: only own-created tickets in the current account, including
  title/description/status and public timestamps;
- `support_messages`: public messages on those tickets, own customer messages and
  operator replies. Operator principal/email and system/internal messages are excluded;
- `attachment_metadata`: sent attachments tied to selected public messages with
  matching account/request, own customer uploads or operator uploads on public operator replies;
  ID/message ID/name/content type/byte size/created time only;
- `notifications`: recipient principal AND account match; ID/event/title/body/read
  state/times only. Reading does not mark notifications as read.

Explicit columns exclude other members/customer messages, private metadata,
context, admin notes, source paths, links, OAuth subjects, tokens, site/provider
keys, attachment binaries, drafts, orders, ledgers, usage, runtime and knowledge
records. Free text remains the text shared in the conversation; this feature
does not promise automatic removal of manually pasted secrets from that text.

Limits are complete-or-fail: 100 tickets / 1000 messages / 500 attachment metadata
rows / 500 notifications, with limit+1 detection. SQL byte preflight precedes
free-text materialization. The precise UTF-8 JSON envelope must fit 2 MiB.
Overflow returns 413, never a partial file or silently truncated dataset.

Confirmation uses one PostgreSQL REPEATABLE READ transaction with account →
principal → membership → challenge locking. Concurrent scope changes reject the
snapshot; concurrent confirmations cannot both succeed. The operation budget is
5 seconds, with remaining-budget SQL/lock timeouts and a one-second connection
attempt. A dedicated short-lived connection avoids shared pool wait. SQL/lock
budget failures return 504; serialization/DB races return 409. Build/serialize,
size and timeout failures roll back consumption, so the code remains usable
until its normal expiry. Commit precedes response delivery: a lost successful
response requires a fresh code; no export response is stored or replayed.

## Delivery and verification

Backend and dedicated BFF responses use `Cache-Control: private, no-store`,
`Pragma: no-cache`, and `Vary: Cookie, Authorization` on success and failure.
Validation and transport errors never reflect payloads. No OTP, email, export
body or free text is added to logs, audit events or traces. The browser uses
transient Blob URLs, revokes them after initiating download and stores no code
or copy in localStorage, sessionStorage, IndexedDB or a URL.

Focused tests: `tests/api/test_portal_data_export.py`, data_export cases in
`tests/integration/test_portal_self_service_postgres.py`, and frontend
`portal-data-export` Vitest/Playwright specs. Fake delivery only. Local opt-in
PostgreSQL skips are not concurrency evidence; all new PostgreSQL cases require
real 0-skip M4 execution before delivery acceptance. The local builder does not
publish a PR or mutate M4; the assigned integrator owns those subsequent gates.
