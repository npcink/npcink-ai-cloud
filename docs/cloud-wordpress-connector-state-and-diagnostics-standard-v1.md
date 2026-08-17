# Cloud WordPress Connector State and Diagnostics Standard v1

Status: active engineering and product standard.

## 1. Purpose

This standard defines how Npcink AI Cloud, the Cloud Addon, WordPress AI
consumers, and Portal surfaces represent connection state, service lifecycle,
credentials, diagnostics, and acceptance evidence.

It prevents four recurring failure modes:

- treating a successful binding as proof that hosted runtime is usable;
- collapsing different failures into one generic authorization message;
- exposing backend JSON or transport details directly to an end user;
- presenting a component self-test as proof that the normal user path works.

WordPress owns abilities, prompts, local settings, review, approval, and final
writes. Cloud owns hosted runtime execution, account/site service lifecycle,
credentials, entitlement, usage, health, and bounded diagnostics.

## 2. State Model

The following facts are independent and MUST be represented independently:

| Fact | Question answered | Owner |
| --- | --- | --- |
| Principal binding | May this Portal principal view or operate this site? | Cloud identity/service plane |
| Account binding | Which customer account retains the site relationship and history? | Cloud service plane |
| Site lifecycle | Is hosted runtime active, inactive, provisioning, suspended, or archived? | Cloud service plane |
| Credential lifecycle | Is the site key active, unexpired, unrevoked, and scoped? | Cloud service plane |
| Addon verification | Can this installation sign and complete the expected Cloud probe? | Addon projection of Cloud evidence |
| Capability readiness | Can the requested ability scene traverse its registered contracts? | WordPress ability truth plus Cloud runtime validation |
| Consumer acceptance | Did the normal user action complete through the real path? | Revision-bound cross-surface evidence |

Therefore:

```text
bound != active != credential-valid != capability-ready != accepted
```

An account MAY retain more bound sites than active sites. Deactivation MUST
preserve the binding, credential record, usage, and audit history. Runtime
acceptance MUST continue to require an active site and an active compatible key.

## 3. Lifecycle and Authorization Rules

| Site state | Runtime | Customer action | Binding/history |
| --- | --- | --- | --- |
| `active` | Allowed when key and scope are valid | None | Preserved |
| `inactive` | Denied | Activate in Portal; select replacements explicitly when quota is full | Preserved |
| `provisioning` | Denied | Complete or wait for the owning connection flow | Preserved |
| `suspended` | Denied | Contact platform administration | Preserved |
| `archived` | Denied | Reconnect through the verified Addon flow | Historical evidence preserved; current binding released |

Activation quota limits active sites. It MUST NOT be reused as a general
binding limit. The separate anti-abuse bound-site ceiling is defined by
[ADR-039](decisions/039-bound-site-and-active-site-lifecycle-management.md).

## 4. Safe Error Projection

Errors MUST be specific enough for an authenticated customer to recover, but
MUST NOT create a public identifier-enumeration oracle.

Credential validation therefore precedes detailed lifecycle projection:

1. validate that the supplied key belongs to the supplied `site_id`;
2. validate key status, revocation, expiry, and required scope;
3. only after ownership is proved, return lifecycle-specific recovery such as
   `auth.site_inactive`, `auth.site_suspended`, or `auth.site_not_ready`;
4. requests without a matching credential return `auth.invalid_key` without
   disclosing whether another site record exists.

Customer UI MUST translate known stable codes into safe, actionable language.
It MUST NOT render raw backend JSON as the primary result. The error code and
trace identifier MAY appear as secondary support references.

| Stable code | Customer-safe meaning |
| --- | --- |
| `auth.invalid_key` | The credential is invalid, expired, revoked, or belongs to another site |
| `auth.site_inactive` | The site is connected, but Cloud service is not activated |
| `auth.site_suspended` | The site service was suspended by the platform |
| `auth.site_not_ready` | Provisioning or another non-active step is incomplete |

The versioned Cloud-to-Addon fields, disclosure order, localized projection,
and recovery actions for `auth.site_inactive` are defined by the
[Cloud Connector Recovery Contract](cloud-connector-recovery-contract-v1.md).

OAuth provider identifiers follow the same rule. A provider `openid` is an
internal binding identifier, not necessarily a user-facing account number.
Portal MAY show a verified nickname or masked provider identity when available.
It MUST NOT label an opaque `openid` as a QQ number.

