# WordPress Title External Provider E2E Revalidation — 2026-07-25

Status: independently revalidated on the accepted M4 development runtime.
Production was not changed.

This record is limited to the WordPress title-generation external Provider
path. Context-window ownership and rejection behavior, trusted price metadata,
and cache monetary evidence are separate work items.

Follow-up on `2026-07-25`: the official OpenAI list price was accepted only as
an explicitly non-gateway-billing runtime-estimate baseline. The independent
price ownership and existing-cohort cache calculation are recorded in
[Provider Pricing And Cache Economics Revalidation](provider-pricing-and-cache-economics-revalidation-2026-07-25.md).

## Change Envelope

- Repository changed: `npcink-ai-cloud`, documentation only.
- Runtime under test: accepted M4 Preview revision
  `b12eab5200d5839bdb819eea408c64310479abde`.
- Consumer under test: disposable draft on the Local WordPress site
  `https://magick-ai.local`.
- Intended result: revalidate the normal
  `WordPress -> Addon -> Cloud -> mqzj/openai -> gpt-5.5 -> WordPress review`
  path from current integration truth.
- Public and internal API contracts changed: none.
- Routing configuration changed: none.
- WordPress, Addon, Provider, Cloudflare, production, entitlement, credit, and
  billing configuration changed: none.
- Prompt, result, credential, cookie, nonce, or environment values retained in
  Git: none.
- Real Provider call budget: three text calls, with a three-consecutive-failure
  stop condition. The run completed `3 / 3`; no retry cohort was started.
- Rollback: revert this documentation commit. No runtime or routing rollback is
  required because the validation did not mutate either.

## Before

The current `origin/master` was freshly fetched before validation:

- revision: `b12eab5200d5839bdb819eea408c64310479abde`;
- the historical `3133be02` revision was not treated as current truth;
- M4 status reported `acceptance_state=accepted`, `promotion_pr=259`,
  `source_branch=master`, `source_dirty=false`, and the same `b12eab52`
  source revision;
- all eight managed M4 services were running, the required services were
  healthy, Alembic was at `20260717_0068 (head)`, and `/` plus
  `/health/live` returned `200`;
- the existing foreground SSH tunnel on `127.0.0.1:18010` was owned by the
  documented M4 preview command, targeted M4 loopback `127.0.0.1:8010`, and
  returned the development JSON liveness envelope.

The read-only Provider evidence baseline for the current
`npcink-cloud/connector-runtime`, `openai/gpt-5.5` lane contained:

- `20` successful evidence records;
- `20 / 20` complete Provider-call meter evidence;
- `0` errors and `0` fallbacks;
- no prompt, result payload, credential, or cache key projection.

## Route, Contract, And Consumer Investigation

The current source and M4 data were traced before making a Provider call:

1. WordPress AI `ai/title-generation` is projected by the Addon to
   `title_generation`.
2. The Addon sends `cloud_connector_runtime.v1` with a nested
   `wordpress_operation.v1`; it only accepts
   `cloud_connector_result.v1` with `suggestion_only=true`.
3. Cloud maps `title_generation` to `wp-ai.short-text` and routing intent
   `content.short_text`.
4. The live M4 `wp-ai.short-text` binding had one candidate:
   `openai-global-gpt-5-5`, model `gpt-5.5`, Provider adapter ID `openai`,
   health `healthy`.
5. Enabled M4 Provider connections were `ollama_m4` and `mqzj`.
   `ollama_m4` declared only `qwen3.5:9b`; `mqzj` declared `gpt-5.5`.
   Therefore the live `openai/gpt-5.5` adapter lane resolved to the existing
   `mqzj` connection without changing the route.
6. The consumer remained the official WordPress AI review UI. Cloud and the
   Addon had no WordPress write path.

The gateway connection name and internal adapter identity remain distinct:
`mqzj/gpt-5.5` is the operator-facing connection lane, while
`openai/gpt-5.5` is the normalized Provider-call evidence identity.

## Real E2E Result

The repository's opt-in Local browser gate ran against:

- WordPress `7.1-beta3-62847`, environment `local`;
- official WordPress AI `1.2.0`;
- Npcink Cloud Addon `0.1.3`;
- verified Addon connection and enabled WordPress AI connector;
- the documented foreground M4 tunnel at `http://127.0.0.1:18010`.

The gate made exactly three text Provider calls: title generation,
summarization, and one whole-paragraph rephrase. This record claims title E2E
acceptance only; the other two calls were part of the existing browser gate and
were included in the total call budget.

Browser and local persistence evidence:

