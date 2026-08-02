# M4 Preview Runtime-Bound Configuration Publication Standard v1

Status: active engineering standard.

Purpose: define how M4 Preview publishes repository files that are read
directly by a running container through a host bind mount. The immediate
consumer is `deploy/nginx.m4-preview.conf`, but the admission and failure rules
apply to any future runtime-bound configuration file.

This standard is M4-only. It does not authorize production deployment, change
the private relay, replace the deployment or frontend-slot locks, weaken
candidate/accepted promotion, or create another source or release authority.

## 1. Why This Standard Exists

A source bundle can be complete while publication into the live source mirror
is still unsafe. A normal rsync may truncate and rewrite one destination file
in place. If a running container bind-mounts that host file, it can observe an
intermediate byte sequence that was never a valid repository revision.

The repository therefore distinguishes four boundaries:

1. **transfer completeness**: the relay payload has arrived and matches its
   declared digest;
2. **staging completeness**: the payload has been fully extracted into a
   unique, non-live directory;
3. **candidate validity**: Compose and consumer-specific configuration checks
   pass against the staging tree;
4. **live publication**: runtime-bound files move from the previous complete
   version to the next complete version at an explicit commit point.

Passing one boundary MUST NOT be reported as passing a later boundary.

## 2. Scope and Definitions

A **runtime-bound file** is a repository file whose host path is read directly
by a running container or host process. This includes a Compose single-file
bind mount and may include a watched host configuration file.

The **live source mirror** is the M4 directory used by the active Compose
project. It is disposable runtime input, not Git or accepted-source truth.

The **staging tree** is a unique sibling directory populated from one verified
source bundle. Running services MUST NOT bind-mount files from this directory.

The **publication commit point** is the first operation that can make incoming
source bytes visible at a live runtime path.

## 3. Required Invariants

M4 source publication MUST preserve all of these invariants:

- one repository operation lock owns the primary live source mutation;
- every required frontend-slot lock is held for the existing guarded interval;
- the relay remains transient, private, digest-verified, and independently
  locked;
- the source bundle is fully extracted before validation begins;
- Compose and consumer-specific validation use the staging tree;
- a validation failure occurs before the publication commit point;
- a runtime-bound file is excluded from the live tree rsync;
- its incoming file is created in the destination directory and only after the
  generic live rsync succeeds;
- the incoming bytes are checksum-verified against the staged source;
- publication uses a same-filesystem atomic rename;
- the old live file remains in place until that rename succeeds;
- the consumer is recreated or reloaded only after the atomic commit;
- candidate, merged, accepted, production, and human evidence remain distinct;
- existing post-commit fail-closed cleanup remains authoritative.

`--delay-updates` reduces exposure for ordinary source files, but it is not a
substitute for excluding and atomically publishing a runtime-bound file.

## 4. Required Publication Sequence

The implementation sequence is normative:

1. Inspect the current M4 owner, candidate, primary/slot locks, and relay lock;
   stop on foreign ownership rather than retrying or taking over.
2. Acquire the relay lock and upload the complete bundle to a relay-side
   partial path.
3. Verify bundle length and digest, then publish the relay object atomically.
4. Start the M4 operation under the existing primary deployment lock, then
   download and verify the complete bundle on M4. Acquire frontend-slot locks
   at the existing guarded interval when the operation requires them.
5. Extract the bundle into a unique staging tree outside the live source
   mirror.
6. Confirm all required files exist.
7. Resolve the protected live `.env` inputs into staging without copying their
   values into Git or the relay bundle.
8. Run `docker compose config --quiet` against the staging Compose files.
9. Run each consumer-specific preflight against the staged file. For Nginx,
   this is a disposable `nginx:1.27-alpine` container with `--network none` and
   the staged configuration mounted read-only.
10. Determine whether each runtime-bound file differs from the live version.
11. Mark the stack touched immediately before starting the live source commit.
12. RSync ordinary source with delayed updates and delayed deletion while
    excluding every runtime-bound file.
13. After rsync succeeds, copy each staged runtime-bound file to a unique
    same-directory incoming path.
14. Verify the incoming digest equals the staged digest.
15. Rename the incoming path over the live path atomically.
16. Run migrations and start or restart the normal candidate services under
    the existing fail-closed rules.
17. Recreate a consumer only when its runtime-bound input changed; otherwise
    preserve the existing lifecycle behavior.
18. Run the live consumer preflight, service status, relevant HTTP smoke, and
    state recording before releasing operation locks.

The incoming path MUST NOT be created before step 12. A live rsync using
`--delete` or `--delete-delay` is allowed to remove unknown destination files;
creating the incoming path early makes the deployment delete its own staged
commit object.

## 5. Nginx-Specific Contract

For `deploy/nginx.m4-preview.conf`:

- Compose continues to bind the stable host path to
  `/etc/nginx/conf.d/default.conf` read-only;
- live rsync excludes `deploy/nginx.m4-preview.conf`;
- staging validation uses the exact image used by the M4 proxy and no network;
- the same-directory incoming filename is unique to the operation run;
- the incoming file mode is `0644`;
- SHA-256 equality is checked before rename;
- a changed configuration causes an explicit proxy recreation after commit;
- an unchanged configuration does not cause an unnecessary proxy recreation;
- final evidence compares the live host digest with the digest visible inside
  the proxy container.

