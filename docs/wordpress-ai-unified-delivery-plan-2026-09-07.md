# WordPress AI unified delivery plan

Status: historical staged plan with the current disposition below.

## Current disposition, 2026-09-08

This checkpoint supersedes older milestones and proposal language below.
The operator approved phase-1 engineering closeout into master, not production.
The product objective still includes model choice and task-specific site
context; formatting is the first finished workflow, not the entire objective.

- Formatting: Cloud returns complete validated HTML; WordPress displays it in
  the visible editor with undo. No separate preview page or second Apply step.
  Native WordPress save remains the author's action. No tool-triggered save.
- Preservation: original text, media, tables, code, links and order are protected.
  Only spacing and bounded paragraph/list/BR repairs are in scope. Do not resume
  empty-node deletion, heading promotion or broad semantic rewriting.
- v2 is the WordPress HTML path. v1 spacing compatibility is retained; no new
  Markdown structure or cross-platform delivery is claimed.
- Models/context: the later pilot has 23 attempts, 16 successful outputs and
  eight complete pairs. Earlier 10-attempt records below are intermediate.
  No model winner or site-context benefit has been established. Reuse existing
  artifacts offline first; new provider/judge calls require a bounded decision.
- Human role: practical use and feedback only. Dedicated manual scoring is not
  a required next step. Third-party billing is used, not rebuilt.
- Nano and further semantic segmentation remain paused. Existing research is
  archived, not an executable backlog.
- Follow-up sequence: finish source integration and clean-master M4 acceptance;
  inspect existing model-pair evidence offline; propose at most one bounded
  model/context comparison only if missing evidence will change a real choice.

See [phase-1 closeout](history/wordpress-ai-engineering-closeout-2026-09-08.md)
for exact PRs and acceptance evidence, and the [formatting history](history/wordpress-content-formatting-summary-2026-09-08.md)
for requirements and engineering lessons.

## Historical baseline plan
Baseline inspected: Cloud `735b422a11b519f934786e922e0d3c6b33da3cb2`.

## Objective and authority

Deliver cost-conscious model selection, task-specific site enhancement, and
safe content formatting. Two-site technical monitoring is one milestone, not
the product objective. Default lane: development. Publication, merge and
production deployment are not authorized by this plan.

Gemini Nano is paused completely: no feature, provider, fallback, routing or
development dependency. Its research remains archived in Eval Lab. Formatting
decisions discussed in that historical task remain independent of Nano.

## Confirmed requirements

- Retain functional profiles; several profiles may share an actual model.
- Keep primary execution, failure fallback and explicit experiments separate.
- Do not build another model registry, routing control plane or monitoring platform.
- Reuse official WordPress AI controls instead of duplicating basic features.
- Current content is task fact; retrieved site context supplies bounded,
  relevant terminology and style, not unrelated historical facts.
- WordPress owns permissions, review, revisions, final writes and publication.
- Cloud formatting supports Markdown-to-Markdown and HTML-to-HTML, without
  format conversion; deliver the WordPress consumer before other platforms.
- Preserve visible text, punctuation, numbers, URLs, entities and code.
- Allow reviewed spacing, paragraph splits, heading/list structure and empty
  node operations; preserve Gutenberg comments and protect complex regions.
- AI returns allowed operations, never an unconstrained replacement article.
- AI failure may return a mechanically validated rule-only candidate with
  explicit failure evidence and required human review. Invariant failure must
  not return a writable candidate.
- Formatting uses existing runtime/provider infrastructure and defaults to
  no-store content handling. Exact lifecycle semantics require source review.

## Current evidence inventory

