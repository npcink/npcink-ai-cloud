# Retention release certificate maintenance exception — 2026-11-04

Status: operator-approved bounded release-tooling contract. This does not authorize
Deploy Production. The operator separately requested deploying the retention release;
workflow authorization must still bind the final exact production SHA.

## Scope and deadline

The operator approved deferring only the renewal dry run during the official
[Let’s Encrypt maintenance](https://letsencrypt.status.io/pages/maintenance/55957a99e800baa4470002da/6ae128f23dbbeb05d762175d).
Incident `6ae128f23dbbeb05d762175d` must remain active in the official status API;
its planned window is 2026-11-03 16:00–2026-11-04 21:00 UTC. The operator
explicitly approved deferring this retention release's dry run after actual
renewal attempts [41792025557](https://github.com/npcink/npcink-ai-cloud/actions/runs/41792025557)
and [41792460224](https://github.com/npcink/npcink-ai-cloud/actions/runs/41792460224)
failed with CA-side DNS validation errors. The directory returning HTTP 200
does not prove challenge recovery. Ended official maintenance still requires
normal readiness; there is no automatic fallback to this exception.
The exception expires at **2026-11-05 04:00 UTC / 12:00 Asia/Shanghai**,
including in-flight consumption.

The application tree is frozen at `ca3b476683e9a31b50bb18820a27b56b9039dc2f`.
Only the exact release-tooling, test and documentation paths in
`deploy/certificate-maintenance-exception.py:ALLOWED` may differ. The production
installation must still be `9a5bf35240b5702ab853fedc0f126baa7f003360`.
The frozen source already contains reviewed retention rules #1368 and compatibility
record #1369. No further application, Compose, migration or WordPress authority
changes are admitted through this exception.

## Explicit selection and independent evidence

Promotion preflight requires `--certificate-maintenance-exception` plus the exact
`NPCINK_CLOUD_CERTIFICATE_MAINTENANCE_APPROVAL` sentence:

`Defer the renewal dry run for the approved 2026-11-04 retention release.`

Deploy Production separately requires the same sentence in optional input
`certificate_maintenance_confirmation`, in addition to ordinary exact-SHA
confirmation. Empty input always selects ordinary certificate readiness.
There is no generic skip flag and no automatic fallback from a failed dry run.

The helper checks clean source identity, the frozen scope and official maintenance,
then runs reviewed public tooling in a temporary root-owned directory over strict
SSH. It does not edit installed application source. Live inspection acquires the
host deployment lock and checks certificate/key permissions and matching, hostname,
trust chain, at least 30-day validity, the actual NGINX TLS binding and served leaf,
renewal timer/service/direct Certbot ExecStart, persistent hook digest and a real
hook/config-test/reload proof. Public TLS must serve the same trusted leaf.
Any failed check stops admission.

Evidence is explicitly `maintenance_exception`, with
`renewal_dry_run_passed=false`. Inspection never creates, restores or overwrites the
ordinary `status=passed` readiness receipt. Valid current TLS and timer/hook proof
**do not prove renewal challenges can complete**.

## Prior consumed exception

The earlier application release used schema `npcink.certificate_maintenance_exception.v1`
and `maintenance-20261104-deployment.json`; its claim was consumed by run
41766124689 for installed revision `9a5bf352`. Preserve that record unchanged.
This separately authorized retention release uses schema
`npcink.retention_certificate_maintenance_exception.v1` and distinct claim
`maintenance-retention-20261104-deployment.json`. Neither the old approval sentence
nor its consumed claim authorizes this attempt.

## One attempt and failure semantics

Promotion only inspects. The explicitly selected deployment creates an exclusive
root-owned mode0600 claim in the protected mode0700 edge directory, binding final
source SHA/tree, workflow run ID, expiry and live certificate/timer/hook digests.
An existing claim cannot be overwritten or reissued automatically, even after a
failed deployment. No exception cleanup/retry workflow is provided.

The formal runtime loader repeats live checks and consumes the claim durably
**before image loading or tagging**. A consumed, expired or unrelated claim cannot
select the exception; a malformed/unsafe claim fails closed. TLS binding drift,
version mismatch or deadline expiry stops consumption. A later normal release
still requires the complete ordinary receipt. A failed attempt requires a new
operator decision or restored normal readiness; rerunning the workflow is not a
new authorization.

All other release gates remain mandatory: reviewed master source, production PR,
exact production CI/CodeQL, scanned SHA-bound v2 bundle, database and operational
preflight, matched backup/recovery evidence and final Deploy authorization.
This release adds no migrations. Immediate application rollback uses the current
0092-compatible installed `9a5bf352` bundle, with the existing session/TOTP
constraints preserved.

After staging recovers, perform the normal authorized certificate-readiness refresh
and record its actual result separately as deferred proof completed or still
pending. This contract creates no automation and does not claim the dry run passed.
