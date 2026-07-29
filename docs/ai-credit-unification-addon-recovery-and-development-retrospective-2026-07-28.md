# AI Credit Unification, Addon Recovery, and Development Retrospective — 2026-07-28

Status: source implementation merged and accepted on M4. Production was not
changed.

Scope: the product naming decision, Cloud commercial-meter cutover, migration
continuity repair, Addon projection cleanup, Local WordPress acceptance, and
development lessons from restoring the Addon service summary.

This is an evidence and engineering-retrospective record. It does not create a
new billing system, approve production, redefine WordPress ownership, or make
M4 a source of truth. The canonical commercial-meter decision remains
[ADR-028](decisions/028-ai-credit-commercial-meter-contract.md).

## Executive Summary

The visible incident started in the WordPress Addon as:

> 暂时无法获取套餐与权益。

The fault was not one isolated UI request. It exposed a cross-repository seam
that had drifted at three levels:

1. Cloud source had moved toward `ai_credits`, but the M4 database still
   contained legacy commercial columns that the running source no longer
   expected.
2. The Addon-facing entitlement projection still used the generic wrapper
   `credit_usage_detail`, even though the internal ledger and customer language
   were being standardized.
3. The Addon tolerated legacy response shapes and silently defaulted missing
   values, which could turn contract drift into plausible but incorrect
   customer output.

The project is still pre-user development, so the repair used a clean
cutover instead of adding another compatibility layer:

- internal fields and ledger unit: `ai_credits`;
- customer-visible Chinese unit: **AI 积分**;
- Addon projection wrapper: `ai_credit_usage_detail`;
- hard limits such as sites, concurrency, batch size, and vector capacity:
  separate resource limits, never converted to AI credits;
- Addon behavior: read-only, strict, and fail-closed when the canonical
  projection is absent or malformed.

The resulting architecture remains:

```text
Cloud commercial ledger and entitlement truth
  -> canonical read-only AI credit projection
  -> thin WordPress Addon summary and links
  -> customer sees “AI 积分”
```

WordPress still owns local settings, abilities, workflows, approval, preflight,
and final writes. Cloud owns account-level commercial truth, hosted usage,
entitlements, and ledger detail. The Addon owns transport and presentation, not
a second balance or package truth.

## Product Language Decision

### Canonical vocabulary

| Layer | Canonical term | Examples |
| --- | --- | --- |
| Internal unit | `ai_credits` | ledger unit, grant unit, budget key |
| Internal fields | explicit `ai_credit*` / `*_ai_credits` names | `ai_credit_delta`, `consumed_ai_credits`, `remaining_ai_credits` |
| Addon projection | `ai_credit_usage_detail` | summary, portal paths, availability |
| Chinese customer copy | AI 积分 | 套餐 AI 积分、AI 积分包、AI 积分明细 |
| Hard resource limits | their real resource names | 站点数、并发数、批量大小、向量容量 |

The chosen term is intentionally product-specific. “点数” is too generic,
“信用点” can imply financial or reputation credit, and “额度” is better
reserved for hard resource limits. “AI 积分” tells Chinese customers what the
variable meter applies to without representing it as cash, stored value, or a
universal quota.

### Stable paths versus semantic names

Existing `/credit-ledger` and Portal usage paths remain stable because the path
is an address, not the contract's unit name. Payload fields and visible copy
carry the precise `ai_credits` meaning. This avoids route churn while still
removing ambiguous data aliases.

### Stable summary arithmetic

Customer-facing Portal, entitlement, and Addon summaries use one finite-period
contract:

- `used` is gross AI-credit consumption from `consume` ledger events;
- `remaining` is the current spendable package plus paid-credit balance;
- `limit` is `used + remaining`.

Grant and adjustment entries change available balance and therefore `limit`
and `remaining`; they never reduce `used`. The ledger-only
`net_used_ai_credits` diagnostic remains available for reconciliation, but it
must not replace customer-visible consumption. Addon consumers preserve these
three Cloud-owned values without recalculating a local balance.

## Incident and Root Cause

### Observed symptom

The Addon service summary could still show article and Site Knowledge data, but
the “套餐与权益” row failed independently. That pattern showed the Addon page
itself was alive and narrowed the problem to the entitlement request and its
projection.

### Runtime and database mismatch

The first runtime check found M4 unavailable. After the runtime was restored,
the entitlement request reached Cloud but failed with a database programming
error. The deployed source expected the AI-credit schema while persisted rows
still used legacy fields including:

- `subscription_orders.credit_amount`;
- `trial_claims.credit_limit`;
- `plan_offers.trial_credit_limit`.