## 5. Proxy and HTTP Method Contract

Every customer-facing call passing through a framework proxy has two contracts:

1. the backend route contract;
2. the proxy method, body, header, timeout, and error-normalization contract.

Adding a backend `PATCH` route is incomplete until the catch-all Portal proxy
exports and tests `PATCH`. A browser-side `405 Method Not Allowed` SHOULD be
investigated at the closest ingress first; it does not prove that the backend
route rejected the request.

Proxy tests MUST enumerate every supported method. Non-GET bodies and content
types, identity/session headers, idempotency keys, and bounded timeouts MUST
remain covered by the owning proxy contract.

## 6. Capability Scene Contract

The Cloud connector MUST accept only known WordPress AI ability scene calls.
This protects Cloud from becoming a second ability or workflow registry.

When a normal feature such as featured-image generation is rejected as an
unknown scene, the repair sequence is:

1. identify the real WordPress UI action and owning ability;
2. inspect the scene metadata emitted by that ability/client;
3. verify the Addon recognizes the current official WordPress AI shape;
4. verify Cloud consumes the bounded connector contract without inventing a
   Cloud-owned ability definition;
5. exercise the normal editor action again.

Do not fix this class of error by admitting arbitrary scene names, raw prompts,
or test-only bypass routes.

## 7. Diagnostics and Acceptance Levels

| Level | What it proves | Example |
| --- | --- | --- |
| Configuration | Required values exist and are syntactically valid | Endpoint and token present |
| Connection | The external service accepted a bounded live probe | Embedding/Zilliz probe passed |
| Index | Stored chunks can be written and returned by a controlled round trip | Zilliz rebuild self-check passed |
| Retrieval | A normal Site Knowledge search used the production backend | Real search recorded against Zilliz |
| Consumer | The normal WordPress or Portal action completed | Editor feature or lifecycle action succeeds through its UI |

Lower levels MUST NOT be presented as higher-level acceptance. An index rebuild
round trip is not normal retrieval acceptance.

Platform-owned maintenance SHOULD run automatic acceptance after index rebuild
or credential changes and project the result read-only. Ordinary users SHOULD
see status and recovery guidance, not a platform diagnostic button. An explicit
manual retry MAY remain in Cloud Admin as a low-frequency operator action.

Acceptance automation MUST use the normal runtime/search path, server-owned
bounded fixtures or existing eligible content, normal audit classification, and
no WordPress writes. It MUST report `pending`, `passed`, `no_hit`, or `failed`
without claiming success from HTTP status alone.

## 8. Investigation Order

1. Reproduce the exact normal user action; capture method, path, stable error
   code, trace ID, and projected state.
2. Inspect the nearest browser/WordPress proxy or connector boundary.
3. Confirm the backend route and request contract.
4. Inspect service lifecycle and entitlement decisions.
5. Inspect credential ownership, status, expiry, and scope.
6. Inspect capability/ability scene compatibility.
7. Inspect provider transport only after the local seams are proved.
8. Verify the repaired path through the normal consumer.
9. Correlate runtime, usage, audit, and diagnostic evidence to one request.
10. Report local, M4 candidate, PR, merged, M4 accepted, production, and human
    evidence separately.

A timeout with partial bytes received means the connection was established but
the response did not finish inside the caller budget. Increasing the bounded
timeout may be appropriate, but it is not a substitute for checking response
size, streaming, proxy limits, and the expected latency class.

## 9. Verification Requirements

- proxy method tests for added or changed HTTP methods;
- focused API/domain tests for lifecycle transitions and binding preservation;
- auth tests proving active success, invalid-key fail-closed behavior, and
  lifecycle detail only after credential ownership;
- customer-safe error formatting and i18n completeness tests;
- M4 source candidate and focused runtime/consumer proof for Cloud behavior;
- normal WordPress or Portal smoke when the user-visible action is the target.

Do not spend Provider budget merely to manufacture evidence. Use a bounded real
call only when deterministic evidence cannot prove the changed seam.

## 10. Boundary Review

This standard does not move WordPress ability, workflow, prompt, preset, router,
approval, or final-write truth into Cloud. It does not move account-wide Cloud
lifecycle management into the Addon, or Cloud operator diagnostics into
ordinary WordPress settings. Cloud remains runtime/detail owner; the Addon is a
thin connector; WordPress remains the control plane and final-write owner.
