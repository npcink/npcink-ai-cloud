# Single-Operator Pre-User Development Closeout and Next-Stage Guide — 2026-08-18

Status: dated cross-stage evidence, retrospective, and next-stage handoff; not
current production, M4, Addon-package, Provider-call, recruitment, or human-value
authorization.

## 1. Purpose and conclusion

This record consolidates the recent project history from the perspective of a
single developer using AI before the first formal non-author cohort. It covers
user-experience remediation, deterministic pre-user testing, privacy-safe
journey evidence, Portal recovery work, M4 and release evidence, delivery-time
analysis, and the final development/merge/release workflow split.

The stage conclusion is:

> The project has enough engineering and observation infrastructure for the
> first small real-user validation cycle. The next priority is ordinary product
> work and naturally observed user friction, not another general workflow,
> dashboard, monitoring, CI, M4, or governance expansion.

The active rules remain in the linked standards. This dated document explains
why they were chosen, what evidence existed at closeout, and how the next tasks
should use them.

## 2. Starting constraints

The work began under unusually constrained but explicit conditions:

- one human developer and AI-assisted implementation;
- no independent internal tester and initially no real non-author users;
- an early commercial-validation stage where “enough to learn” is more valuable
  than platform completeness;
- non-technical future users who cannot be expected to report exact HTTP,
  authentication, state-ownership, or recovery failures;
- Local WordPress, disposable test lanes, M4, GitHub Actions, production, and
  public Addon distribution as different evidence environments;
- a requirement to remove obvious defects before inviting external users,
  without manufacturing paid Provider calls or production operations.

These constraints made AI persona review, deterministic fixtures, browser
checks, fault injection, metadata-only telemetry, and exact evidence states
useful. They did not turn AI testing into human acceptance.

## 3. Historical progression and delivered evidence

### 3.1 User-facing friction was treated as a correctness problem

Portal work was narrowed around the jobs a new user must complete: understand
account versus site state, connect WordPress, recover from an inactive or
unhealthy site, interpret package capacity, and reach support without duplicate
actions or stale context.

The current source history includes:

- PR `#746`: Portal account ownership and validation closeout;
- PR `#747`: safe next actions for site issues;
- PR `#748`: context refresh and duplicate-support-action correction;
- PR `#749`: clearer capacity and recovery paths;
- PR `#787`: correction of Portal site-filter routing semantics;
- PR `#789`: localized Portal fault-recovery browser regression coverage.

The reusable lesson is that ambiguous ownership, stale context, missing next
actions, and misleading capacity language are not merely visual polish. For a
non-technical user they directly determine whether the product can be used and
recovered without developer intervention.

### 3.2 Pre-user testing moved from happy paths to a risk matrix

PR `#786` added a deterministic, synthetic, metadata-only new-user readiness
matrix. It covers ten high-risk states:

- a new account with no site;
- one healthy connected site;
- switching between multiple site contexts;
- inactive and suspended site recovery;
- account-scoped quota pressure;
- expired session recovery;
- cross-account site denial;
- invalid connector credentials;
- temporary service unavailability.

PR `#788` added stable fault-injection contracts for six of the failure states,
including the expected HTTP status, bounded error code, safe recovery action,
and disclosure boundary. These fixtures forbid production writes, Provider
calls, WordPress object writes, entitlement mutation, secret disclosure, and
foreign-record disclosure.

This is the appropriate role for AI-assisted pre-user evaluation: enumerate
personas and failure modes, exercise closed contracts, and force recovery
semantics to become testable. It can reveal low-level defects cheaply, but it
cannot prove comprehension, trust, usefulness, retention, or willingness to
pay.

### 3.3 Observation was added because users cannot provide technical logs

Cloud PR `#750` added privacy-safe customer-journey ingestion and summaries.
PR `#751` added authenticated, site-scoped Portal events. The Addon-side sender
and consent work is recorded in the pre-user observability closeout as Addon
PRs `#99`–`#101`. Public privacy wording was later clarified by Cloud PR
`#780`.

The observation boundary is deliberately small:

- allowlisted journey, step, bounded error, duration, coarse browser/viewport,
  opaque session, and owned run metadata;
- no prompt, generated text, article content, free-form error, email, username,
  WordPress post/user identifier, credential, cookie, URL, DOM, request body,
  or response body;
- WordPress editor collection remains explicit site-administrator opt-in;
- Portal events remain authenticated, site-scoped operational metadata under
  the existing Portal privacy notice;
- summaries and defect candidates are read-only evidence, not automatic prompt,
  router, approval, publication, product, or WordPress mutation authority.

The first useful measures are first-use progression, retry-to-success and other
failure recovery, accepted-then-explicit-save, settled abandonment, Portal
login/connection/support blockers, bounded error counts, and anomalous-session
references. For the initial `2-3` users, the existing summary is sufficient;
a new analytics dashboard or clickstream platform is not justified.

