# Production WordPress Round-Trip Validation Runbook v1

Status: active controlled-validation runbook.

Purpose: prove one real operator journey through WordPress, the Cloud Addon,
Npcink AI Cloud, and one hosted provider call without manufacturing users,
usage, adoption, or commercial evidence. The runbook also fixes the expected
time budget, evidence boundary, and exact cleanup method so future operators
and AI sessions do not rediscover the same production topology manually.

This runbook does not authorize deployment, first-install finalization,
external-user access, bulk/media expansion, or Provider calls beyond the
declared experiment budget.

## 1. Fixed ownership boundary

The only accepted product path is:

```text
WordPress Ability
-> standalone Cloud Addon transport
-> Npcink AI Cloud runtime
-> hosted provider/model
-> suggestion or temporary artifact returned to WordPress
-> operator review
-> explicit local adopt/save action
-> WordPress final write
```

WordPress remains the ability, review, approval, final-write, revision, and
cleanup truth. Cloud may own hosted execution, usage, entitlement, provider
evidence, temporary artifact bytes, delivery evidence, and artifact purge.
Cloud must not publish, import, or mutate WordPress content directly.

One operator fixture proves only operator-path functionality. It does not prove
real-user acceptance, natural reuse, content quality, commercial viability, or
GA readiness.

## 2. Time and Provider budget

Use three lanes instead of investigating every seam during the paid production
call:

| Lane | Purpose | Provider budget | Expected operator time |
| --- | --- | ---: | ---: |
| Local or M4 fixture | UI, failure recovery, zero-write-before-save, unique write, and cleanup behavior | 0 | 10-30 minutes |
| Production read-only preflight | revision, migration, lifecycle, health, identity, entitlement, quota, ledger, and rollback facts | 0 | under 5 minutes when the standard script passes |
| Production real call | only the credential, network, hosted model, metering, and real delivery facts that fixtures cannot prove | normally 1 | one bounded operator journey |

Declare the maximum Provider calls before opening the production UI. Use the
repository Provider call ledger when a real Provider experiment is planned.
Do not retry, regenerate, optimize, or create another task merely to make the
report look complete. A failed call consumes the declared budget unless the
provider evidence proves no dispatch occurred.

The first visible result time, Cloud run duration, Provider latency, local
request duration, and cleanup time are separate measurements. Do not report a
later screenshot timestamp as the first success time.

## 3. Required identities and immutable inputs

Record before execution:

- production source revision and sole Alembic revision;
- public Cloud endpoint;
- WordPress URL and real plugin checkout;
- Addon checkout and revision;
- `site_id` and `account_id`;
- active site/account/subscription/entitlement state;
- hosted provider and namespaced model;
- current `used`, `remaining`, `limit`, ledger count, run count, Provider call
  count, and positive grant/adjustment count;
- known rollback release and first-install lifecycle state;
- experiment ID, maximum Provider calls, and exact requested task.

Never put an SSH key path, Provider key, site secret, database credential,
internal token, prompt text, WordPress content, or customer data in the checked-
in receipt.

## 4. Read-only production preflight

Run from a trusted operator workstation with a separately supplied SSH target
and identity file:

```bash
pnpm run production:wordpress-roundtrip:readiness -- \
  --ssh-host <host> \
  --ssh-user <user> \
  --identity-file <path> \
  --site-id <site_id> \
  --account-id <account_id> \
  --expected-source-revision <40-hex> \
  --expected-migration <revision> \
  --expected-used <used> \
  --expected-remaining <remaining> \
  --expected-limit <limit> \
  --expected-ledger <count> \
  --expected-runs <count> \
  --expected-provider-calls <count> \
  --minimum-observation-hours 24
```

Add `--run-id` and `--artifact-id` when checking an existing round-trip receipt.
The command is read-only. It streams the checked-in inspection code to the
host, locates exactly one container for every required production service, and
returns one JSON receipt. It does not install a file on the server or read
protected configuration values.

Stop before any Provider call when the receipt is `blocked` or `error`, when
the lifecycle or rollback boundary is unclear, or when any expected quota or
ledger value differs. The receipt deliberately sets
`claims.finalize_authorized=false`: mechanical readiness never grants
first-install finalization.

### Internal no-user active-soak mode

