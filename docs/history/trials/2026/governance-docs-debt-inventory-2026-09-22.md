# Governance Inventory: Documentation Debt - 2026-09-22

Status: read-only planning evidence collected for a governance review. Not a
contract, standard, runbook, or release authority. No file was modified,
moved, or deleted while collecting this record.

Collected on branch `codex/governance-inventory-20260922` at `origin/master`
revision `1d6100f6` (post PR #1013). Method: scripted counts and
cross-reference sweeps (`find`/`grep`) over the tracked tree; reference =
literal filename occurrence in AGENTS.md, README.md, docs/**, app/,
frontend/src/, scripts/, tests/, deploy/, .github/, config/.

## Totals

- 471 tracked markdown files under `docs/` (281 at root, 190 in
  subdirectories).
- ADRs: 55 files in `docs/decisions/`, numbering 001-055.
- Dated evidence records (date in basename): 258 total = 144 at `docs/` root
  + 109 under `docs/history/**` + 5 elsewhere (observation-inbox 3,
  superpowers plans/specs 2).
- Non-dated active docs: 213 (137 at root including the index itself; 76 in
  subdirectories: 55 ADRs, 9 legacy-contracts, 12 history READMEs).
- Index/README files: 14 (`docs/README.md`, `docs/history/README.md`, 10
  nested history READMEs, 1 legacy-contracts README).

Root dated records by month: 2026-05: 1, 2026-06: 32, 2026-07: 62,
2026-08: 30, 2026-09: 19.

## Headline signals

1. **144 dated evidence records sit at `docs/` root.** The docs README's
   "Dated Active-document Review" explicitly blesses only 13 of them (6
   retained active authority, 7 historical evidence retained in place). The
   remaining 131 are convention migration candidates into `docs/history/**`.
   Caveat for planning: roughly 20 recent 2026-09 records are actively linked
   from the README task/observation tables, so moves need index updates, and
   the newest records are still live working state.
2. **ADR numbering defects.** 044 is missing (043 jumps to 045) and two
   files claimed 028 (`028-ai-credit-commercial-meter-contract.md` and
   `028-versioned-public-site-compliance-projection.md`). `docs/README.md`
   carried a duplicate-numbering warning, so this was a known-but-unfixed
   defect. Resolution 2026-09-22: the newer meter decision was renumbered to
   `056-ai-credit-commercial-meter-contract.md`, the 044 gap is recorded in
   the docs README numbering status, and the documentation reachability gate
   now fails on duplicate ADR numbers.
3. **Supersession debt without version variants.** No stem has multiple
   `-vN` variants coexisting (120 versioned files, 118 are v1-only, one
   v2-only). But `site-media-recommendation-engineering-standard-v1.md` and
   `site-media-recommendation-development-standard-v2.md` appeared to cover
   the same subject under different stems, and the docs README indexed
   **both** as active rules. Resolution 2026-09-22: reading both documents
   showed complementary layers, not supersession — v1 governs
   site-inventory media recommendations and v2 governs external image-source
   recommendations as its declared implementation companion. The docs README
   entries and the v1 scope note now state that relationship explicitly.
4. **No hard orphans; debt shows up as weak linking.** `check:doc-
   reachability` enforces index reachability, so zero docs have no inbound
   reference. Instead, 51 of the 137 non-dated root docs have only 1-2
   referencing files: 26 have exactly one reference and 25 have two.

## Weak-link detail (non-dated docs at docs/ root)

Referenced **only by the index** `docs/README.md` (19 files):
single-operator-ai-development-and-release-playbook-v1,
m4-preview-target-alignment-standard-v1,
cloud-model-capability-discovery-and-verification-standard-v1,
model-reference-metadata-v1, site-ops-cloud-analysis-runtime-v1,
media-alt-and-visual-evidence-development-standard-v1,
performance-security-remediation-closeout-and-standard-v1,
small-customer-trial-commercial-readiness-v1, source-extraction-preview-v1,
wordpress-ai-recommendation-development-standard-v1,
runtime-observation-workbench-improvement-plan-v1,
cloud-admin-runtime-observation-ui-development-standard-v1,
wordpress-ai-request-path-map-v1,
site-media-recommendation-development-standard-v2,
runtime-observation-workbench-real-scenario-acceptance-v1,
cloud-portal-site-detail-status-display-standard-v1,
deferred-engineering-triggers-v1,
cloud-admin-visual-information-architecture-review-standard-v1,
cloud-admin-ui-review-and-delivery-playbook-v1.

Referenced **only by a past inventory record**
(`docs/history/repository-hygiene/2026/document-navigation-and-hotspot-review-2026-09-11.md`),
i.e. effectively operationally orphaned (6 files):
internal-alpha-onboarding-smoke-runbook,
plugin-observability-implementation-summary,
cloud-adapter-analysis-contract,
cloud-local-integration-and-rebuild-guidance, mixin-missing-methods-fix,
wordpress-ai-capability-readiness-v1.

Referenced by one peer doc (1): admin-disclosure-state-ownership-standard-v1.

The two-reference group (25 files) is dominated by "index + one dated
closeout record" pairs, which is the normal healthy pattern for completed
work; the full list is regenerable with the method above.

Reference-count distribution for context: the most-referenced active docs
are `cloud-admin-ui-standard-v1.md` (63), `cloud-admin-frontend-engineering-
standard-v1.md` (61), `cloud-admin-information-architecture-v2.md` (57),
`development-validation-operating-model-v1.md` (55),
`cloud-production-release-policy-v1.md` (50), `m4-preview-ai-development-
standard-v1.md` (39), `cloud-content-generation-boundary-v1.md` (36).

## Directory shape

```
docs/ root ......................... 281 files
docs/decisions/ .................... 55 (ADRs 001-055, 044 missing, 028 x2)
docs/history/ ..................... 121 (109 dated + 12 READMEs)
  admin/2026 (+phase-c, phase-d-h, pilots, records)
  architecture|m4|media|portal|production|refactor|repository-hygiene|trials /2026
docs/legacy-contracts/magick-ai-root/ 9
docs/observation-inbox/ ............ 3
docs/superpowers/plans|specs/ ...... 2
```

## The 13 README-blessed root residents

Retained active authority (6): ai-provider-env-config-retirement-2026-06-26,
external-trial-operator-runbook-2026-06-11,
image-processing-fc-oss-readiness-2026-07-20,
naming-residual-allowlist-2026-06-24,
provider-connection-production-runbook-2026-06-30,
release-ci-open-source-patterns-2026-07. Historical evidence retained in
place (7): admin-account-governance-lightweight-2026-06-12,
cloud-production-deployment-history-2026-06-24,
external-trial-capability-note-2026-06-10, external-trial-copy-and-log-
2026-06-11, external-trial-handoff-summary-2026-06-15,
external-trial-readiness-checklist-2026-06-10,
pre-release-legacy-debt-and-development-history-2026-07-10.

## Proposed next actions (non-binding, for the planning pass)

1. Batch-migrate the 131 root dated records into `docs/history/<topic>/2026/`
   with README index updates, oldest months first; verify with
   `check:doc-reachability`. Exclude the ~20 live 2026-09 records still
   linked from active task tables until their tasks close.
2. Fix ADR numbering: annotate or renumber the duplicate 028 pair and record
   the 044 gap; add a numbering-integrity check (see the rule-enforcement
   inventory for the checker candidate).
3. Merge or explicitly supersede the site-media-recommendation v1/v2 pair
   into one canonical standard.
4. Adopt a one-in-one-out budget for new root active docs; consider a lint
   that requires an explicit README retention entry for any new dated file
   at `docs/` root.
5. Triage the 26 single-reference docs: fold into their referencing doc,
   gain real references, or archive as evidence.
