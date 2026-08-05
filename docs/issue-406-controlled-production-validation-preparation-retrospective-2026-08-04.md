# Issue #406 Controlled Production Validation Preparation Retrospective — 2026-08-04

Status: time-bounded evidence and retrospective.

Purpose: preserve the facts, corrections, engineering lessons, and remaining
gates from the Issue #406 production-preparation and production-host isolated
canary work.

This document is not a new production approval, first-install finalization,
production validation, human acceptance, user rollout, or GA decision. Current
GitHub state, protected policy, runtime evidence, and the active
[Production-host Localhost Candidate Canary Standard](production-host-localhost-candidate-canary-standard-v1.md)
take precedence over this dated record.

## 1. Original Objective

The session objective was the smallest controlled production validation for one
frozen release candidate, not GA and not user enablement. The required order was
read-only audit first, then separately approved mutations only.

The operator later narrowed the practical experiment to a production-host
localhost-only candidate canary with these explicit prohibitions:

- no production RDS connection;
- no production service, `current`, DNS, or Cloudflare modification;
- no direct server application-source edit;
- no payment without separate amount/account approval;
- no secret, credential, token, code, or environment value disclosure.

## 2. Frozen Candidate and Artifacts

The authoritative candidate remained unchanged throughout the final canary and
cleanup:

| Item | Evidence |
| --- | --- |
| `master` revision | `3d1787e5bb92e5e4a5d2adf947563e42a323a117` |
| Git tree | `372f635ca2c7e779e1bb09174ef5337e128227e9` |
| Linux/AMD64 bundle SHA-256 | `e7b773ba4335713c8456e8ca1c2b7185e91e312ef28d7b6b6305a5c464ecd209` |
| Alembic head | `20260801_0078` |
| previous production application source | `a0f1da12a00494040c0600f090c4f2a761c73e4e` |
| production release pointer | `release-aca29c326e16aef8-20260722173156-39542` |
| host fingerprint | `SHA256:iu0HjxW6NP2SXDYdn7i/sx7zHwBYeK/aIA8+VTD5bQU` |

The bundle, scan index, allowlist, image lock, and controlled CVE acceptance
were recorded in Issue #406. Exact bundle replay passed empty PostgreSQL 18
migration, idempotent migration, immutable-image verification, runtime startup,
and signed smoke.

## 3. Read-only Production Findings

The host audit established:

- production `current` and running images matched the existing release;
- protected runtime configuration was mode `0600` and matched the installation
  state digest;
- RDS resolved privately, used TLS `verify-full`, and reported PostgreSQL 18;
- live Alembic revision was `20260717_0068`, while candidate replay proved the
  path to `20260801_0078`;
- schema comparison found no missing model-required table, column, or index
  signature; remaining differences were historical equivalent names and
  live-only helper indexes;
- logs were readable for API, all workers, frontend, and proxy;
- the operator reported a successful restore of the latest RDS backup to a
  separate temporary validation instance.

The ownership inventory found one active account, principal, membership, and
site, but the live `0068` schema had no `principal_site_bindings` table. No
ownership was inferred from membership. Candidate migration `0072` introduces
the fail-closed binding model.

## 4. Lifecycle Blocker

Production promotion correctly stopped because the protected lifecycle
artifacts did not form a finalized state:

- `install-state.json` reported `installation_state=complete`;
- `/opt/npcink-ai-cloud/.installation-complete` was absent;
- `.first-install-pending.json` remained and bound the active release.

The correct conclusion was not “the JSON says complete, deploy anyway.” A first
install is a multi-artifact state machine. Ordinary deployment remains blocked
until governed acceptance produces the permanent sentinel and completes the
pending lifecycle under the repository runbook.

No marker was changed, deleted, forged, or bypassed.

## 5. Isolated Canary Outcome

The exact candidate ran on the production ECS host under the separate Compose
project `npcink-ai-cloud-canary-406-3d1787e5`.

Passed evidence:

- only `127.0.0.1:8110` was published;
- PostgreSQL 18 was disposable and unpublished;
- production RDS was not used;
- API, runtime worker, callback worker, ops worker, frontend, proxy, Redis, and
  PostgreSQL became healthy;
- migration reached `20260801_0078`;
- repository signed runtime smoke passed;
- synthetic Admin entry established an authenticated `/admin` session;
- synthetic Portal registration and entry established an authenticated
  `/portal` session without printing the verification code;
- the operator completed the browser inspection;
- cleanup removed all canary containers, networks, volumes, image tags, port
  listeners, and the local SSH tunnel;
- production pointer, seven production container IDs, and production liveness
  remained unchanged.

Final browse-canary receipt:

```text
/opt/npcink-ai-cloud-canary/issue-406-3d1787e5-browse-07/receipt.json
SHA-256 2c994f071ac7751c3581b46963c0312170732958d5df118b53d1571a01251a94
```

Issue evidence:

- [localhost candidate canary](https://github.com/npcink/npcink-ai-cloud/issues/406#issuecomment-5177057524)
- [restore result and lifecycle blocker](https://github.com/npcink/npcink-ai-cloud/issues/406#issuecomment-5177258868)
- [browse canary closeout](https://github.com/npcink/npcink-ai-cloud/issues/406#issuecomment-5177887868)

## 6. Development Lessons

### 6.1 Exact candidate is the primary key of release evidence

SHA, tree, bundle, image IDs, migration, scan, host run, and receipt must form
one chain. If the candidate changes, evidence invalidation is cheaper and safer
than explaining why mixed-revision evidence is “probably equivalent.”

### 6.2 A production host is not automatically production

Environment classification depends on data, ingress, configuration, service
ownership, and traffic—not only the physical server. A separate project,
disposable database, localhost-only proxy, synthetic identities, and unchanged
production baseline create useful host-compatibility evidence without creating
production evidence.

### 6.3 Lifecycle truth is composite

One `complete` field cannot override missing permanent acceptance or a retained
pending marker. Release tooling should continue treating protected state,
sentinel, pending marker, current release, and config digest as one governed
contract.

### 6.4 Compose defaults are unsafe during partial recreation

The initial canary used explicit candidate image variables. During browse setup,
a later API/frontend recreation initially omitted the complete Compose
invocation envelope and selected ordinary `:prod` tags. Independent image-ID
inspection caught this before the evidence was accepted. The services were
recreated with candidate-specific image tags and reverified.

The durable lesson is: every `docker compose` invocation is a new deployment
decision. Reusing the same project directory does not preserve the original
interpolation inputs.

### 6.5 Network dependencies must be revalidated after recreation

Recreating API/frontend changed internal Docker addresses and left the canary
proxy with a stale upstream. The safe repair was to recreate only the canary
proxy with the complete canary environment. Restarting production proxy or
loosening isolation would have crossed the authorization boundary.

### 6.6 Release images may intentionally exclude development modules

Attempting to call `app.dev.seed_portal_demo` inside the exact production image
failed because the image excludes that development package. The correct path
was the candidate's public test-only registration contract, with the code parsed
and submitted in one process. Validation helpers must respect the shipped image
surface rather than assuming the source checkout exists inside it.

### 6.7 Failures are evidence when classified precisely

Preliminary harness runs exposed host-Python selection, unavailable external
fixture images, missing worker readiness, and an over-broad post-smoke port
check. Each was corrected without weakening signed smoke or touching
production. Recording these failures prevents the final green result from
looking artificially effortless and makes the harness easier to improve.

### 6.8 Cleanup is part of the test

A canary has not passed isolation until containers, volumes, networks, image
tags, port listeners, tunnel, production pointer, and production container IDs
are checked after teardown. “The page worked” is only the middle of the test.

## 7. Work Review Report

### Original goal

Complete the smallest practical candidate validation while preserving the
production lifecycle blocker, secret boundary, rollback evidence, and explicit
separation between canary, production validation, human acceptance, and GA.

### Completion

- [x] Completed: exact candidate/bundle/image/migration audit.
- [x] Completed: read-only production host, RDS, schema, ownership, logging, and
  rollback inventory.
- [x] Completed: isolated signed runtime canary and synthetic Admin/Portal
  browser inspection.
- [x] Completed: deterministic cleanup and production-baseline revalidation.
- [x] Completed: Issue #406 evidence update with truthful checkbox decision.
- [ ] Not completed: production PR/deployment, formal production smoke,
  WordPress reconnect/revoke, external OTLP observation, payment, 24-hour
  observation, production human acceptance, or GA. These were outside the
  achieved authorization/gates, not silently skipped work.

### Problems found

| Severity | Specific behavior | Root cause | Corrective standard |
| --- | --- | --- | --- |
| Must correct | Browse recreation temporarily selected ordinary API/frontend `:prod` tags instead of candidate tags | Partial Compose commands omitted the full interpolation envelope | Require the same explicit project, files, port, paths, and every image variable for every Compose call; inspect actual image IDs afterward |
| Must correct | First proxy recreation omitted the canary port and safely collided with occupied production port `8010` | The operation was treated as a service restart instead of a full configuration evaluation | Treat every recreate as a new deployment decision; render/inspect config before execution |
| Should correct | Portal seed attempted a development module absent from the release image | Validation assumed source-tree helpers were shipped | Prefer public test-only contracts or bundle-contained helpers; verify image contents first |
| Should correct | Frontend/API recreation left proxy upstream stale | Network dependency identity was not part of the immediate post-recreate check | Revalidate affected network edges and recreate only the isolated proxy when necessary |
| Should correct | Early harness attempts depended on host/runtime details not proven in preflight | The first harness encoded assumptions before inventorying the host | Add host Python, platform, local image availability, worker set, and listener ownership to mechanical preflight |
| Improve | Evidence was spread across multiple Issue comments and transient receipts | Operational learning was recorded chronologically but not normalized | Maintain one active canary standard plus one dated retrospective and link both from the release index |

### What worked well

- Candidate stability was checked before mutation and after cleanup.
- Secrets and one-time codes were never printed.
- Production baseline used exact pointer/container identities rather than health
  alone.
- Failed attempts cleaned automatically or failed closed before production
  mutation.
- M4, canary, production, human acceptance, and GA labels stayed separate.
- The operator obtained a fast browser-visible result without granting Alibaba
  Cloud control-plane authority.

### Next-task focus

1. Recheck the candidate before any future production action.
2. Resolve the first-install lifecycle through its governed acceptance path;
   do not manufacture the sentinel.
3. Keep formal production identities, WordPress reconnect/revoke, OTLP, and
   payment as separately approved gates.
4. Use the complete Compose invocation envelope for every isolated recreate.
5. Close every future canary with post-cleanup production identity checks.

## 8. Current State

At this closeout:

- candidate canary passed: **yes**;
- synthetic browser inspection completed: **yes**;
- production validated: **no**;
- human accepted: **no** — only the isolated synthetic canary was inspected;
- GA: **no**;
- Cloud remained runtime/detail only;
- WordPress approval, truth, and final-write ownership remained local;
- no forbidden control-plane or infrastructure drift was introduced.