The ordinary 24–72 hour observation remains required when external users,
public trial traffic, or natural workload exists. When the operator explicitly
declares that there are no external users and no natural traffic, one bounded
30–60 minute active soak may satisfy only the first-install internal-validation
observation item. This replaces empty elapsed time with event-driven evidence;
it does not weaken the later real-user gate.

Run the default 30-minute, 60-second-interval soak from the trusted operator
workstation:

```bash
pnpm run production:internal-validation:active-soak -- \
  --ssh-host <host> \
  --ssh-user <user> \
  --identity-file <path> \
  --site-id <site_id> \
  --account-id <account_id> \
  --expected-source-revision <40-hex> \
  --expected-migration <revision> \
  --expected-used <used> \
  --expected-remaining <remaining> \
  --expected-limit <limit> \
  --expected-ledger <count> \
  --expected-runs <count> \
  --expected-provider-calls <count> \
  --approval 'Approved for internal no-user active soak by operator.'
```

The command repeatedly invokes the existing read-only readiness inspection. It
fails when release, migration, lifecycle, container identity/start time,
restart count, image identity, site/account, entitlement, quota, ledger, run,
or Provider-call totals change. Every sample also reuses the governed internal
operational-readiness helper to check the required worker heartbeats, worker
container stability, and `/health/operational-ready`. It makes no Provider request and does not
contact WordPress. The receipt records non-health `502` evidence as `not
measured` unless a separate governed log query supplies it; absence of that
measurement must not be presented as a zero count.

This substitution does not waive the real WordPress round trip, backup/restore,
rollback, controlled CVE gate, operator review, or separate finalize approval.
It proves no real-user acceptance, natural reuse, quality demand, or commercial
viability. If any external user or natural traffic is introduced, discard this
substitution and use the ordinary 24–72 hour observation window.

## 5. WordPress-side zero-write baseline

Use the real WordPress UI for the operator action. CLI evidence must avoid
loading unrelated plugins and themes where possible, because a full WordPress
bootstrap may dispatch due Cron events and change Cloud usage independently of
the test.

Immediately before the Provider request, record:

- post, revision, and attachment counts;
- current maximum post ID;
- the target post ID when a text task is used;
- browser console and network start point;
- Cloud quota, ledger, run, and Provider-call baseline from the read-only
  receipt.

If an unrelated Cron or worker task changes usage, preserve it as a separately
identified side effect and establish a new baseline. Do not conceal it or
attribute it to the Provider call.

No post, revision, attachment, metadata, or publication write may occur while
the suggestion or image is only being generated and reviewed.

## 6. Execute one real operator journey

Use one high-frequency task first. Text title, summary, or rewrite may be used
when they fit the experiment. A first-install media lifecycle check may use one
image only when separately authorized. Do not expand into media search, bulk
generation, repeated optimization, or commercial experiments.

For an image fixture:

1. use the declared provider/model and one prompt;
2. wait for the editor preview without duplicate clicks;
3. inspect console and the Ability REST request;
4. confirm WordPress counts are unchanged;
5. review the result as an operator;
6. explicitly decide adopt or reject;
7. click save at most once when adopting;
8. verify exactly one attachment and exact byte/checksum identity;
9. verify post and revision counts did not change unless that exact write was
   the declared task.

A low-quality but technically usable fixture may be adopted only when the
report calls it a lifecycle fixture and explicitly denies content-quality or
user-acceptance conclusions.

## 7. Quota, ledger, and failure evidence

Compare before and after evidence from database-backed Cloud truth:

- `used_after - used_before` equals the contract cost;
- `remaining_before - remaining_after` equals the same cost;
- `limit` remains unchanged;
- ledger entries match the contract components;
- Provider call count changes by exactly the actual dispatch count;
- grants and adjustments are reported separately and do not erase historical
  used evidence;
- a UI summary alone is never sufficient.

Cover one naturally occurring failure, retry, busy, or optional-stage error
when it appears. Do not manufacture a paid failure. Prove whether recovery
created another Provider call, ledger entry, run, or WordPress write. A
non-blocking optional-stage failure is recorded separately and is not an excuse
for unrelated refactoring.

## 8. Exact Cloud artifact cleanup

Delete the WordPress fixture first using WordPress's exact attachment/object
identifier and confirm its original and derived files are absent. Do not delete
unrelated media or reset an auto-increment counter.

