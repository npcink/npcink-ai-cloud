# Deferred Engineering Triggers v1

Status: active trigger-gated planning record, reconciled on 2026-10-25 against
Cloud c4831b5041dde32630d0d2f886322d8da97c6532. Original review dates were
2026-09-18 (items 1–5), 2026-09-19 (item 6), 2026-09-20 (item 7), and
2026-10-21 (item 8). Those dated observations remain historical evidence.

This reconciliation corrects implementation and authority assumptions; it does
not authorize implementation, product expansion, configuration, paid Provider
calls, or production operations. A condition that is unproven or not reached
remains open. It is no longer accurate to say that no trigger has fired:
structured-output consumers exist (item 2), and the old indefinite production
pause has been superseded (item 7). Neither fact grants a new implementation
or deployment authorization.

## Evidence boundary

Cloud source is fixed to the commit above. Addon observations below are a
bounded static sample at 46b11d807292e2b898b3161110a5c6fa495bb755, not proof
of the installed plugin, WordPress.org package, enabled scene count or current
request-log contents. Local, CI, M4 candidate, merged, M4 accepted, production
and human evidence remain distinct. No live DB, container logs, deployment
markers or production state were read for this reconciliation.

The companion contract-version deferral remains
[ADR-053](decisions/053-defer-bounded-contract-compatibility-until-public-ecosystem-distribution.md).
Current engineering cleanup is tracked in
[the follow-up queue](engineering-follow-up-queue-v1.md); neither record is
runtime authority.

## Reviewed Item 1: Addon Facade → Scenario Contract Registry

**State and successor.** The sampled Addon bootstrap has twelve execute
facades, nine named for Toolbox scenes. The old single 4300+ line client and
validator locations are obsolete: Addon #220 moved per-scenario guards into
Npcink_Cloud_Runtime_Request_Guards; #221/#222 split diagnostics/media helpers.
This is mechanical separation, not a schema-driven Toolbox registry.
WordPress registered-task projection already supplies a partial contract seam.

Scenario facades still validate before signed transport. The private request
kernel does not mean every generic client method vanished: execute_runtime
remains public/deprecated and is used after bounded Toolbox payload validation.
Do not broaden that surface when considering a registry.

**Trigger and remaining gate.** Retain the original approximate threshold of
fifteen Toolbox business scenes. Nine named Toolbox facades in this static
sample do not establish that threshold, and fifteen validators/helpers or many
WordPress registered tasks are not fifteen Toolbox scenes. Paused code does
not count as authorization to re-enable a scene.

**Minimum next action.** At the next real Toolbox scene addition, count actual
scene contracts and maintenance duplication. If that approximate threshold is evidenced, decide the smallest Addon-only
registry scope and its paired release evidence. Keep scenario-bound, fail-closed
validation and one signed transport; do not start an unrelated release or
declare the deferred registry delivered merely because guards were extracted.

## Reviewed Item 2: Model Capability Surface (ModelCapabilities)

**Implemented.** [Capability contracts](../app/domain/model_capabilities/contracts.py)
still define text, vision, embedding, image_generation, audio_generation and
video_generation, route fingerprints and four evidence states.
[Routing](../app/domain/routing/service.py) uses current verified probe evidence
for vision/image/audio. Model context/prices and execution-time context budget
checks already exist; they are not the missing work.

