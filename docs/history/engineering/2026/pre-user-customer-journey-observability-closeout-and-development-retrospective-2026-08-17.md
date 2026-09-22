# Pre-user Customer Journey Observability Closeout and Development Retrospective — 2026-08-17

Status: time-bounded cross-repository evidence and next-stage handoff.

Purpose: close the internal pre-user observability implementation stage,
separate completed engineering evidence from unreleased and unmeasured states,
and preserve a lean operating method for the first consenting non-author user
cohort. This document is not production, WordPress.org, public-site, Provider,
or human-recruitment authorization.

## 1. Outcome

The project now has a bounded, privacy-safe path for collecting the product
journey signals that a non-technical user is unlikely to report precisely:

- the WordPress Addon can send explicitly enabled, metadata-only editor events;
- Cloud can ingest, retain, summarize, and propose read-only defect candidates;
- Portal can send authenticated, site-scoped login, connection, and support
  events;
- the existing summary is sufficient for the first small cohort, so no new
  dashboard or analytics platform is required;
- monitoring consent, content ownership, approval, and final writes remain in
  WordPress rather than moving into Cloud.

This closes the source-foundation stage. It does not close formal release or
human product validation.

## 2. Frozen closure envelope

Focused modules were customer-journey metadata, Portal site-scoped producers,
the Addon producer and disclosure, and the real-editor observation runbook.

Explicit non-goals were:

- no prompt, generated text, article content, email, URL, DOM, raw WordPress
  user/post identifier, credential, or free-form exception collection;
- no clickstream, user profile, advertising use, employee scoring, automatic
  approval, automatic fix, or automatic WordPress content mutation;
- no second Cloud control plane, prompt/router/preset truth, local ability
  registry, or workflow registry;
- no dashboard before the manual summary proves insufficient;
- no extra paid Provider calls solely to manufacture evidence;
- no production, WordPress.org, public privacy-page, or cohort operation in
  this closeout.

The validation classification for this document-only closeout is `L0`. It
uses source and policy checks only; M4, Docker, Provider, and production gates
are not repeated because the document changes no runtime behavior.

## 3. Issue and evidence matrix

Evidence was rechecked on 2026-08-17.

| Historical issue | Owner | Source state | Release or consumer evidence | Final classification |
| --- | --- | --- | --- | --- |
| Non-technical users cannot precisely report editor failures | Cloud customer-journey service | PR `#750`, merge `95db18f8` on Cloud `master` | M4 later accepted Cloud `master` revision `6063d0b7`; production remains at `53f0040d` | source closed; production open |
| Portal setup failures were absent from the observation path | Cloud Portal | PR `#751`, merge `6063d0b7` on Cloud `master` | M4 acceptance identifies PR `#751` and revision `6063d0b7` | source and M4 closed; production open |
| WordPress lacked a privacy-safe journey sender | `npcink-cloud-addon` | PR `#99`, merge `8cb0b9b` on Addon `master` | no WordPress.org release containing this revision was verified | source closed; public package open |
| Monitoring disclosure could be mistaken for hidden or content-level tracking | `npcink-cloud-addon` | translation PR `#100`; consent/data-scope PR `#101`; Addon `master` at `8355b1b` | `magick-ai.local` displayed the corrected “使用与故障诊断” copy from a clean local `master` checkout | local consumer closed; public package and privacy page open |
| The local settings page appeared unchanged after implementation | Local WordPress mount | no product-code defect | plugin symlink still targeted an older worktree; repointing it to clean Addon `master` at `8355b1b` exposed the intended copy | closed locally; durable lesson recorded |
| The first cohort needed funnel and recovery visibility | Cloud read model and operator workflow | bounded summary shipped with PRs `#750`–`#751`; active contract and runbook updated by this closeout | no real non-author production cohort yet | engineering closed; human evidence open |

## 4. Exact environment state

| Plane | Evidence state on 2026-08-17 | What it proves |
| --- | --- | --- |
| Cloud development | `origin/master=6063d0b7` | customer-journey storage/summary and Portal producers are integrated |
| Cloud production source | `origin/production=53f0040d` | the journey commits are not yet in the production branch |
| M4 candidate/acceptance | accepted PR `#751`, revision `6063d0b7` | the current Cloud `master` candidate passed the governed M4 acceptance chain |
| Addon development | `origin/master=8355b1b` | sender, translations, and clarified consent copy are integrated |
| Local WordPress | `magick-ai.local` mounted a clean Addon `master` checkout at `8355b1b` and displayed the new copy | one local consumer used the intended revision |
| WordPress.org | public `0.1.7` remained the observed release | the new sender/copy must not be assumed available to new sites |
| Public privacy notice | older mixed-language monitoring copy remained observed | public disclosure still needs an independently authorized update |
| Human acceptance | no non-author user cohort run | usability, comprehension, retention, and willingness to pay remain unknown |

