# Portal session registry v1

Status: B3a local source candidate; independent review and runtime acceptance pending.
B2 was merged in #1241 (master `4aff7487`) and separately M4 accepted.
This document describes B2 activation and the B3a API contract; source, local
tests, CI, M4 and production remain separate states. No production deployment or cutover is authorized by this document.

## Scope and boundary

Cloud owns its Portal login sessions. This registry does not represent WordPress
users, Admin grants/sessions, site HMAC credentials, OAuth state, or anonymous
customer-journey IDs. No WordPress control-plane truth moves to Cloud. No TOTP,
commercial changes, cleanup worker, or new infrastructure is included.

B1 introduced ORM, Alembic schema, caller-transaction repository primitives and
separate signing/projection types. B2 connects all Portal issuance and Cookie/
Bearer validation together through a pure core encoder and transaction-owned
lifecycle service. The API attaches only material returned after commit. The
repository flushes but never commits; its list primitive is not an auth check.
B3a adds own-principal list and revocation commands; B3b UI remains a separate batch.

## Minimal storage

`portal_sessions` contains:

| Column | Meaning |
| --- | --- |
| `session_id` | Nonempty string, at most 64 characters, primary key; issuer generates a cryptographically random ID (for example `secrets.token_urlsafe(32)`). It is an identifier, not a bearer secret. |
| `principal_id` | Required FK to `principals`, no cascade deletion. |
| `session_version` | Required positive principal version at issuance. |
| `created_at` | Required timezone-aware UTC issuance timestamp, explicitly supplied. |
| `absolute_expires_at` | Required UTC expiry strictly after creation; no automatic renewal. |
| `revoked_at`, `revoke_reason` | Both null or both present; reason length 1..64, timestamp at/after creation. B2 logout uses `logout`; whole-principal invalidation remains version-derived. |
| `auth_method` | `email_code`, `registration`, or `qq`; not a second-factor claim. |
| `client_hint` | Optional browser/OS label, 1..120 characters; unverified and possibly absent or spoofed. |

No raw UA/IP, location, fingerprint, JWT, OTP, OAuth payload, or last-seen hot
writes. Client hint must be derived from a bounded allowlist in the future
issuer, never copied from raw request headers into this column. It cannot prove
physical device identity or merge sessions. B2 intentionally leaves hints unknown (`NULL`) and adds no UA parser.

Indexes support stable `(principal_id, created_at, session_id)` pagination and
expiry lookup. `list_active` orders creation then ID descending, limit 1..50,
offset >=0, filters own principal/active status/current version/unrevoked/unexpired
rows. It takes caller-supplied `now`; it does not update activity or imply future
cutover validity for a JWT. Owned lookup intentionally also finds revoked rows
for future idempotency semantics, without revealing another principal's rows.

`PortalSessionSigningMaterial` is an internal input shape; it contains no token.
`PortalSessionProjection` is a separate safe public shape with `is_current` and
bounded hint, without principal/version/secrets. B2 uses a separate internal `IssuedPortalSession` containing token and matching timestamps;
that value never enters public JSON, audit or idempotency receipts. Only its safe
time/transport metadata is serialized; B3a exposes the separate safe projection.

## B2 transaction and activation contract

The caller owns commit/rollback. When needed, lock account first, then principal,
then membership, then session rows in stable ID order, then proof/code. The
repository's explicit principal lock refreshes cached ORM state. B2 locks all discovered accounts in sorted order, then principals in sorted order,
then memberships; refreshes locked ORM state; and only then locks registry and
proof. Batch disable retains request result ordering while acquiring locks in
stable order. Login/registration discover existing identity without locking,
then lock and recheck before consuming code. New-registration unique constraints
and proof locks reject conflicting writers; no uncommitted token reaches HTTP.

B2 switches all issuers and both Cookie/Bearer verifiers together: email login
and remember-me, existing/new registration, existing/new QQ JSON/HTML, and dev
entry's normal backend verification. QQ bind must not create a login row. Same
clock and integer-second expiry must drive row, JWT and response metadata.
Proof/business changes, row creation and signing must succeed in one UoW before
HTTP cookie emission; no separate post-proof registry commit.

Validity after B2 is signed claims AND active principal/current version AND own
sid row with matching version/expiry, unrevoked and unexpired. Unknown/cross-owner
sid is rejected; DB failure yields the existing 503 envelope, never JWT-only
fallback. GET/session and site selection must not auto-register sid-less tokens.
Site rotation retains sid and absolute expiry and rechecks the original version;
it cannot read a newer DB version to resurrect a revoked caller.

Email change promotes only the authenticated current sid to its new version in
the same transaction, preserving expiry. Global `/session/revoke` retains its
existing all-sessions-including-current meaning. QQ unbind, closure, and Admin
single/bulk disable must share principal status/version locking. Data export
must recheck original sid inside its own locked transaction and bind its OTP to
sid/version; route-only auth misses races with individual revocation. These are part of the single B2 cutover; no separate verifier/issuer activation is supported.

