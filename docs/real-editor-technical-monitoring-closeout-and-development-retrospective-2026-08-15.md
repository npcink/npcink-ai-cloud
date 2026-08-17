# Real Editor Technical Monitoring Closeout and Development Retrospective — 2026-08-15

Status: dated implementation and technical-validation evidence; not production,
GA, commercial-value, or human-quality acceptance authority.

## 1. Scope

This record closes the implementation and first two-site technical-validation
stage that followed the platform-administrator review of WordPress-to-Cloud
editor assistance. It consolidates the historical discussion, the Local
WordPress work, the Provider budget, Addon automation, monitoring evidence,
corrections made during validation, and the remaining observation boundary.

The durable operating rules live in:

- [Real Editor Cohort Operations v1](real-editor-cohort-operations-v1.md);
- [Hosted WordPress Text Generation Closed-Loop Validation Standard v1](hosted-wordpress-text-generation-closed-loop-validation-standard-v1.md);
- [Editor Assist Quality Flywheel v1](editor-assist-quality-flywheel-v1.md).

This dated record does not authorize another Provider call, production
deployment, M4 mutation, prompt/model/router change, or WordPress write.

## 2. Original Goals

The work evolved through four operator goals:

1. review the project from the platform-administrator perspective and identify
   unreasonable design, confusing usage, weak diagnostics, and operational
   gaps;
2. implement corrections in stages instead of attempting a broad rewrite;
3. prepare metadata-only evidence so real use could produce data for later
   development;
4. move most defects into Local, Docker, deterministic, and browser validation
   before production or broad real-user use.

The final operator decision removed subjective manual scoring from this stage.
The accepted scope became `technical_monitoring_only`: prove the path,
boundaries, metering, metadata completeness, and cleanup, then use later
monitoring for trend analysis without calling that evidence user value.

## 3. Boundary And Evidence Model

The validated chain was:

```text
official WordPress AI editor control
  -> WordPress Ability
  -> Npcink Cloud Addon signed transport
  -> Cloud hosted runtime and Provider
  -> reviewable suggestion
  -> Insert/Accept in dirty editor state
  -> explicit local Save/Update
  -> metadata-only generation/outcome evidence
  -> bounded Cloud aggregation
```

Ownership remained unchanged:

| Evidence or state | Owner |
| --- | --- |
| Ability, editor control, review, adoption, save, revision | WordPress local |
| Connection, bounded local correlation, signed event transport | Cloud Addon |
| Hosted execution, Provider call, usage/credit evidence, event storage, read-only aggregation | Cloud |
| Prompt, preset, workflow, approval, preflight, final-write truth | Existing local owners; not Cloud |

No prompt, generated output, article content, WordPress post/user ID,
credential, cookie, nonce, authorization header, raw request body, or raw
response body was admitted to the cohort observation record.

## 4. Implementation And Validation History

### 4.1 Preparation

- Local and Docker were selected as the primary defect-removal environment.
- The official WordPress AI `1.2.0` editor surfaces were used instead of a
  test-only route.
- The operator completed the required local WordPress configuration and
  metadata-only monitoring consent on both sites.
- Free entitlement was rechecked from current Portal state instead of relying
  on an earlier one-active-site assumption.

The dated capacity receipt was:

```text
active_sites=2/3
bound_sites=3/9
active_aliases=site_a,site_b
```

This proves the observed entitlement at that time only. It is not a permanent
package promise.

### 4.2 Site B technical pass

`site_b` (`magick-toolbox.local`) completed title, summary, and selected-text
rewrite through the normal editor path:

- three Provider calls;
- eight AI credits in the recorded run;
- one generation and one outcome event per task;
- `saved_exact_output` for the recorded summary and rewrite and complete
  technical adoption evidence for title;
- zero pending quality records;
- zero prohibited fields;
- six Cloud-stored quality events.

### 4.3 Addon automation

The Addon browser smoke was extended and merged through
`npcink-cloud-addon` PR `#97`, merge commit
`b01e671679b4a5e5f283b68269de0ab9edc44bec`.

The merged automation added:

- strict `WP_AI_TEXT_PROVIDER_LEDGER_PLAN` validation;
- read-only ledger and monitoring preflight with no draft, browser, claim, or
  Provider dispatch;
- unique task item/dispatch validation;
- an atomic claim immediately before title, summary, and rewrite UI dispatch;
- exact `provider_dispatch_allowed=true` authorization;
- bounded ledger receipts in the machine summary;
- real-event correlation through the existing site-keyed
  `object_scope_hash` rather than a fixture token in a Cloud run ID;
