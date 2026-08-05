# Hosted WordPress Text Generation Closed-Loop Validation Standard v1

Status: active engineering and validation standard.

Closeout baseline: PR `#462`, merged `master` revision
`4043d20759b8e64efab1192332b0a47bda92c5e9`, promoted to M4 with
`acceptance_state=accepted`, `promotion_pr=462`, `source_branch=master`, and
`source_dirty=false` on `2026-08-02`.

This document turns the Hosted GPT-5.5 WordPress editor-loop investigation,
repair, and acceptance history into a repeatable method. It is a standard plus
a bounded historical closeout record; it does not make that revision
permanently current.

It does not replace the
[Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md),
[Development and Validation Operating Model](development-validation-operating-model-v1.md),
[M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md),
[Provider Call Ledger](provider-call-ledger-and-next-stage-deferral-2026-07-25.md),
or WordPress Ability-owned contracts. It does not authorize production,
Issue `#406`, Provider spend, customer trials, or human acceptance.

## 1. Goal and completion contract

The target is one user-value chain, not a collection of healthy components:

```text
real WordPress editor entry
  -> WordPress Ability
  -> Npcink Cloud Addon transport
  -> Cloud runtime resolve and execute
  -> runtime profile and Provider routing
  -> Hosted text Provider request
  -> response parsing and semantic validation
  -> provider / usage / credit / error evidence
  -> suggestion returned to WordPress
  -> user review and adoption
  -> explicit WordPress save
```

Development acceptance requires all of the following:

1. identify the plugin source actually mounted by WordPress;
2. invoke the Ability through the normal editor control, without a test route;
3. send the bounded Addon/Cloud runtime contracts;
4. select the intended profile, Provider, model, and instance;
5. return a real Provider result through the normal consumer;
6. make the suggestion visible and adoptable in the editor;
7. record zero WordPress writes before explicit save;
8. perform the expected bounded write on explicit save;
9. correlate run, Provider call, usage, credit, fallback, and error fields to
   the same request;
10. prove one controlled editor failure/recovery path;
11. clean fixtures, sessions, tunnels, budgets, and locks;
12. report source, PR, M4, production, and human states separately.

HTTP `200`, valid JSON, a screenshot, a push, green CI, a merge, or an M4
candidate is useful evidence. None alone proves the complete chain.

## 2. Ownership and interfaces

| Segment | Source owner | Interface | State owner |
| --- | --- | --- | --- |
| Editor entry and review | WordPress AI | editor control and Ability execution | WordPress editor |
| Title contract | WordPress AI | `ai/title-generation`, `wp_ai_client_prompt(...)->generate_text()` | Ability registry and schema |
| Cloud bridge | Npcink Cloud Addon | `cloud_connector_runtime.v1` with `wordpress_operation.v1` | Addon connection, authorization, and transient correlation |
| Resolve and execute | Npcink AI Cloud | signed `/runtime/resolve` and `/runtime/execute` | Cloud run record |
| Task/profile mapping | Npcink AI Cloud | `title_generation -> wp-ai.short-text / content.short_text` | Cloud runtime profile and binding |
| Provider selection | Npcink AI Cloud | catalog instance plus enabled `ProviderConnection` | catalog, connection, health, and route evidence |
| Provider request | Provider adapter | endpoint-specific Responses or Chat Completions contract | Provider-call record |
| Result normalization | Cloud and Addon | `cloud_connector_result.v1`, `suggestion_only=true` | Cloud evidence and Addon validation |
| Adoption/final write | WordPress editor | Insert/Accept, then normal Save/Update | WordPress post and revision truth |

`npcink-workflow-toolbox` is not a runtime hop for official WordPress AI title
generation. It owns the central cross-repository quality matrix. Do not
describe it as carrying the request unless current source proves that path.

Cloud must not acquire WordPress Ability, prompt, workflow, approval, or
final-write ownership; a second local registry; or a test-only production
bypass.

## 3. Evidence lifecycle

| State | What it proves | What it does not prove |
| --- | --- | --- |
| `local-ready` | dependencies/configuration are prepared | behavior passed |
| `local verified` | a focused source, contract, or consumer check passed | M4 or merge |
| `M4 candidate` | a packaged worktree behaved on M4 | commit, review, merge, acceptance |
| `PR verified` | required checks passed | merge or deployed runtime |
| `merged into master` | reviewed source reached integration truth | M4 runs it |
| `M4 accepted` | clean current `master` was promoted and smoked | production or human acceptance |
| `production validated` | approved production revision passed production checks | human value or GA |
| `human accepted` | an authorized human accepted the result | broad rollout or durable quality |

Evidence is revision-bound and time-bound. A previous accepted revision is a
historical fact, not proof that a later catalog, profile, connection, or
`master` revision remains correct.

