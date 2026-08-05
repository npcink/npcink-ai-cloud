# AI Development Validation Tiers v1

Status: active engineering standard.

Purpose: give human operators and AI development sessions one fast, risk-based
answer to three questions:

1. how soon a change may be shown for feedback;
2. which evidence is required before publication and merge;
3. when shared M4 runtime ownership and a cold rebuild are actually justified.

This standard refines, but does not weaken,
[ADR-024](decisions/024-risk-tiered-development-validation-authority.md), the
[Development and Validation Operating Model](development-validation-operating-model-v1.md),
the [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md),
or GitHub required checks. It does not authorize production, Cloudflare, DNS,
Access, Tunnel, secret, data, or Cloud/WordPress ownership changes.

## 1. Two Clocks, One Evidence Chain

Every task has two independent clocks:

- **preview clock**: the shortest safe path to something a human can inspect;
- **closeout clock**: the evidence required to publish, merge, promote, or
  release the chosen change.

A visible preview is a candidate, not proof of merge, M4 acceptance,
production release, or human acceptance. Do not delay an eligible L0 or L1
preview on unrelated backend CI, a full visual matrix, PR merge, or accepted
promotion. Do not use that speed to mislabel the later evidence state.

## 2. The Three Tiers

Classify the whole change by its highest-risk touched seam. When uncertain,
start at the lower plausible tier for investigation, then reclassify upward
before editing the higher-risk seam.

| Tier | Typical scope | Preview gate | Closeout gate |
| --- | --- | --- | --- |
| **L0: appearance only** | copy, color, icon, local spacing, or other presentation that does not change layout geometry, actions, state, interaction, shared primitives, or runtime inputs | exact source/static check plus one target-route PC browser check | relevant source contract and required PR checks; no M4 by default |
| **L1: route composition** | page layout, fold/disclosure, filter presentation, column visibility/order, action placement, responsive composition, or route-local interaction | focused route contract/behavior check plus focused PC browser receipt | `check:admin-ui` for Admin work, relevant focused interaction test, required PR checks, and the complete visual matrix once only when the changed seam requires it |
| **L2: shared or runtime-sensitive** | API/data semantics, auth, credentials, destructive behavior, shared primitives/tokens, dependencies, persistence, migration, worker, proxy, Compose, Dockerfile, deployment scripts, or runtime configuration | focused source/contract evidence, then the appropriate isolated candidate runtime | full relevant chain, candidate M4 where in scope, required PR checks, merge, clean-master promotion, status, and relevant smoke |

The older Admin labels map as follows: `low` is L0, `material` route layout is
L1, and `shared` or behavioral/runtime-sensitive work is L2. Other historical
documents may use L1/L2/L3 for deployment environments; that notation is not
this change-risk classification. When quoting historical evidence, retain its
original label and name the scheme explicitly.

### 2.1 L0 eligibility is intentionally narrow

L0 is allowed only when all of these are true:

- no action is added, removed, reordered, hidden, or made easier/harder to
  discover;
- no breakpoint, width, height, overflow, column, dialog, disclosure, or
  focus behavior changes;
- no shared component, geometry token, state owner, API, dependency, build,
  proxy, or runtime input changes;
- the target route can be inspected in one bounded PC browser state.

Changing text can still be L1 when the new length changes layout, disclosure,
or action clarity. Moving a button is L1 even if no handler changes.

### 2.2 L1 is the normal Admin UI tier

L1 covers most useful page simplification: reducing visible columns, replacing
ambiguous filters, moving low-frequency controls behind a disclosure, and
rebalancing whitespace. The model-management simplification on
`/admin/ai-resources` is an L1 example because it changes route composition
and operator scanning, even though it does not change the API or data owner.

Use one focused route fixture and browser receipt first. Do not run every
Admin route merely because one route changed. Run the complete visual matrix
once at closeout only when the manifest, shared seam, or PR policy requires it.

### 2.3 L2 pays for the risk it introduces

L2 does not mean “run everything.” It means select every gate that answers a
real risk introduced by the change. A proxy-only change needs proxy contract
and runtime response-header evidence; it does not automatically need every
domain test. A migration or shared credential primitive needs a broader chain.

