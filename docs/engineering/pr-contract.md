# PR Contract (Cloud)

Status: active short pointer. Normative detail lives in existing files.

## CI-required human headings

Enforced by `.github/workflows/pr-body-contract.yml` via
`.github/scripts/check_pr_body_contract.py`. Human PRs must include headings
matching (case-insensitive) **Scope**, **Boundary**, **Verification**, and
**Risk**.

Start from [`.github/pull_request_template.md`](../../.github/pull_request_template.md).
Do not replace the template with a body that omits those four headings.

## Policy

- Humans: [pr-and-dependency-update-policy.md](../pr-and-dependency-update-policy.md)
- Dependabot: same policy file (trusted-bot lane; different body rules)
- Local checker exercise: `pnpm run test:pr-body-contract`
- Preferred publish path: `pnpm run pr:publish` (see root `package.json`)

## Production target

A PR targeting `production` must also contain the exact operator sentence
required by repository release policy (see AGENTS detail and
[cloud-production-release-policy-v1.md](../cloud-production-release-policy-v1.md)).
Agents must not invent Deploy authorization.