| Area | Current evidence | What remains unproved |
| --- | --- | --- |
| Profiles | `app/domain/wordpress_ai_connector/routing_profiles.py` defines short text, editorial, classification, vision, image and audio groups | Actual model bindings, comparative quality and cost |
| Task mapping | Title/excerpt/meta description use short text; summary/rewrite/reply use editorial; classification/moderation use classification | Support and user-facing behavior for every official AI task |
| Quality | `docs/editor-assist-quality-flywheel-v1.md` and `app/domain/observability/editor_assist_quality.py` exist; editor contract names title, summary and rewrite | Two-site end-to-end evidence and actual model attribution |
| Site context | Existing generation-reference documentation is historical evidence | Current task-specific retrieval coverage, lifecycle and measurable benefit |
| Browser harness | Addon has uncommitted AI 1.2.0/1.3.0 compatibility work and readiness tests from this task | Full browser flow on both current sites |
| Sites | Earlier browser evidence showed both local sites connected; demo site was disabled to release a slot | Revalidate current settings before temporary test changes |
| Formatting | No matches for `content.format`, `content_format` or `format-proposal` in current Cloud `app/`, `tests/` and docs index; historical formatting worktree absent from current inventory | Locate recoverable historical work and inspect it before reuse; no completion claim |
| Nano | Eval Lab `docs/gemini-nano-research-and-deferral-2026-09-07.md` exists | No development planned |

Source existence is not a passed test. Earlier checks and runtime observations
must not be represented as fresh evidence for this baseline.

Current read-only preflight on both sites passes local environment, HTTP home
origin, AI version and verified connector checks, then stops at required AI
feature flags. No fixture was created and no Provider execution was attempted.
Snapshot and temporary feature enablement are the next technical action, not
another connection authorization or plugin installation.

### Pre-enable safety checkpoint, 2026-09-07

Both site preflights were rerun with their explicit Local PHP 8.2.29 binaries,
MySQL sockets and HTTP origins. Both again passed environment, origin, reviewed
AI version and verified connector checks, then failed the required feature-flag
assertion. No fixture or Provider dispatch occurred. The Addon readiness
regression file passed both tests (version allowlist and retained safeguards).
The generic WP-CLI inspector used system PHP without the Local socket and could
not detect the installation; the explicitly targeted preflights are the valid
site evidence, not that generic negative result.

Source inspection identified prerequisites before enabling monitoring:

- The disposable fake transport intercepts `/v1/runtime/execute` only. It does
  not prevent monitoring uploads, while collector registration schedules an
  upload whenever verified monitoring is enabled. Thus synthetic events could
  escape to Cloud or disappear from the local buffer during the browser test.
- The browser runner explicitly cleans its draft, authentication session and
  fake transport state, but does not explicitly remove fixture-scoped quality
  buffer/pending records. Draft deletion alone is not cleanup proof for those
  separately stored options.

The next action identified at that checkpoint was to implement bounded fake-mode upload isolation plus fixture-scoped
metadata cleanup, including failure paths, before temporary feature enablement.
Preserve unrelated buffered events, credentials and settings. Do not disable
all site cron or clear entire shared options. This is test-harness safety work,
not a request to expand the monitoring product. Real Cloud ingestion and
cross-site isolation remain separate, unproved validation exits.

### Two-site local browser result, 2026-09-07

Fake-mode upload isolation, fail-closed expiry and fixture-scoped quality cleanup
are now implemented in the Addon browser harness, not production plugin code.
The JavaScript gate passes five regression tests. Both sites completed the
full fake-provider quality browser flow on WordPress 7.1, AI 1.3.0 and Addon
0.2.0. Review screenshots were visually inspected in both site languages.

| Evidence | Site A | Site B |
| --- | --- | --- |
| Pre-save post/autosave writes | 0 | 0 |
| Explicit save writes / revision delta | 1 / 1 | 1 / 1 |
| Quality events / sessions | 8 / 3 | 8 / 3 |
| Exact saved summary and rewrite outcomes | 2 | 2 |
| Manually edited title, unmatched saved outcome | 1 | 1 |
| Pending records after test / after cleanup | 0 / 0 | 0 / 0 |
| Buffer records after cleanup | 0 | 0 |
| Forbidden quality fields / invalid storage markers | 0 / 0 | 0 / 0 |
| Draft, temporary auth session, fake option and MU file removed | verified | verified |
| Original feature options and remaining settings fingerprint restored | verified | verified |

