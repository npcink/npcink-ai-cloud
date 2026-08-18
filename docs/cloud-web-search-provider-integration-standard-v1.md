# Cloud Web Search Provider Integration Standard v1

Status: active engineering standard.

Purpose: define the smallest safe and repeatable path for adding a managed web
search provider to Npcink AI Cloud without creating a second control plane,
leaking credentials, overclaiming evidence, or consuming unnecessary Provider,
CI, and M4 budget.

## 1. Scope

This standard applies when adding or materially changing a provider under the
Cloud `web_search_provider` seam. It covers provider investigation, adapter
design, Provider Connection projection, Admin discovery, tests, real-upstream
validation, M4 candidate evidence, protected merge, and post-merge acceptance.

It does not authorize:

- a Cloud skill registry, MCP platform, or provider marketplace;
- WordPress writes, approval, preflight, or final audit ownership;
- prompt, preset, router, ability, or workflow truth moving into Cloud;
- production deployment or production credential changes;
- paid calls made only to manufacture observation data.

Cloud owns the hosted provider adapter, bounded runtime configuration,
normalized evidence, usage detail, health, and diagnostics. WordPress and the
local Npcink stack continue to own user intent, adoption, approval, and final
write authority. Search output remains `suggestion_only`.

## 2. Entry Criteria

Before editing, establish all of the following:

1. The service is a search execution provider rather than an MCP/Skill package,
   content registry, workflow engine, or control surface.
2. The upstream authentication method, base URL, request path, response shape,
   timeout behavior, limits, and price model are known or explicitly marked
   unverified.
3. Unsupported filters are identified. Do not silently ignore recency, domain,
   region, language, or result-count semantics requested by the caller.
4. The active worktree is based on current `origin/master`, or the exact reason
   for using another baseline is documented.
5. The change is classified under the development validation tiers. A provider
   runtime adapter is normally L2 because it crosses an external runtime seam;
   documentation-only follow-up is normally L0.

A marketing page, contact page, or credential form is not sufficient API
evidence. Prefer official API documentation and one bounded real request when a
test credential becomes available.

## 3. Change Envelope

Write a compact envelope before implementation:

- focused module and intended behavior;
- explicit non-goals and Cloud boundary;
- public contracts and error codes touched;
- expected source, Admin, test, and documentation files;
- Provider-call, elapsed-time, CI, and M4 budget;
- verification sequence and rollback.

Do not mix provider integration with unrelated refactoring, provider-priority
changes, new infrastructure, or production rollout.

## 4. Required Implementation Seams

A complete primary web-search provider integration normally covers these
existing seams:

| Seam | Required result |
| --- | --- |
| Settings | Base URL, credential, positive timeout, and non-negative cost fields |
| Provider allowlist | Explicit provider ID accepted by configuration validation |
| Runtime adapter | Bounded request, normalized evidence, usage, and stable errors |
| Provider construction | Provider can be selected explicitly and discovered by `auto` |
| Provider ordering | Intentional placement that does not silently change existing traffic |
| Provider Connection projection | Encrypted credential and bounded config reach runtime settings |
| Environment import | Legacy/dev import supported without exposing credential values |
| Admin discovery | Existing shared Provider Connection UI can create and test the provider |
| Public test errors | Safe error codes survive Admin provider testing |
| Runtime contract | Supported behavior, unsupported behavior, and boundary are documented |
| Tests | Happy path, error path, secret redaction, and runtime projection are covered |

Reuse the existing FastAPI, `httpx`, Provider Connection, Admin, PostgreSQL,
Redis, and worker seams. Adding a provider does not justify a new queue,
scheduler, registry, gateway, or orchestration system.

## 5. Adapter Contract

### 5.1 Requests

- Read credentials only from runtime settings projected from encrypted Provider
  Connections or an explicitly bounded development import.
- Apply a positive timeout and bounded result count.
- Send only fields that the upstream contract supports.
- Treat custom base URLs as privileged operator configuration, not user input.
- Never include credentials in runtime request payloads, returned metadata,
  logs, exception strings, test snapshots, or documentation.

### 5.2 Responses

- Treat every upstream response as untrusted input.
- Enforce the shared maximum response size before parsing large bodies.
- Require the documented success envelope and result collection.
- Normalize title, URL, snippet/content, provider ID, evidence policy, and usage
  through existing shared helpers.
- Fail closed on malformed success envelopes. An empty or differently shaped
  object must not be reported as a successful search.
- Keep source text bounded; provider content is evidence, not publication-ready
  copy.

### 5.3 Unsupported Semantics

If the provider cannot honor a requested filter, return a stable provider-
specific unsupported error. Silently dropping a domain or recency restriction
can change the meaning and safety of the caller's request.

### 5.4 Error Mapping

At minimum, distinguish:

- missing credential or endpoint;
- invalid authentication or access;
- quota exhaustion;
- rate limiting;
- timeout and network failure;
- upstream unavailability;
- malformed or unsuccessful response;
- provider-specific unsupported filters.

