# Portal registration access v1

Status: active contract; operator approved on 2026-11-05. Source implementation
and validation do not establish production activation.

## Policy

Cloud owns new-account admission. The existing `ServiceSetting` row
`portal_registration` stores `public_registration_enabled` and `email_allowlist`.
Admin → Service settings → Registration access is the operator entrypoint.
There is no new invitation, application, approval, quota, or entitlement system.

| Saved policy | New account creation |
| --- | --- |
| Public registration enabled | Existing email and QQ self-registration flows |
| Public registration disabled; complete email in allowlist | Email verification registration only |
| Public registration disabled; email absent from allowlist | Denied with `service.portal_registration_closed` (403) |
| Public registration disabled; empty allowlist | All new self-registration denied |

Missing policy preserves the previous open behavior. A saved policy is always
enabled as a policy: its boolean controls public registration, not the policy
row's `enabled` flag. Malformed/disabled saved policy blocks new accounts rather
than reopening access. No environment fallback or cache overrides saved policy.
Existing users retain login, session recovery, QQ binding, subscription, purchase
and trial eligibility under their existing rules. Disabling registration or
removing an email does not revoke an account or grant additional credits.

Allowlist entries are complete addresses, at most 200 before deduplication,
trimmed and lowercased using the same validation as Portal identities. Wildcards,
domain-only entries and implicit plus-address/alias matching are not supported.
The allowlist is returned only through the existing authenticated Admin settings
surface; public responses never expose the list. Setting-change audit records
retain setting identity/outcome, not the allowlist itself.

## Enforcement

The commercial domain checks new email admission before issuing registration
codes and again before creating an account. A previously issued code cannot
bypass a later closure or allowlist removal. Allowed email addresses must still
prove mailbox possession. Existing accounts using registration as a login path
remain supported and do not receive duplicate subscriptions.

QQ identities have no trusted, locally verified mailbox proof at first login.
When public registration is disabled, first-time QQ account creation is denied
regardless of third-party profile email. Existing QQ bindings can still sign in.
A new tester first registers with an allowed email and then binds QQ through the
existing authenticated account flow. HTML QQ denial returns to
`/portal/register?reason=registration_closed`; this query is presentation only
and cannot authorize registration.

The additive internal PATCH `/internal/service/admin/service-settings/portal-registration`
requires existing internal authorization and an idempotency key. The browser
proxy exposes only that method/path under the existing service-settings Admin
authority. Both fields are required; extra fields and invalid email entries are
rejected without changing the saved policy. The Admin editor uses existing
draft, navigation protection, write locking and save/readback recovery behavior.

## Operator use and rollout

For restricted internal testing, save the tester email list with public
registration disabled. Keep the empty-list consequence and QQ limitation visible
beside the controls. Later reopening requires only enabling public registration;
the saved list can remain for a future restricted period.

The 2026-11-05 decision supersedes the earlier **no registration allowlist**
choice for prospective account creation only. The three-user Free observation
cohort remains independent; it does not become the list. The 2026-10-23 purchase
and shared-trial scope for existing eligible accounts remains unchanged.

Deployment and changing production settings require separate explicit operator
authorization. This change does not itself close production registration.
Rollback source by reverting this focused change; operational reopening, when
authorized, uses the same policy editor with public registration enabled.

## Maintenance and verification

Changes to account admission must test issuance and account creation against
the current saved policy separately, including outstanding codes, malformed
policy, empty allowlist and existing-account recovery. Missing configuration
compatibility must not become a fallback for malformed saved configuration.
Keep provider profile claims separate from locally verified mailbox proof.

Reuse the settings editor's draft and saved-but-unconfirmed readback guards.
When adding a directory entry, run the existing workbench screenshot scenario
as well as the new feature scenarios; the directory can change a golden even
when the default form is unchanged. Review actual/diff for every tracked
platform and obtain required visual acceptance before updating baselines under
the existing Admin UI standard.

Delivery evidence and failure corrections are recorded in the
[2026-11-06 closeout](history/portal/2026/registration-access-closeout-2026-11-06.md).
That dated record does not authorize production activation.
