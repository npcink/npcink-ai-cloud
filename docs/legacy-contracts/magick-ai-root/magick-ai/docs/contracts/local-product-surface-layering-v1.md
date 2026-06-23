# Local Product Surface Layering Contract v1

> Status: active
>
> Updated: `2026-04-11`
>
> Scope: local WordPress product surfaces built on `magick-ai`, including `magick-ai-content-assistant`, `magick-ai-cloud-addon`, and future local extension/admin product fronts.

## 1. Objective

Freeze one default layering rule for future local product work so AI contributors do not keep rebuilding the same mixed surface:

1. settings truth
2. runtime action
3. delivery / result transport
4. preview / confirm / apply
5. batch / long-task / cloud detail

This contract exists to stop local product surfaces from drifting into:

1. one giant admin page that saves defaults and runs workflows in the same request
2. a second router / model / preset control plane
3. a local batch governance workspace
4. a cloud detail surface copied into local control UI

## 2. Constitutional Rule

The default product rule is:

`local keeps truth and final choice; action surfaces stay thin; long work uses canonical delivery; final WordPress writes remain local.`

Hosted-first copy in Settings Shell and local product surfaces MUST NOT imply cloud-only. The UI may recommend hosted execution, but it must keep local fallback, local confirmation, and local final WordPress write ownership understandable from the default path.

Expanded:

1. local settings keep basic truth and final choice
2. local action surfaces collect one object input and launch one canonical ability/workflow
3. long-running or gated work continues through canonical `run/status/result`
4. preview / confirm / apply stay local
5. heavy detail, batch execution, queue state, and deep diagnostics stay outside the default local front door

## 3. Layer Definitions

### 3.1 Settings Truth Layer

This layer owns:

1. low-frequency defaults
2. local enable/disable truth
3. final local option choice
4. minimal policy fields that future actions consume

This layer must not own:

1. workflow execution
2. queue lifecycle
3. deep runtime diagnostics
4. model/provider final selection truth outside core runtime

Settings truth may appear near an action surface as readonly summary or a link, but it must not share the same save/execute handler.

### 3.2 Action Surface Layer

This layer owns:

1. single-object input
2. one clear primary action
3. preview-oriented or suggest-oriented entry
4. compact result summary

This layer must not become:

1. a second settings page
2. a batch workbench
3. a queue console
4. a second execution mainline

Default local action shape:

1. single object
2. single run
3. summary-first
4. human-confirmable when writes are possible

### 3.3 Delivery Layer

All execution must keep one canonical delivery path.

Allowed:

1. short synchronous result for truly lightweight single-object work
2. canonical `run/status/result`
3. optional `cancel` only when the real runtime supports it

Forbidden:

1. blocking the whole admin page while waiting for heavy multi-step completion
2. inventing one page-private status/result side contract
3. bypassing the unified runtime bridge from product-layer controllers/UI

Important clarification:

`single-run local` does not mean `synchronous whole-page request`.

Single-run is a product-scope rule.  
Transport may still be async when the work is multi-step, gated, offloaded, or likely to outgrow one admin request.

### 3.4 Preview / Confirm / Apply Layer

This layer owns:

1. preview
2. human confirm
3. final local WordPress write
4. local audit/governance record

Cloud or hosted runtime may return generated output, but it must not become the final WordPress write owner.

### 3.5 Heavy / Offload / Detail Layer

These concerns do not belong on the default local front door:

1. batch execution
2. queue/job lifecycle
3. historical aggregation
4. long-running analysis
5. provider/service diagnostics detail
6. cloud billing/usage/key truth

They belong to:

1. canonical `run/status/result`
2. cloud/offload detail surfaces
3. addon/service-plane summary + explicit drill-down

## 4. Separation Rule

The required split is logical first, not purely visual.

That means:

1. settings truth and runtime action may be shown on the same screen only when one side is summary-only
2. settings save and runtime execution must not share the same form intent, request handler, or payload contract
3. result rendering may sit on the same route as the action, but it must not drag settings save, queue control, or cloud configuration into the same request path

Practical rule:

If a surface lets the operator both `save defaults` and `run AI work`, those flows must be split at the handler/API boundary even if the screen is temporarily colocated.

## 5. Default Admission Matrix

### 5.1 Put It In Local Settings Truth When

1. it is low-frequency
2. it defines a default or policy
3. it represents final local choice
4. it does not need partial refresh to feel usable

### 5.2 Put It In Local Action Surface When

1. it is single-object
2. it is high-frequency
3. it is generate / preview / confirm oriented
4. it can return a compact result or preview

### 5.3 Force Canonical `run/status/result` When

1. the work is multi-step
2. the work is gated or may wait for confirm
3. the work may exceed one request lifecycle
4. the work is offloaded
5. the UI would otherwise block on completion

### 5.4 Keep Final Write Local When

1. the action updates WordPress objects
2. the action changes settings truth
3. the action requires audit/governance trace

### 5.5 Move It To Cloud/Offload/Detail When

1. it is batch
2. it needs queue state or retry control
3. it needs historical aggregation
4. it is heavy analysis or long-running enrichment
5. it looks like an operations console