After `response.raise_for_status()`, make sure the error response cannot fall
through into normal success parsing. Add a regression test for any error branch
whose response object remains assigned after an exception.

## 6. Test and Evidence Ladder

Evidence must progress in this order. Later evidence does not erase the need to
name earlier limitations.

### 6.1 Local deterministic evidence

Start with the smallest tests that cover:

- request URL, auth header, and bounded JSON shape;
- success normalization;
- unsupported filter rejection;
- auth, quota, rate, timeout, network, and invalid-response behavior as relevant;
- Provider Connection runtime projection;
- environment-import secret redaction;
- Admin provider discovery.

Run targeted Ruff and Mypy when Python changes. Run `check:admin-ui` for Admin
catalog or interaction changes and `check:anti-drift` when Cloud contracts
change. Do not call a Docker-backed broad gate green when it never started due
to a missing local `.env`.

### 6.2 Real-upstream contract probe

Use a real credential only when authorized. The default budget is one request;
a second request is allowed only to diagnose a concrete protocol difference.

- Read the credential through hidden stdin or another non-echoing transient
  mechanism.
- Do not write it to `.env`, a command argument, shell history, a temporary
  file, Git, or a documentation artifact.
- Print only sanitized status, latency, result count, host names, and structural
  presence checks.
- After the probe, verify that the environment and worktree contain no secret.
- If a credential was pasted into chat, an issue, or another durable message,
  treat it as exposed and rotate it before persistent configuration.

A successful authoring-Mac probe proves upstream authentication and response
compatibility. It does not prove M4 reachability, production configuration,
production billing, or human usefulness.

### 6.3 M4 candidate evidence

For runtime source changes:

1. run the narrowest useful local source/static gate;
2. sync one coherent candidate checkpoint;
3. run a focused provider/runtime test;
4. record `candidate`, source revision, dirty state, migration head, and health;
5. after committing identical content, sync again only when needed to bind M4
   evidence to the clean commit revision.

If M4 reports a missing Alembic revision that exists on current master, stop.
Do not retry migration or substitute local Docker. Restore existing containers
through the documented recovery lane, move the feature onto current
`origin/master`, and dispatch a new candidate once.

### 6.4 Protected merge and acceptance

- Publish from a clean focused `codex/*` branch using the repository PR
  template and `pnpm run pr:publish`.
- Keep Scope, Cloud Boundary, Verification, Risk, Admin UI, deployment impact,
  and rollback explicit.
- Let required checks and squash auto-merge remain the merge authority.
- After merge, update a clean current `master` M4 operations worktree and run
  `m4:preview:promote -- --pr <number>`.
- Close acceptance only when status reports `accepted`, the merged PR, current
  `master`, `source_dirty=false`, the expected migration head, and healthy
  services. Run the relevant focused post-merge smoke; do not replay a full M4
  suite without a distinct risk reason.

## 7. Evidence States

Never collapse these states into one word such as “done”:

| State | What it proves |
| --- | --- |
| Local tests passed | Deterministic source behavior on the authoring machine |
| Real-upstream probe passed | Credential and upstream API shape worked for that bounded request |
| M4 candidate | Candidate source behaved on M4; source is not yet accepted master |
| PR CI green | Protected repository checks passed for the feature head |
| Merged | Feature reached `master` through the protected lane |
| M4 accepted | Current merged master revision was promoted and verified on M4 |
| Production deployed | A separately authorized production release updated the host |
| Production configured | The provider credential and connection are active in production |
| Human accepted | Real users found the provider useful in the intended product flow |

## 8. Rollout Rules

- New providers remain optional and default-disabled until configured.
- Put a new provider last in automatic ordering unless measured evidence
  justifies changing existing traffic.
- First configure and test it in M4 or another internal environment.
- Use an explicit provider selection for canary queries; automatic fallback may
  otherwise hide whether the new provider was called.
- Observe success rate, latency, relevance, duplicate rate, auth/quota/rate
  errors, and actual cost before changing priority.
- Production promotion and production credential configuration require their
  own operator authorization.

## 9. Stop Conditions

Stop automatic retries and report evidence when:

- the same external-transfer or Provider error repeats twice;
- the active branch is missing the runtime's current migration revision;
- the only available credential has been exposed and cannot be rotated;
- the upstream contract cannot honor required caller restrictions;
- validation would require production changes or paid calls beyond the declared
  budget;
- the change would move local control-plane truth into Cloud.

## 10. Definition of Done

A provider integration is development-complete when:

- code and active runtime documentation agree;
- deterministic tests, static checks, and affected Admin contracts pass;
- the real API is either boundedly verified or explicitly marked unverified;
- the feature is merged through protected CI;
- current merged `master` is M4 accepted;
- no credential remains in source, environment, logs, or task artifacts;
- production deployment/configuration and human acceptance are reported as
  separate pending states unless independently completed;
- a dated closeout records corrections, evidence, residual risk, and the next
  smallest rollout action.
