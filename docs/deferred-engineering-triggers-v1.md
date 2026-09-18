# Deferred Engineering Triggers v1

Status: active planning record. This document records the 2026-09-18 review of
three previously proposed architecture directions, their current implementation
state, and the pre-declared trigger for each. It is not runtime authority and
it does not authorize early work: every item here is deferred **by trigger
condition, not by date**, and none of the triggers has fired.

## Date

2026-09-18.

## Purpose

Three architecture suggestions were re-audited against current code so that a
future session neither re-proposes them prematurely nor forgets them. The
review method was read-only code inspection; every claim below carries its
evidence path. The companion deferral for contract-version compatibility is
ADR-053 (`decisions/053-defer-bounded-contract-compatibility-until-public-ecosystem-distribution.md`),
which applies the same trigger-based pattern to a different seam.

## Reviewed Item 1: Addon Facade → Scenario Contract Registry

**Current state.** The Addon now exposes roughly ten `npcink_cloud_addon_execute_*`
facades (`npcink-cloud-addon/includes/bootstrap.php:213-512`), each a thin
(~20-line) delegate. All of them funnel into exactly one private signed
transport (`class-cloud-runtime-client.php:1201`, headers via
`build_signed_headers` at `:2075`), so the security goal — fail-closed,
scenario-bound public functions, never a generic client — is intact.

**Real duplication is not the facades.** It is the eight per-scenario
`normalize_*_request` validators (each ~100-150 lines, all inside one
4300+ line client file, `class-cloud-runtime-client.php:2365-3580`). A partial
contract layer already exists for the WordPress AI text scenes:
`Npcink_Cloud_AI_Task_Contract::project_registered_ability()` plus
`npcink_cloud_addon_execute_registered_ai_task_runtime()`
(`bootstrap.php:231-290`). Toolbox scenes (image, audio, web_search,
image_source, site_ops, media_governance) are still method-per-scenario.

**Trigger to act.** When the toolbox scene count reaches ≈15 (currently ~6
toolbox + 2 wp-ai scenes). At that point convert the per-scenario validators
into a schema-driven contract registry with one generic validator. Doing it
earlier refactors working code for no functional gain; the Addon is in
wordpress.org release mode and should not carry unrelated refactors.

## Reviewed Item 2: Model Capability Surface (ModelCapabilities)

**Current state.** This suggestion is mostly already implemented, in a more
rigorous form than originally proposed: `app/domain/model_capabilities/`
defines the capability tuple (`text`, `vision`, `embedding`,
`image_generation`, `audio_generation`, `video_generation` —
`contracts.py:9`), per-route evidence states (`verified` / `unsupported` /
`verification_failed` / `unverified`), `RouteFingerprint` cache identity, and
probes. `RoutingService.resolve()` gates `vision`, `image_generation`, and
`audio_generation` execution kinds on current `verified` evidence
(`app/domain/routing/service.py:107-110`); `context_window` and prices ride on
each candidate (`routing/service.py:84-86`), and context overflow is handled
at execution time (`app/adapters/providers/compatibility.py`,
`ContextBudgetAssessment`).

**Remaining gap.** `structured_output`, `tool_call`, and `streaming` are not
in the capability tuple. Structured-output failures currently surface as
provider errors instead of being excluded at routing time.

**Trigger to act.** The first scenario that actually requires one of those
abilities. The change is then small: extend `MODEL_CAPABILITIES`, add a probe,
and gate the new execution kind the same way vision/image/audio are gated
today. Adding the entries earlier buys nothing because no consumer reads them.

## Reviewed Item 3: Quality-Driven Model Routing (Flywheel → Routing)

**Current state.** Deliberately not implemented. Routing is fully
configuration-driven (profile → binding → candidate instances); no quality
signal influences candidate selection. The evidence side is accumulating:
editor-assist quality attribution is already bucketed by model and routing
profile (PR #951, squash `2f1889d9`), and agent feedback exposes per-model
adoption rates (`app/domain/agent_feedback/service.py:440`).

**Trigger to act.** The sample-stage detector reporting `observation`
continuously (≥50 quality sessions in a 7-day window), as defined by the
"Sample-stage gate" in `editor-assist-quality-flywheel-v1.md`. The evaluation
runs automatically every 24h in
`app/workers/ops_cadence.py::_run_editor_assist_quality_detection`; do not
build a second monitoring mechanism. As of 2026-09-18 the detector still
reports `insufficient` (26 real quality sessions on M4; fixtures excluded —
fixture sessions are ~47% of M4 quality data and must be filtered out when
reading quality numbers).

## Current Highest Priority

The only data-gated precondition in the whole set is real usage volume. The
lowest-cost path is to run genuine daily editorial work through the existing
local chain (Local site `magick-ai` → Cloud at `127.0.0.1:18010`) instead of
manufacturing sessions. Inflating numbers with fixture-like sessions is
explicitly counterproductive: fixture contamination is already a known
problem in M4 quality readings.

## Engineering Lessons

1. **Defer by trigger condition, not by date or by enthusiasm.** Same pattern
   as ADR-053: write the condition down, let it fire on evidence.
2. **Prefer verified evidence over declared claims.** For local and
   multi-provider ecosystems, "OpenAI-compatible" self-description is not a
   capability fact; probes plus evidence states gate routing reliably.
3. **Keep one narrow signed transport; grow surface with thin facades.**
   Registry-ify when the schema-validation duplication (not the facade
   boilerplate) becomes the dominant cost.
4. **Data-gated features need automatic evaluation, not human memory.** The
   ops cadence detector is the carrier; a deferred item without an automatic
   evaluator gets forgotten or fires late.
5. **Speculative abstraction has negative value before its consumer exists.**
   Every item above already has a designated landing site in code, so the
   future change is small — that is the payoff of deferring now.

## Non-Goals

- No code change is authorized or planned by this document.
- No conflict with the Refactor Master Plan rules 9-10 (`NO_COMPATIBILITY_LAYER`,
  `ONE_ACTIVE_CONTRACT_VERSION`): none of the three items introduces a
  compatibility layer or a second contract version.

## Rollback

Delete this file and its `docs/README.md` index line. If a trigger has already
fired for an item, mark that section `Superseded` by the implementing PR
instead of deleting the history.