## 6. UI Rules

Default local surfaces should:

1. keep one primary action per section
2. show summary before detail
3. keep deep payloads/debug/raw JSON behind explicit detail affordances
4. prefer partial refresh over full-page reload for high-frequency interactions

Default local surfaces should not:

1. dump raw `data/meta` payloads on first paint
2. show queue controls, worker controls, or batch workbench affordances by default
3. duplicate cloud detail/configuration surfaces
4. reintroduce direct provider/model selection into product-layer UI

### 6.1 Settings Shell Menu Layering

Core Settings Shell menus use the same three-layer contract:

1. `default`: current availability, blockers, and the next action
2. `task`: one explicit operator action such as add, manage, connect, enable, or save
3. `advanced`: directories, contracts, diagnostics, endpoint details, raw payloads, and low-frequency troubleshooting

The visible sidebar remains `开始 / 模型 / 集成`. Runtime and Capability remain hidden route groups owned by Start detail entries. Capability marking belongs to model instance management. Capability Library and Function Catalog remain advanced/detail entries; MCP and Agent Gateway are default integration entries.

## 7. Implementation Rules For Future AI

When adding a new local feature, follow this order:

1. classify the feature as `settings truth`, `single-object action`, `delivery`, `local write`, or `cloud/offload/detail`
2. define the canonical ability/workflow entry first
3. decide the smallest default local front door
4. choose synchronous result only if the interaction is truly lightweight
5. otherwise return `run_id` early and continue through `status/result`
6. keep preview/confirm/apply local
7. keep cloud/addon detail summary-only on the local side

### 7.1 Frozen Content-Assistant Defaults

The current default local front doors are now frozen as:

1. article: native WordPress post screens are the default daily front door; the Content Assistant article tab defaults to history/detail workbench with bounded `optimize / draft / production / history` deep views
2. comment: single native-comment suggestion/reply from the WordPress comments entry
3. media: single attachment ALT suggestion on the default media page

### 7.1.1 Structured Suggestion Output Rule

Local suggestion lanes for taxonomy, SEO metadata, review notes, media ALT, and
similar content-adjacent outputs must consume structured fields from the
canonical ability/workflow output contract.

Required rules:

1. ability/workflow `input_schema` and `output_schema` remain the schema truth
2. UI surfaces consume named structured fields instead of parsing free text into
   product truth
3. generated candidates are sanitized, deduplicated, ordered, and risk-filtered
   before preview
4. model or hosted runtime output remains candidate data until local preview /
   confirm / apply completes
5. final WordPress writes remain local and auditable

This rule allows structured suggestion UX without creating page-private schema,
channel-specific schema normalization, or a second content registry.

## 8. Blocking Governance Gates

The following gates are now the blocking governance layer for local product surfaces:

1. `check:capability:admission`
2. `check:local:surface-budget`
3. `check:front-door:structure`
4. `check:content-assistant:dev-readiness`

This tranche treats the four gates above as the default minimal closeout for continuing content-assistant work. Descriptor snapshots, telemetry, and scaffolding stay outside the default path unless a later task explicitly opens those surfaces.

### 8.1 What Each Gate Owns

1. `check:capability:admission`
   - entry ability, `required_workflows`, `required_scopes`, `risk_level`, `requires_confirm`, and projection/channel exposure truth
2. `check:local:surface-budget`
   - default front door budget, settings/runtime separation, no batch/operator-console drift, and no page-owned sync orchestration
3. `check:front-door:structure`
   - one default front door per domain, one primary action lane, explicit secondary detail jump, summary-first result surface
4. `check:content-assistant:dev-readiness`
   - content-assistant domain fast closeout, including surface layering, runtime context/record, and write seam boundaries
### 8.2 Default AI Workflow

When a task hits a local product surface:

1. classify the lane first in the task contract or implementation note
2. keep implementation inside that lane
3. close out with the four blocking gates above instead of falling back to repo-wide heavy PHP by default

### 8.3 Current Recommendation After The Green Baseline

The current local-product baseline is green again. That means content-assistant
feature work may continue, but only inside the frozen lane model above.

Default recommendation:

1. continue with `single-object action`, `preview / confirm / apply`, or a
   bounded `secondary detail` surface
2. run `pnpm run scaffold:local-feature-lane -- --lane <lane> --surface <surface>`
   before starting a new local feature so lane ownership and default gates stay
   explicit
3. treat `check:content-assistant:dev-readiness + check:capability:admission + check:local:surface-budget + check:front-door:structure`
   as the standard closeout for content-assistant work
4. add `check:projection:descriptor-snapshots` when descriptor-bearing
   projection surfaces change
5. do not reopen page-owned runtime orchestration or a second operator-console
   style front door

Current highest-yield follow-up priorities:

1. keep `magick-ai-content-assistant/includes/admin-page.php` from growing into
   a new composition center; if a new feature needs orchestration, push it into
   REST/delivery or split another trait instead
2. if article optimization grows again, evaluate async-capable delivery before
   adding more synchronous surface weight
