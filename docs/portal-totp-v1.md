# Portal TOTP v1

Status: T1 storage (#1245) and the restricted T2 login/management boundary
(#1247, `0a0cdbad1ec629f64e1b7bf7a50ba2b3b8138d3c`) are historical merged
and M4-accepted deliveries. The current SELF06/07 candidate mounts public
setup/start and setup/confirm and adds the complete Portal Account consumer.
It is local candidate source, not a new M4 acceptance or production delivery.
Real PostgreSQL, strict `@live`, independent reviews, required CI, M4 candidate
and merged/accepted identity checks remain separate pending gates. No new
migration or production operation is included. The historical receipts in
[the seven-session closeout](history/engineering/2026/seven-chat-phase1-closeout-2026-10-24.md)
prove the earlier restricted delivery only, when setup was not mounted.

## Ownership and activation boundary

Cloud owns its Portal identity storage. This does not represent WordPress users,
Admin sessions, site HMAC or a second WordPress control plane. Existing Portal
Cookie/Bearer, login, site selection, export and revocation semantics stay intact.
There is no new library, protocol, migration, task, raw device data or commercial write.
The candidate publicly composes the existing setup router alongside the integrated
issuers/verifiers; enabled-principal second-factor gates remain mandatory.
Email login codes are a first factor, not TOTP or second-factor proof.

## Storage schema

Migration `20261024_0091` was allocated after observing unique head
`20261024_0090`. It adds three tables and four nullable session evidence columns.
It does not backfill evidence, create factor rows or change principal versions.

| Table | Stored state and invariants |
| --- | --- |
| `portal_totp_factors` | Unique principal FK without cascade; positive persistent factor version; disabled/enabled; independent active and pending encrypted seed slots. Disabled requires no active seed/enabled time/counter. Enabled requires nonempty active ciphertext, enabled time and positive recovery generation. Counter is null or nonnegative; generation is nonnegative. Pending ID/ciphertext/creation/expiry are all absent or all present with expiry after creation. Pending setup ID is unique. Updated time is not before creation. |
| `portal_recovery_codes` | Random bounded ID, principal FK without cascade, positive factor version/generation, nonempty salted hash, creation and nullable consumption time at/after creation. No plaintext. Old generations remain history; T2 must compare the factor's current generation. |
| `portal_auth_challenges` | Random bounded ID and nonempty credential hash, principal FK, purpose login/setup/disable/recovery_reset, primary method/time, original principal/factor/generation bindings, expiry, bounded attempts and nullable consumption time. Login has no original SID binding; every management purpose requires original SID and expiry together. No arbitrary metadata or redirect URL. |

Challenge state is derived from expiry, attempts, consumption and original scope
bindings; a challenge is never a Portal session and has no account/site access.
Factor binding zero explicitly represents no factor row at primary proof time;
principal session version remains strictly positive. A missing/corrupt factor
must never be interpreted as a successful second factor. Secret hash verification,
counter acceptance, attempts, setup, enable, reset and consumption are T2 work.

Session evidence permits legacy (all four new columns null), primary-only
(primary_authenticated_at only), or complete MFA (positive factor_version,
primary_authenticated_at, second_factor_verified_at >= primary time and method
totp/recovery_code). Partial evidence is rejected. `iat` is not an authentication
time. Existing issuers leave these columns null. New internal evidence types do
not enter the B3a six-field public session projection or JWTs in T1.

## Repository, transaction and lock contract

Repository primitives use the caller's Session, flush without committing, refresh
locked ORM state, and scope recovery/challenge lookups to the owning principal.
They do not enable factors, verify codes, consume recovery codes or issue tokens.
Unique factor insert occurs only after the caller's principal lock; it must not
upsert over an existing factor. Multiple IDs must be locked in sorted order.

The future shared order is accounts → principals → memberships → factors → SIDs
→ recovery IDs → challenge IDs → email/OAuth proofs, sorted within each class.
Skipping unused classes is allowed; acquiring earlier classes late is not.
B3a's current account/principal/membership/SID order is unchanged in dormant T1.
T2 must discover identity and factor requirements before locking primary proofs,
not append a factor lock at the end of an issuer that already holds a proof lock.

## Seed encryption and maintenance inventory

`encrypt_portal_totp_seed` / `decrypt_portal_totp_seed` wrap the existing rde.v1
HKDF/Fernet family with the fixed `portal_totp_seed` purpose and runtime encryption
root/key ID. Seeds must be nonempty. JWT secrets are not encryption roots.
Wrong purpose/root, unknown key and malformed/missing ciphertext fail closed.
No seed, otpauth URI or plaintext recovery code belongs in receipts, audit,
exports, analytics or logs. The ciphertext record's repr also omits ciphertext.

The existing inventory expands from five to seven kinds:
`portal_totp_active_seed` and `portal_totp_pending_seed`. Each non-null slot is
counted, including expired pending state. Empty or unversioned seed ciphertext
is an error, not an absent slot. The collector loads only its owned factor
columns; writeback changes only the respective ciphertext slot. Version, counter,
generation, timestamps and challenge/recovery consumption are not changed.

Inventory/dry-run/verify do not write. Apply requires the existing explicitly
confirmed exclusive maintenance window, locks factor rows in principal order,
checks plaintext roundtrip and atomically commits or rolls back all replacements.
The new purpose has never used the historical SHA-derived unversioned Fernet
scheme: old seed rde envelopes are decrypted using only an explicit key_id→root
mapping with their original HKDF context. Original five-kind historical recovery
keeps its existing algorithm. Normal authentication gains no old-key fallback.
Concurrent user lifecycle and maintenance without an exclusive window is not
claimed safe; T2 must revisit that complete lock graph before activation.

## Historical schema compatibility and fail-closed behavior

Before querying factor ORM rows, the collector inspects the same connection's
schema and Alembic revision DAG. A complete metadata-created test schema may
lack alembic_version. A versioned complete schema must include the T1 revision
in its ancestry. Unknown or multiple revision markers are rejected.

Only a single known revision from 0068 through a strict pre-T1 ancestor may
legitimately omit all three new tables and all new evidence columns. Historical
0068 also legitimately has no portal_sessions table. Such a schema reports zero
for both new kinds while preserving all five original collectors. Revision names
are not compared lexically. Partial TOTP tables/columns, missing new tables at a
T1-or-later revision, and unversioned incomplete schema fail closed. There is no
broad UndefinedTable fallback or silently empty inventory for damage.

## Evidence gates and rollback

SQLite tests prove state constraints, caller rollback/readback, owned queries,
seed isolation and inventory roundtrip/rollback, not PostgreSQL locks/migrations.
The existing guarded Portal PG module retains historical0090 Core/reflection
reads instead of loading new ORM columns against old tables. Runtime B2/B3a
fixtures migrate to0091; B1's parent→0090→parent floor remains explicit.

The integrator must separately run both gates, with zero skips/errors and exit0:

- Existing Portal random-schema runner:
  `pnpm run m4:preview:test -- --focused tests/integration/test_portal_self_service_postgres.py -q`.
  It proves parent→0091→parent→0091, old SID/version/expiry preservation, actual
  checks/FK/uniqueness, transaction locks with independent connections, slot
  inventory and flushed-write rollback. It does not prove TOTP authentication.
- Historical `tests/integration/test_runtime_data_encryption_0058_to_0068.py`
  uses its own documented `NPCINK_CLOUD_P1_E06_POSTGRES_ADMIN_URL`, loopback PG16
  and two disposable source/recovery databases. It is not a Portal schema target
  and must not be inserted into that runner or pointed at a shared/prod database.
  Existing18-ciphertext cutover/recovery/CLI checks must retain both new kinds at0.

Downgrade refuses any row in the three new tables or any non-null new session
proof. With empty dormant storage, it removes only T1 additions and preserves
existing sessions/principals. No activation rollback may bypass factor gates or
restore a JWT-only verifier. Once enabled, T2 recovery/rollback requires a separate
coordinated plan; disabling UI is not equivalent to disabling second-factor
requirements. Local, independent review, CI, M4 candidate/accepted and production
are separate evidence states.

## T2 integrated boundary and wire contract

The candidate ordinary app composes public setup, login challenge completion,
disable/reset and count-only status. `app/api/main.py` mounts `setup_router`
alongside the existing router; API tests use this actual application composition
instead of adding a test-only mount. Public activation is candidate behavior
and must not be described as deployed or accepted before the remaining gates.
Enabled-principal verification remains active independently of the Account UI.

All email login/remember-me, existing registration, QQ JSON/HTML and the shared
session issuer return a restricted outcome for enabled principals. HTTP200 on a
primary proof is not authenticated: `data` contains only
`{status: "second_factor_required", expires_at}`; there is no account/site
projection or new complete registry row. An old session cookie is cleared.
The credential is only in `portal_totp_challenge`, HttpOnly, SameSite=Lax,
Secure on HTTPS, path `/`, max-age300. It is not a Portal JWT, ordinary Bearer,
account/site credential or a URL parameter. QQ HTML redirects only to
`/portal/challenge`; completion navigation can use `/portal`, not an arbitrary
client redirect. QQ OAuth proof and challenge commit together.

| Endpoint | Request / result |
| --- | --- |
| `GET /portal/v1/totp/status` | Current full session required; returns `enabled` and current-generation `recovery_codes_remaining`, never seed/hash/proof. |
| `GET /portal/v1/totp/challenge/status` | Uses only the HttpOnly challenge cookie; returns `status: pending|expired|consumed|attempts_exhausted` and `expires_at`. It never accepts the credential in a URL/body and never issues a full session. |
| `POST /portal/v1/totp/challenge/complete` | Restricted cookie plus `{code, method: "totp" | "recovery_code"}` (defaulttotp); success returns normal session data, `status: "authenticated"`, sets full-session cookie and clears challenge. |
| `POST /portal/v1/totp/disable/start` | Current full session with trusted recent primary; creates purpose/SID-bound challenge cookie. |
| `POST /portal/v1/totp/disable/confirm` | Current full session + challenge cookie + code/method; disables factor and returns replacement full session. |
| `POST /portal/v1/totp/recovery-reset/start` | Same recent-primary gate, purpose recovery_reset. |
| `POST /portal/v1/totp/recovery-reset/confirm` | Same proof inputs; replaces generation, returns replacement full session and eight recovery_codes exactly once. |
| `POST /portal/v1/totp/setup/start` (candidate public) | Recent-primary full session, disabled factor only; creates new pending slot and returns setup_id, secret, otpauth_uri exactly once plus challenge cookie/expiry. Replacing pending invalidates the previous setup binding. |
| `POST /portal/v1/totp/setup/confirm` (candidate public) | Full session, setup challenge cookie and `{setup_id, code, method: "totp"}`; enables, consumes matched counter, returns replacement full session and eight recovery_codes once. |

The challenge status bootstrap is cookie-only and carries no credential in its
URL, request body, or response. Its projection keeps `status:
second_factor_required` and uses `challenge_status` for `pending`, `expired`,
`consumed`, or `attempts_exhausted`; missing or invalid cookies return HTTP 401
with `auth.portal_factor_invalid` and `challenge_status: missing`. Completion
keeps HTTP 401 with the same error code: a wrong code that can still be retried
returns `challenge_status: retryable` and `attempts_remaining`; the final wrong
code returns `challenge_status: attempt_limit` with `attempts_remaining: 0`.
Expired, consumed, exhausted, or invalid bindings return terminal status. Clients retain
the form only for `retryable`; terminal or missing states clear local challenge
state. The challenge cookie is never used as an Authorization Bearer token, and
the status endpoint never issues a full session.

Sensitive routes require same origin, private no-store, no-cache and Cookie/
Authorization Vary, including framework validation/error exits. They never claim
an idempotency receipt, even if the client supplies Idempotency-Key. There is no
secret replay endpoint. A successful lifecycle response lost after commit must
be recovered by fresh login and another protected recovery reset, not by
replaying a response containing codes/seed. Missing runtime encryption roots,
corrupt seed, database or signing errors fail closed with unavailable response;
no plaintext/root is returned.

### Recent primary and trusted session proof

New non-factor sessions store primary_authenticated_at at actual verified
primary login; old rows remain legacy, not silently upgraded. Management requires
a current full session whose stored primary time is no more than300seconds old
and not in the future. Legacy/stale returns401
`auth.portal_primary_reauthentication_required`: the client must ask the user to
log in again. Fresh email, registration or QQ login qualifies equally. For an
enabled principal that login itself requires the current second factor; each
management confirmation still requires a separate current factor/recovery proof.
There is no global reusable `recently_verified` boolean and JWT iat never stands
in for primary authentication. Cookie/Bearer, export, closure, Admin invalidation,
rotation and registry commands all retain the shared verifier. Enabled subjects
require a matching factor_version plus complete stored second-factor proof;
unsigned/arbitrary mfa_ok claims cannot substitute. If a factor tombstone is
missing but MFA-session history exists, primary issuance fails503 rather than
falling back to email-only. Active MFA rows also fail validation if their factor
is missing. Disabled tombstones are retained.

### RFC profile, transactions and failure budgets

The codec fixes RFC6238 SHA1, six decimal digits, 30seconds, ±1counter. It uses
stdlib HMAC with published RFC vectors; no new dependency or encryption format.
All uses (pending confirmation, login, disable, reset) share the locked factor
watermark and accept only a matched counter strictly greater than it. Future-step
acceptance advances that same watermark. A recovery credential is bounded random
ID plus192-bit secret, independently salted PBKDF2 hash, exact owned-row lookup,
current factor version/generation and single consumption. Eight codes are emitted
only once; old generations remain non-valid history. Reset preserves seed and
counter, increments recovery generation; enable/disable increment factor version.
Every lifecycle command increments principal session_version and issues only the
operation browser's new SID, preserving its original absolute expiry. New version invalidates all old complete sessions
and challenges actually bound to that version.

Challenge IDs are random; the complete opaque credential (ID,256-bit secret and
original server-selected session TTL) is hashed in storage. Tampering any part
fails hash validation. Remember-me lifetime is the original bounded issuer TTL;
completion accepts no TTL or auth-success flag. No schema addition is required:
head remains0091 and T1 historical migrations are unchanged.

Challenge purpose, expiry, attempts, primary freshness, principal session version,
factor version and recovery generation are checked under principal/factor locks.
Management additionally binds original SID and exact original absolute expiry;
its caller is revalidated under the SID lock. New login challenges have no SID:
single/others revocation does not erase unrelated fresh login challenges.
Global revoke, email change, closure, Admin disable and lifecycle version changes
invalidate challenges by their actual versions/status. Account/membership scope
is checked again before completion. Setup challenge ID equals its pending ID;
a replacement pending cannot be confirmed using an old challenge.

Wrong TOTP/recovery increments that challenge's attempt_count and commits failure
accounting before returning401. Five failures exhaust one challenge. Sum of
attempts on all of the principal's challenges in the last900seconds is limited
to15 under the same principal lock; replacing a challenge does not clear it.
Credential/scope/expiry rejection occurs before business mutation; invalid scope
must never use an attempt commit to persist business writes. Public primary
verification has a separate persisted principal/email-discovery and trusted
transport-peer window, independent of code resend or debug delivery; factor
routes also persist peer and management-principal request windows. Arbitrary
forwarded client identifiers are not trusted. Unknown challenge credentials are
not allowed to spend a victim's stored challenge budget.

Accounts → principals → memberships → factor → sorted SIDs → exact recovery row
→ challenge → primary proofs is the shared order. Email/registration/QQ callers
acquire factor before primary proof; issuer only reads that factor later and
never acquires a late factor lock after proof. Principal serialization protects
absent-factor insert and aggregate budgets. No locking is added to historical
T1 migration sources or B3a public projections. Re-signing/site/email rotation
retains the original row proof and absolute expiry.

Signing occurs before commit. Signing/commit failure rolls back challenge,
watermark, recovery consumption, factor/generation/version and registry/business
state together. A completed commit remains consumed if response delivery fails.
Tests distinguish those outcomes with final DB readback and locally scoped
fault patches restored before teardown.

### Historical T2 evidence gates and future activation gate

For the merged T2 batch, the gates below were executed and recorded: real
PostgreSQL `101/101` plus original TOTP API `32/32`, strict PC replay `16/16`
with no page errors, compiled BFF private-response checks, and independent A01/
C1-s review. M4 accepted is recorded separately from production. These results
are historical evidence for #1247; any future activation change must run a new
candidate through the same gates. Local SQLite API/domain/RFC tests and
sequential scenario replay are not real PostgreSQL acceptance. The guarded existing PG module retains all75 T1 cases
and appends T2 counter/challenge/recovery single-consume, enable-vs-primary,
completion-vs-disable/reset/global revoke/Admin disable/email change/closure, and
SID-bound management-vs-single/others races. Actual independent connections,
observed lock waits and final row/authentication assertions must run on B02's
controlled PostgreSQL lane with zero skips/errors and schema cleanup. The old
0058→0068 dedicated two-database recovery gate stays separate. No runner allowlist,
shared environment or historical migration was changed by this backend batch.
Whole-backend A01 review, complete C1 consumer review, joint browser proof,
real PG, required CI, M4 candidate, merged and accepted were completed for
#1247 and remain distinct evidence states. Production and public activation are
still separate future gates.

## SELF06/07 Account consumer and candidate verification

The PC Account page keeps one “登录与安全” section and adds an inline authenticator
row beside the existing session controls. Setup shows a manual Base32 key (no
QR dependency); setup accepts only a six-digit TOTP. Protected recovery reset
and disable accept the current TOTP or a recovery code and retain the same
trusted recent-primary gate. Challenge expiry is capped by primary time +300s:
299s can leave a usable challenge; exactly300s leaves no challenge lifetime and
is rejected. Refreshing a JWT does not extend this boundary.

A dedicated same-origin no-store client sends one request without automatic
retry or idempotency receipts, validates bounded wire fields, and never keeps
raw error bodies or causes. Confirmation first synchronously adopts a validated
replacement Session through an authentication-epoch guard, retires old
load/select results, then displays exactly eight recovery codes once. Session
Context is reconstructed from public Session fields and never contains codes,
seed or URI. No refresh or automatic site selection is inserted between commit
and the one-time display.

Seed, proof, URI and codes live only in component/request memory. Saved, cancel,
expiry, route exit, logout, changed authentication, pagehide and bfcache restore
clear them; pagehide synchronously scrubs secret DOM text/input before freezing.
Late responses cannot restore retired secrets. Focus rereads current cookie
state before another write; an in-flight operation becomes explicitly uncertain.
A lost response may follow a committed rotation: clear all secrets, never
repeat confirm automatically, reread Session/status or require fresh ordinary
login and a protected reset. There is no retrieval of an earlier code batch.

The source includes focused unit/API tests, public-route PostgreSQL readback
and post-commit response-loss cases, a compiled standalone BFF matrix, and
`portal-totp-activation.spec.ts` with explicit `@contract`/`@live` lanes. CI runs
the deterministic `@contract` suite with its own standalone build/server, then
runs the compiled BFF script against that same `.next` artifact.
`@contract` uses synthetic responses and cannot prove real database behavior.
`@live` requires a controlled compiled frontend/backend/PG and injected disposable
primary credentials; missing inputs fail rather than skip or mock success.
Sensitive tests disable trace, screenshots, video, HAR and page-text snapshots
(`PLAYWRIGHT_NO_COPY_PROMPT=1`); assertions/reporting must contain only safe
booleans/counts. Historical M4 results are not evidence for this candidate.

Remaining delivery gates: the parent serial lane must run the entire guarded
PostgreSQL module (no skip counted as pass), real `@live`, independent backend
and consumer reviews, exact-head required CI, M4 candidate and merged-source
acceptance. Production is not performed or authorized by this candidate.
