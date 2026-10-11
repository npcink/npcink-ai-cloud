# Site-Inactive Recovery Closeout — 2026-08-13

Status: dated development closeout and reusable learning record. Not current
production authorization.

## Outcome

The cross-repository fix changed an ambiguous inactive-site error into an
actionable, localized recovery flow while preserving fail-closed runtime
authorization.

| Layer | Owner | Delivered result |
| --- | --- | --- |
| Cloud auth/runtime | Cloud | `auth.site_inactive` plus bounded recovery facts |
| WordPress Addon | Addon | localized activation-required state and two recovery actions |
| WordPress control plane | WordPress/local stack | unchanged ability, workflow, approval, and final-write ownership |

## Why the original message was confusing

“签名验证失败：site is bound but Cloud service is inactive” mixed a transport
security phrase with a service-lifecycle fact. The signature was valid; the
request was rejected because the site was inactive. Users therefore tried to
reconnect or replace credentials instead of activating the existing site.

The durable diagnostic rule is:

```text
bound != active != credential-valid != capability-ready != consumer-accepted
```

Always identify which fact failed before choosing copy or a recovery action.

## Implementation sequence

1. Inspect the full consumer path: Addon probe, Cloud auth guard, Portal
   lifecycle, and normal WordPress state projection.
2. Add a versioned, additive Cloud error contract; keep the runtime rejection
   unchanged.
3. Enforce credential-first disclosure so lifecycle detail is not an
   identifier-enumeration oracle.
4. Preserve the structured code/data in the Addon rather than parsing English
   text.
5. Let the Addon own localized copy and actions; let Cloud supply only facts.
6. Test both repositories independently, then verify the cross-repository
   dependency order: Cloud merge/runtime first, Addon merge/package second.
7. Report each evidence state separately instead of calling a candidate,
   merged source, or package release “published”.

## Verification record

### Cloud

- Focused local pytest: 23 passed.
- Ruff: passed.
- Required GitHub checks: passed.
- PR: [#695](https://github.com/npcink/npcink-ai-cloud/pull/695), merged to
  `master` at `372d7e841ec38adcc413362b055a76e10451d0db`.
- M4 candidate focused inactive-site test: passed.
- Clean-master M4 promotion: accepted; source clean and API/frontend healthy.

### Addon

- `composer run test:all`: passed.
- `composer run i18n:check`: passed.
- PHP 8.0, 8.2, and 8.4 contracts: passed.
- Release static gates: passed.
- PR: [#87](https://github.com/npcink/npcink-cloud-addon/pull/87), merged at
  `23d1e6fb64501e1e7622286e9991ab4893901322`.
- Playground smoke did not reach WordPress because dependency fetch failed
  twice with the same external-transfer signature. Retries were stopped;
  this is external fetch evidence, not plugin activation evidence.

### Cross-repository matrix

The central matrix passed unrelated local repository gates but was not wholly
green because its Cloud inventory entry pointed at a different dirty/ahead
worktree and its Addon entry contained pre-existing unrelated changes. This
must not be rewritten as a failure of PR #695 or #87. The lesson is to run the
matrix from clean, revision-pinned worktrees and record inventory blockers
separately from changed-scope gate results.

## Reusable development rules

- Start with the nearest observable user action, not the broadest subsystem.
- Name the fact owner before changing code.
- Prefer stable machine-readable codes over message parsing.
- Keep customer copy local to the surface that owns locale and interaction.
- Make recovery explicit; never silently activate or deactivate another site.
- Preserve fail-closed behavior while improving explanation.
- Validate the normal consumer path, not only a component self-test.
- Spend runtime/provider budget only when it answers a distinct risk question.
- Keep local, CI, M4 candidate, merged, M4 accepted, production, and human
  evidence distinct.
- Stop repeated retries after the same external-transfer signature and retain
  the evidence for an operator decision.

## Follow-up

1. Package and publish the Addon release containing PR #87.
2. Run the Addon package install/activation smoke after publishing.
3. During the next coordinated release, verify one inactive-site recovery from
   the real WordPress settings surface through Portal activation and recheck.
4. Keep this record historical; update the active standard or ADR if the
   contract changes rather than silently editing this receipt.

## Rollback

Revert the documentation and code through normal Git review. Do not delete
site records, credentials, usage, or audit history to undo the behavior.
