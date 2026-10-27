# Cloud Hosted Runtime Profiles v1

Status: active.

Date: 2026-07-17.

## Purpose

Define the bounded Cloud operator contract for selecting the hosted runtime
candidate chain used by the current WordPress connector. This is a Cloud
runtime configuration surface, not an ability, workflow, prompt, preset,
approval, or CMS routing control plane.

## Current Scope

WordPress is the only implementation priority in this phase. The contract is
platform-tagged so a later Typecho, Z-BlogPHP, Ghost, or other CMS connector can
be added without pretending to be WordPress or creating a second Cloud runtime.

The current contract identity is:

- `platform_kind`: `wordpress`
- `connector_id`: `wordpress_ai_connector`
- `operation_contract_version`: `wordpress_operation.v1`
- `contract_version`: `cloud-hosted-runtime-profiles.v1`

This platform tag is an explicit seam, not a universal CMS registry.
`connector_id` names the WordPress hosted-profile family; it is not the
deployed connector implementation identifier carried by the public runtime
envelope. The public execution envelope remains the single
`cloud_connector_runtime.v1` contract and is not selectable from this Admin
resource. Profiles are selected from the validated platform-specific operation,
so this resource binds the WordPress operation contract explicitly.

## Ownership

Cloud owns:

- the hosted profile namespace and the task-to-profile-id mapping inside it:
  resolving a task to one of the `wp-ai.*` hosted profiles, whether it arrives
  as a WordPress operation-contract task name (text scenes) or as the runtime
  input's `task` (the image-generation envelope). The table and the resolver
  live in `app/domain/wordpress_ai_connector/routing_profiles.py` and are applied
  on the connector runtime path in `app/api/routes/runtime.py`, so a connector
  request does not select its own hosted profile;
- the hosted candidate instance chain for each supported runtime profile;
- runtime timeout, fallback, and bounded retry settings;
- provider/model availability and health evidence;
- the configuration revision and service-plane audit receipt.

The WordPress/plugin side owns:

- ability and workflow identity, schema, and enablement;
- task adoption — whether a task uses a hosted profile at all, and which
  WordPress-side feature exposes it — and the local router truth for everything
  that does not leave the site;
- prompts, presets, permissions, review, approval, and preflight;
- final WordPress writes and final local audit truth.

Mapping ownership and adoption ownership are separate. Cloud resolves a task
name to a profile id inside its own hosted profile namespace; the resolved id is
returned with the run as execution metadata, but the site can neither choose it
nor configure the mapping. Which tasks a site sends to the hosted runtime, and
whether it uses hosted profiles at all, stay WordPress-side decisions: the
mapping is only consulted for requests a site has already routed to Cloud.

Cloud configuration can change how an already adopted hosted profile executes.
It cannot enable a plugin feature, adopt a profile for a site, or authorize a
WordPress write.

## Admin Contract

The only browser page is:

```text
/admin/runtime-profiles
```

The only internal service endpoints are:

```text
GET /internal/service/admin/runtime-profiles
PUT /internal/service/admin/runtime-profiles
PATCH /internal/service/admin/runtime-profiles
```

The browser proxy exposes the exact matching `GET`, `PUT`, and `PATCH` methods at
`/api/admin/runtime-profiles` after platform-admin and catalog-management
authorization. Unknown methods and the retired `ability-models` paths fail
closed.

The read projection contains:

- explicit platform and connector identity;
- available runtime instances grouped by execution kind;
- six supported WordPress profiles, ordered candidate instance IDs, and
  `availability_state` (`active` or `paused`);
- independent `read_only_profiles` containing the existing `text.ai` automatic
  binding snapshot in configured order; this is not historical call evidence;
- the Cloud/local ownership boundary.