- documentation and static contracts for the new fail-closed behavior.

Addon verification passed `check:js`, `test:all`, WordPress.org review guard,
boundary search, protected GitHub checks, and squash auto-merge. Playground was
not applicable because plugin bootstrap, activation, public connector API,
default connector state, and the WordPress/PHP compatibility baseline were not
changed.

### 4.4 Site A automated pass

`site_a` (`magick-ai.local`) ran the automated real-Provider flow:

- title reused the already claimed same-item dispatch idempotently;
- summary and rewrite claimed their first planned dispatch immediately before
  the UI click;
- all three Provider responses returned through the official editor;
- no fixture post or autosave write occurred before explicit Save/Update;
- one normal local save preserved draft status and created revision evidence;
- non-target sentinel blocks remained unchanged;
- the temporary post and short-lived authentication session were removed;
- AI credits changed from `11672` to `11664`, exactly the expected eight;
- six events formed three complete sessions with zero pending records;
- title, summary, and rewrite were all `saved_exact_output`;
- prohibited fields were zero;
- Cloud accepted and stored six events, and the local buffer returned to zero.

The shared Provider ledger ended this implementation checkpoint at:

```text
experiment_id=editor-cohort-20260815
claimed_calls=6
remaining_calls=24
status=open
```

It remains open only because the declared observation stage has not yet made a
final no-more-calls decision. An open ledger is not a completed experiment and
must be closed when no further paid calls are authorized.

## 5. What Is Closed

- the obsolete one-active-site Free assumption was corrected with current
  entitlement evidence;
- two independent Local WordPress consumers were concurrently active;
- title, summary, and rewrite completed on both sites;
- Provider-call budget enforcement became atomic at the UI-dispatch boundary;
- monitoring consent remained WordPress-local;
- zero-write-before-save and exact local-save ownership were proved;
- metadata-only event completeness, Cloud storage, pending cleanup, and
  prohibited-field absence were proved;
- subjective human evaluation was removed from the technical stage instead of
  being fabricated;
- a daily operator-local read-only summary was updated to use the verified
  concurrent-site capacity and to keep calls, credits, runs, events, sessions,
  and observations as separate units.

## 6. What Remains Deliberately Open

| Item | Current state | Reason |
| --- | --- | --- |
| Natural observation window | open | one technical checkpoint cannot establish a cross-day trend |
| Decision-grade quality | not reached | six complete sessions are below the 50-session observation and 200-session decision stages |
| Human product value | not measured by operator choice | technical adoption proxies cannot prove usefulness, willingness to pay, or retention |
| Real failure matrix | partial | deterministic recovery is safer than manufacturing paid timeout, rate-limit, credential, or quota failures |
| Provider ledger close | pending | close only after the operator declares that no further bounded calls are authorized |
| Stable Local Addon mount | pending maintenance | both sites still mount the clean topic worktree whose relevant content equals merged master; repointing must not disrupt Local use |
| Production/M4/GA | not part of this stage | no production authorization was given; the Addon test-orchestration change did not require M4 |

Do not treat “remaining” as permission to broaden scope. The next default
action is observation and deterministic failure coverage, not another Admin
surface, telemetry platform, scheduler, or model/prompt change.

## 7. Work Review Report

### Original goal

Build a locally testable, safely budgeted, metadata-only WordPress editor loop
that could enter real use without depending on repeated manual interaction or
subjective scoring.

### Completion

- [x] two-site title/summary/rewrite technical flow completed;
- [x] current Free capacity measured instead of inferred;
- [x] Provider calls bounded by a shared atomic ledger;
- [x] pre-save zero-write and explicit-save ownership proved;
- [x] quality sessions, Cloud ingestion, credits, and cleanup verified;
- [x] Addon automation reviewed, merged, and protected by CI;
- [x] daily read-only monitoring summary configured;
- [ ] natural multi-day observation completed;
- [ ] decision-grade or human-value evidence collected;
- [ ] production validation authorized.

### Problems and corrections

