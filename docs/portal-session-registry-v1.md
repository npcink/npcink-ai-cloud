# Portal session registry v1

Status: B1 dormant storage contract. This change does not issue or validate sid,
change login/logout, or enable session lists/revocation. Existing Portal
`Principal.session_version` authentication continues unchanged. Later B2/B3
requirements below are contracts, not delivered runtime capabilities.

## Scope and boundary

Cloud owns its Portal login sessions. This registry does not represent WordPress
users, Admin grants/sessions, site HMAC credentials, OAuth state, or anonymous
customer-journey IDs. No WordPress control-plane truth moves to Cloud. No TOTP,
commercial changes, cleanup worker, or new infrastructure is included.

B1 contains only ORM, Alembic schema, caller-transaction repository primitives,
distinct internal signing/public projection types, and storage tests. Repository
creation flushes but never commits; errors propagate to the transaction owner.
There are no production callers in B1. Its list primitive is not an auth check.

## Minimal storage

`portal_sessions` contains:

| Column | Meaning |
| --- | --- |
| `session_id` | Nonempty string, at most 64 characters, primary key; future issuer must generate a cryptographically random ID (for example `secrets.token_urlsafe(32)`). It is an identifier, not a bearer secret. |
| `principal_id` | Required FK to `principals`, no cascade deletion. |
| `session_version` | Required positive principal version at issuance. |
| `created_at` | Required timezone-aware UTC issuance timestamp, explicitly supplied. |
| `absolute_expires_at` | Required UTC expiry strictly after creation; no automatic renewal. |
| `revoked_at`, `revoke_reason` | Both null or both present; reason length 1..64, timestamp at/after creation. Future lifecycle defines stable reason codes. |
| `auth_method` | `email_code`, `registration`, or `qq`; not a second-factor claim. |
| `client_hint` | Optional browser/OS label, 1..120 characters; unverified and possibly absent or spoofed. |

No raw UA/IP, location, fingerprint, JWT, OTP, OAuth payload, or last-seen hot
writes. Client hint must be derived from a bounded allowlist in the future
issuer, never copied from raw request headers into this column. It cannot prove
physical device identity or merge sessions. B1 provides no hint parser.

Indexes support stable `(principal_id, created_at, session_id)` pagination and
expiry lookup. `list_active` orders creation then ID descending, limit 1..50,
offset >=0, filters own principal/active status/current version/unrevoked/unexpired
rows. It takes caller-supplied `now`; it does not update activity or imply future
cutover validity for a JWT. Owned lookup intentionally also finds revoked rows
for future idempotency semantics, without revealing another principal's rows.

`PortalSessionSigningMaterial` is an internal input shape; it contains no token.
`PortalSessionProjection` is a separate safe public shape with `is_current` and
bounded hint, without principal/version/secrets. B1 does not serialize either
onto an API or convert a row into trusted signing material.

## Transactions and future B2 activation

The caller owns commit/rollback. When needed, lock account first, then principal,
then membership, then session rows in stable ID order, then proof/code. The
repository's explicit principal lock refreshes cached ORM state. B1 does not
retrofit existing domain transactions or claim current login concurrency is
solved. Future issuance/revoke/Admin disable/closure must use one protocol;
code-first login transactions must be reordered and rechecked before activation.

B2 must switch all issuers and both Cookie/Bearer verifiers together: email login
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
sid/version; route-only auth misses races with individual revocation. These are
B2 obligations, not additions to dormant B1.

Logout later revokes the valid current sid and clears cookie; missing/expired/
already revoked cookie can still be cleared. DB failure must not be described as
successful server revocation. Revoking a Bearer sid does not delete client copies.

## Future B3 API and UI

Only after B2 acceptance, add own-principal sessions without requiring a selected
site or account owner. Keep existing snake_case Cloud envelope/meta, error,
same-origin/CSRF, private no-store and receipt semantics:

- GET `/portal/v1/sessions?limit=20&offset=0`: bounded stable active-only list.
- POST `/portal/v1/sessions/{session_id}/revoke`: owned revoked target is idempotent
  while caller remains valid; unknown/other owner's target both 404. Current sid
  revocation clears cookie and makes subsequent Cookie/Bearer calls 401.
- POST `/portal/v1/sessions/revoke-others`: retains verified current sid, no global
  version bump; static route must not be consumed by dynamic ID matching.

Auth precedes receipt replay; writes recheck caller under the principal lock.
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

B2's default cutover is explicit time T: all sid-less tokens become 401 and users
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
The existing guarded `tests/integration/test_portal_self_service_postgres.py`
module adds real parent→head→downgrade→head, persisted-state, FK/no cascade,
uniqueness, check constraints and two-connection transaction-lock proof. Its
runner accepts only disposable Compose PostgreSQL in test/development/preview;
no configured DB means skip, which is not PG proof. Keep 0089's tests unchanged.

B1 needs focused pytest, Ruff/mypy, changed plan/doctor, doc reachability/diff
checks, plus integrator-run real PG with zero skips. CI, M4 candidate, merge,
M4 accepted and production are separate evidence states. B2 additionally needs
all login/rotation/revocation/export concurrency and fail-closed tests; B3 needs
API ownership/replay and compiled browser tests. See
[verification commands](engineering/verification-commands.md) and
[Portal frontend implementation patterns](engineering/portal-frontend-feature-implementation-patterns.md).
