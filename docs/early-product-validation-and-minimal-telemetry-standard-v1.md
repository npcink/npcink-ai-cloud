# Early Product Validation and Minimal Telemetry Standard v1

Status: active product-development standard.

Date: 2026-08-17.

Purpose: keep the pre-commercial Npcink AI phase focused on proving that
non-author WordPress users can complete and value the core hosted-AI workflow.
It defines the smallest useful observation and defect-improvement loop without
turning Cloud into a product-analytics platform or using engineering breadth as
a substitute for market evidence.

This standard does not authorize production deployment, Provider spending,
automatic product mutation, or WordPress writes.

## 1. Current Stage and Evidence Baseline

The project is still in early product validation:

- one human developer uses AI tools to implement and test the system;
- there has not yet been a real non-author user acceptance cohort;
- deterministic source tests, GitHub CI, M4 candidate checks, and clean-master
  M4 acceptance provide strong engineering evidence, but not user-value or
  commercial evidence;
- PR `#750` added the privacy-safe `customer_journey_event.v1` Cloud ingestion
  and summary foundation and was accepted on M4 at merged revision
  `95db18f8bcebfc65fb4e72592cf39cff8b23d86d`;
- that foundation has not been enabled on the production machine and does not
  by itself collect real user evidence.

The principal question is therefore no longer whether more infrastructure,
dashboards, abstractions, or synthetic tests can be built. It is:

> Can a non-technical, non-author user complete the normal WordPress Ability
> -> Addon -> Cloud runtime -> hosted model -> reviewed editor-adoption path,
> receive useful output, recover from ordinary failures, and choose to use it
> again or pay for it?

Until that question has real evidence, engineering work should make the core
journey easier to try and diagnose rather than expand product breadth.

## 2. Governing Principles

### 2.1 Prove one core task before expanding

Prefer a small number of representative WordPress tasks, currently title
generation, summary generation, and selected-text rewrite. Do not add another
CMS, broad workflow family, commercial surface, or infrastructure layer merely
because the current implementation makes it technically possible.

### 2.2 Non-technical users report outcomes, not diagnoses

Trial users should not be asked for logs, route names, error codes, screenshots
of developer tools, or technical explanations. Ask only questions they can
answer reliably, such as:

- Did you finish the task?
- Was the result useful enough to keep?
- Did you know what to do after an error?
- Would you use this again?

Bounded metadata should identify the likely failing step. A developer then
reproduces and diagnoses the problem from product and runtime evidence.

### 2.3 Collect the minimum evidence needed for a decision

The first useful journey evidence is limited to:

- connection or login started, succeeded, failed, or retried;
- generation started, succeeded, failed, retried, accepted, or rejected;
- explicit save completion or a settled accepted-without-save session;
- bounded duration, coarse error category/code, surface, browser family, and
  desktop/mobile class when they answer a real diagnostic question;
- optional Cloud `run_id` only when it belongs to the authenticated site.

The authoritative event shape, privacy boundary, retention, and summary rules
remain in [Customer Journey Metadata v1](customer-journey-metadata-v1.md).

Do not collect content, prompts, generated output, editor identity, WordPress
object IDs, arbitrary URLs, DOM, form values, stack traces, credentials, raw
request/response bodies, or arbitrary error messages.

### 2.4 Automatic diagnosis is advisory

Cloud may produce bounded funnel summaries, anomalous session references, and
P1/P2 defect candidates. A candidate is a lead for human investigation, not
proof of a defect and never authority to change prompts, routers, presets,
models, workflows, approval state, publication state, or WordPress content.

### 2.5 Synthetic evidence does not prove human value

AI role-play, deterministic fixtures, browser automation, disposable
WordPress, and M4 are useful for finding obvious defects before a user trial.
They can prove contract behavior, recovery paths, privacy, compatibility, and
runtime facts. They cannot prove comprehension, usefulness, willingness to
reuse, support burden, or willingness to pay.

### 2.6 Evidence states remain separate

Report source tests, M4 candidate validation, PR checks, merge, M4 acceptance,
production deployment, production observation, non-author acceptance, and
commercial evidence as separate facts. Do not shorten all of them to “done.”

## 3. Minimum Trial and Improvement Loop

Use this loop after a separately authorized production release enables the
bounded emitter:

```text
consenting non-author user attempts one core task
  -> Addon emits metadata-only journey events
  -> Cloud settles the session and produces a bounded summary
  -> developer selects one reproducible high-value defect candidate
  -> narrow fix and regression test
  -> normal source, CI, merge, and M4 acceptance chain
  -> separately authorized production release
  -> repeat the affected user journey
```

The first implementation after the Cloud foundation should remain small:

1. Add a WordPress/Add-on emitter for the allowlisted core events.
2. Reuse the existing Cloud summary API and simple operator queries.
3. Run a bounded cohort with a few consenting non-author users.
4. Record one outcome per cohort: `go`, `modify`, `hold`, or `stop`.

Do not build a customer analytics dashboard before simple queries become an
actual operating burden or fail to answer a named product decision.

## 4. Defect Selection Rules

Fix issues in this order:

| Priority | Evidence | Default response |
| --- | --- | --- |
| P0 | security, privacy, data loss, unauthorized write, tenant leakage | stop the trial and repair before resuming |
| P1 | user cannot connect, generate, recover, accept, or explicitly save | reproduce and fix before expanding the cohort |
| P2 | repeated confusion, repeated retries, poor feedback, or a meaningful drop in the core funnel | fix the smallest owning seam after confirming the pattern |
| P3 | cosmetic inconsistency or low-frequency friction that does not block the core task | record; batch only when it becomes recurrent or cheap to fix safely |

One isolated session is enough to investigate a P0/P1 safety or blocking
failure. It is normally not enough to redesign a workflow, tune a model, or
change a ranking rule. Small cohorts require both absolute counts and rates;
avoid impressive percentages produced from one or two sessions.

When evidence is ambiguous:

1. verify event completeness and emitter behavior;
2. correlate with bounded Cloud run and health evidence;
3. reproduce the exact step with the narrowest deterministic or browser test;
4. distinguish product failure from network, browser transport, Provider, or
   observation-pipeline failure;
5. change only the owning seam.

## 5. Pre-Commercial Scope Boundary

Before real use or payment evidence proves the commercial logic, do not build
by default:

- a general product-analytics warehouse or third-party behavioral SDK;
- session replay, DOM capture, heat maps, detailed user profiling, or identity
  correlation;
- a new Admin/Portal analytics dashboard, alert-ranking center, or automated
  defect-management system;
- automatic prompt, model, router, preset, workflow, approval, or content
  mutation based on telemetry;
- long-term raw-event retention beyond the current bounded need;
- broad multi-CMS expansion, speculative HA/scale work, or infrastructure
  migration without representative load;
- synthetic Provider traffic or repeated broad test runs solely to make an
  observation report look complete.

These are deferred, not permanently forbidden. Reopen one only when a named
decision cannot be made reliably with the existing bounded evidence.

## 6. Commercial-Proof Reopening Triggers

Further observability or product infrastructure becomes reasonable only when
real evidence creates a recurring need, for example:

- multiple active sites and users make manual summaries unreliable;
- users naturally repeat the core task and request adjacent capabilities;
- trial-to-paid or renewal decisions need cohort or trend comparison;
- support volume makes session-level diagnosis materially expensive;
- retention, performance, concurrency, or reliability measurements show that
  the current bounded implementation is insufficient;
- a legal, privacy, security, or enterprise requirement demands a stronger
  audited control.

The next investment should address the observed constraint directly. A
commercial signal does not automatically authorize every deferred dashboard,
platform, or infrastructure project.

## 7. Reusable Development Lessons

The recent development history yields the following durable lessons:

1. **Start from the user task.** Trace connect, understand, act, feedback,
   recovery, adoption, and explicit save instead of optimizing isolated pages
   or files.
2. **Fix obvious defects before inviting users.** Static analysis, focused
   tests, browser automation, AI role-play, and M4 should remove low-level
   failures that would waste a small human cohort.
3. **Do not postpone real-user evidence indefinitely.** Engineering work is
   more controllable than human observation, so it can become a comfortable
   substitute for product validation unless the stage has an explicit stop
   condition.
4. **Preserve ownership boundaries.** Cloud executes and summarizes bounded
   runtime metadata; WordPress owns abilities, prompts, review, approval,
   preflight, final writes, and publication.
5. **Prefer narrow evidence to repeated ceremony.** Run the smallest gate that
   answers the changed risk. Preserve successful evidence and rerun only the
   failed seam when possible.
6. **Treat failures as evidence.** Do not erase Provider, transport, capacity,
   browser, or migration failures by replaying until a green result appears.
7. **Use thresholds appropriate to small samples.** Combine counts, rates,
   session settlement, and manual review; do not overfit one early cohort.
8. **Write stopping rules before expansion.** When the core workflow is usable
   and diagnosable, stop adding infrastructure and move to non-author trials.

## 8. Stage Completion Checklist

Before opening a non-author production cohort:

- production release is separately approved and its rollback is known;
- the Addon emitter is opt-in, metadata-only, bounded, retry-safe, and tested;
- the authenticated site remains the Cloud site authority;
- prohibited content and identity fields are rejected or absent;
- the core connect, generate, retry, accept, and save paths work;
- the user can see safe, actionable failure feedback;
- operator queries can distinguish incomplete telemetry from product failure;
- the cohort size, Provider budget, support channel, and stop conditions are
  declared;
- no participant is asked to provide technical diagnostics;
- the final decision will be `go`, `modify`, `hold`, or `stop`.

## 9. Relationship to Existing Authority

This standard narrows priorities; it does not replace existing contracts:

- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
  governs engineering evidence and delivery states.
- [Real Editor Cohort Operations](real-editor-cohort-operations-v1.md) governs
  bounded technical-monitoring and human-value cohort execution.
- [Customer Journey Metadata v1](customer-journey-metadata-v1.md) governs the
  new journey event contract.
- [Cloud AI Data Handling Standard](cloud-ai-data-handling-standard-v1.md)
  governs data classification and handling.
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
  preserves local WordPress review and final-write ownership.
- [Customer Trial Commercial Package Policy](customer-trial-commercial-package-policy-v1.md)
  governs the separately bounded paid-package validation posture.

If this standard conflicts with a security, privacy, production-release, or
Cloud/WordPress boundary, the stricter owning authority wins.
