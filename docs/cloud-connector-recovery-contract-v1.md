# Cloud Connector Recovery Contract v1

Status: active cross-repository contract.

This contract defines how Cloud and the WordPress Cloud Addon represent a
bound site whose hosted service is not active. It prevents a lifecycle fact
from being misreported as a signature or credential failure.

## 1. Product boundary

Cloud is the authority for site lifecycle, entitlement, credential validity,
and bounded recovery facts. The Addon is the authority for stable localized
WordPress copy, action labels, and the local recovery interaction. WordPress
remains the local control plane and final-write owner.

Cloud MUST NOT add an activation bypass, silently replace another active site,
or become a second ability, workflow, prompt, router, approval, or WordPress
write control plane.

## 2. Independent facts

The following facts MUST remain separate:

```text
bound != active != credential-valid != capability-ready != consumer-accepted
```

- `bound`: the site relationship and history are retained;
- `active`: hosted runtime service is currently authorized and consumes active
  capacity;
- `credential-valid`: the presented key is active, unexpired, unrevoked, and
  belongs to the supplied site;
- `capability-ready`: the requested WordPress ability scene and Cloud runtime
  contract are compatible;
- `consumer-accepted`: the normal user action completed through its real
  WordPress or Portal path.

An inactive site remains fail-closed for runtime execution. Deactivation does
not erase its binding, credential record, usage, or audit history.

## 3. Stable inactive-site response

When a valid site key and required scope have already been established, Cloud
returns HTTP `403` with:

```json
{
  "status": "error",
  "error_code": "auth.site_inactive",
  "message": "site is bound but Cloud service is inactive",
  "data": {
    "recovery_contract": "cloud_site_activation_recovery.v1",
    "site_status": "inactive",
    "activation_required": true,
    "action": "activate_site",
    "portal_url": "https://<configured-portal>/portal"
  }
}
```

The `data` object is additive, bounded, and machine-readable. Cloud owns the
contract name, lifecycle status, activation requirement, action identifier,
and configured Portal URL. Cloud does not own translated UI copy or HTML.

`portal_url` MUST be derived from configured Cloud service settings and MUST
not contain secrets, request payloads, or arbitrary user-provided URLs. If no
configured URL is available, the Addon falls back to its safe local Cloud
entry URL.

## 4. Security and disclosure order

Detailed lifecycle facts are disclosed only after all of the following pass:

1. the supplied key belongs to the supplied `site_id`;
2. the key is active and within its expiry/revocation rules;
3. the request has the required scope;
4. the site is then evaluated for lifecycle state.

Invalid, cross-site, expired, revoked, or underscoped requests MUST continue
to return the generic fail-closed authorization result and MUST NOT reveal
that a different site record exists or is inactive.

## 5. Addon projection rules

Addon versions implementing this contract MUST:

- preserve the stable `error_code` and bounded `data` fields;
- map `auth.site_inactive` to a local `activation_required` state;
- avoid presenting the state as “signed verification failed”;
- use localized, customer-safe copy equivalent to “Connected, activation
  required”;
- provide a primary action to open Cloud site activation;
- provide a secondary action to check activation again;
- keep the runtime unavailable until a later successful verification;
- retain a generic safe fallback for older Cloud responses without the stable
  code.

The Addon MUST NOT render raw backend JSON as the primary user experience or
invent lifecycle truth that Cloud did not provide.

## 6. Recovery flow

```text
Cloud auth.site_inactive
        |
        v
Addon activation_required projection
        |
        +--> Activate this site in Cloud --> Portal lifecycle action
        |
        +--> Check activation again ------> signed verification probe
                                             |
                              active + valid -> connected/ready
                              still inactive -> same recovery state
                              invalid key ----> credential recovery
```

Activation is explicit and account-scoped in Cloud/Portal. The Addon may open
the Portal and re-probe the current installation, but it does not select or
deactivate another site on the customer's behalf.

## 7. Compatibility and versioning

The contract is additive to the existing error envelope. Older Addons may
ignore `data` and retain their generic fallback; they must not gain access to
runtime execution while the site is inactive. Future incompatible changes
require a new `recovery_contract` identifier and a new Addon mapping.

## 8. Verification and evidence

The minimum proof for a change to this contract is:

- Cloud focused auth/API tests for active success, inactive recovery, and
  credential-first disclosure;
- Addon behavior tests for state projection, activation action, recheck action,
  localization, and generic fallback;
- static/boundary checks proving no control-plane or WordPress-write drift;
- required GitHub checks for both repositories;
- after Cloud merge, clean-`master` M4 promotion, status, and focused smoke;
- an Addon package/release verification before customers receive the UX.

Evidence states MUST be reported separately: local verified, PR verified,
merged, M4 accepted, production validated, and human accepted.

## 9. Rollback

Revert Cloud and Addon through their normal reviewed PRs. Do not edit site
statuses, keys, bindings, usage, or audit history directly on a server as a
rollback substitute. A rollback restores the older generic projection while
preserving fail-closed inactive-site authorization.
