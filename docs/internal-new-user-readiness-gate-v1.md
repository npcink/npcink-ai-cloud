# Internal New-User Readiness Gate v1

Status: active internal development standard.

Purpose: provide a repeatable, provider-free gate for finding Portal, account,
site, authentication, entitlement, and recovery defects before the first real
external users arrive. This gate is for internal development evidence; it does
not authorize production release, customer recruitment, or GA.

## 1. Product boundary

Npcink AI Cloud remains the hosted runtime enhancement layer. The Portal may
display account service state and site-scoped runtime evidence, but it must not
become a second WordPress control plane.

Account-owned data:

- identity and session state;
- package/subscription and entitlements;
- billing and payment orders;
- credit balance and account-level quota.

Site-owned data:

- binding and lifecycle state;
- usage, trends, and run evidence;
- connector/connection diagnostics;
- site-scoped support context.

Selecting a site changes only site-scoped evidence. It must not change the
account package, subscription, entitlement, billing, or credit balance.

## 2. Five-stage gate

| Stage | Objective | Evidence | Result |
| --- | --- | --- | --- |
| 1. Matrix | Name the first-user risk scenarios and ownership boundaries. | `tests/fixtures/portal/internal_new_user_readiness_matrix.json`; contract tests. | Complete in PR #786 (`5e25e0e5`). |
| 2. Semantics | Keep site filtering and session recovery aligned with account/site ownership. | Portal Playwright journeys, API/type checks, M4 candidate and accepted promotion. | Complete in PR #787 (`6ba916da`). |
| 3. Fault contracts | Bind failures to stable error codes, status, disclosure, and recovery actions. | `test_internal_new_user_fault_injection_contract.py`; customer-safe error mapping and translations. | Complete in PR #788 (`b42fa0fa`). |
| 4. Browser regression | Prove localized recovery, retry, and redaction in the actual Portal route. | `portal-workspace-path.spec.ts`; required frontend/Portal Playwright CI. | Complete in PR #789 (`88b777f2`). |
| 5. Documentation | Preserve the operating model, evidence chain, and reusable checklist. | This standard and ADR-047. | This document. |

The stages are sequential, but a later stage may add a regression test for an
earlier contract. Do not mark a stage complete from a local candidate alone;
runtime-bearing changes require merged `master` and clean-master M4 acceptance.

## 3. Deterministic scenario matrix

The matrix currently contains ten synthetic scenarios:

1. new account without a site;
2. one ready site;
3. multi-site context switch;
4. inactive site recovery;
5. suspended site read-only state;
6. account quota attention;
7. expired-session recovery;
8. cross-account site denial;
9. invalid connector credential;
10. temporary service unavailability.

The fixture is metadata-only. It must not contain provider calls, production
writes, WordPress object writes, account entitlement mutations, secrets,
credential values, or foreign-account record details.

Fault scenarios additionally declare:

- stable `error_code`;
- expected `http_status`;
- bounded `recovery_action`;
- `disclosure` posture.

The matrix is a test contract, not a production traffic generator. Synthetic
route mocks are preferred for browser regressions; use test doubles for backend
faults and never spend Provider budget to manufacture failure evidence.

## 4. Required checks

### 4.1 Every Portal/account-site change

Run the narrowest useful local check first, then the relevant frontend or API
gate. For this readiness gate, the minimum contract checks are:

```bash
/Users/muze/gitee/npcink-ai-cloud/.venv/bin/python -m pytest \
  tests/contract/test_internal_new_user_readiness_matrix.py \
  tests/contract/test_internal_new_user_fault_injection_contract.py -q
```

Frontend route changes must include the focused Portal Playwright file:

```bash
pnpm run frontend:test:e2e:portal-workspace-path
```

When frontend dependencies are unavailable in an auxiliary worktree, record
that fact explicitly and rely on the required GitHub frontend gate; do not
claim local browser evidence that was not run.

### 4.2 M4 acceptance

For Cloud source or runtime-sensitive changes:

1. use `m4:preview:sync` for an ordinary source checkpoint;
2. publish and merge the focused PR;
3. update the clean M4 operations worktree to current `origin/master`;
4. run `m4:preview:promote -- --pr <merged-pr>`;
5. verify `m4:preview:status` shows:
   - `acceptance_state=accepted`;
   - `promotion_pr=<merged-pr>`;
   - `source_branch=master`;
   - `source_dirty=false`;
   - `source_revision=<current origin/master>`.

The private relay is the default transfer path. The direct transfer fallback
is allowed only when the operator explicitly authorizes it for the bounded
operation. M4 is runtime evidence, never source truth.

## 5. Recovery expectations

| Failure | Customer-visible posture | Must not happen |
| --- | --- | --- |
| Session expired | Return to login and restore the requested Portal path. | Lose the selected site/filter silently. |
| Site inactive | Explain activation/reconnection recovery. | Present it as a credential or generic Cloud outage. |
| Site suspended | Preserve read-only evidence and direct support recovery. | Offer runtime mutation or activation controls. |
| Cross-account site reference | Fail closed with no foreign-record disclosure. | Reveal the other account, site name, or binding details. |
| Invalid connector credential | Point to connector credential recovery. | Display raw credential/provider detail. |
| Temporary service failure | Offer bounded retry and support escalation. | Show backend exception text or duplicate a mutation. |
| Account quota exceeded | Keep quota language account-scoped. | Invent site-level entitlements or move credits between sites. |

## 6. Internal acceptance checklist

- [ ] Account package, subscription, entitlement, billing, and credit balance
      remain unchanged when the selected site changes.
- [ ] Usage, trend, run records, and site diagnostics follow the selected site.
- [ ] Login recovery restores the original route and query parameters.
- [ ] Inactive and suspended sites remain distinguishable.
- [ ] Cross-account references fail closed without disclosure.
- [ ] Connector and service failures have actionable, localized copy.
- [ ] Retry succeeds without duplicate writes or duplicate provider calls.
- [ ] Internal backend details, secrets, provider IDs, and credential values are
      absent from customer-facing messages.
- [ ] Required GitHub checks pass.
- [ ] M4 accepted evidence is recorded separately from candidate and merge
      evidence.
- [ ] Production remains untouched unless a separate operator-authorized
      release task exists.

## 7. Current boundary and remaining work

This gate reduces deterministic internal defects; it does not prove:

- real mailbox delivery or external OAuth acceptance;
- real customer comprehension or product value;
- production deployment or GA readiness;
- cross-repository WordPress Addon acceptance beyond the explicitly tested
  contract;
- Provider quality, cost, or long-term reliability.

The next useful evidence after this gate is a bounded internal operator/browser
soak using synthetic or disposable data, followed by a separate decision about
whether real-user or production validation is authorized.
