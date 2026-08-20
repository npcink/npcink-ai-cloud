# Internal Readiness Final Handoff — 2026-08-18

Status: dated final handoff; the active rules are the linked standards, not
this evidence summary.

## 1. Final outcome

The pre-user engineering closeout is complete for the current internal scope.
The project now has a deterministic way to test the main Portal and connector
failures before inviting real users, while preserving the existing Cloud,
Portal, and WordPress ownership boundaries.

This means:

- the known account/site semantics are explicit and executable;
- the principal first-user failure states have safe recovery contracts;
- the Portal has browser evidence for localized retry and redaction;
- the work is merged into `master` with protected CI evidence;
- the relevant runtime revisions were promoted and accepted on M4;
- the process and lessons are written down for the next development session.

It does not mean production, GA, real-user comprehension, Provider quality,
commercial viability, or external Addon acceptance have been proven.

## 2. Historical delivery chain

| Concern | Delivered in | What changed | Highest evidence |
| --- | --- | --- | --- |
| Readiness matrix | PR #786 | Ten deterministic synthetic scenarios and account/site ownership contract. | Merged `master` `5e25e0e5`. |
| Portal semantics | PR #787 | Site filter updates Router state; account package/entitlement data stays account-scoped; session recovery restores the requested path. | M4 accepted `6ba916da`. |
| Fault contracts | PR #788 | Stable fault code/status/disclosure/recovery metadata, safe customer copy, and translations. | M4 accepted `b42fa0fa`. |
| Browser regression | PR #789 | Chinese transient-failure copy, retry recovery, and backend-detail redaction browser test. | M4 accepted `88b777f2`. |
| Standards and ADR | PR #791 | Active readiness standard, ADR-047, and documentation index links. | Merged `master` `74dac8d4`. |

The separate pre-user development retrospective in
`docs/single-operator-pre-user-development-closeout-and-next-stage-2026-08-18.md`
contains the broader history of Portal UX, privacy-safe journey evidence,
delivery-time analysis, and development/merge/release lanes. This handoff is
the short operational summary; it intentionally does not replace that record.

## 3. Development method that worked

### Start from the user job, not the visible component

The original question was why a logged-in customer still saw the wrong Portal
header. The useful diagnosis was not “change the header”; it was to trace
session state, selected site context, account projections, routing, and the
actual local/M4 consumer. The same approach exposed that package and service
rights belong to the account while usage and run evidence can be filtered by
site.

### Turn ambiguous states into named contracts

“Something is unavailable” is not a sufficient acceptance criterion. Each
fault scenario now names its owner, error code, status, disclosure boundary,
and recovery action. This makes both backend tests and browser assertions
repeatable.

### Prefer synthetic, metadata-only evidence before real traffic

No Provider calls, production writes, WordPress mutations, or fake customer
records were needed to exercise the ten scenarios. Synthetic route mocks and
test doubles found localization, retry, stale-context, and disclosure issues
without spending budget or creating cleanup risk.

### Verify the consumer revision before rewriting source

When local behavior did not match the expected source, the first check was the
mounted worktree/package/runtime revision and cache, not an immediate code
rewrite. This avoids “fixing” code that was already correct but not the code
being consumed.

### Keep evidence states separate

The reliable chain is:

```text
local verified -> candidate -> PR verified -> merged master -> M4 accepted
```

Direct sync proves a candidate only. M4 accepted requires the merged PR and a
clean current `origin/master` promotion. Documentation-only work does not
need an M4 operation.

## 4. Reusable operating rules

1. Keep one focused module per session and write a compact change envelope.
2. Classify the change before selecting tests: L0/L1/L2 and local/Cloud/build
   runtime lanes are different decisions.
3. Run the narrowest useful check first; repeat a broad gate only for a distinct
   risk question.
4. Stop after two identical external-transfer failures and use the documented
   recovery lane or report the blocker.
5. Never mix unrelated dirty-worktree changes into a commit. Use a clean,
   locked worktree when the active checkout is dirty.
6. Treat account/site ownership as a product contract, not merely a UI label.
7. Never expose backend exceptions, credentials, provider IDs, or foreign
   account/site details in customer-facing recovery copy.
8. Treat M4 as disposable runtime evidence, never as source or Git truth.
9. Record what is not proven: no real-user value, production, GA, mailbox,
   OAuth, or Provider-quality claim follows from deterministic tests.
10. After merge, update the clean M4 operations worktree and verify the exact
    accepted source revision before closing a runtime-bearing task.

## 5. Current acceptance checklist

- [x] Account/site ownership and site-filter semantics are covered.
- [x] Session expiry restores the requested Portal route and filter.
- [x] Inactive, suspended, cross-account, quota, connector, and transient
      service cases have bounded recovery expectations.
- [x] Customer-facing fault copy is localized and backend-detail safe.
- [x] GitHub required checks passed for the implementation chain.
- [x] M4 accepted revisions were verified for runtime-bearing PRs #787–#789.
- [x] The readiness standard and ADR are indexed in local documentation.
- [ ] Real-user comprehension, usefulness, retention, and willingness to pay.
- [ ] Production or GA authorization.

## 6. Next action

Do not open another general platform/process expansion by default. The next
useful step is a bounded internal operator/browser soak using synthetic or
disposable data, with a fixed time budget and explicit stop conditions. If that
soak is clean, decide separately whether to authorize a small consenting
non-author cohort. Any real-user or production step must create its own scope,
evidence chain, privacy review, rollback, and operator authorization.

## Related documents

- [Internal New-User Readiness Gate](internal-new-user-readiness-gate-v1.md)
- [ADR-047](decisions/047-internal-new-user-readiness-gate.md)
- [Single-Operator Pre-User Development Closeout](single-operator-pre-user-development-closeout-and-next-stage-2026-08-18.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
