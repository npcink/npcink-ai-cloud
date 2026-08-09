## Summary

- Briefly describe the intended change.

## Scope

- [ ] This change is limited to the stated Cloud module.
- [ ] Public runtime API, capability contract, provider seam, deployment lifecycle, or product boundary docs were updated if changed.
- [ ] No unrelated generated files, local environment files, screenshots, or cross-repo worktree changes are included.
- Focused module:
- Explicit non-goals:
- Cloud boundary impact:

## Release Gate

- [ ] This PR does not commit production secrets, SMTP passwords, provider keys, DB credentials, or internal tokens.
- [ ] This PR does not make Cloud a WordPress write owner, second ability registry, second workflow registry, or second local control plane.

## Cloud Boundary

- [ ] Cloud remains the hosted runtime enhancement layer.
- [ ] Runtime results stay suggestion-only unless an explicit governed downstream contract owns the write.
- [ ] This does not add a second WordPress control plane, local ability registry, workflow registry, approval/preflight/audit truth, or WordPress write owner.
- [ ] This does not move prompt/router/preset local truth into Cloud-facing WordPress control surfaces.
- [ ] Provider credentials, request logs, usage, and entitlement evidence remain redacted from logs and responses.

## Verification

- [ ] The narrowest useful verification gate is listed below.
- [ ] `pnpm run check:fast`
- [ ] `pnpm run check:perimeter` if runtime boundaries, WordPress seams, or provider surfaces changed.
- [ ] `pnpm run check:anti-drift` if Cloud frontend/backend contracts changed.
- [ ] `pnpm run lint` if Python typing, lint-sensitive code, or shared backend modules changed.

```text

```

## Risk

- Residual risk:
- Rollback plan:
- [ ] For auth/quota/multi-tenant changes: current configuration versus stored
      snapshots, principal-scoped error projections, and stale `409` client
      recovery were reviewed or marked not applicable.

## Admin UI

Complete when this PR changes `frontend/src/app/admin/**`,
`frontend/src/components/admin/**`, or shared admin styling.

- Page model:
- Operator job:
- Reference implementation:
- Shared primitives reused:
- Primary action:
- Secondary action:
- Destructive action and confirmation:
- Low-frequency detail moved behind:
- Visual risk tier (`low`, `material`, or `shared`):
- Required browser states:
- Visual receipt artifact:
- Rule results (`pass` / `fail` / `review_required` / `not_applicable` / `unmeasured`):
- Human visual acceptance (`pending`, `not_required`, `accepted`, or `rejected`):
- PC evidence:

- [ ] The route remains classified in `frontend/admin-ui-manifest.json`.
- [ ] Shared `--admin-*` geometry and admin primitives are reused.
- [ ] No new route-local dialog or credential reveal implementation was added.
- [ ] `pnpm run check:admin-ui` passed.
- [ ] `pnpm run check:admin-ui:visual` passed when layout, tables, dialogs, or shared primitives changed.
- [ ] Material/shared visual changes produced a structured receipt; no receipt is reported as `unmeasured`.
- [ ] New golden baselines or shared visual patterns have explicit human visual acceptance.

## Deployment Impact

- [ ] No production deployment impact.
- [ ] Requires an explicit `Deploy Production` dispatch with the exact operator
  confirmation after CI passes on the protected production branch.

## Production Promotion

Complete only when this PR targets `production`.

- [ ] Source branch is `master` or a release-fix branch that will be backported to `master`.
- [ ] `master` CI is green, or this is an emergency release fix.
- [ ] Rollback path is known.
- [ ] `deploy/RELEASE_CHECKLIST.md` has no newly relevant unchecked blocker for this release scope.
- [ ] Approved for production validation by operator.

## Notes

Summarize the behavior change, boundary decision, and known follow-up.
