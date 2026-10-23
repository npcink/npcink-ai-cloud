# Phase 1 Closed-Loop Runbook — 2026-10-19

Status: active operator/agent checklist. Does **not** authorize production
Deploy, paid Provider execute, or plugin publication by itself.

中文主题：把第一阶段跑通——官方 WordPress AI → Cloud Addon → Cloud
`POST /v1/runtime/execute` → 建议采用/保存 → `/v1/agent-feedback/*`。

Companion: root [`AGENTS.md`](../../AGENTS.md),
[`phase-1-scope.md`](phase-1-scope.md),
[`wordpress-ai-loop-verification-checklist-2026-09-22.md`](../wordpress-ai-loop-verification-checklist-2026-09-22.md).

## 0. Snapshot (read-only evidence as of drafting)

| Fact | Evidence |
| --- | --- |
| Public live | `GET https://cloud.npc.ink/health/live` → 200; `source_revision=b8cc6049da7d` |
| Git `origin/production` tip | `16747c40` (SEO specialist pause #1141/#1143) — **newer than live** |
| #1155 family (Advisor / inspection / audio / advanced media) | On `master`; **not** on `origin/production` / not in live |
| True generate this wave | **Not verified**; 2026-10-17 runs recorded `provider.upstream_unavailable` |
| Formal release smoke | **not_passed** / deferred ([formal-release-smoke-entry-v1.md](../formal-release-smoke-entry-v1.md)) |
| Trial posture | First 3 users / 4 weeks may start on trial §0 without full formal smoke; do **not** rename that as formal Done |

Refresh live SHA before any Deploy or smoke; do not permanently copy the table.

## 1. Authority map (who clicks what)

| Step | AI / maintainer may prepare | Human operator must do |
| --- | --- | --- |
| Read docs, draft receipts, run **non-mutating** curls | Yes | Optional review |
| Fill smoke env from secret store | Draft paths only | Paste secrets / OTP |
| `production:release:preflight` | Yes (read-only GitHub/API) | Confirm `ready` |
| GitHub **Deploy Production** | Never self-dispatch without quote | Exact phrase + `expected_sha` |
| Portal login code / mailbox | Request when authorized | Enter OTP |
| WordPress install Addon + official `ai` plugin | Package/checklist | Install/activate on site |
| Portal site authorize / reconnect | Guide | Click authorize |
| Paid / real `execute` or editor generate | Only after human budget OK | Confirm budget + one click |
| Merge PRs / promote `production` | With explicit ask | Approve |

## 2. Source runbooks (do not fork procedures)

Use these as normative command owners:

| Topic | Path |
| --- | --- |
| Deploy Production | [`deploy/PRODUCTION_GITHUB_DEPLOY.md`](../../deploy/PRODUCTION_GITHUB_DEPLOY.md) |
| Release checklist / open blockers | [`deploy/RELEASE_CHECKLIST.md`](../../deploy/RELEASE_CHECKLIST.md) |
| Formal release smoke entry | [`docs/formal-release-smoke-entry-v1.md`](../formal-release-smoke-entry-v1.md) |
| Smoke env template | [`deploy/release-smoke.env.example`](../../deploy/release-smoke.env.example) |
| Smoke script | [`deploy/release-smoke.sh`](../../deploy/release-smoke.sh) |
| Internal tunnel wrapper | [`deploy/with-smoke-internal-tunnel.sh`](../../deploy/with-smoke-internal-tunnel.sh) |
| WP AI connector smoke (Cloud-only) | [`docs/production-wordpress-ai-connector-smoke-runbook-v1.md`](../production-wordpress-ai-connector-smoke-runbook-v1.md) → `app/ops/production_wordpress_ai_connector_smoke.py` |
| Portal + writing acceptance | [`docs/portal-production-validation-runbook-2026-10-16.md`](../portal-production-validation-runbook-2026-10-16.md) |
| Loop Done (six criteria) | [`docs/wordpress-ai-loop-verification-checklist-2026-09-22.md`](../wordpress-ai-loop-verification-checklist-2026-09-22.md) |
| Live-site stage1 orchestrator | `scripts/live-site-stage1.py` → `app/ops/live_site_stage1.py` (+ readiness/acceptance/execute-packet siblings) |
| Addon public onboarding | Addon repo `docs/public-cloud-onboarding-checklist.md` |
| Addon ↔ Cloud paired release | Addon repo `docs/042-paired-release-readiness-2026-10-17.md` |
| Runtime config / failed generate note | [`docs/runtime-configuration-acceptance-2026-10-17.md`](../runtime-configuration-acceptance-2026-10-17.md) |

## 3. Acceptance sheet (copy into a receipt)

### A. 前置条件

| # | Check | AI 可做 | 需人工 | Pass? |
| --- | --- | --- | --- | --- |
| A1 | `curl -fsS https://cloud.npc.ink/health/live` → ok; record `source_revision` + release name | Yes | — | |
| A2 | Decide target Cloud SHA: either keep live `b8cc6049…` for trial-only reuse, or promote a reviewed `production` tip (e.g. include SEO pause `16747c40` and/or later master) | Draft options | Choose | |
| A3 | Provider budget / connection usable for **one** short text call ([portal runbook §0](../portal-production-validation-runbook-2026-10-16.md)) | Read docs | Confirm budget | |
| A4 | WordPress ≥ 7.0; official plugin `ai`; Addon package identity agreed | Checklist | Install | |
| A5 | Addon package: agreed zip (收口日实测 header/常量 **0.4.4**；规划期曾配对 0.4.3)；do not treat store listing as git master | Verify paths | Install agreed package | |
| A6 | Secrets for smoke exist in store (never commit): see `deploy/release-smoke.env.example` | List names | Fill values | |

### B. 部署窗口（仅当人工选择更新 live）

Normative flow: [`deploy/PRODUCTION_GITHUB_DEPLOY.md`](../../deploy/PRODUCTION_GITHUB_DEPLOY.md).

| # | Step | AI 可做 | 需人工 | Pass? |
| --- | --- | --- | --- | --- |
| B1 | Ensure desired revision is on GitHub `production` (promotion PR already merged if required) | Inspect refs | Approve promotion | |
| B2 | `pnpm run production:release:preflight -- --sha <full-lowercase-sha>` → `release_preflight=ready` | Yes | Read output | |
| B3 | Optional: `--require-formal-smoke` when inline smoke is part of the gate | Yes | Decide | |
| B4 | GitHub Actions → **Deploy Production**; paste `dispatch_expected_sha`; type exactly `Approved for production validation by operator.` | Never alone | Dispatch | |
| B5 | Leave `run_formal_release_smoke=false` unless OTP will remain valid; deferred smoke ≠ passed | Remind | Toggle | |
| B6 | Post-deploy: live `source_revision` matches expected SHA | Curl | Confirm | |

**Stop:** no Deploy without the exact approval sentence and matching SHA.

### C. 正式 / 有界 smoke（密钥 + OTP）

| # | Step | AI 可做 | 需人工 | Pass? |
| --- | --- | --- | --- | --- |
| C1 | Copy `deploy/release-smoke.env.example` → `.tmp/release-smoke.env`; `chmod 600` | Template | Fill secrets | |
| C2 | Fields: `NPCINK_CLOUD_BASE_URL`, `INTERNAL_AUTH_TOKEN`, `ADMIN_KEY`, member email, **Portal login code**, site id / key id / key secret | List | Paste OTP + keys | |
| C3 | Prefer tunnel path in [formal-release-smoke-entry-v1.md](../formal-release-smoke-entry-v1.md): `deploy/with-smoke-internal-tunnel.sh` + `deploy/release-smoke.sh` with `NPCINK_CLOUD_EXPECTED_DEPLOYED_SHA` | Run when authorized | Authorize | |
| C4 | Or GitHub **Release Smoke** workflow after deploy | Prepare | Dispatch | |
| C5 | Cloud-only connector smoke (signed): `app/ops/production_wordpress_ai_connector_smoke.py` per its runbook — optional title execute; **no WP writes** | Run when keys exist | Approve spend | |

Trial note: full formal smoke may stay not_passed for the 3-user trial §0; still record that honestly.

### D. 站点连接（Addon + Portal）

From Addon [`docs/public-cloud-onboarding-checklist.md`](file:///Users/muze/gitee/npcink-cloud-addon/docs/public-cloud-onboarding-checklist.md) (in Addon repo):

| # | Step | AI 可做 | 需人工 | Pass? |
| --- | --- | --- | --- | --- |
| D1 | Confirm `https://cloud.npc.ink/health/live` and `/portal` reachable | Curl | — | |
| D2 | Install/activate official `ai` + Addon on the trial site | Guide | Click | |
| D3 | Portal authorize → Addon shows connected; entitlement / `wordpress_ai_capabilities` fresh | Diagnose | Authorize | |
| D4 | Optional live-site automation: `uv run python scripts/live-site-stage1.py` (plan first; `--execute` needs exact approval text in `app/ops/live_site_addon_install.py`) | Plan report | Approval string | |

Paired release reminder ([Addon `docs/042-paired-release-readiness-2026-10-17.md`](file:///Users/muze/gitee/npcink-cloud-addon/docs/042-paired-release-readiness-2026-10-17.md)): do not distribute Addon features that require a Cloud schema/live that is not deployed.

### E. 真 generate + 编辑器闭环（一次最小任务）

Normative clicks: [portal-production-validation-runbook §4](../portal-production-validation-runbook-2026-10-16.md).

| # | Step | AI 可做 | 需人工 | Pass? |
| --- | --- | --- | --- | --- |
| E1 | Open non-sensitive draft in WP editor; confirm Addon connection | — | Yes | |
| E2 | One title (or short text) via official AI control; no batch / no SK side quests | — | Yes | |
| E3 | Suggestion dialog → human edit → insert/adopt → **Save draft** (no publish required) | — | Yes | |
| E4 | Reload editor; adopted text still present | — | Yes | |
| E5 | Dev correlates Cloud `run_id`, provider/model, credits, errors | After human run | Share times | |
| E6 | Feedback / journey (if opted in): event ties to `source_run_id`; no prompt/body | Query when authorized | Opt-in settings | |

**Stop on failure** per portal runbook §5 (do not hammer generate).

### F. 收据字段（每条闭环至少记一次）

| Field | Example / rule |
| --- | --- |
| Time (Asia/Shanghai) | ISO-like local label |
| Cloud live `source_revision` + release name | From `/health/live` |
| Git refs considered | `origin/production`, `origin/master` tips |
| WordPress / official AI / Addon versions | Plugin screens |
| Site id (opaque) | No secrets |
| Operation | title generate / adopt / save |
| UI result | success/fail + visible error text |
| `run_id` / `trace_id` | If shown; else “not shown” |
| Provider / model | From Cloud evidence, not guessed |
| Credits before/after | Portal display |
| Feedback event id | Or “not delivered / N/A” |
| Formal smoke | passed / not_passed / deferred |

## 4. Immediate blockers (what is stuck now)

1. **Human Deploy decision** — whether to leave live on `b8cc6049` or Deploy a newer `production` tip (and whether to wait for #1155-class promote). AI cannot press Deploy.
2. **Secrets + OTP** — formal smoke and signed connector smoke need filled `.tmp/release-smoke.env` / protected GitHub secrets and a fresh Portal login code.
3. **Provider truth** — last documented production text attempts were `provider.upstream_unavailable`; need one authorized minimal generate under budget, not more docs.
4. **Addon distribution** — 收口日实测 Addon 插件头/常量 **0.4.4**（规划讨论期曾确认 0.4.3 合入）；试用站须装约定 zip，不假设商店分发 == git master。详见 [planning-discussion-session-closeout-2026-10-23.md](../history/engineering/2026/planning-discussion-session-closeout-2026-10-23.md)。

## 5. Suggested order for “跑通” without over-claiming

1. Human: confirm budget + which Cloud SHA is in scope (keep live vs Deploy).
2. If Deploy: B2→B4→B6 only with explicit approval sentence.
3. Human: D2–D3 on one trial site.
4. Human: E1–E4 once; maintainer: E5–E6.
5. Optionally C* when OTP/secrets ready; keep formal smoke status honest for trial §0.

Do not mark [six Done criteria](../wordpress-ai-loop-verification-checklist-2026-09-22.md) complete from a single smoke.