## 4. Session entry and change envelope

Before investigation or editing:

1. inspect the user checkout and read repository/boundary instructions;
2. fetch current `origin/master` when integration truth matters;
3. preserve unrelated modifications in a locked isolated `codex/*` worktree;
4. inspect open PRs, worktree owners, merge lane, M4 operation lock, frontend
   slots, relay, tunnel, and current candidate before shared mutation;
5. declare builder, integrator, and investigator roles as applicable.

The change envelope must name one owning seam, conflict domain, branch,
worktree, expected files, forbidden areas, public contracts, Provider budget,
cross-repository matrix, verification gates, merge/M4 owners, rollback, stop
conditions, and non-goals.

Do not reset, stash, overwrite, seize a lock, reuse another candidate, or mix
unrelated staging to obtain a clean environment.

## 5. Read-only audit before spend or edits

### WordPress consumer

Confirm site/environment, WordPress/WordPress AI/Addon versions, resolved
plugin symlink and worktree, Ability schema, real editor control, and loaded,
verified, and enabled connector states as separate facts. Trace Insert/Accept,
autosave, and final Save/Update ownership.

### Addon transport

Trace Ability-to-task mapping, envelope versions, signing/scopes, timeout and
error normalization, `suggestion_only` validation, and absence of direct
WordPress writes.

### Cloud routing

Trace resolve/execute routes, task/profile mapping, current binding revision,
candidate order, ProviderConnection source role, configured-secret or explicit
secretless state, declared capabilities/models, health, endpoint variant, and
recent bounded call evidence.

Catalog tags are not execution authority. WordPress text candidates must also
agree with an enabled execution connection's `text_generation` capability. A
catalog model mislabeled as text must not make an embedding-only Provider
executable for text generation.

### Provider and evidence

Trace endpoint-specific payload, structured-output adaptation, semantic result
validation, and the shared run/trace/Provider-call identity across profile,
Provider, model, instance, latency, tokens, cost, fallback, error, usage, and
credit entries.

Never retain credentials, environment files, raw customer prompts/results,
cookies, or nonces as evidence.

## 6. Choose one highest-value gap

Prefer the smallest owning seam that enables the real consumer to traverse the
whole chain. Rank gaps in this order:

1. normal WordPress entry or recovery;
2. bounded Addon transport;
3. executable Cloud profile/Provider selection;
4. Provider wire compatibility;
5. safe response semantics;
6. same-request evidence correlation;
7. performance or presentation.

Do not answer a core-loop failure by adding Admin pages, reports, dashboards,
governance panels, a second API, or a new routing/control system.

Stop and report a blocker for product ownership choices, production access,
new credentials/budget, unapproved cross-repository edits, or another task's
merge lane, worktree, candidate, or lock.

## 7. Implementation discipline

One session changes one owning seam.

For catalog/profile repairs:

- refresh from live enabled adapters when real connections are execution truth;
- require execution source, configured secret or explicit secretless status,
  and capability compatibility;
- preserve documented Admin-owned profile state;
- keep fallback bounded and explicit;
- test an adversarial incompatible Provider, not only the happy candidate.

For Provider adapters:

- test the final wire payload by endpoint variant;
- keep the Ability schema as semantic truth;
- use a bounded Provider-compatible schema copy only at the wire boundary;
- validate the response again against Ability meaning;
- fail closed on missing or wrong-typed fields.

Never add a production bypass for test convenience.

## 8. Provider-call budget

Before a real dispatch, inspect and initialize the shared Provider-call ledger,
set aggregate/per-item limits and failure stop conditions, and claim exactly
one call immediately before dispatch. Reconcile Provider records and close the
ledger afterward.

Do not automatically retry merely to obtain a green result. A deterministic
fake may validate consumer recovery, but must be labeled local and must never
be presented as real Cloud/Provider evidence.

## 9. Verification ladder

```text
focused source/contract tests
  -> M4 source-only candidate for ordinary Cloud source
  -> exact focused M4 tests when container behavior matters
  -> disposable real WordPress browser smoke
  -> same-request Provider/usage/error correlation
  -> exact staging and review
  -> protected PR checks
  -> merge into master
  -> clean current-master promotion
  -> stable accepted status and relevant smoke
```

Use deploy only for changed build/runtime fingerprints. Documentation uses the
local-only lane. Do not duplicate a full M4 suite before and after green CI
without an M4-specific reason. Git-metadata checks may fail/skip in a source
bundle without `.git`; run them in a real worktree and CI, and report the M4
result honestly.

## 10. Real consumer contracts

The success smoke must prove Fake Provider is disabled, the normal editor
control is used, review is visible, Insert changes only dirty editor state,
`pre_save_post_writes=0`, one explicit Save performs the expected write, the
revision/persisted value are correct, non-target content is unchanged, and the
temporary post/session are removed.

