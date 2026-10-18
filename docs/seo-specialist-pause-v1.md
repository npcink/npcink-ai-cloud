# SEO Specialist Runtime Pause

Status: merged implementation; production-source candidate validated, 2026-10-19.
This status does not claim that the production server has loaded the change.

Cloud temporarily rejects dedicated SEO/AEO/GEO tasks at the WordPress
operation contract boundary, with `wordpress_operation.feature_paused` (HTTP
400). The check precedes both legacy task handling and task-contract validation,
so a local task contract does not bypass availability. Local Ability definitions,
WordPress approvals and final writes remain outside Cloud.

The paused identifiers are recorded in `PAUSED_DISCOVERABILITY_TASKS` in
`app/domain/wordpress_ai_connector/contracts.py`. Ordinary title, summary,
excerpt, translation, classification, slug and ALT tasks stay available. This
is a runtime availability list, not an Ability registry or prompt-keyword ban.
An article or image request may still discuss SEO as ordinary subject matter.

SEO-only editorial review is refused. Mixed review retains grammar,
readability and accessibility; result normalization removes specialist review
types. New Nightly inspection results use `nightly_content_quality_score.v3`
and do not penalize absent or short SEO descriptions. Existing v2 results are
not rewritten, and result/history read endpoints remain unchanged.

There is no migration, destructive cleanup, data backfill, new service or
runtime configuration. Existing specialist implementations remain for a future
reviewed restoration. Restore by reverting this focused change and repeating
the current contract, consumer and runtime gates; do not treat old approvals,
caches or historical scores as new execution permission.

The corresponding product and transport pause belongs to Workflow Toolbox and
Cloud Addon. Toolkit, Core, Adapter and Eval are not modified by this task, so
this record does not claim a platform-wide SEO write prohibition. See the
[three-repository implementation record](../../npcink-workflow-toolbox/docs/seo-specialist-pause-implementation-2026-10-18.md)
for the exact evidence state and remaining runtime limitations.

已注册任务投影中的 `seo_headline` 同样属于暂停任务；通用自定义任务投影仍可传输。回归使用通用 article_headline 正向样例和 SEO 别名零调用负向样例，避免依靠旧的 SEO 成功样例证明暂停完整。

## Merge and Deferred Deployment Record

Implementation [PR #1141](https://github.com/npcink/npcink-ai-cloud/pull/1141)
merged into master. Isolated production-source
[PR #1143](https://github.com/npcink/npcink-ai-cloud/pull/1143) merged as
`16747c401d2d1fc9d07bfbf5c530d3aca4a9cfa4`; its tree matches the reviewed
candidate. Exact production CI, CodeQL, image-scan policy, bundle archive
verification and metadata preflight passed. Production deployment was deferred;
the observed installed baseline was `b8cc6049`.

The verified candidate bundle SHA-256 is
`5891faec512cb256ecf775b25a8f2b17debf3d69a372b88cffe0e3115c8940cf`;
artifact 12147245141 belongs to
[CI run 39155089398](https://github.com/npcink/npcink-ai-cloud/actions/runs/39155089398).
The verified offline b8 rollback bundle SHA-256 is
`641bf54c7c2a052464f8f9dde42f951bca3c986afe725770f60eae8ea60cc898`.
These are dated identities, not a guarantee of future artifact availability.

Before the next authorized deployment, resolve the existing baseline
[smoke failure](https://github.com/npcink/npcink-ai-cloud/actions/runs/39154517793)
(ready health expected 200, received 403), verify actual host image mappings
and protected-configuration recovery, and refresh exact-SHA preflight and scan
validity. The 17 existing Redis/Nginx scan exceptions expire on 2026-10-25 UTC;
policy passed with zero unallowlisted blocking findings, not zero vulnerabilities.
Reassess the installed baseline and rollback compatibility if the next release
includes other changes. This document update does not promote new source,
deploy a server, repair the earlier source relay or distribute plugins.