Logout revokes the valid current sid and clears cookie; missing/expired/
already revoked cookie can still be cleared. DB failure must not be described as
successful server revocation. Revoking a Bearer sid does not delete client copies.

## B3a API and future B3b UI

The own-principal API requires no selected site, account membership or owner
role. It keeps snake_case Cloud envelope/meta, errors, same-origin and existing
idempotency receipts:

- GET `/portal/v1/sessions?limit=20&offset=0`: limit 1..50 and offset >=0;
  invalid pagination is 400. Returns `data.items` and
  `data.pagination: {limit, offset, total}`, ordered by created_at then SID
  descending. Items contain only session_id, is_current, created_at, expires_at,
  auth_method and nullable client_hint; active/current-version rows only.
- POST `/portal/v1/sessions/{session_id}/revoke`: owned revoked target is idempotent
  while caller remains valid; unknown/other owner's target both 404. Current sid
  revocation clears cookie and makes subsequent Cookie/Bearer calls 401.
- POST `/portal/v1/sessions/revoke-others`: retains verified current sid, no global
  version bump; static route must not be consumed by dynamic ID matching.

Both POST commands require the existing Idempotency-Key and return only
`data.revoked_count`. No cookie-clearing flag or token is stored in receipts.
Replaying a self-revoke receipt using another valid login does not clear that
login's cookie. Own already-revoked targets return count zero with a fresh key.
Revocation and receipt persistence retain the existing separate transactions:
if receipt persistence fails after the revoke committed, return 503 without
undoing the revoke. A fresh-key retry by a valid caller returns count zero.

All exits on this seam, including early forwarded-host rejection, framework
405, auth, receipt and unexpected failure, use `Cache-Control: private, no-store`,
`Pragma: no-cache` and `Vary: Cookie, Authorization` (preserving existing Vary).
Unexpected/DB failures return generic 503 without SQL or exception details.

Auth precedes receipt replay; writes and cached replay recheck the original
caller SID/version/expiry under account→principal→membership→sorted SID locks.
Clock validity is checked after lock waits, without replacing original claims.
List count and page share the same principal-serialized snapshot; GET never
writes or renews expiry. Commands own their transaction; repository methods
never commit.
A revoked caller cannot use a cached response to bypass auth. Response loss after
self-revocation can correctly lead to 401 on retry. Store no token/private body
in receipts. UI follows API in a separate batch, in account security; keep the
existing global revoke action and four primary navigation entries. Labels say
browser/OS hints rather than verified devices. TOTP/recovery remains separate.

## Migration, cutover and rollback

Migration `20261024_0090` follows actual unique head `20261023_0089`, checked at
implementation start. It creates schema only, without backfilling historical
sessions. It does not bump versions, invalidate tokens, or run any lifecycle.

B1 downgrade drops only its indexes/table, preserving principals. It is safe only
while no dependent runtime writes/readers are enabled and with any required data
retention handled. Do not treat schema downgrade as an auth rollback strategy.

B2 cutover T is the coordinated activation of this source revision across all API instances: all sid-less tokens become 401 and users
log in again. No infinite legacy path, automatic session registration, or sliding
compatibility TTL. Coordinate all API instances; mixed old verifiers cannot
promise individual revocation. M4 may use a disposable candidate identity for
re-login; never revoke shared demo sessions to manufacture proof. Production
cutover/deployment requires separate exact human authorization.

After individual revocation, restoring a JWT-only verifier would accept still
unexpired revoked tokens. Retain registry verification on rollback, or coordinate
stopped issuance/traffic and global invalidation of affected principal versions
before restoring an old verifier. Remove dependent consumers before downgrade.

## Evidence gates

SQLite repository tests prove caller rollback/commit, own scope, filtering and
stable pagination only. Metadata-created tables are not Alembic evidence.
The guarded `tests/integration/test_portal_self_service_postgres.py` retains B1's
real parent→head→downgrade→head, persisted-state, FK/no cascade, uniqueness and
check tests. B2 adds dual independent connections with a barrier at the actual
commit and observed `pg_blocking_pids` waits, testing both commit orders for
issuance vs revoke/disable, rotation vs logout, and export vs logout; failed
signing/commit must preserve pending proof. Existing consumer fixtures now include
0090 and explicitly registered sessions. Skipped PG tests are not concurrency proof. Its
runner accepts only disposable Compose PostgreSQL in test/development/preview;
no configured DB means skip, which is not PG proof. Keep 0089's tests unchanged.

B1 needs focused pytest, Ruff/mypy, changed plan/doctor, doc reachability/diff
checks, plus integrator-run real PG with zero skips. CI, M4 candidate, merge,
M4 accepted and production are separate evidence states. B2 additionally needs
all login/rotation/revocation/export concurrency and fail-closed tests; B3 needs
API ownership/replay, atomic failed-commit readback, and real PG races for
individual revoke vs revoke-others and export in both commit orders, plus
original-caller expiry during observed lock waits for command/replay. B3b
separately needs compiled browser tests. See
[verification commands](engineering/verification-commands.md) .