3. keep `write / production` inside the same bounded article tab, but do not
   let them absorb batch, queue, or debug-first UI

The following flows are explicitly secondary detail surfaces, not default front
doors:

1. media batch governance through bounded orchestration handoff/result surfaces, not in local media front doors or a Settings batch workbench
2. queue/status/detail views beyond one compact summary block

Within the frozen article front door, `write` and `production` are bounded
subviews inside the same article tab rather than a separate canonical
entrypoint. `write` is the user-facing alias of the existing `draft` view and
continues to use `workflow/wordpress_article_draft`; `production` continues to
use `workflow/wordpress_article_production` for existing draft/current-post
publish readiness. They may keep their own delivery/results handling, but they
must still remain summary-first, avoid batch/queue/debug drift, and continue
using REST/delivery seams instead of page-owned orchestration.

Native article entry is now the default user path for single-post article work:
`edit.php` may add one `AI 写文章` submenu that redirects to `post-new.php`,
`post-new.php` owns the visible write-article starting point, `edit.php` may add
only single-post row actions, and `post.php?action=edit` may expose current-post
write/optimize/publish-readiness panels. Content Assistant article pages default
to history/settings/deep-detail workbench. Bulk actions, scan-all flows, new
article REST seams, and new workflow ids are outside this contract.

If those flows remain local, they must still respect the same separation rule:
REST/delivery owns runtime action, and the page owns summary, preview,
confirm/apply, and navigation only.

### 7.2 Default Feature Paths For Future Local Plugin Work

When future AI adds a feature to `magick-ai-content-assistant` or another local
plugin/admin surface, choose one lane before editing code:

1. `settings truth`
2. `single-object action`
3. `preview / confirm / apply`
4. `secondary detail / batch / long-task`

Required implementation paths:

1. `settings truth`
   - edit only the dedicated settings surface or settings subpage
   - allow readonly summary elsewhere only when it does not share the same save
     handler
   - do not add runtime execution to page-owned settings handlers
2. `single-object action`
   - add or extend a canonical REST seam first
   - keep the default local front door to one primary action plus compact
     summary/result
   - use synchronous result only when the action is truly lightweight
   - otherwise return `run_id` early and continue through canonical
     `run/status/result`
3. `preview / confirm / apply`
   - keep final WordPress writes local
   - keep cloud/offload output as candidate data, not final local truth
   - keep preview/apply code in the local preview/apply seam instead of
     page-owned runtime handlers
4. `secondary detail / batch / long-task`
   - do not expand the default local front door to absorb batch/detail work
   - place the work in an existing secondary detail surface or a new secondary
     route
   - let canonical delivery own status/result progression

Shared local-app/runtime glue should extend the core-owned local adapter seam,
not duplicate app registration, runtime context normalization, or runtime
record decoration in each extension plugin.

Content Assistant policy defaults are owned by the extension option
`magick_ai_content_assistant_settings` plus code defaults. The extension must
not auto-migrate article/comment/media policy fields out of the legacy
`magick-ai` main settings option, and the shared settings store must not fall
back to `magick_ai_get_settings()` for those bounded policy fields. Core
continues to own cross-domain orchestration, channel posture, runtime, and
public integration truth.

### 7.3 Required Closeout For Content-Assistant And Similar Local Extensions

Every change that adds or modifies a local feature should explicitly close out
the matching gates:

1. always run `pnpm --dir ../magick-ai-content-assistant run check:content-assistant:dev-readiness`
2. treat `check:content-assistant:dev-readiness` as the default fast lane for local content-assistant-style work, not as a substitute for repo-wide `check:unit:php`
3. only add `pnpm run check:unit:php:heavy` when the change really touches shared workflow / projection / Agent Gateway / MCP / platform runtime truth
4. if the change touches runtime entry routes, services, or workflow/mainline
   behavior, also run `pnpm --dir ../magick-ai-content-assistant run check:content-assistant:runtime-env`
5. if the change touches contracts or AI workflow docs, also run
   `pnpm run check:contracts:refs`, `pnpm run check:docs:metadata-sync`, and
   `pnpm run check:ai:frontdoor`
6. if the change grows local admin or sibling-plugin surfaces, also run
   `pnpm run check:source-file-governance:report:json`

These closeout commands are part of the feature path, not optional aftercare.

## 8. Explicit Anti-Patterns

Do not:

1. process `save_defaults` and `generate` in the same request handler
2. call provider HTTP directly from page/controller/action UI
3. bind `provider_id` or `model_id` in product-layer extension code
4. treat one local page as settings page + runtime workbench + queue console + debug dump
5. turn cloud/addon into the final WordPress write owner

## 9. Relationship To Existing Contracts

This contract tightens and composes the following existing rules:

1. `cloud-responsibility-boundary-v1.md`
2. `mainline-workflow-skill-ability-delivery-v1.md`
3. `execution-tier-policy-v1.md`
4. `article-optimization-apply-v1.md`
5. `third-party-dev-path-v1.md`

If a future change conflicts with any of those rules, treat this document as a local product-surface interpretation layer, not a replacement truth.