- `ai/title-generation`: HTTP `200`;
- the generated title was visible in the WordPress review modal before Insert;
- Insert changed only dirty editor state;
- WordPress post/autosave writes before explicit Save/Update: `0`;
- explicit local Save/Update writes: `1`;
- saved title equaled the reviewed suggestion;
- revision delta after explicit save: `+1`;
- post status remained `draft`;
- non-target sentinel blocks remained unchanged;
- the temporary draft and short-lived authentication session were deleted and
  verified absent.

The matching Cloud title run was:

| Field | Observed value |
| --- | --- |
| `run_id` | `run_fc433b55d0ab4139bf0aa065391739fa` |
| status | `succeeded` |
| profile | `wp-ai.short-text` |
| Provider | `openai` through the existing `mqzj` connection |
| model | `gpt-5.5` |
| instance | `openai-global-gpt-5-5` |
| connector contract | `cloud_connector_runtime.v1` |
| operation contract | `wordpress_operation.v1` |
| operation task | `title_generation` |
| write posture | `suggestion_only=true` |
| fallback | `false` |
| error | none |
| input tokens | `950` |
| output tokens | `105` |
| cost estimate mode | `unpriced` |

The cost field remained `0` only because the lane was unpriced. It is not
evidence of free upstream execution.

After the three-call browser run, the same Cloud evidence lane contained:

- `23 / 23` successful records;
- `23 / 23` complete Provider-call meter records;
- `0` errors and `0` fallbacks;
- `23 / 23` cache-affinity-applied records;
- read-only evidence boundary;
- no prompt, result payload, credential, cache key, or direct WordPress write.

## Verification Commands And Exact Results

```bash
git fetch --prune origin
git rev-parse origin/master
pnpm run m4:preview:status
curl -fsS http://127.0.0.1:18010/health/live
```

Results:

- `origin/master=b12eab5200d5839bdb819eea408c64310479abde`;
- M4 accepted revision matched `origin/master`;
- eight managed services were running;
- `/=200`, `/health/live=200`, Alembic `20260717_0068 (head)`;
- tunnel liveness returned `status=ok`, environment `development`.

The M4 read-only routing inspection returned:

```text
profile=wp-ai.short-text
candidate=openai-global-gpt-5-5
provider=openai
model=gpt-5.5
health=healthy
operation_contract=wordpress_operation.v1
mqzj declares gpt-5.5
ollama_m4 declares qwen3.5:9b only
```

The real consumer gate was:

```bash
NODE_PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules" \
HEADLESS=1 \
WP_BASE_URL="https://magick-ai.local" \
WP_AI_TEXT_ARTIFACT_DIR="/tmp/npcink-item1-title-e2e-20260725" \
WP_AI_TEXT_SUMMARY_PATH="/tmp/npcink-item1-title-e2e-summary-20260725.json" \
composer run smoke:wp-ai-text-browser
```

Result: passed every preflight, review, no-write, local-save, revision,
sentinel-integrity, session-cleanup, and fixture-cleanup assertion.

Disposable artifact hashes:

| Artifact | SHA-256 |
| --- | --- |
| machine summary | `8e70ee70c663e60e6a008b283e459f52239327851173f703c911f0317ad65a19` |
| review screenshot | `54220584f73a52399d37c885f3947746d7b1ad656933b230fdbf871725ddbdc3` |
| saved screenshot | `77fbc05e1c96791fed633fc6d8f4f8145f5b336eea751686dc2bd407a095368f` |

The artifacts remain outside Git and contain no Provider credential. The
machine summary contains only bounded IDs, counts, paths, versions, and hashes;
it does not retain raw prompts or model outputs.

## Unverified Boundaries

- This does not validate production or any production Provider connection.
- It does not prove a monetary cache benefit.
- It does not change or accept any price metadata.
- It does not prove causal latency improvement.
- It does not provide human/external customer acceptance.
- It does not re-accept context-overflow rejection behavior; that is a
  separate P2 work item.

## Acceptance Ledger

| State | Result |
| --- | --- |
| source/local verified | Passed: current contracts and disposable WordPress consumer path traced and exercised |
| candidate validated on M4 | Not a new candidate: no runtime source or routing change was made |
| PR/CI | Pending for this independent documentation record |
| merged into master | Pending |
| accepted on M4 | Functional path passed on already accepted revision `b12eab52`; docs-only promotion decision pending after merge |
| production | Not changed |
| human/external acceptance | Pending |

## Related Records

- [Provider Context Window And P2 Revalidation](provider-context-window-p2-revalidation-2026-07-25.md)
- [WordPress Title Provider E2E And Context Preflight Validation](wordpress-title-provider-e2e-and-context-preflight-validation-2026-07-25.md)
- [Provider Runtime Evidence Surface Validation](provider-runtime-evidence-surface-validation-2026-07-25.md)
- [Pi-Inspired Provider Runtime Compatibility Evidence](pi-provider-runtime-compatibility-evidence-2026-07-25.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