### 3.4 Exact consumer revision mattered more than another code change

One historical “the page did not change” problem was not a source defect. Local
WordPress was mounted to an older Addon worktree. Repointing the mount to the
intended clean revision exposed the already-implemented monitoring disclosure.

The durable debugging order is therefore:

1. identify the exact consumer and expected behavior;
2. verify the installed package, mounted worktree, symlink, source revision,
   runtime revision, cache, and environment;
3. only then decide whether product code is wrong.

Merged source, M4 acceptance, production source, public package publication,
installed plugin revision, and human acceptance must remain separate states.
“No production enablement” means an implementation may exist in source or a
candidate environment while no production runtime, public package, or formal
user cohort is yet using it.

### 3.5 Deployment duration and task duration were separated

A host deployment taking about five minutes can be acceptable while a Codex
task lasts one to three hours. The longer task clock may include:

- source investigation and reproduction;
- implementation and focused local feedback;
- CI queue, CodeQL, targeted shards, review, and protected merge waiting;
- environment-protection or operator-authorization waiting;
- bundle build, scan, transfer, migration, cutover, and health as distinct
  release phases;
- correction of a review finding and a new revision's required checks;
- avoidable broad-gate repeats, blind external-transfer retries, scope growth,
  or stale-environment diagnosis.

The historical release example in the active single-operator release standard
records a `1h36m45s` workflow in which about `1h26m07s` was hidden dispatch or
Environment waiting and the actual job was about `10m38s`. This is why one
wall-clock number must not be reported as “deployment time.”

The operator-referenced `1h55m`, `3h`, and `3h36m` task records should be read as
composite delivery sessions, not as five-minute host mutations. Their shared
lesson was to measure authoring, local feedback, PR CI/review, authorization,
artifact work, host mutation, and observation independently before deciding
what to optimize.

### 3.6 The process was finally split by requested outcome

PR `#785`, merge revision `2f018771`, extended the existing `check:changed` and
AI task envelope instead of creating another workflow tool. It introduced
three explicit lanes:

| Lane | Default target | Meaning |
| --- | --- | --- |
| `development` | 45 minutes | produce a coherent, focused, verifiable candidate; PR and production are not implied |
| `merge` | 90 minutes | publish one focused PR, pass required checks, merge, and complete applicable clean-master M4 acceptance |
| `release` | 120 minutes | execute a separately approved production promotion and verification |

The targets are split-and-report prompts, not permission to skip required
evidence. Changed paths still own tier, commands, and runtime classification;
they do not authorize PR or production work. A second independent blocker ends
scope expansion and moves unrelated findings to follow-up.

## 4. Root causes and corrections

| Problem | Root cause | Correction now in force |
| --- | --- | --- |
| Too much time spent on process compared with product work | development, merge, M4, and release work were treated as one continuous default path | default to `development`; enter `merge` or `release` only for the requested outcome |
| Repeated broad validation | reassurance was treated as a new risk question | use the narrowest gate and reuse exact-identity evidence; repeat a broad gate only for a distinct risk |
| Long blind retries | external transfer failure was treated as ordinary test flakiness | stop after two identical external-transfer failures and use the documented recovery lane or report the blocker |
| Scope expanded during one long session | adjacent findings were absorbed before the first seam reached delivery | stop at the second independent blocker and deliver one independently valuable slice |
| Source looked correct but the consumer differed | mounted worktree, package, cache, or deployed revision was not verified | inspect exact consumer identity before editing code |
| Monitoring risked user distrust | purpose, data scope, consent, and forbidden uses were not explicit enough | publish plain-language disclosure and keep the schema closed and metadata-only |
| Telemetry risked becoming product authority | diagnostic evidence and product decisions were compressed together | require operator review and a normal scoped task; forbid automatic product or WordPress mutation |
| AI testing risked being called user validation | technical success, behavior, and human value were treated as one state | report deterministic, consumer, runtime, release, monitoring, and human-value evidence separately |
| More infrastructure was proposed before natural evidence | abstract optimization preceded inspection of existing owners and real samples | extend existing commands first; require repeated natural evidence before another process PR |

## 5. What is closed and what remains open

### Closed as engineering foundation

- bounded Portal recovery and account/site ownership semantics are protected by
  current source and focused contracts;
- privacy-safe Cloud and Portal journey evidence exists in current source;
- Addon sender and disclosure work has source history and local-consumer
  evidence recorded in the pre-user closeout;
- the public monitoring notice was clarified in source;
- the internal readiness and fault-injection matrix covers the main first-user
  technical states without external mutation;
- development, merge, and release lanes are explicit and machine-readable;
- protected PR publishing, evidence states, M4 candidate/accepted distinction,
  release timing, and worktree lifecycle have active standards.

### Still requires current evidence or explicit authorization

- verify the exact Cloud production revision before claiming journey events are
  live for formal users;
