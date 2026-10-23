# Portal TOTP storage v1

Status: T1 dormant source candidate, pending independent review and real PostgreSQL
acceptance. This is storage and maintenance support only. No factor is enabled
for a real principal; no setup, challenge, recovery, issuer or frontend entrypoint
is connected. TOTP is not available to users from this change. Production remains
separately authorized. See [Portal sessions](portal-session-registry-v1.md).

## Ownership and activation boundary

Cloud owns its Portal identity storage. This does not represent WordPress users,
Admin sessions, site HMAC or a second WordPress control plane. Existing Portal
Cookie/Bearer, login, site selection, export and revocation semantics stay intact.
There is no new library, flag, route, task, raw device data or commercial write.
T2 must integrate all issuers/verifiers and clients before enabling any factor.
Email login codes are a first factor, not TOTP or second-factor proof.

## Dormant schema

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
  `pnpm run m4:preview:test -- focused tests/integration/test_portal_self_service_postgres.py -q`.
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