B's first run exposed a stale test assumption: AI 1.3.0 migrated summary meta
from `ai_generated_summary` to `wpai_generated_summary`. Official installed
upgrade and registration sources confirmed this. The harness now selects the
exact key for reviewed versions, retaining the original equality assertion;
the corrected B rerun and A run passed. The failed B draft was also removed.

Fresh snapshots supersede the historical switch record: A monitoring was
already enabled and was preserved; B monitoring was disabled and was restored
to disabled. A's existing site-reference request flags were preserved, not
newly enabled, and the fake transport does not prove retrieval occurred.

Machine summaries and switch snapshots are under
`/tmp/npcink-two-site-validation.yhz7bh/{A,B}/`; they are local temporary
artifacts, not durable repository acceptance or production evidence. Successful
fixture IDs were A `281058` and B `9`; failed B fixture `6` was removed.
No real model dispatch was used. At this browser checkpoint, real Cloud
ingestion and cross-site authorization isolation were still unproved; the
following checkpoint records their separate evidence.

### Live metadata transport and isolation, 2026-09-07

Read-only M4 status reported accepted PR `923`, clean `master` revision
`735b422a11b519f934786e922e0d3c6b33da3cb2`, matching the local origin reference.
Health and migration-head checks passed. No sync, deploy or promotion occurred.
The existing WordPress loopback tunnel used LAN SSH to M4; it was not changed.

Through each site's actual Addon signed client and existing credentials:

- One `validation.technical_monitoring_only` event per site was accepted and
  stored. Reposting that same event with another request idempotency key gave
  `stored_count=0`, `duplicate_count=1` on both sites.
- Each site's signed summary showed exactly one event under its unique test
  plugin slug and no event under the other site's test slug.
- In-memory requests retaining the site's key but declaring the other site's
  identity were rejected as `cloud_auth_invalid_key` in both directions.
  Persisted credentials were never replaced.

The unique test slugs are `npcink-tech-20260907-yhz7bh-a` and
`npcink-tech-20260907-yhz7bh-b`. Two metadata-only diagnostic events remain in
the preview database under normal retention; they are not real user quality
feedback or Provider runs. The raw bounded receipt is
`/tmp/npcink-two-site-validation.yhz7bh/cloud-check.json`. This proves live
signed-client transport, persistence-visible summary, deduplication and the
tested site-identity isolation cases, not every authorization route or a
scheduled WP-Cron delivery cycle. Paid execution and real model attribution
remain outside this technical test.

The central `composer quality:matrix:run` ran once: all five WordPress repository
gates passed; Cloud returned `needs_validation` because this working tree has
the uncommitted plan document and exact-SHA CI requires a clean tree. Overall
matrix exit was 1, not green. Preserve successful sub-gates. This does not
authorize a commit, publication, new broad run, or removal of the document.

M4_OBSERVATION_RECEIPT date=2026-09-07; route=WordPress-loopback-LAN-SSH; sync=not occurred; focused=not measured; promotion=not occurred; operations=sync:0,deploy:0; stable_502=not measured; m4_only=not occurred; coordination=not occurred

## Ordered milestones and exits

1. Baseline: finish source/test inventory and preserve this requirement ledger.
   Inspect historical formatting artifacts read-only; never reconstruct their
   state from task summaries alone. Status: in progress.
2. Technical validation: snapshot both sites' settings, temporarily enable only
   agreed features and metadata monitoring, run serial Fake Provider browser
   flows, verify fixture/session/filter cleanup, restore original settings.
   Record local versus Cloud ingestion and site-isolation evidence separately.
   Fake transport cannot prove real runtime dispatch, cost or model quality.
   Status: both local fake-provider browser flows and live signed metadata
   ingestion/deduplication/site-isolation cases passed. Overall cross-repository
   source closeout remains needs_validation; no merge or production claim.
