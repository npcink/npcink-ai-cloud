# Editor Assist Quality JSON Export Production Closeout — 2026-08-07

Status: dated production release and development retrospective.

Purpose: record the bounded delivery of the Editor Assist Quality JSON export,
the exact evidence chain used to release it, the material time costs, and the
rules future AI sessions should reuse. This record is not current production
authority; later releases may have replaced the named revision.

## 1. Outcome and scope

One secondary `Export JSON / 导出 JSON` action was added to the expanded
Editor Assist Quality detail on `/admin/troubleshooting` and deployed to
`cloud.npc.ink`.

The action downloads the currently loaded raw, read-only API response. It does
not create a new API, database table, report page, CSV pipeline, Provider-cost
join, scheduled export, Admin system, or commercial conclusion.

The exported response remains metadata-only. It does not add prompts, article
text, generated text, credentials, WordPress post IDs, or WordPress user IDs.
WordPress remains the adoption and final-write owner.

## 2. Exact release evidence

| Item | Evidence |
| --- | --- |
| feature PR | [#575](https://github.com/npcink/npcink-ai-cloud/pull/575) |
| merged `master` revision | `4298ea245e1f43ce39f15e661d611ab98a039031` |
| production promotion PR | [#576](https://github.com/npcink/npcink-ai-cloud/pull/576) |
| deployed `production` revision | `adc1bc10bc325f3e575e0b6a8ebf76df15a5739a` |
| production workflow | [31181387735](https://github.com/npcink/npcink-ai-cloud/actions/runs/31181387735) |
| release | `release-5de7ebdf2b4eeeb8-20260807144140-2679` |
| deployment execution | one, no retry |
| deployment job duration | about `10m38s` (`14:36:16Z` to `14:46:54Z`) |
| Alembic revision | `20260801_0078 (head)` |
| installation state | `complete` |
| public live health | HTTP `200` |
| internal operational readiness | HTTP `200`, three required workers |
| service restart counts | zero after activation |
| Provider calls | zero |
| WordPress writes | zero |

The deployment used the ordinary operator-gated GitHub workflow with
`finalized_runtime_network_repair=false`. No server-side application edit was
made, and no same-version recovery deployment was attempted.

## 3. Validation chain

The change was classified as a bounded Admin read-only action. Verification
used the narrowest seam first and reused evidence instead of replaying broad
gates:

1. focused ESLint and frontend TypeScript passed;
2. `pnpm run check:editor-assist-quality` passed with six tests;
3. `pnpm run check:admin-ui` passed;
4. the target Runtime Diagnostics Playwright flow passed `3/3`;
5. the target `/admin/troubleshooting` visual matrix evidence passed for the
   target revision;
6. the broader visual command later reported an unrelated credit-pack
   URL-filter failure; that seam passed on its isolated `2/2` rerun, and the
   already-proved target-route matrix was not rerun again;
7. the M4 candidate was synced, PR #575 merged, and clean `master` was promoted
   with `acceptance_state=accepted`;
8. PR #576 required checks and the exact `production` push CI passed before the
   single deployment was dispatched;
9. post-deploy SSH and HTTP inspection confirmed the named release, migration,
   service stability, worker readiness, and live health.

Cloudflare Access blocked a manual public-preview login and the loopback login
remained loading. That authentication problem was not treated as evidence that
the deterministic route behavior failed, and no further time was spent trying
to bypass the protected preview boundary.

## 4. Time-cost analysis

The application change was small. Most elapsed time belonged to serialized
release authority rather than implementation:

| Phase | Observed cost | Why it was retained |
| --- | --- | --- |
| focused implementation and checks | seconds to a few minutes per gate | answered the changed UI/read-model seam |
| M4 source sync | about `26s` | proved the candidate in the governed preview lane |
| focused Runtime Diagnostics browser test | `19.9s` | proved the actual operator interaction |
| clean-master M4 promotion | about `61s` | bound accepted M4 state to merged PR #575 |
| production PR backend-targeted check | `9m10s` | protected merge authority; not rerun locally |
| exact production push CI | about `13m` | mandatory input to the deploy workflow |
| GitHub Environment approval wait | about `1h26m` between dispatch and job start | human production authorization; no work was repeated while waiting |
| production deployment job | about `10m38s` | built/scanned/transferred the exact release and ran release gates |

The long wall-clock duration therefore did not indicate repeated product
failure. The largest single delay was an intentional human approval wait,
followed by required CI and deployment work.

## 5. Problems and the response

### Protected preview authentication

The public M4 preview required Cloudflare Access. Automated or loopback login
did not provide a useful manual session. The response was to keep the existing
deterministic browser evidence and stop, rather than add credentials, weaken
Access, rebuild images, or create a second preview route.

### Unrelated broad-gate failure

The full Admin visual command first reported an unrelated credit-pack
URL-filter assertion. The target route evidence had already passed. The failed
seam was rerun in isolation and passed `2/2`; the complete visual command was
not replayed merely to obtain another green transcript.

### Production approval wait

The deployment job entered `waiting` for the protected `production`
environment. The session reported the exact workflow URL and stopped instead
of approving on the operator's behalf. After explicit approval, the same run
completed successfully; no second deployment was created.

### First-install rollback history

At the preflight and immediate post-deploy inspection, no `previous` symlink
was present after the first-install-finalized lifecycle. This known no-external-
user limitation was recorded rather than hidden. It did not authorize an extra
deployment to manufacture rollback history.

## 6. Durable rules for future AI sessions

1. A small read-only export should reuse the owning API response. Do not build
   a report system when browser download is sufficient.
2. Declare budgets before material operations. This task allowed zero Provider
   calls, zero WordPress writes, no image build outside governed release lanes,
   and one production deployment.
3. Preserve successful sub-gate evidence when a later unrelated assertion
   fails. Diagnose and rerun only the failed seam when supported.
4. Treat Cloudflare Access, WordPress connector tunnels, M4 runtime, CI, and
   production as different consumer and authority paths.
5. Wait for the exact `production` push CI before dispatching deployment; a
   green promotion PR alone is insufficient.
6. Never bypass GitHub Environment approval. Surface the pending run to the
   operator and continue the same run after approval.
7. Separate implementation time, CI time, approval wait, transfer/build time,
   and deployment time in the closeout. Wall-clock cost is an engineering
   resource.
8. Do not create Provider calls, WordPress writes, users, or synthetic adoption
   merely to populate an export.
9. A downloaded JSON file supports third-party analysis; it does not establish
   real-user acceptance or commercial viability.
10. Stop after the bounded outcome. Do not extend the task into Admin redesign,
    dashboards, CSV, alerts, automatic Eval, media, or batch generation.

## 7. What this proves and does not prove

This proves:

- the named source change passed its focused UI and contract gates;
- merged `master` was accepted on M4;
- the named `production` revision passed required CI and deployed once;
- production remained live and operational with the expected migration and
  stable workers;
- the export stayed within the metadata-only read boundary;
- deployment and verification consumed no Provider calls or WordPress writes.

This does not prove:

- that a third-party operator downloaded or successfully analyzed the file;
- external WordPress user acceptance, natural reuse, retention, or willingness
  to pay;
- that exported metrics are decision-grade at the current sample size;
- commercial viability, unit economics, Provider cost attribution, or product-
  market fit;
- that a dated release remains the current production revision.

## 8. Next-stage recommendation

Do not add another analytics surface. Invite a small number of real WordPress
operators to use one frequent text task, then let ordinary metadata accumulate.
Use the Admin detail for direct inspection and the JSON export only when a
bounded third-party analysis is useful. Prioritize first value, voluntary
reuse, edit/reject behavior, and willingness to pay over additional release or
reporting infrastructure.

## 9. Related authority and evidence

- [Editor Assist Quality Flywheel](editor-assist-quality-flywheel-v1.md)
- [Cloud Agent Feedback Quality Gate](cloud-agent-feedback-quality-gate-v1.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Production Release and WordPress Text Round-Trip Closeout — 2026-08-07](history/production/2026/production-release-and-wordpress-text-roundtrip-closeout-2026-08-07.md)