The write request must repeat `contract_version`, `platform_kind`,
`connector_id`, `operation_contract_version`, and a profile set. `PUT` requires the complete catalog; `PATCH` accepts a
nonempty subset, validates only that subset, and preserves omitted profiles
including their binding revisions and failed or stale media evidence. Both
methods return the complete read projection and retain the same permission,
idempotency, candidate validation, and service audit requirements. The Admin
page opens an independent dialog draft and sends exactly that usage using
`PATCH`. Success refreshes the complete projection and closes the dialog; a
failure retains input. Cancel, Escape, and close discard that draft. No page
second save exists. Ordinary saves never trigger capability probes, including
for the edited media usage: explicit **Verify capability** supplies existing
required evidence before saving. Media recognition policy saves independently.
`read_only_profiles` is never accepted by the write interface; the six-profile
whitelist and `text.ai` automatic selection rules are unchanged.
Candidate instances, when present, must be available, enabled by the provider
model allowlist, compatible with the profile execution kind, and limited to a
primary plus one fallback. An empty candidate chain is an explicit fail-closed `needs_candidates` state, so a
missing media provider does not block unrelated profile configuration. Writes
require an idempotency key and return an auditable operator receipt. Existing
Cloud operator notes must round-trip unchanged when the page does not edit
them.

## Direct Cutover

The project has no production users and no compatibility requirement. The
following surfaces are deleted rather than aliased:

- `/admin/ability-models`;
- `GET /internal/service/admin/ability-models/runtime-projection`;
- `GET|POST /internal/service/admin/ability-models/plugin-routing`;
- `POST /internal/service/admin/ability-models/runtime-binding`.

The read-only Cloud dependency projection is removed from this workspace.
Site Knowledge embedding remains exclusively under `/admin/vector-settings`.
The constant-conflict runtime binding stub is removed. Audio generation remains
a supported runtime execution kind, but audio preview is removed from the
profile configuration page; provider/runtime diagnostics may gain a separate
bounded test surface only after a new contract review.

The browser proxy no longer exposes audio-job creation or polling. The internal
audio runtime API remains available to non-browser runtime consumers and is not
silently repurposed as an Admin diagnostic surface.

The superseded combined WordPress connector contract and its former identity
field are removed atomically from active code, persisted hosted-profile
policies, frontend consumers, and tests. There is no alias, dual read, or
fallback value.

## UI Contract

The page is a configuration workspace:

1. configured / unconfigured / paused / configuration-error summary and boundary;
2. hosted profile directory;
3. selected profile inspector;
4. candidate selection only inside the edit dialog;
5. one dialog save per usage with an auditable receipt, plus independent media
   recognition policy save.

Model suppliers use POST for create (duplicate ID, including a concurrent
create, returns 409) and PATCH for edit (missing ID returns 404). Credentials
remain masked and an omitted replacement preserves the stored Key. Fetching
the account catalog preserves enabled choices and never auto-selects all
models. Missing configured models remain visible as catalog unconfirmed.
Reference information refreshes independently and never counts as account
availability. Save persists connection and enabled models before directory
sync; directory failure offers a retry and cannot be reported as save failure.
The preview fetch is not a stored runtime catalog. Saving therefore performs a
second account catalog fetch to update runtime instances; explain this before
submission rather than trusting a browser-supplied catalog as runtime truth.
Missing credentials direct the operator back to Key entry. New model selections
come from the account catalog; there is no manual model-add entry. Duplicate-create errors name
an actionable recovery, and changing a new supplier's display name updates its
generated ID. Capability verification identifies its target capability and
states that it sends a real, potentially billable Provider request.
The model list defaults to account-returned models plus selected IDs that the
account catalog has not confirmed, with separate counts. Reference models have
their own browsing scope and never inflate the account count. Normalize only
qualified/bare forms of the same ID; do not guess aliases between different
IDs. Reference timestamps identify reference updates, not account fetches.
Historical-model visibility is a browser-persisted list preference; reference
source selection is explicitly view-only. Neither is supplier configuration or
a reason to require saving. More operations groups confirmed enabled-model
mutations; view preferences remain in reference browsing.
A supplier save has one short success toast. Automatic directory refresh does
not also emit a row-level test success; catalog failure stays beside its retry,
independent of the saved connection. Manual checks describe the stage proved,
without implying verified model generation. Persistent next-step content offers
an action rather than repeating the save receipt.

