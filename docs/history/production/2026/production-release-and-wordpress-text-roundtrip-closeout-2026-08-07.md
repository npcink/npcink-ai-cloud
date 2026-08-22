# Production Release and WordPress Text Round-Trip Closeout — 2026-08-07

Status: time-bounded production historical evidence; not current release authorization.

Current authority: [Cloud Production Release Policy](../../../cloud-production-release-policy-v1.md).

Original status: time-bounded production and single-operator validation evidence.

Purpose: preserve the final production release identity, deployment and
recovery lessons, and the first completed single-operator WordPress text
adoption loop after first-install finalization.

This record does not authorize a future deployment, Provider spend, external
user access, GA, media expansion, bulk generation, or a commercial claim.
Current code, protected policy, production state, and the active
[Production WordPress Round-Trip Validation Runbook](../../../production-wordpress-roundtrip-validation-runbook-v1.md)
take precedence over this dated evidence.

## 1. Scope and boundary

The authorized product path was:

```text
WordPress Ability
-> Npcink Cloud Addon
-> Npcink AI Cloud runtime
-> hosted Provider/model
-> editor suggestion
-> operator review
-> explicit adopt/save
-> WordPress final write
```

The session used one internal operator and one temporary WordPress draft. It
did not manufacture three to five users, natural reuse, paid demand, or broad
acceptance. Cloud remained runtime and evidence only; WordPress retained
Ability, review, approval, revision, and final-write truth.

## 2. Final release identity

| Item | Evidence |
| --- | --- |
| development integration revision | `02dc011f5376121095d18312d9de6f4c45bfbcb4` |
| production revision | `c36e0d5977b0fcc2fb27ef5a9594c51cc7aef71d` |
| source fix PR | `#572` |
| production promotion PR | `#573` |
| production workflow run | `31163521318` |
| deployment executions | `1` for the final promoted revision |
| deployment duration | `10m58s` |
| Alembic revision | `20260801_0078` |
| release | `release-a64b7a18be689ad5-20260807090008-2824` |
| installation state | `complete` |
| public live health | passed |
| worker and image identity checks | passed |
| pending first-install marker | absent |

First-install finalization ended the pending installation lifecycle. Because
this was the first finalized installation, there was no earlier managed release
available as `previous`. The operator explicitly accepted that limitation for
this no-external-user validation. It is not a permanent ordinary-deployment
property: a later successful release can retain this release as its rollback
predecessor.

## 3. Problems encountered before the final deployment

The long wall-clock time came mainly from serial discovery across different
release phases, not from one unusually difficult application defect.

| Phase | Problem | Root cause | Durable response |
| --- | --- | --- | --- |
| build and scan | archive, scanner, and dependency operations were slow or failed under external network conditions | registry/package/database downloads were treated as if a rerun were the only recovery | prepare and scan exact artifacts on the governed workstation, M4, or CI lane; cache or resume external inputs; do not deploy Syft/Grype as production services |
| image transfer and equivalence | classic Docker archives and mode propagation were not accepted consistently | release tooling assumed one archive representation | commits through `#553`, `#555`, `#557`, and `#559` normalized archive handling and scanner temporary state |
| runtime recovery | finalized production runtime network state was incomplete | first-install and ordinary-runtime network state had different lifecycle assumptions | `#561` added bounded, evidence-bound repair rather than an ad hoc server edit |
| provider readiness | a degraded or non-routable Provider could block otherwise operational service | health and routing authority were not classified at the same seam | `#565` kept degraded Providers operationally visible while `#538` scoped readiness to routable instances |
| operational readiness | host/origin, scheme, loopback, and Edge expectations produced false negatives | probes were coupled to public-edge assumptions instead of the actual internal readiness route | `#543`, `#545`, `#567`, `#569`, and `#571` aligned the bounded readiness contract |
| Site Knowledge image | Zilliz SDK was absent from the production image | source support existed without the corresponding release-image dependency | `#549` added the component to the governed image |
| credit evidence | read-only Site Knowledge status produced credit consumption | evidence collection entered the ordinary AI-credit path | `#572` retained run/usage/audit evidence while making status credit-free |

These fixes were merged through Git and promoted normally. No production
application code edit on the server became source truth.

## 4. Why progress was slower than necessary

Four evidence questions were mixed into one long chain:

1. can the exact image be built, scanned, transferred, and loaded;
2. can first-install/finalized production activate and pass readiness;
3. can the real WordPress editor reach a hosted Provider and account correctly;
4. can one operator review and explicitly save without premature WordPress
   writes.

A failure late in the chain repeatedly caused earlier successful work to be
revisited. The durable correction is phase-bound evidence reuse:

```text
exact local/M4 artifact evidence
-> production promotion identity
-> one bounded production deployment
-> deployment health and migration smoke
-> one paid WordPress consumer journey
-> exact cleanup and closeout
```

The same revision, tree, artifact, scan database, and risk question should
reuse its existing receipt. A later readiness failure is not a reason to
rebuild an unchanged bundle. Two identical external failures end blind retries
and require a cache, resume, local artifact, or materially different plan.

## 5. WordPress and Cloud identity

| Item | Evidence |
| --- | --- |
| WordPress site | `https://magick-ai.local` |
| WordPress version | `7.1-RC2-63095` |
| WordPress AI plugin | `ai` `1.2.0` |
| Cloud endpoint | `https://cloud.npc.ink` |
| site | `site_magick-ai-local` |
| account | `acct_magick_ai_local` |
| key ID | `key_b84aeef8e7704b57a2c877012061d8a0` |
| initial entitlement | active, `300` AI credits |

The title-generation dialog belonged to the WordPress AI plugin. The Addon
provided the hosted transport; it did not own the editor control or final save.

## 6. Declared Provider budget and successful result

The maximum real Provider budget was declared as one call. Exactly one call was
made; no retry or regenerate was used.

Returned and adopted title:

```text
WordPress 内容团队如何用 AI 生成标题建议并验证闭环
```

The operator reviewed the title for factual consistency, unsupported claims,
tone, and readability before adoption.

Cloud evidence:

| Field | Value |
| --- | --- |
| run ID | `run_8cab0c426306440e8b7c0f4e5e230e58` |
| ability | `npcink-cloud/connector-runtime` |
| channel | `editor` |
| status | `succeeded` |
| Provider/model | `openai` / `gpt-5.4-mini` |
| Provider call ID | `128` |
| Provider latency | `3923ms` |
| tokens | `703 in`, `122 out`, `825 total` |
| retries/fallback | `0` / `false` |
| Provider cost evidence | `0.0`, unpriced evidence |

The measured backend first-success time is the Provider latency above. The
visible editor result arrived within a few seconds, but no independent precise
human stopwatch was recorded; this document does not invent one.

## 7. Credit and ledger reconciliation

| Metric | Before | After paid call | Delta |
| --- | ---: | ---: | ---: |
| used | 72 | 74 | +2 |
| remaining | 228 | 226 | -2 |
| limit | 300 | 300 | 0 |
| credit-ledger entries | 48 | 50 | +2 |
| runs | 45 | 46 | +1 |
| Provider calls | 127 | 128 | +1 |
| positive grants/adjustments | 0 | 0 | 0 |

The two credit components matched `ai-credit-ledger-v2`:

- `runs`: `-1` credit;
- `tokens_total`: `-1` credit for `825` tokens at
  `1000_tokens_rounded_up`.

The earlier expectation of one credit was an incorrect assumption. Database
ledger truth showed a contract cost of two. No grant or adjustment hid used
credits.

## 8. Failure and recovery: Gutenberg autosave

After the suggestion was inserted but before explicit Save, Gutenberg created
autosave revision `287388`. The long-open editor tab had crossed its autosave
window, so marking the title dirty triggered a write immediately. The parent
draft remained unchanged.

This violated the zero-write-before-save gate and was treated as a failed
attempt, not as an acceptable revision.

The recovery envelope was limited to the temporary draft and its one autosave:

1. stop without Save or another Provider call;
2. verify `post_parent=287387` and `post_name=287387-autosave-v1`;
3. delete only revision `287388`;
4. prove the parent draft still had the old title and zero revisions;
5. reload the editor from the server;
6. decline the stale browser backup instead of restoring the failed dirty
   state;
7. reuse the already returned and reviewed title;
8. explicitly click Save Draft once.

The successful recovery produced canonical revision `287389` and persisted the
reviewed title. It produced no second Provider call and no additional credit
ledger entry.