The recovery smoke must prove a safe error is visible, no premature write
occurs, Retry/Regenerate restores usability, the user can edit before Insert,
Save remains the final write, and all overrides/fixtures are removed.

A deterministic transport-preempted fake proves editor recovery only. A real
Provider-failure experiment requires a separate bounded budget and must not
corrupt shared credentials or routing.

## 11. Post-merge M4 acceptance

Promotion must run from the stable, clean, current `master` operations
worktree. Detached HEAD, feature branch, stale `master`, or dirty source must
fail closed.

Accepted status requires:

```text
acceptance_state=accepted
promotion_pr=<merged PR>
source_revision=<current origin/master>
source_branch=master
source_dirty=false
```

A promotion command that merely dispatched remote work is not acceptance.
Wait for stable state and healthy relevant services before reporting it.

## 12. Cross-repository matrix

| Repository/runtime | Validation responsibility | Default edit owner |
| --- | --- | --- |
| official WordPress AI | Ability and editor behavior | upstream/local WordPress task |
| `npcink-cloud-addon` | signed transport and result/no-write contracts | Addon task |
| `npcink-ai-cloud` | runtime/profile/Provider/evidence | Cloud task |
| `npcink-workflow-toolbox` | central quality matrix, not request transport | toolbox task |
| Local WordPress | mounted consumer and final-write proof | disposable local validation |
| M4 | candidate/accepted development runtime | one operation owner at a time |

List dependencies during audit. Expand edits only when a public contract truly
crosses repositories and the change envelope explicitly authorizes it.

## 13. 2026-08-02 closeout record

The audit found `wp-ai.short-text` selecting embedding-only Ollama candidates
and a catalog that no longer contained the configured Hosted GPT-5.5
connection. The owning gap was catalog/profile reconciliation.

PR `#462` repaired it by using live enabled Provider adapters during runtime
seed/catalog refresh, filtering WordPress candidates by execution source,
configuration, and Provider capability, and testing an embedding-only Provider
whose catalog entry was incorrectly tagged as text.

The real browser used WordPress AI `1.2.0`, Addon `0.1.3`, and the normal
editor. Title, summary, and rewrite returned through Hosted GPT-5.5. The
primary title request recorded:

```text
run_id=run_922acf41849248ffbcea53c1a2bb3cbd
provider_call_id=462
profile=wp-ai.short-text
provider=openai
model=gpt-5.5
instance=openai-global-gpt-5-5
fallback=false
error=""
suggestion_only=true
```

The browser recorded zero pre-save writes, one explicit save, and one revision
increment. Provider, usage, credit, and empty-error evidence shared the same
Provider call. A deterministic local failure/recovery smoke proved visible
error, retry, regenerate, user edit, save, and cleanup; it was not claimed as a
real Provider failure.

Verification summary:

- catalog/seed: `15 passed`;
- runtime/Provider/OpenAI: `233 passed`, one existing deprecation warning;
- real-Provider budget: `3 / 3`, then closed;
- PR `#462` required checks: passed;
- merged and M4-accepted `master`: `4043d20759b8e64efab1192332b0a47bda92c5e9`;
- accepted M4 focused regressions: `2 passed`;
- accepted HTTP: `/=200`, `/health/live=200`;
- production: not changed;
- human acceptance: not measured.

One M4 contract attempt collected `839`: `834 passed`, `3 skipped`, `2 failed`
because engineering inventory checks require `.git`, intentionally absent from
the source bundle. The two inventory contracts passed in a normal Git worktree
and protected GitHub backend checks passed. This remains partial M4 contract
evidence, not an unqualified green full suite.

## 14. Work review report

### Original goal

Prove and minimally repair the real WordPress-to-Hosted-GPT-5.5 value chain
while preserving WordPress control-plane and final-write ownership.

### Completion

- [x] traced every owner, interface, and state boundary;
- [x] separated current evidence from historical tests and inference;
- [x] repaired one owning seam;
- [x] proved a real Provider success path and controlled editor recovery;
- [x] correlated Provider, usage, credit, fallback, and error fields;
- [x] merged and promoted clean `master`;
- [x] released merge/M4/slot/relay/tunnel/worktree ownership;
- [ ] production validation, intentionally excluded;
- [ ] independent human acceptance, not measured.

### Problems and corrections