- verify the exact published and installed Addon package before claiming the
  sender and disclosure are available to new sites;
- verify the public privacy notice from the intended public deployment rather
  than from source alone;
- run the formal `2-3`-person consenting non-author cohort on the intended
  release machines;
- collect human comprehension, usefulness, support burden, retention, and
  commercial evidence separately from telemetry;
- collect compatible natural delivery samples before claiming a stable overall
  development-efficiency improvement;
- recheck all dated production, entitlement, M4, package, and capacity facts at
  the time they are used.

## 6. Next-stage operating method

The operator can now continue ordinary product development and return with the
next task. Use this cycle:

1. **Start in development.** Define one user problem, one owning seam, explicit
   non-goals, and the narrowest evidence gate. Aim for a candidate in `30-60`
   minutes, with `45` minutes as the default split point.
2. **Remove cheap defects first.** Use source contracts, the readiness matrix,
   fault injection, Fake Provider paths, Local WordPress, and focused browser
   states before paid Provider, M4, or production work.
3. **Inspect the real consumer.** Confirm the exact source/package/runtime
   revision whenever observed behavior contradicts code.
4. **Enter merge only on request.** Publish one focused PR and let required
   GitHub checks decide merge eligibility. During CI waiting, prepare only
   read-only or non-conflicting work; keep one protected merge/shared-runtime
   operation owner.
5. **Use M4 only for the risk it proves.** Ordinary source uses sync; dependency,
   Docker, Compose, proxy, or deployment fingerprints use deploy. Do not use M4
   for docs or CI-only work.
6. **Enter release separately.** Freeze the production envelope, name the exact
   authorization needed, preserve rollback, and report `no_deploy` explicitly
   when no server update is required.
7. **Let telemetry create evidence, not decisions.** Review summaries and named
   anomalous sessions, reproduce when possible, and classify each item as fix,
   improve, observe, or invalid evidence.
8. **Invite real users after preflight.** The user need not provide technical
   logs. The operator uses journey metadata, application evidence, and bounded
   observation to locate the issue, then asks only simple task and comprehension
   questions.
9. **Stop process expansion.** Build another workflow, dashboard, cache, shard,
   or monitor only after the same natural problem repeats three times or one
   event directly blocks safety, merge, or release and the existing recovery
   path cannot handle it.

## 7. Success measures for the next stage

| Area | Near-term target | What it does not prove |
| --- | --- | --- |
| Development feedback | ordinary feature/bug candidate in `30-60` minutes | merge, M4 acceptance, or production |
| Merge closeout | focused task reaches protected merge in about `90` minutes when checks are healthy | production readiness |
| Release closeout | comparable approved release aims for about `120` minutes, measured by phase | stable improvement before multiple natural samples |
| Pre-user readiness | all relevant deterministic scenarios and fault contracts pass | human comprehension or value |
| First cohort | `2-3` consenting non-author users on exact release machines | GA or statistically broad product claims |
| Journey evidence | first-use, recovery, save, abandonment, and blocker metadata is available without prohibited fields | content quality, retention, or willingness to pay by itself |
| Process investment | no new infrastructure without three comparable repetitions or a direct safety/release blocker | that the current process is permanently optimal |

## 8. Durable authority and evidence references

Use these documents rather than copying their normative rules into a new local
checklist:

- [Single-Operator AI Development Standard](single-operator-ai-development-standard-v1.md);
- [Development and Validation Operating Model](development-validation-operating-model-v1.md);
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md);
- [Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md);
- [Single-Operator AI Release Workflow Standard](single-operator-ai-release-workflow-standard-v1.md);
- [Customer Journey Metadata](customer-journey-metadata-v1.md);
- [Real Editor Cohort Operations](real-editor-cohort-operations-v1.md);
- [Pre-user Customer Journey Observability Closeout](pre-user-customer-journey-observability-closeout-and-development-retrospective-2026-08-17.md);
- [Development Efficiency Phases 1-3 Closeout](development-efficiency-phases1-3-closeout-and-retrospective-2026-08-14.md);
- [Development Efficiency Phase 3 Observation Plan](development-efficiency-phase3-observation-plan-v1.md).

## 9. Closeout receipt

```text
Focused scope: single-operator pre-user development, testing, observability, delivery, and workflow synthesis
Current source baseline: origin/master 88b777f2 after pre-publication refresh
Key integrated Cloud PRs: #746-#752, #780, #785-#789
Current normative change: none; existing active standards remain authoritative
Runtime or product mutation: none
Provider calls: 0
Docker operations: 0
M4 operations: 0
Production operations: 0
Human acceptance: not run by this documentation task
Highest evidence state for this record: dated repository retrospective after current-source verification
Rollback: revert this documentation PR; runtime behavior is unchanged
Next action: continue one ordinary product task in the development lane, then use naturally observed evidence to decide whether any further process change is justified
```