| Severity | Concrete problem | Root cause | Durable correction |
| --- | --- | --- | --- |
| must correct | The early plan retained an outdated “Free allows one active site” assumption | historical package knowledge was treated as current entitlement truth | read the current Portal/entitlement receipt and date-stamp capacity evidence |
| must correct | The first real quality assertion searched for the local fixture token inside a real Cloud run ID | a deterministic Fake Provider identity pattern was generalized to opaque production-style run IDs | correlate through the existing site-keyed `object_scope_hash` and task key |
| must correct | The first site-A command reached Provider success and explicit save, then failed only at the incorrect final correlation assertion | one combined command hid which sub-gates had already passed | preserve successful paid-call evidence, diagnose the exact failed seam, and do not replay Provider calls merely for a green wrapper |
| should correct | Manual quality scoring remained in the initial cohort design after the operator said it could not be supplied | the original experiment goal was not reclassified when the evidence policy changed | declare `technical_monitoring_only` versus `human_value_cohort` before dispatch and prohibit inferred human fields |
| should correct | Title budget was claimed before the automated full run existed | budget preparation and consumer execution were not yet one atomic workflow | reuse the same dispatch idempotently and move every future claim immediately before its UI dispatch |
| should correct | Local event correctness and Cloud stored counts were initially discussed as one “monitoring passed” result | capture, buffer, transport, and read model were compressed into one state | verify local event/session/outcome invariants separately from accepted/stored/duplicate and buffer counts |
| should correct | A manually inspected flush result used a guessed `ok` field even though the authoritative sent/stored/buffer counters were correct | response shape was inferred instead of read from the owning contract | verify exact contract fields; do not let a convenience boolean override authoritative counters |
| improve | The Local sites still mount the auxiliary Addon topic worktree after merge | changing a live symlink during validation risked disrupting both sites | schedule a separate clean-master repoint after merge and observation, then release the lock only when unmounted and clean |

### What worked well

- real calls were delayed until both site and monitoring prerequisites were
  visible;
- the existing Addon buffer, Cloud event table, quality read model, and daily
  cadence were reused instead of adding infrastructure;
- paid calls, elapsed time, browser runs, writes, and cleanup were treated as
  bounded validation resources;
- dirty user worktrees were preserved and focused work used locked clean
  worktrees;
- Provider success, local adoption, Cloud ingestion, merge, production, and
  human evidence remained separate states;
- a failed final assertion was treated as a harness defect rather than evidence
  that the successful Provider/editor path had failed.

### Next-task focus

- collect natural three-to-seven-day evidence without manufacturing calls;
- add deterministic summary/rewrite timeout, rate-limit, disabled-monitoring,
  interrupted-flush, and credential/quota failure coverage;
- close the Provider ledger when the operator declares no further calls;
- repoint both Local sites to a stable clean Addon `master` worktree during a
  planned maintenance step;
- run fixed-corpus evaluation only after a sustained candidate and sufficient
  samples justify it.

## 8. Reusable Development Method

### 8.1 Separate the four truths

Every editor-assist validation must report four truths independently:

1. **consumer truth**: the real editor control rendered, reviewed, adopted, and
   saved through WordPress;
2. **runtime truth**: Cloud selected and executed a compatible Provider path;
3. **evidence truth**: usage, credits, events, sessions, and errors correlate
   without prohibited data;
4. **value truth**: a human or adequately mature observation supports a product
   conclusion.

The first three can be automated. The fourth cannot be manufactured from a
successful HTTP request or exact save.

### 8.2 Spend only after fail-closed preflight

Before a paid call, verify site, version, mounted source, connector,
monitoring, feature flags, open ledger, reserved item, unique dispatch, and
credit expectation. Claim at the last responsible moment: immediately before
the UI action that can dispatch the call.

### 8.3 Use deterministic tests for destructive failures

Use Fake Provider, local filters, disposable WordPress fixtures, Docker, and
bounded interrupted-transfer tests for failures that would otherwise consume
budget, corrupt shared credentials, or destabilize a real site. Label this
evidence deterministic and never call it a real Provider failure.

### 8.4 Preserve partial evidence

A combined command is not one indivisible fact. If generation, adoption,
write, credit, or cleanup passed before a later unrelated assertion failed,
record those sub-gates. Rerun only the seam whose evidence is missing.

### 8.5 Automate collection, not product mutation

Automatic monitoring may collect and summarize metadata-only evidence. It may
not enable consent, create Provider calls, change sites, rewrite prompts,
select models, modify routing, open Eval, write WordPress, or promote
production.

## 9. Rollback And Closeout

This documentation changes no runtime behavior. Revert the documentation PR to
roll back its normative wording.

Operational cleanup remains separately governed:

- close only the exact Provider experiment with a bounded reason;
- preserve the observation receipt and automation history;
- repoint Local symlinks only to a verified clean checkout;
- unlock/remove auxiliary worktrees only after merge, cleanliness, unmount,
  and rollback checks;
- do not start production without the exact operator approval required by the
  production release policy.