M4 acceptance is not production deployment. A local symlink is not a package
release. A merged Addon commit is not evidence that WordPress.org or an
installed site uses it. A successful automated journey is not human product
value.

## 5. Product decision

For the present commercial-validation stage, the implemented scope is enough.
The project should default to explicit site-administrator opt-in, make the
monitoring purpose and forbidden data clear, and use the existing manual
summary to diagnose the first cohort. It should not invest now in dashboards,
click-level analytics, identity tracking, automated remediation, or broad
evaluation infrastructure.

The initial useful measures are:

- first-use start-to-success/failure progression;
- retry and failure-recovery rate;
- accepted suggestion followed by explicit save;
- settled abandonment;
- Portal login, connection, and support blockers;
- bounded error counts and anomalous-session references.

These measures help locate friction. They do not by themselves prove content
quality, business value, retention, or willingness to pay. Those conclusions
require the separately declared human-value cohort and bounded human
observations.

## 6. Reusable single-operator and AI development method

### 6.1 Separate five truths

Always report source, protected merge, candidate runtime, formal release, and
human acceptance separately. Most false closeouts in this stage came from
compressing two or more of these states into “done.”

### 6.2 Start with deterministic and local evidence

Use closed schemas, allowlists, unit/contract tests, Fake Provider paths,
fault injection, and local WordPress consumers to remove obvious defects
before spending Provider budget or involving real users. A real call should
answer a question the deterministic lane cannot answer.

### 6.3 Treat external operations as bounded resources

Declare limits for paid calls, broad gates, image builds, M4 operations, and
production actions. Preserve successful sub-gate evidence when a later wrapper
assertion fails. Do not replay a paid or slow operation merely to make one
combined command green.

### 6.4 Verify the consumer's exact revision

When UI behavior contradicts source, inspect the active plugin mount, symlink,
package version, runtime revision, caches, and environment before changing
code. The missing local disclosure was caused by an old worktree mount, not by
the merged copy implementation.

### 6.5 Keep observation proportional to the stage

For `2-3` early users, a bounded summary plus named anomalous sessions is more
useful than a dashboard. Add infrastructure only after repeated real evidence
shows a concrete unanswered question. This protects a single operator from
maintaining an analytics product before the core commercial logic is proven.

### 6.6 Convert evidence into ordinary work

Telemetry never edits the product automatically. The operator reviews the
summary, reproduces the issue where possible, classifies it as fix, improve,
observe, or invalid evidence, and then uses the normal scoped development,
review, release, and rollback workflow.

## 7. Next-stage order

Proceed only through separately authorized steps:

1. promote the intended Cloud `master` revision through the protected
   production lane and verify the deployed revision and health;
2. publish an Addon version containing PRs `#99`–`#101`, then verify the
   immutable package/tag and installed revision;
3. update the public privacy notice so it matches the shipped disclosure and
   data contract;
4. run preflight on each cohort site, including explicit administrator opt-in,
   empty/reconciled buffers, summary visibility, and no prohibited fields;
5. invite `2-3` consenting non-author editors on the formal release machines;
6. inspect the manual summary daily during the bounded window and fix only
   reproducible or sufficiently repeated defects;
7. close with one `go`, `modify`, `hold`, or `stop` decision under the active
   cohort runbook.

Do not infer authorization for steps 1–5 from this sequence.

## 8. Closeout receipt

```text
Scope: privacy-safe WordPress and Portal customer-journey observability foundation
Issue ledger: source implementation and local/M4 evidence closed; formal release and human acceptance explicitly open
Source evidence: Cloud master 6063d0b7 via PRs #750-#751; Addon master 8355b1b via PRs #99-#101
Release evidence: Cloud production 53f0040d; WordPress.org observed at 0.1.7; no open production PR observed
Runtime/consumer evidence: M4 accepted 6063d0b7; magick-ai.local displayed Addon 8355b1b disclosure
Deferred evidence: Cloud production, Addon publication, public privacy notice, and 2-3-person non-author cohort
External-operation budget and actual use: docs-only; zero Provider, M4, Docker, production, WordPress.org, or public-site operations
Rollback: revert this documentation PR; runtime behavior is unchanged
Final state: pre-user engineering foundation closed; formal release and human-value validation remain operator-authorized next-stage work
```