Migration `0073` had renamed the main paid-grant AI-credit columns, but the
remaining commercial fields still needed explicit forward migrations. PR
[#322](https://github.com/npcink/npcink-ai-cloud/pull/322) added migrations
`0074` and `0075`, restored revision continuity, and brought M4 to
`20260728_0075 (head)`.

The key lesson is that a naming cutover is not complete when only application
models compile. Every persisted commercial field, migration edge, seed,
projection, test fixture, and consumer contract must cross the same revision
boundary.

### Projection drift

After database recovery, the remaining contract still mixed:

- canonical ledger fields such as `consumed_ai_credits`;
- generic wrapper `credit_usage_detail`;
- generic or defaulted unit handling;
- permissive fallback response shapes in the Addon.

That was risky because a missing or old payload could be displayed as a valid
zero/default balance. The strict cutover therefore removed the legacy wrapper
and fallback behavior instead of preserving both names.

## Implementation History

### 1. Customer copy and Addon presentation

Addon PR
[#67](https://github.com/npcink/npcink-cloud-addon/pull/67), merged as
`53eb06a4`, standardized the visible Chinese copy around “AI 积分” and replaced
the remaining English ownership note on the service summary.

This established the customer language first, but it did not by itself prove
that Cloud schema, projection, and runtime state were aligned.

### 2. Canonical Cloud commercial meter

Cloud PR
[#321](https://github.com/npcink/npcink-ai-cloud/pull/321), merged as
`973e8924`, made `ai_credits` the canonical internal commercial meter and
recorded the decision in ADR-028.

The change covered direct ledger/grant fields, DTOs, product copy, and the
separation between variable AI consumption and hard resource limits.

### 3. Migration continuity repair

Cloud PR
[#322](https://github.com/npcink/npcink-ai-cloud/pull/322), merged as
`d9c1d3bb`, added the remaining forward migrations and restored the M4 database
to the current Alembic head.

No balances, periods, expiry behavior, payment decisions, or refund decisions
were recalculated. The change renamed schema fields while preserving their
values and commercial meaning.

### 4. Strict Addon consumer contract

Addon PR
[#68](https://github.com/npcink/npcink-cloud-addon/pull/68), merged as
`a8d0f70c`, changed the consumer to:

- accept only `ai_credit_usage_detail`;
- require `summary.unit === "ai_credits"`;
- require the canonical entitlement envelope;
- stop inventing a default unit or default Portal paths;
- use explicit `ai_credit_usage_url` and `ai_credit_ledger_url` link keys;
- reject the old `credit_usage_detail` and `unit=credit` shapes.

The Addon stays thin: it does not calculate balances, grant credits, repair
subscriptions, or cache a competing entitlement truth.

### 5. Canonical Cloud projection

Cloud PR
[#323](https://github.com/npcink/npcink-ai-cloud/pull/323), merged as
`a5fff69b`, changed the Cloud/Portal projection to:

- expose `ai_credit_usage_detail`;
- use `ai_credit_usage_detail` for ledger detail;
- expose `ai_credit_usage` and `ai_credit_ledger` Portal link keys;
- identify the surface as `portal_personal_ai_credit_usage`;
- remove the old generic wrapper rather than serve aliases in parallel.

The pre-merge candidate revision was `3cfd30e5`. The clean merged `master`
revision `a5fff69b` was then promoted and accepted on M4.

## Verification and Evidence

### Cloud source and candidate runtime

The narrow Cloud checks passed:

- `node tests/unit/portal-commercial-dto-contract.mjs`;
- M4 focused entitlement route: `5 passed`;
- M4 focused Portal summary/usage/entitlement route: `1 passed`.

The candidate was deployed to M4 from clean source revision `3cfd30e5`.
Candidate status showed:

- `acceptance_state=candidate`;
- `source_dirty=false`;
- API, frontend, proxy, PostgreSQL, and Redis healthy;
- Alembic `20260728_0075 (head)`;
- `/health/live` reachable through the expected local tunnel.

Candidate evidence proves the feature branch behavior. It is not accepted M4
evidence until the merged `master` revision is promoted.

### Addon source and Local WordPress

The Addon repository passed:

- `composer run test:all`;
- behavior coverage for the canonical projection;
- static coverage that blocks the removed wrapper and generic unit.

The actual plugin mounted by `magick-ai.local` was resolved before browser
acceptance. Existing unrelated local edits were preserved. After loading the
canonical Addon change, the service summary showed:

- “免费版 · 可用”;
- “可用 AI 积分”;
- `9,997 / 9,997`;
- “剩余 100%”;
- the Chinese account-ownership note.

This proved the actual Local WordPress consumer, not merely a source checkout
or an unrelated plugin directory.

### Cross-repository matrix

The central matrix passed for:

- `npcink-abilities-toolkit`;
- `npcink-governance-core`;
- `npcink-ai-client-adapter`;
- `npcink-workflow-toolbox`;
- `npcink-cloud-addon`.

The active root `npcink-ai-cloud` checkout was correctly reported as
`needs_validation` because it already contained unrelated editor-assist work.
That was a worktree-isolation signal, not a failure of the AI-credit change.
The exact Cloud feature revision used its focused tests, M4 candidate evidence,
and protected GitHub checks as its merge authority.

## Final Closeout Evidence

- Addon PR #67: merged as `53eb06a4`;
- Cloud PR #321: merged as `973e8924`;
- Cloud PR #322: merged as `d9c1d3bb`;
- Addon PR #68: merged as `a8d0f70c`;
- Cloud PR #323: merged as `a5fff69b`;
- accepted M4 `source_revision`:
  `a5fff69b2234e67dffac3d42a082df748826ac74`;
- accepted M4 `promotion_pr=323`;
- accepted M4 `source_branch=master`;
- accepted M4 `source_dirty=false`;
- accepted M4 `acceptance_state=accepted`;
- accepted M4 Alembic revision: `20260728_0075 (head)`;
- accepted M4 API, frontend, proxy, PostgreSQL, Redis, and workers: running;
- accepted M4 HTTP: `/=200`, `/health/live=200`;
- production: not changed;
- external customer acceptance: not applicable yet; the project has no users.

## Reusable Development Method

### 1. Name the product unit before renaming fields

Start with one sentence that customers and developers can both understand:

> High-cost hosted AI consumption uses AI 积分; hard resource limits keep their
> own units.

Then map that sentence into ledger unit, schema fields, API wrappers, DTOs,
links, copy, tests, and migrations. Renaming files ad hoc without this semantic
anchor creates new synonyms faster than it removes old ones.

### 2. Trace the entire consumer path

For a failed summary row, trace:

```text
visible row
  -> Addon parser
  -> HTTP response envelope
  -> Cloud route projection
  -> domain service
  -> ORM model
  -> database schema and Alembic head
```

A healthy page, HTTP `200`, or passing unit parser is insufficient when another
layer can still be stale.

### 3. Treat migrations as executable contract history

Schema evolution must be continuous from the actual deployed revision. Check:

- the running Alembic revision;
- all renamed columns, not just the primary model;
- upgrade order and heads;
- old persisted values after upgrade;
- application startup and focused consumer queries.

Do not repair a migration gap with a one-off database edit. Put the correction
in Git so the next clean environment reproduces it.

### 4. Prefer one strict contract before users exist

Pre-GA is the cheapest time to remove ambiguity. When there are no real users
or supported old clients, maintaining both:

- `credit_usage_detail` and `ai_credit_usage_detail`;
- `credit` and `ai_credits`;
- canonical and fallback response envelopes

creates permanent test and reasoning cost without protecting anyone. Make one
forward migration, update all controlled consumers, and add negative tests that
keep the old shape from returning.

### 5. Fail closed at commercial projection seams

An entitlement or balance projection must not fabricate defaults that look
valid. Missing unit, missing canonical envelope, or unknown link keys should
produce an unavailable state with retry, not an invented zero or a silently
accepted legacy shape.

### 6. Verify the real mounted WordPress plugin

Local WordPress may load a symlink or a different worktree than the terminal's
current directory. Resolve the installed plugin target first, preserve its
dirty state, then validate the browser. Otherwise a passing source test can be
mistaken for acceptance of code WordPress never loaded.

### 7. Keep evidence states explicit

Use these separate labels:

- local verified;
- candidate validated on M4;
- PR checks passed;
- merged into `master`;
- accepted on M4;
- production validated;
- human/external acceptance.

Do not compress them into “done.” This incident required both a candidate test
and a post-merge promotion because M4 is runtime evidence, not Git truth.

### 8. Isolate dirty work instead of cleaning it

The active Cloud and Addon checkouts contained unrelated user work. Clean
task-specific worktrees made it possible to:

- inspect focused diffs;
- stage exact files;
- publish coherent PRs;
- preserve local experiments;
- run the central matrix without misattributing unrelated dirtiness.

Isolation is faster and safer than stash/reset cleanup when several workstreams
share a repository.

## Future Checklist for Meter or Entitlement Changes

Before changing an externally visible consumption unit:

- [ ] define the internal canonical unit and customer-visible term;
- [ ] list hard limits that must remain independent;
- [ ] inventory schema, migrations, seeds, DTOs, API wrappers, Portal, Admin,
      Addon, translations, tests, and fixtures;
- [ ] decide whether real compatibility obligations exist;
- [ ] add forward migrations for every persisted rename;
- [ ] make consumers reject unknown or legacy commercial units;
- [ ] run focused Cloud and Addon tests;
- [ ] validate the actual M4 database revision and consumer request;
- [ ] validate the actual mounted Local WordPress plugin;
- [ ] publish each owning repository through its protected PR workflow;
- [ ] promote clean merged Cloud `master` before claiming accepted M4 state;
- [ ] report production and external acceptance separately.

## Boundary and Non-Goals

This work did not:

- move WordPress ability, workflow, approval, prompt, preset, router, or write
  truth into Cloud;
- add an Addon balance cache, repair workflow, package editor, or billing
  control plane;
- turn AI credits into cash, stored value, or a substitute for all resource
  limits;
- add a second ledger or wallet;
- change production;
- claim external-user or GA acceptance.

Cloud remains runtime/service detail and commercial truth. The Addon remains a
thin read-only customer surface. WordPress remains the local control plane.