Usage candidate tables default to current compatible catalog models. Unselected
catalog-missing or unavailable models are retained under a closed “Unconfirmed
or unavailable models” disclosure, with counts and a supplier-management link.
Selected problematic primary/fallback models remain in the main table with
reasons so they can be replaced. Filters apply to both groups, with a separate
bounded visible count per group. This changes visibility only: text models with
missing catalog evidence retain their existing selection eligibility, and media
capability verification requirements remain unchanged.

The next action configures usages with a supplier filter, or enables models
first when none are selected.

Existing runtime run details expose `selected_provider_id` and
`selected_model_id` from the recorded run alongside `run_id`. Absent fields are
null and shown as no call evidence; current routing configuration must never
be used to reconstruct historical selection. No schema migration is needed.

It must use the shared strict `ApiClient`. It must not fetch Site Knowledge
embedding state, create audio jobs, expose generated media bytes, or imply
ownership of WordPress abilities or writes.

## Verification

Use the focused backend, proxy, static frontend, and Playwright contracts for
the surface, then run:

```bash
pnpm run check:fast
pnpm run check:seam
pnpm run check:perimeter
pnpm run check:anti-drift
pnpm run lint
```

### 账户目录与型号身份（2026-10-26）

- 内部 `model_id` 继续用于路由与历史证据。供应商内显示上游原始型号；
  跨供应商位置显示供应商名称与上游型号，内部 ID 放在详情。
- 仅归一化连接明确使用的系统 namespace；保留上游型号的大小写和斜杠路径，
  不按名称相似度合并、替换型号，不把 `vendorA/foo` 与 `vendorB/foo` 当成一个型号。
- `vision` 是已有目录主分类，文本用途也可选择这类文本输出模型；界面显示
  “文本 · 支持图片输入”。目录声明不代表能力验证，视觉用途继续要求当前路由的
  独立验证证据。普通文本保存不发起媒体验证。
- 此兼容修正不修改 `text.ai` 自动候选的规则、标签或顺序。
- 已保存但最新目录未返回的型号标为“已保存，目录未返回”，保留现有选择，
  不显示成参考资料自动启用。停用前展示存储用途引用与保存影响，提供用途配置入口。
- 所有供应商预设只填连接信息，不能预填任何启用型号；Admin 不再提供自由输入
  型号的手动添加入口。参考资料只读，不提供单项或批量启用。
- 新增启用必须从账户目录明确选择，不自动全选。Admin POST/PATCH 在新增选择时
  重新获取账户目录，独立于客户端提交的预览/参考元数据校验，拒绝未返回或停用型号；
  目录失败保留草稿，不写入连接。仅保留/减少已有选择不额外请求目录，不发起付费探测。
  改变供应商、类型、地址或 namespace 后不得沿用旧连接的型号来源证明。
- 已有手动配置保持兼容；未返回型号可保留/移除，但移除后重新启用需有账户目录证明。
  内部 bootstrap/import 的 `upsert` 保留历史兼容能力，不暴露为 Admin 任意型号写入口。
- `config.model_ids` 字段存在且为空时，明确表示没有启用模型；运行 allowlist 同样拒绝
  该供应商的全部型号，不得恢复 metadata 或默认目录。只有字段缺失的旧连接才兼容
  metadata 回退。无模型目录/仅部署 ID 的新连接目前不能通过普通 Admin 启用模型；
  出现实需后单独设计部署 ID 接入，不恢复通用自由输入。

成因记录：旧预设会将硬编码型号直接填入启用选择，保存未校验账户目录，目录同步又会
为避免中断已有用途保留已保存型号；这条组合路径能够长期保留目录未返回型号。
以上规则同时约束预设、参考入口、写接口和空列表语义，不能仅删除单个型号。