The recovery/cleanup window created two evidence-only Cloud runs:

- `npcink-cloud/site-knowledge-sync`;
- `npcink-cloud/site-knowledge-status`.

Both had zero Provider calls and zero credit-ledger entries. Final totals were
`runs=48`, `provider_calls=128`, `ledger=50`, and `used=74`. The extra runs are
reported rather than hidden, and the status run directly confirmed the
credit-free behavior shipped in `#572`.

## 9. WordPress writes and cleanup

Write accounting by operator-visible lifecycle event:

- failed attempt before explicit Save: one autosave revision;
- successful recovered path: one explicit Save action, updating the draft and
  creating one canonical revision;
- cleanup: one exact deletion of the temporary post and its revisions.

The temporary post was `287387`. Cleanup removed the post, autosave `287388`,
canonical revision `287389`, and the test browser session. A final database
check found zero rows for the temporary post/revision identity set. No real
WordPress content was deleted, and no temporary Cloud key was created.

The two merged task worktrees for `#572` and `#573` were clean, unlocked, and
removed. Existing unrelated files in the operator checkout were not staged or
modified.

## 10. Browser, network, and evidence limitations

The editor displayed the returned suggestion and the final saved state. The
Cloud run, Provider call, usage, ledger, and final WordPress revision shared a
consistent request and adoption chain.

No durable standalone browser-console artifact was preserved during closeout.
Therefore this record does not claim that the complete browser session had zero
console errors. Network success is supported by the editor result and the
correlated Cloud/Provider records, but that does not substitute for a retained
browser network export in a future release receipt.

## 11. What this proves and does not prove

This proves:

- the named production revision deployed successfully with the named migration
  and health state;
- one internal operator traversed the real WordPress -> Addon -> Cloud ->
  Provider -> review -> explicit Save chain;
- the Provider and two-credit ledger contract matched;
- a native autosave failure was recovered without another paid call or
  duplicate final write;
- Site Knowledge status retained evidence without consuming credit;
- WordPress remained the final-write owner and the fixture was removed.

This does not prove:

- external-user acceptance or natural reuse;
- three to five independent users;
- willingness to pay, retention, unit economics, or commercial viability;
- media, batch generation, or long-duration production stability;
- browser-console zero-error status;
- that the first-install no-previous-release limitation applies to later
  ordinary deployments.

## 12. Durable development lessons

1. Separate build, deployment, runtime, and consumer acceptance into different
   evidence phases.
2. Bind every reusable result to revision, tree, artifact, platform, scan, and
   target state; invalidate only the dependent evidence.
3. Stop blind retries after two identical external failures and change the
   recovery mechanism.
4. Build and scan away from the production runtime; production should validate
   receipts, load exact images, migrate, activate, and smoke.
5. Classify readiness failures before changing code. Host, scheme, Edge,
   routability, and Provider degradation are different seams.
6. Refresh a long-open WordPress editor immediately before adoption.
7. Reuse a valid paid result when only local editor state failed.
8. Treat run, Provider-call, usage, and credit-ledger counts as separate owning
   truths.
9. Cleanup and worktree release are part of acceptance.
10. Operator validation, real-user acceptance, and commercial viability must
    remain separate conclusions.

## 13. Next-stage recommendation

Do not expand Admin, reporting, media, or batch generation from this result.
The next product question is commercial, not another release-engineering
exercise: choose one narrow ICP and one frequent text job, then measure first
value, voluntary reuse, rejection/edit behavior, and willingness to pay with
real invited users. Use production deployment work again only for a concrete
blocking defect or an intentional release.

## 14. Related authority and evidence

- [Cloud Production Release Policy](../../../cloud-production-release-policy-v1.md)
- [Production WordPress Round-Trip Validation Runbook](../../../production-wordpress-roundtrip-validation-runbook-v1.md)
- [Hosted WordPress Text Generation Closed-Loop Validation Standard](../../../hosted-wordpress-text-generation-closed-loop-validation-standard-v1.md)
- [Production WordPress Image Round-Trip Evidence — 2026-08-05](../../../production-wordpress-image-roundtrip-evidence-2026-08-05.md)
- [Issue #406 Controlled Production Validation Preparation Retrospective — 2026-08-04](../../../issue-406-controlled-production-validation-preparation-retrospective-2026-08-04.md)