| Severity | Concrete problem | Root cause | Durable correction |
| --- | --- | --- | --- |
| must correct | A prior accepted loop did not prevent later refresh from selecting embedding-only routing | revision evidence was separated from mutable runtime-state evidence | validate revision, connection capabilities, binding, and consumer together |
| must correct | Candidate selection trusted catalog tags alone | metadata projection was mistaken for execution authority | require execution source, configuration, and capability compatibility |
| should correct | A promotion attempt used detached HEAD and failed | script branch identity was not checked first | use the stable clean `master` operations worktree |
| should correct | The first status poll still showed the old candidate while remote apply was finishing | dispatch was momentarily conflated with completed transition | wait for stable accepted state and service health |
| should correct | Local seam/perimeter stopped because ignored `.env` was absent | environment prerequisites were mixed with source tests | report it exactly; use focused tests and CI without silent Docker substitution |
| improve | M4 full contract included Git inventory checks | scope ignored intentional source-bundle limits | run Git contracts locally/CI and M4 runtime tests on M4 |

### What worked well

- delayed Provider calls until routing was understood;
- protected dirty shared work in a locked worktree;
- concentrated changes in one seam and added an adversarial regression;
- preserved credentials, evidence minimization, and WordPress write ownership;
- bounded Provider spend and used the real consumer;
- kept candidate, PR, merged, accepted, production, and human states distinct;
- accepted fail-closed promotion behavior instead of bypassing it.

### Next-task focus

- observe the accepted revision without modifying it;
- treat a later `master` or candidate as a new evidence target;
- collect natural stability/correlation evidence without paid calls solely for
  reporting;
- keep production and human acceptance separately authorized.

## 15. Pending task: observe the M4 accepted revision

Status: **pending; not started by this documentation change**.

Target at creation time:

```text
revision=4043d20759b8e64efab1192332b0a47bda92c5e9
promotion_pr=462
expected_acceptance_state=accepted
expected_source_branch=master
expected_source_dirty=false
```

Objective: observe whether this accepted development revision stays healthy
and whether naturally occurring, authorized WordPress text requests retain
complete Provider/usage/error correlation. This is observation, not another
feature batch.

Entry conditions:

1. re-read current `origin/master` and `m4:preview:status`;
2. if either revision advanced, do not attribute new evidence to
   `4043d207...`; redefine the target or mark the old target unobservable;
3. confirm operation/slot/relay/candidate ownership is free;
4. do not initialize a Provider budget unless an active probe is separately
   authorized;
5. do not start production or Issue `#406`.

Minimum observation fields:

- exact start/end time and timezone;
- accepted revision and promotion PR at every checkpoint;
- service health and relevant HTTP status;
- non-health `5xx`/`502` count and query coverage;
- naturally occurring target-profile run count;
- success, failure, fallback, and unexplained-error counts;
- run/Provider-call/usage/credit/error correlation completeness;
- lock, candidate, restart, and runtime-change events;
- every unavailable interval or field labeled `unmeasured`.

Recommended first window: one bounded 24-hour observation. Extend to five real
development days only when explicitly requested; days without a valid receipt
remain `unmeasured` and must not be backfilled.

Stop when the target revision changes, another owner/candidate takes M4,
evidence could expose protected data, unapproved spend or production access is
needed, or a defect requires source changes. A defect starts a new focused
development task.

The receipt must conclude `continue`, `modify`, `hold`, or `stop`, with exact
measured and unmeasured fields. It cannot claim `production validated` or
`human accepted` without separate authorization and evidence.

## 16. Closeout checklist

```text
[ ] Actual mounted WordPress source identified
[ ] Ability, Addon, Cloud, profile, Provider, and editor path traced
[ ] One owning seam, conflict domain, and non-goals declared
[ ] Sessions, PRs, worktrees, locks, candidate, slots, relay, and tunnel checked
[ ] Provider ledger claimed before every authorized real call
[ ] Real success used the normal editor with Fake Provider disabled
[ ] Controlled failure/recovery labeled as real or deterministic
[ ] Pre-save writes, explicit save, revision delta, and cleanup verified
[ ] Run, Provider call, usage, credit, fallback, and error correlated
[ ] Focused gates reported exactly, including partial failures
[ ] Exact files staged and reviewed; required PR checks passed
[ ] Clean current master promoted and stable accepted status verified
[ ] Production and human acceptance reported separately
[ ] All task ownership, budgets, fixtures, sessions, tunnels, and locks released
```

## 17. Related records

- [Hosted GPT-5.5 WordPress Short Text Closeout — 2026-07-28](hosted-gpt55-wordpress-short-text-closeout-and-development-retrospective-2026-07-28.md)
- [WordPress Title External Provider E2E Revalidation — 2026-07-25](wordpress-title-external-provider-e2e-revalidation-2026-07-25.md)
- [WordPress Title Provider E2E and Context Preflight — 2026-07-25](wordpress-title-provider-e2e-and-context-preflight-validation-2026-07-25.md)
- [Provider Runtime Compatibility Retrospective — 2026-07-25](provider-runtime-compatibility-development-retrospective-2026-07-25.md)
- [Cloud Hosted Runtime Profiles v1](cloud-hosted-runtime-profiles-v1.md)