3. Model/site value: fixed samples, first compare models with context held
   constant; then compare site context on/off with model held constant.
   Measure quality, latency, errors and cost per usable result. Obtain an exact
   real-call budget before execution. Do not infer decisions from one output.
   Status: partial execution; the operator approved four public articles and
   at most 40 upstream attempts. The later instruction to use the third-party
   platform supersedes the tariff-confirmation dispatch blocker; CNY 20 remains
   a budget target, not an enforced or verified settlement ceiling. See the
   pilot checkpoint below. Replacement model and reduced pairing await approval.
4. Formatting runtime: inspect reusable work, freeze MD/HTML contracts, implement
   protected parsing and rule operations, integrate AI operation suggestions,
   validate invariants, failure modes and runtime lifecycle. Deliver candidates
   and differences only. Status: pending.
5. WordPress consumer: preview, explicit adoption, stale-source SHA rejection,
   native revision and reliable restore. Validate disposable copies first;
   confirm selected real articles and write authority before real adoption.
   Human assessment must show useful improvement, not just passing code tests.
   Status: pending; real-article writes not authorized.
6. Expansion decision: use findings to select or defer one further official AI
   task/platform. A justified defer decision satisfies planning, not an implied
   implementation of every possible feature. Status: pending.

## Model pilot checkpoint, 2026-09-07

The local direct-gateway pilot is not Cloud runtime or WordPress adoption
evidence. The controlling experiment `wp-ai-model-context-20260907` was
reconciled against its ledger and local result artifact: 10 of 40 attempts
claimed, with 4 successful GPT-5.6 outputs, 5 Luna HTTP 403 refusals and one
interrupted request whose completion is unknown. The unknown dispatch is
`p22057-summary-gpt-5-6`; it remains spent and must not be automatically replayed.
Successes cover article 280875 title/summary/rewrite and article 22057 title.
Successful generation is not human acceptance or comparative quality evidence.

The initial global consecutive-failure stop condition was inadequate: successes
from the other model reset the counter, allowing repeated Luna refusals. The
batch was terminated. The local runner now stops on HTTP 401/403, but regression
proof is still required before further paid dispatch. Preserve failed and
uncertain records; do not regenerate successes to produce a cleaner history.

Authenticated read-only `GET /v1/models` returned HTTP 200 and exactly
`gpt-5.5`, `grok-4.5`, `grok-4.6`, `gpt-5.6`. Public Luna pricing did not prove
credential access. Listed IDs likewise do not guarantee successful generation
or independently verified upstream model identity.

Remaining reservations are model comparison 14, context generation 8 and
context embedding 8. Do not reset the ledger or consume context reservations
to hide failed comparison attempts. The original complete 24-call matrix no
longer fits the comparison reservation. A proposed GPT-5.6/Grok-4.6 quality
comparison with fewer pairs is awaiting operator confirmation; it is not an
approved economy-model substitution. Actual third-party charges remain unknown.

Raw samples and results remain ignored local artifacts in Eval Lab under
`generation-context/generated/model-pilot-{samples,results}-20260907.json`.
Frozen public sample IDs are 280875, 22057, 22055 and 280861. Their WordPress
product-description skew limits generalization. No real article was written,
no shared routing was changed and Nano remains excluded. Human review,
real Site Knowledge comparison and milestones 4-6 remain incomplete.

## Verification and resource rules

For baseline documentation: changed-file plan, diff checks and selected policy
gate. No M4 sync/deploy, build or Provider call needed. For later milestones,
declare the owning module, risk tier, exact tests and resource budget before
changes. Reuse valid evidence; do not expand technical validation indefinitely.
Cross-repository completion requires the Toolbox central quality matrix.

At each exit report requirements proved, failed or missing; source revision;
test/runtime evidence; cleanup/restoration; remaining authorization. Do not
mark the overall goal complete until all requested delivery and decision exits
are supported. No claims of merge, M4 acceptance or production from local tests.

Rollback for this baseline is removal of this newly added document only. Later
site rollback restores snapshotted options and removes only exact disposable
fixtures, preserving established Cloud credentials and unrelated user work.
