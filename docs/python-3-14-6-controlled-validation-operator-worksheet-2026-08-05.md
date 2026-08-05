# Python 3.14.6 Controlled-Validation Operator Worksheet — 2026-08-05

Status: unsigned worksheet; not a controlled-risk acceptance receipt.

This file is a handoff checklist only. It must never be supplied to
`scripts/check-first-install-cve-gate.py`, copied into a deploy bundle, or
treated as operator authorization. An AI session must not fill the authorization
timestamp, sign for the operator, or create the private checksum pair.

## Exact production identity

| Field | Value |
| --- | --- |
| Production revision | `6b3267885bcbf6ba8a02cd6541f3d45876f3268f` |
| Production source tree | `a6f5991a6a073ed0ff88f9493c5d822c0e4e6fff` |
| Managed release | `release-4a45f6d2f9d16b42-20260805032842-25749` |
| Expected exact deploy-bundle SHA-256 from the release handoff | `4a45f6d2f9d16b42b1b608ee638c12baa321b6af4091a49b609ff537202ea8e0` |
| Scope | `controlled_production_validation_only` |
| GA authorized | `false` |
| Required expiry | `2026-08-11` |

The current file at the ordinary local path
`/Users/muze/gitee/npcink-ai-cloud/dist/deploy-bundle.tgz` hashed to
`f01827758d912798ac5073db65ce40212fd21337a419b184d1e5a2eb3026dd53` during
this session. It is not the exact deployed bundle and must not be used to issue
or validate the acceptance.

## Operator prerequisites

- [ ] Locate the original trusted bundle whose SHA-256 is exactly
  `4a45f6d2f9d16b42b1b608ee638c12baa321b6af4091a49b609ff537202ea8e0`.
- [ ] Confirm its manifest binds the production revision and source tree above.
- [ ] Re-run the exact bundle scan and confirm both scan receipts are fresh and
  `passed`.
- [ ] Confirm the finding set is exactly `CVE-2026-11940`, `CVE-2026-11972`, and
  `CVE-2026-15308` for Python `3.14.6`, with no unallowlisted blocking finding.
- [ ] Refresh CISA SSVC evidence and confirm `exploitation=none` for all three.
- [ ] Review the current internal-only/no-user scope and the short expiry.
- [ ] Personally decide whether to authorize the controlled validation risk.

If the exact original bundle is unavailable, stop. Do not assume a rebuilt
bundle is byte-identical, edit the expected digest, or reuse an acceptance bound
to another bundle.

## Values the private receipt must bind

The operator-owned mode-`0600` JSON must use contract
`npcink.controlled_production_cve_risk_acceptance.v1` and bind all fields
required by
[Python 3.14.6 Controlled Production Validation Risk Decision](python-3-14-6-controlled-production-validation-risk-decision-2026-07-21.md),
including:

- exact source revision, source tree, and bundle SHA-256;
- fresh scan-index, API scan-receipt, and allowlist SHA-256 values;
- exact scan statuses, image platform/reference, counts, and finding set;
- current CISA SSVC values and check timestamp;
- `exception_expires_on=2026-08-11`;
- `ga_authorized=false`;
- the real operator identity and authorization timestamp.

After the operator creates the private JSON, create a separate owner-only
mode-`0600` file containing only its lowercase SHA-256. Then run:

```bash
<python-3.12-or-newer> scripts/check-first-install-cve-gate.py \
  --bundle <exact-deploy-bundle.tgz> \
  --controlled-risk-acceptance <private-acceptance.json> \
  --controlled-risk-acceptance-checksum <private-acceptance.sha256>
```

Only a passing gate for that exact bundle can remove the CVE readiness blocker.
It still does not authorize first-install finalization; finalize requires a new,
separate operator decision after all readiness evidence is reviewed.
