# WordPress–Cloud Integration Diagnostics Retrospective — 2026-08-13

Status: dated development retrospective and evidence summary. Not current
production authorization.

## 1. Scope

This retrospective consolidates the investigation thread covering:

- featured-image prompt generation rejected as an unknown AI scene;
- Zilliz index rebuild passing its round trip while real retrieval remained
  unaccepted;
- QQ binding failures surfacing raw JSON and ambiguity about a QQ number;
- Addon verification reporting `site is not authorized` despite a retained
  site relationship;
- Portal site deactivation returning `405 Method Not Allowed`;
- an HTTP call timing out after receiving only part of a large body;
- moving Site Knowledge product surfaces out of Toolbox and keeping platform
  acceptance in Cloud rather than exposing it as an ordinary user task.

The long-term rules extracted from these incidents are in
[Cloud WordPress Connector State and Diagnostics Standard](cloud-wordpress-connector-state-and-diagnostics-standard-v1.md).

## 2. Shared Root Pattern

The visible errors appeared unrelated, but the principal contradiction was the
same: a lower-layer technical fact was presented as if it were the whole
product state.

- “site exists” was treated as “runtime authorized”;
- “index round trip passed” was treated as “real search accepted”;
- “backend route exists” was treated as “browser request can reach it”;
- “QQ returned an identity” was treated as “the UI has a QQ number”;
- “connector blocks unknown scenes” was treated as a Cloud outage;
- “connection timed out” obscured that bytes were already flowing.

The corrective method was to name each independent fact, identify its owner,
and validate the complete consumer path instead of widening permissions or
adding more user controls.

## 3. Incident Summaries

### 3.1 Featured-image generation and known AI scenes

The guard that accepts only known WordPress AI scenes is correct. The repair
belongs at the WordPress Ability/Add-on contract seam: recognize the official
scene shape emitted by the real action, preserve the allowlist, and verify the
normal editor action. Extend the bounded contract; do not remove the boundary.

### 3.2 Site Knowledge and real retrieval acceptance

“Index rebuilt and round-trip self-check passed” proves that chunks reached the
fixed collection and a controlled vector query returned an indexed chunk. It
does not prove that normal Site Knowledge search selects Zilliz and retrieves
eligible content.

The initial idea of adding “执行检索验收” to an ordinary WordPress page was
rejected after clarifying the purpose. This is platform infrastructure
acceptance. The target design is automatic Cloud acceptance after rebuild or
credential changes, a bounded Cloud Admin retry, and read-only readiness plus
recovery guidance for ordinary users. Site Knowledge detail belongs with the
Cloud Addon/Cloud boundary, while the standalone Toolbox page can be removed
during development.

### 3.3 QQ OAuth raw JSON and displayed identity

Raw JSON such as `portal.qq_openid_fetch_failed` is support evidence, not an
acceptable primary UI. Known OAuth failures need a customer-safe message,
optional reference detail, and a recovery action.

QQ Connect returns an `openid` used for external identity binding. It is not
necessarily the user's QQ number. Prefer a verified nickname or safely masked
identity; do not relabel `openid` as a QQ number.

### 3.4 Bound site, active service, and valid credential

The platform must support more bound sites than active sites. Deactivation
releases active capacity but retains binding, credential record, usage, and
audit evidence. Runtime still accepts only active sites with valid keys.

Lifecycle-specific errors make a retained inactive binding understandable.
The security closeout added a critical constraint: those details are returned
only after the key proves ownership of the supplied site. Otherwise the service
returns `auth.invalid_key`, preventing site-ID enumeration.

### 3.5 Portal deactivation and the missing PATCH proxy

FastAPI already exposed `PATCH /portal/v1/sites/{site_id}/lifecycle`, and the
Portal client sent PATCH. The Next.js catch-all proxy exported only GET, POST,
PUT, and DELETE, so the framework returned 405 before FastAPI was reached.

The repair added PATCH and expanded the proxy contract test. Trace HTTP failures
hop by hop; a correct backend route does not prove every ingress supports it.

### 3.6 Partial-response timeout

The timeout occurred after receiving 262144 of 1705669 bytes. The caller had
connected and begun receiving data. Raising a bounded timeout may be reasonable
for the operation, but diagnosis must also check payload size, streaming,
buffering, latency class, and whether the UI should wait synchronously.

## 4. Delivered Cloud Change

The Cloud source change introduced:

- PATCH support in the Portal catch-all proxy;
- lifecycle-specific authenticated runtime errors;
- safe English and Chinese Portal error projection;
- focused auth, runtime, proxy, and error regression tests;
- preservation of the active-site-only runtime rule and bound-site lifecycle.

During closeout review, validation order was corrected so invalid credentials
cannot learn whether a site exists or which lifecycle state it has.

This retrospective does not claim that every earlier cross-repository change,
M4 candidate, production deployment, or human WordPress acceptance is complete.
Those evidence states remain revision- and environment-specific.

## 5. Repeatable Method

1. Write the exact user action, observed response, and expected product state.
2. Model binding, lifecycle, credential, capability, provider, and consumer
   acceptance as independent facts.
3. Locate the nearest failing seam rather than changing the broadest system.
4. Preserve fail-closed security and ownership boundaries.
5. Improve stable error codes and customer projection together.
6. Test the proxy/connector contract as well as the backend route.
7. Distinguish component, integration, consumer, and human evidence.
8. Automate platform acceptance and keep ordinary user surfaces task-focused.
9. Run deterministic focused gates first; use M4 or a real consumer only for a
   distinct runtime risk.
10. Document the decision and rollback before the context disappears.

## 6. Anti-patterns

- Do not equate binding with activation or activation with valid credentials.
- Do not expose raw backend JSON as the user experience.
- Do not label opaque OAuth identifiers as human account numbers.
- Do not fix a known-scene rejection by admitting arbitrary scenes.
- Do not add platform verification buttons to ordinary WordPress user pages.
- Do not call an index round trip “real retrieval accepted.”
- Do not increase timeouts without understanding payload and latency behavior.
- Do not debug FastAPI first when an upstream framework returned 405.
- Do not treat commit, push, M4 candidate, merge, production, and human
  acceptance as interchangeable forms of “done.”

## 7. Rollback and Follow-up

Revert code and documents through normal Git review. Do not repair customer
state by deleting sites, bindings, credentials, or audit history directly in
production. Follow-up evidence should use protected PR checks, M4 candidate,
clean-master promotion after merge, normal Portal/WordPress smoke, and separately
authorized production validation.
