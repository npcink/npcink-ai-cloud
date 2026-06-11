# External Trial Operator Runbook - 2026-06-11

Status: active controlled-trial runbook.

Purpose: give the platform administrator one short execution path for the first
approved trial sites. This runbook is not a self-serve onboarding flow, payment
flow, or Cloud-side WordPress control plane.

## Invite Criteria

Invite a site only when all of these are true:

- The site owner/contact and WordPress URL are known.
- The declared use case is reviewable assistance, writing preparation, evidence
  gathering, image candidates, or support diagnostics.
- The site category is not primarily sexual content, gambling, fraud, phishing,
  fake reviews, spam/doorway pages, copyright laundering, or regulated
  high-stakes advice without a separate manual approval.
- The operator accepts that final writes remain local WordPress/Core owned.
- The operator has received the trial briefing copy in
  `docs/external-trial-user-briefing-copy-zh-2026-06-10.md`.

## Provision Access

1. Confirm the target environment is operational:

```bash
pnpm run check:fast
pnpm run check:seam
pnpm run smoke:internal-alpha-onboarding
pnpm run smoke:site-knowledge
pnpm run smoke:local-alpha
```

2. Provision or confirm the site through the existing service-plane path.
3. Issue or confirm one active Cloud API key for the approved site.
4. Save and verify the customer-facing Cloud API key in the WordPress Cloud
   addon.
5. Do not expose split `site_id / key_id / secret` fields in WordPress UI,
   support notes, screenshots, or customer-facing logs.

## Support Evidence

For each trial site, record:

- Cloud base URL and WordPress site URL
- Site ID and account ID
- Cloud API key verified state
- Latest `pnpm run smoke:site-knowledge` evidence JSON
- Latest `pnpm run smoke:local-alpha` evidence JSON
- `/health/operational-ready` result
- Runtime run IDs or error trace IDs
- Any blocked prompts, abuse signals, or manual-review decisions
- Operator notes and feedback summary

## Revoke Or Suspend

Use the platform administrator/service-plane path when a site is out of scope,
compromised, or no longer approved:

1. Revoke the site API key.
2. Suspend the site or subscription when access must stop immediately.
3. Record the reason in the trial log.
4. Confirm subsequent runtime requests fail with an auth, site, or subscription
   rejection rather than a provider execution.
5. Do not add a new Cloud control surface to compensate for a failed trial.

## Weekly Review

Review the first trial batch weekly before changing prompts, profiles, routing,
or UX.

Required review inputs:

- trial log entries
- blocked prompts and abuse signals
- user feedback labels
- runtime errors and provider failures
- Site Knowledge evidence quality
- support evidence gaps

Allowed outcomes:

- keep running unchanged
- pause a site
- revoke a key
- update trial copy
- file a bounded implementation task

Forbidden outcomes without a separate boundary review:

- Cloud-owned publishing
- Cloud prompt/router editor
- Cloud workflow builder
- Cloud ability registry
- Cloud MCP platform
- self-serve payment or checkout