Then purge only the corresponding Cloud artifact:

```bash
pnpm run production:wordpress-roundtrip:cleanup -- \
  --ssh-host <host> \
  --ssh-user <user> \
  --identity-file <path> \
  --artifact-id <artifact_id> \
  --run-id <run_id> \
  --site-id <site_id> \
  --storage-key <obj_key> \
  --checksum sha256:<64-hex> \
  --byte-size <bytes> \
  --expected-delivery-count <count> \
  --approval 'Approved for exact WordPress round-trip fixture cleanup by operator.'
```

The cleanup command:

- refuses a deployment lock or first-install finalization in progress;
- requires all immutable identities and an exact approval sentence;
- requires every delivery to be ACKed;
- claims only the named artifact and deletes only the named storage object;
- preserves the run, Provider call, credit ledger, delivery, and artifact audit
  rows;
- verifies those audit counts are unchanged;
- is idempotent only when the same artifact is already `purged` and its bytes
  are already absent.

Do not replace this command with the broad TTL cadence, a storage-directory
delete, or SQL deletion of audit rows.

## 9. Closeout and finalize boundary

The closeout report must include:

- operator-visible first-success time and backend timing;
- declared and actual Provider calls;
- Cloud credits and externally provable monetary cost;
- adopt/reject decision and its limited meaning;
- WordPress writes before adoption, after adoption, and after cleanup;
- quota and ledger differences;
- failure stage and recovery behavior;
- console, network, Cloud run, Provider, and final WordPress revision evidence;
- cleanup results;
- what the evidence proves and cannot prove.

After cleanup, run the read-only readiness command again with the final expected
totals and optional run/artifact IDs.

First-install finalization remains a separate operator decision. Before asking
for it, also confirm the release policy, backup/restore evidence, rollback map,
the applicable passive-window or internal active-soak observation evidence,
controlled CVE gate, and all acceptance items in
[Cloud First Install with Alibaba RDS PostgreSQL 18](cloud-first-install-rds-pg18-runbook.md).
Do not finalize from this runbook automatically.

The controlled CVE receipt is bundle-external and must be checked against the
exact local deployment bundle; the remote readiness receipt cannot replace it:

```bash
<python-3.12-or-newer> scripts/check-first-install-cve-gate.py \
  --bundle <exact-deploy-bundle.tgz> \
  --controlled-risk-acceptance <private-acceptance.json> \
  --controlled-risk-acceptance-checksum <private-acceptance.sha256>
```

An acceptance that passed an older release script is not current evidence when
the active policy, expiry, exact source, exact tree, bundle checksum, scan, or
CISA evidence contract has changed. Do not edit or re-sign the receipt on
behalf of the operator.

### Known pre-import alt-text mismatch

The WordPress AI image-generation save flow may request
`ai/alt-text-generation` with an inline `image_url` before it imports the image
into the media library. The bounded Npcink Cloud Addon vision handoff accepts
only an authorized local `attachment_id`; it intentionally rejects inline or
external URLs before Cloud upload and execution. Image import may then continue
successfully.

Treat this as an optional-stage shape/order mismatch when the final import
succeeds without duplicate billing or writes. Do not widen the Addon into an
arbitrary data-URL image proxy as an incidental fix. A future narrow fix should
either run alt-text after import using the new attachment ID or explicitly skip
pre-import alt-text for an attachment-only connector.

## 10. Lessons preserved for future AI sessions

1. Paid production time should answer only facts that local fixtures and M4
   cannot answer.
2. A single preflight receipt is faster and safer than repeatedly rediscovering
   container names, identities, quota tables, and lifecycle markers.
3. WordPress CLI bootstrap can have product side effects; use skip controls or
   direct database evidence for counts.
4. Page numbers are projections. Quota, ledger, run, Provider call, delivery,
   artifact, and WordPress revision evidence must come from their owning truth.
5. Cleanup is part of acceptance, not optional housekeeping.
6. Exact bytes may be deleted while durable audit evidence remains.
7. A graceful optional-stage failure can prove recovery without justifying a
   larger fix.
8. Single-operator adoption is not a proxy for multiple users or commercial
   demand.
9. A mechanical readiness pass is not lifecycle finalization authority.
10. Time cost is a first-class constraint: stop investigation once the
    declared evidence question is answered.