The guaranteed read outcomes are therefore the previous complete file or the
next complete file. A running Nginx container MUST NOT observe an rsync
partial.

## 6. Failure Boundary

Failure behavior depends on whether live source may have changed:

| Failure point | Live Nginx file | Running services | Required response |
| --- | --- | --- | --- |
| relay upload/download or digest check | previous complete file | unchanged | clean relay state and report transfer failure |
| extraction or required-file check | previous complete file | unchanged | remove staging and report invalid bundle |
| staged Compose or Nginx validation | previous complete file | unchanged | retain the current candidate/accepted runtime |
| generic live rsync | previous complete Nginx file | existing fail-closed policy may stop application services because other source may be mixed | recover through the repository command; do not retry blindly |
| incoming copy or digest check | previous complete file | existing post-commit fail-closed policy applies | remove the exact incoming file and recover explicitly |
| atomic rename | previous or next complete file | existing post-commit fail-closed policy applies | inspect filesystem health and recover explicitly |
| migration, start, or live preflight | next complete file | existing fail-closed cleanup applies | diagnose and use the documented recovery path |

“Keep the old service running” is mandatory only while failure is known to be
pre-commit. Once ordinary live source may be mixed, stopping named application
services remains the safer evidence-preserving behavior.

## 7. Required Contract and Fault-Injection Evidence

A change to this publication seam MUST start with the narrowest relevant
contract test. The contract suite MUST prove:

- staging validation precedes `stack_touched` and live rsync;
- runtime-bound files are excluded from live rsync;
- delayed update and delayed deletion remain enabled for ordinary source;
- the incoming file is created after successful rsync;
- checksum verification precedes atomic rename;
- consumer recreation follows atomic commit;
- failed rsync leaves the previous runtime-bound file intact and creates no
  incoming residue;
- successful publication leaves the exact candidate content and no incoming
  residue.

For a material script change, M4 fault injection SHOULD additionally prove:

1. an intentionally invalid staged configuration fails before live mutation;
2. the old consumer ID and start time remain unchanged;
3. the old host and mounted-container digests still match;
4. the relevant HTTP routes remain healthy;
5. a valid changed configuration reaches both host and container;
6. the final repository configuration can be restored through the same atomic
   path;
7. primary, slot, and relay locks and transient payloads are absent afterward.

Do not weaken validation, add automatic retries, or stop the consumer before
staging validation merely to make the test pass.

## 8. Evidence and Completion Rules

Report these states separately:

- focused local contract result;
- M4 candidate revision, branch, dirty state, and smoke;
- PR number and protected-check result;
- merged `master` revision;
- accepted promotion PR and clean-master revision;
- host/container configuration digests;
- fault-injection outcome;
- final primary, slot, relay, and worktree lock state;
- production and human-acceptance state.

A direct candidate deploy is not accepted evidence. A green PR is not merged
evidence. HTTP `200` is not proof of source identity. Documentation-only
follow-up after accepted runtime evidence does not require another M4 candidate
unless it changes an executable contract.

## 9. Rejected Shortcuts

### Retry the deployment

Rejected. A second run may succeed only because the first run finished writing
the file. It hides the race and still permits service interruption.

### Validate only after live rsync

Rejected. The consumer can observe invalid bytes before validation begins.

### Stop Nginx before every source transfer

Rejected. It avoids a concurrent reader by creating an unnecessary outage and
does not prove the incoming file is complete.

### Swap the entire live source directory now

Deferred. A release-directory or symlink switch could provide a broader
transaction boundary, but it also changes protected environment placement,
Compose working-directory assumptions, caches, recovery, and cleanup. Adopt it
only in a separate proposal backed by evidence that multiple runtime files
need one atomic generation.

### Treat delayed rsync as atomic publication

Rejected. Delayed updates narrow an exposure window but do not define the
single-file commit and validation boundary required by a live bind mount.

## 10. Extension Rule

Do not automatically add every repository file to the runtime-bound exclusion
list. A new file enters this standard only when its real consumer can read it
while source synchronization is in progress. The change envelope MUST name:

- the host and consumer paths;
- the reader lifecycle;
- the staging validator;
- the commit primitive and same-filesystem proof;
- the changed/unchanged consumer action;
- failure containment and recovery;
- focused contract and runtime evidence.

If several files must become visible as one generation, stop extending this
single-file pattern and evaluate a versioned release directory with an atomic
pointer switch as a separate architecture decision.

## 11. References

- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [M4 Preview Development Workflow](m4-preview-development-v1.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [ADR-023: M4 Preview Candidate Acceptance Promotion](decisions/023-m4-preview-candidate-acceptance-promotion.md)
- [ADR-024: Risk-Tiered Development Validation Authority](decisions/024-risk-tiered-development-validation-authority.md)
- [ADR-026: Private Source Relay Transfer](decisions/026-private-source-relay-transfer.md)
- [M4 Atomic Nginx Configuration Closeout and Development Retrospective](m4-preview-atomic-nginx-config-closeout-and-development-retrospective-2026-08-02.md)