Dependency, lock, Dockerfile, Compose, proxy, and deployment-script changes
use `m4:preview:deploy`; ordinary source uses `m4:preview:sync`. Never choose a
cold build merely as reassurance.

## 3. Immediate Upward Reclassification

Stop the current lane and reclassify as soon as any of these appears:

- a second route or shared primitive must change;
- focus, keyboard, disabled, loading, empty, error, confirmation, or
  destructive behavior changes;
- API shape, request lifecycle, state ownership, authorization, credentials,
  persistence, or audit evidence changes;
- a dependency, lock file, Dockerfile, Compose, proxy, deployment script, or
  runtime setting changes;
- the focused browser check shows overflow, stale assets, console errors,
  network errors, or behavior different from the source under test.

Reclassification is not failure. It prevents an initially small task from
silently bypassing the controls required by its actual diff.

## 4. Optional Parallel AI Sessions

The default repository mode is one active AI development session. Only when
the operator explicitly declares a multi-session queue, follow the
[Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md).
In that mode:

1. each builder owns one conflict domain and stops at a clean, committed
   `local-ready` receipt;
2. L0/L1 frontend candidates use owned frontend slots when runtime rendering
   is needed, without mutating the accepted primary runtime;
3. one integrator owns the human-authored PR lane, current-base integration,
   and primary M4 operations;
4. keep at most one item in the merge/runtime lane and at most two accepted
   `local-ready` items waiting;
5. builders do not independently publish merge-ready PRs, chase `master`, or
   overwrite the shared candidate.

This makes local investigation and implementation parallel while keeping Git
integration and shared runtime mutation intentionally serial.

## 5. Evidence Receipts

Every completion report records:

- tier and the reason for that tier;
- exact source revision and worktree cleanliness;
- changed module and named files;
- preview evidence, if any, with route, viewport, and observed state;
- gates run, exact result, and intentionally omitted gates;
- highest evidence state actually reached: `local verified`, `candidate validated on M4`,
  `PR verified`, `merged into master`,
  `accepted on M4`, or `production validated`;
- M4 or tunnel state when either was used;
- rollback.

Parallel-only handoffs add the owner, `local-ready`, merge-lane, runtime-lane,
and frontend-slot fields required by the parallel standard.

HTTP `200`, a screenshot, a pushed branch, merged source, M4 acceptance,
production deployment, and human approval are never interchangeable.

## 6. Anti-Duplication Rules

- Run the narrowest useful check in the edit loop.
- Do not repeat the same full contract/domain or visual matrix for one revision
  without recording the distinct question answered by the repeat.
- GitHub required checks remain merge authority; M4 proves runtime facts that
  source and hosted CI cannot.
- Post-merge M4 acceptance normally needs promotion, status, and relevant
  smoke, not another automatic full suite.
- A protected public browser path and direct M4 loopback are separate consumer
  paths. If they disagree, inspect source revision, response headers, asset
  identity, browser cache, and edge behavior separately before rebuilding.

## 7. Examples

| Change | Tier | Reason |
| --- | --- | --- |
| Adjust one badge color without changing tokens or geometry | L0 | presentation only |
| Shorten a label and confirm the same geometry | L0 | bounded copy-only change |
| Collapse low-frequency model reference details | L1 | disclosure and scanning behavior change |
| Replace two ambiguous `全部` selects with labeled filters | L1 | route-local control presentation change |
| Remove or relocate a destructive action | L2 | destructive behavior/discoverability changes |
| Change `AdminWorkbenchDialog` for several routes | L2 | shared primitive blast radius |
| Add no-store headers to the M4 preview proxy | L2 | proxy/runtime input change |
| Change only this document | documentation-only | link, policy contract, and docs gate; no M4 |

## 8. Default Decision

When the requested outcome is “先看效果,” optimize the preview clock within
the declared tier. When the requested outcome is “提交、合并、上线或验收,”
continue through the corresponding closeout state. If both are requested,
show the eligible candidate first and finish the closeout second.