**Consumer premise has changed.** structured_output, tool_call and streaming
are still absent from that tuple/probe gate. However,
[WordPress runtime](../app/domain/wordpress_ai_connector/runtime.py) already
builds title JSON-schema requests and other schema/JSON-constrained requests,
then validates/normalizes their output. Ability-owned output_schema is required
by the [connector contract](../app/domain/wordpress_ai_connector/contracts.py).
Existing JSON-schema enforcement (#294/#320 and later #1037 work) means
“no consumer reads structured output” cannot justify blanket deferral.

Provider option support and model-reference booleans are not verified route
capability evidence. Nor does schema-shaped output alone prove that a consumer
requires Provider-native strict-schema guarantees rather than the existing
normalization and output checks. No new tool/stream product consumer or enabled
site surface is established by the adapter's support for those fields.

**Trigger and next decision.** The original trigger is the first real scenario
requiring the ability. Structured-output consumption now requires that focused
review: specify the guarantee for a real task/schema, decide whether existing
validation meets it, and only then scope capability, probe/fingerprint and
consumer-aware routing evidence changes if needed. This may be an orthogonal
requirement on an existing text/vision route, not a new execution kind.
Retain tool/stream deferrals unless a real supported consumer requires them.

A future authorized change must distinguish supported, unsupported, stale and
failed evidence and preserve output-contract/fallback behavior. This document
does not authorize new capabilities, speculative probes or paid calls.

## Reviewed Item 3: Quality-Driven Model Routing (Flywheel → Routing)

**Implementation remains deferred.** Routing still selects from configured
profiles/bindings/candidates with health, allowlist and capability evidence;
quality adoption rates do not drive candidate selection. Existing model,
profile and router attribution is read-only evidence, not an adaptive router.

**Scheduling assumption superseded.** #1125 replaced the old daily cadence
with manual-only quality analysis. The
[worker](../app/workers/ops_cadence.py) keeps the seven-day analysis available
with no automatic interval; the
[background lightweight contract](background-lightweight-mode-v1.md) and
[quality flywheel](editor-assist-quality-flywheel-v1.md) are the current owners.
Do not restore daily evaluation or build another monitor from this old item.

**Data trigger remains unverified.** The original condition was sustained
observation-level natural samples (at least fifty quality sessions in a
seven-day window). The September “26 sessions / 47% fixtures” figures are not
current measurements. A historical successful title or one native adoption
event is not the quality-session denominator.
[The quality query](../app/domain/observability/editor_assist_quality.py)
does not explicitly exclude fixtures at event selection; source/site provenance
must establish the natural denominator. No fresh sample gate was evaluated here.

The current flywheel observation gate governs further instrumentation; a
high-confidence sustained issue only recommends evaluation. Neither a stage
label nor reaching 200 sessions automatically authorizes routing writes. The
old word “continuously” also supplies no independent duration definition.

**Minimum next action.** Reuse valid natural-use receipts or, on operator
request in an authorized runtime, the existing manual read-only analysis.
Establish window, source/fixture exclusion and sustained evidence before a
product/routing decision. Do not manufacture sessions, restore a scheduler or
infer a routing mandate from an instrumentation threshold.

## Reviewed Item 4: WordPress AI Request Log Provider and Model Identity

**Mechanism still present in the sampled source.** Addon
class-cloud-wordpress-ai-connector.php::maybe_log_wordpress_ai_request_evidence
still searches upstream provider/model response fields before its own
CONNECTOR_ID/fallback_model_id. The
[Cloud response](../app/api/routes/runtime.py) still returns Cloud provider_id
and model_id. Addon #305's usage TOKEN mapping did not normalize this identity.

The original five request-log rows, their OpenAI/Grok identifiers, null previews,
context size and developer-mode selector observations are September snapshots,
not present log, privacy or UI evidence. This reconciliation read no current
WordPress database or installed plugin switches.

**Trigger remains open, not proved.** A real operator/site-owner report that
the log is misleading, or an explicit product decision to expose the served
model, still triggers a site-visible contract review. Code demonstrating the
mechanism is not a new complaint or a model-disclosure authorization.

**Minimum next action.** When that trigger is evidenced, settle the identity
projection first. Normalizing the log to the Addon's own identifiers while
retaining Cloud run correlation is the smaller boundary-preserving option;
shipping served-model identity is a separate product/data-surface decision.
Validate response variants, errors and metadata-only behavior rather than
inferring harmlessness from an old developer-mode toggle.

## Reviewed Item 5: Addon Stops Naming A Hosted Image Profile

**Cloud prerequisite remains implemented.** #957 makes
[profile resolution](../app/api/routes/runtime.py) derive the hosted image
profile from the Cloud ability and image_generation task, independently of the
request's profile_id. The
[Toolbox-image derivation test](../tests/api/test_wordpress_ai_connector_runtime.py)
retains the deliberate unrelated-profile case. Test source is not a fresh test
pass.

**Addon remains incomplete.** The sampled request guards still send
wp-ai.image-generation and the behavior test still asserts it. #220 touched
and moved that image-envelope validator in October, so a source-maintenance
opportunity occurred; this does not prove a particular released package or
installed-site trigger. No new Cloud rename blocked by the literal was proved.

**Retained trigger and minimum action.** During the next already-planned Addon
release that touches the Toolbox image envelope, or if the literal blocks an
actual Cloud rename, verify the Cloud prerequisite and omit the field plus its
literal assertion. Prove omission/unrelated values do not change hosted
routing. Do not open a dedicated release solely for this redundant field, and
do not claim it removed from a refactor that only moved it.

**Separate policy gap.** The
[managed runtime predicate](../app/domain/runtime/service.py) still requires
the narrower connector-channel/source/connector identity for image requests.
Toolbox's equal routing profile does not itself grant the same timeout/retry/
fallback policy. Widening that predicate remains a separate execution-bound
decision, not part of literal removal.

## Reviewed Item 6: M4 Preview Source Sync and Frontend Marker Evidence

**Old diagnosis is not current source truth.** The original September
incident described sync writing deployed frontend markers without compiling the
synced source. At the fixed baseline,
[the orchestration script](../scripts/m4-preview.sh) selects frontend recreation
for source/config/volume changes or a missing frontend in every non-prepare
mode, including sync. The sync branch conditionally force-recreates frontend,
and the default
[startup path](../frontend/scripts/m4-preview-start.sh) compiles mounted source
in production mode before serving. Markers are written after health/container
checks.

The selection/recreate branches trace to #623, earlier than the old incident;
#928 added compiled preview startup, also earlier. Do not invent a later “fix”
PR or treat marker writes alone as proof the no-rebuild defect persists.
The [static contract](../tests/contract/test_m4_preview_development_contract.py)
guards selection, sync recreation and marker ordering but is not an M4 replay.

**Field chain remains unverified.** No actual script SHA, runtime mode,
container/served build or potentially polluted marker was read here. The old
incident may concern a different deployed script/state; source does not resolve
that history or prove today's markers trustworthy.

**Retained trigger and minimum gate.** At the next authorized sync/deploy
window or stale-frontend diagnosis, first reuse any matching behavior receipt;
otherwise bind the executing script, source fingerprint, frontend mode and
served build. With new frontend source, sync should select change/recreation
and serve that compiled change; a following unchanged deploy may correctly
reuse it and report no source change. Do not mechanically demand change=1 in
both phases. If a controlled matching-source replay still fails, scope the
smallest operations fix. Do not delete markers or redeploy merely from this
planning record. The original dirty-candidate/served-content acceptance is not
closed by source inspection.

## Reviewed Item 7: Production Promotion Pause — Superseded by Gated Resumption

**Original pause has a successor.** #1075 records the operator's 2026-10-06
decision to resume production-candidate validation and fresh promotion
preparation in the
[current release policy](cloud-production-release-policy-v1.md) and
[readiness record](production-release-readiness-plan-2026-10-06.md).
That is the original resume trigger occurring, not an indefinitely untriggered
pause. Actual Deploy stayed separately exact-SHA authorized.

Later tracked receipts record
[the frozen October deployment](history/production/2026/frozen-cloud-release-closeout-and-retrospective-2026-10-18.md)
and [a subsequent deployment/title acceptance](history/production/2026/deepseek-title-production-acceptance-2026-10-19.md).
These are dated evidence, not this reconciliation's live production check.
The old August revision and 645-commit/417-file divergence are not current facts.

**Remaining release gates.** The
[old resume sequence](history/production/2026/pre-production-release-pause-and-user-experience-consolidation-closeout-2026-08-21.md)
must be read through the current policy: the Portal restoration already reached
master through #865 and later Free verification, so do not automatically rebuild
that slice again. Retired CVE exceptions do not revive; exact current images
need applicable fresh security evidence.

For a new release, current production/source identity, cumulative scope, CI,
bundle/migration/rollback evidence and final exact-SHA operator authorization
remain separate requirements. Historical preparation or deployment approvals
cannot authorize a later dispatch. Formal smoke, user adoption and all six
Phase 1 Done criteria remain separate from a successful deploy or title run.

**Minimum next action.** Retain this supersession and the applicable release
gates. Without a new release objective, no promotion/ref refresh, server
inspection or deployment is required merely to close the old pause wording.

## Reviewed Item 8: Inline Run Orphan Root Cause (Unproven; Symptom Already Mitigated)

**Historical finding.** One October 20 inline run remained running for
41 minutes with no Provider-call evidence and nine concurrency rejections.
Unknown exception and process loss both fit; incident logs were unavailable
after container recreation. The old run/site/model/policy readings are not a
new incident, a current model switch or proof of either root cause.

**Delivered mitigations, not root-cause proof.** #1171's 180-second inline
admission lease prevents one old running row retaining the site's slot.
#1177 adds bounded pre-recreate drain; it can time out and continue recreation,
so it does not eliminate process loss. #1208's worker fallback rechecks status,
inline pattern and per-run age under row lock, then auto-fails after a grace
never shorter than thirty minutes and extended for timeout/retry budget.

The [transaction contract](runtime-provider-transaction-boundary-v1.md) keeps
unknown-dispatch immediate state running and forbids automatic replay or
fabricated Provider usage/results. Delayed auto-fail is a distinct failed
terminal transition and normal callback, not proof the Provider timed out.
The [unknown-dispatch test](../tests/domain/test_runtime_provider_transactions.py)
and [dev reload contract](../tests/contract/test_dev_frontend_dependency_guard.py)
still preserve those deliberate behaviors.

**Retain the original OR triggers.**

- At least two same-site inline orphans in a seven-day window after the lease
  is live: running with no Provider evidence beyond the 180-second lease.
- Operator stale-running repair needed more than once in a week despite the
  lease preventing lockout.
- A run with evidence that its Provider timeout actually failed to fire.

No fresh DB/log/incident receipts establish any of these here. Auto-fail counts
alone are not the same-site/no-Provider-evidence orphan denominator, and
mitigation does not cancel the root-cause obligation.

**Minimum evidence before investigation.** Bind actual run/site/time, deployed
version, lease/grace, Provider evidence, operator actions and process/timeout
timeline; ensure API logs survive recreation and capture the escaping exception
type at the boundary. External log retention was not audited, so missing source
instrumentation is not proof no host retains logs. Only then investigate a
proved trigger through a focused authorized change. Do not disable reload,
rewrite uncertain-failure semantics, replay runs or generate calls to force a
sample from this record.

## Current Highest Priority

Reuse genuine natural editor work and valid receipts; do not manufacture usage
to unlock deferred architecture. Sample-stage evidence, complaints, source
maintenance opportunities and release decisions are different triggers.
The existing manual quality analysis is available when requested; no new
monitor, automatic evaluation schedule or model traffic is authorized here.

## Engineering Lessons

1. Defer by evidenced condition, not age, enthusiasm or a zero-backlog label.
2. Current verified route evidence is stronger than a Provider's capability
   declaration or a reference boolean.
3. Registry decisions follow business-scene/validation duplication, not facade
   counts, helper counts or a refactor that merely moved code.
4. Use the current evaluation owner and schedule. #1125's manual-only quality
   contract supersedes the old daily-evaluator assumption.
5. Recheck consumer premises: structured-output requests already exist, but
   native guarantees and a new routing gate still require a focused decision.
6. Normalize site-visible identity at its boundary; copying Cloud response
   identifiers before an Addon fallback does not create an Addon identity.
7. Separate source defense, controlled behavior receipts and current field
   evidence. A marker, lease or historical deployment cannot prove all three.

## Non-Goals and Maintenance

No code, new product/commercial scope, paused-feature activation, migration,
configuration, M4 operation or production release is authorized by this record.
It introduces no compatibility layer or second contract version.

Keep history when a trigger or implementation has a successor: identify the
implementing/authorizing record and retain any unmet gate. An unproved trigger
or delayed item is not a completed or cancelled task. Future revisions use the
current contracts and exact evidence; reverting this documentation candidate
changes no runtime state.
