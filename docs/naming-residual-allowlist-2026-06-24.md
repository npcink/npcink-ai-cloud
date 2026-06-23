# Naming Residual Allowlist - 2026-06-24

Status: active cross-repo review aid.

This document defines which remaining `magick-ai` strings are allowed after the
Npcink naming reset, and which strings should be treated as active identity
residue.

## Denylist

These strings must not appear in active runtime, caller, package, route, or
contract paths:

- `magick-ai-core`
- `magick-ai-adapter`
- `magick-ai-abilities`
- `magick-ai-cloud-addon`
- `magick-ai-toolbox`
- `magick-ai-eval-lab`
- `magick-ai/open`
- `magick-ai/eval-lab`
- `MAGICK_AI_EVAL_LAB`
- `Magick AI Eval Lab`
- `magick_eval_lab_`
- `magick_eval_task_`

Current replacements:

- `npcink-governance-core`
- `npcink-ai-client-adapter`
- `npcink-abilities-toolkit`
- `npcink-cloud-addon`
- `npcink-toolbox`
- `npcink-eval-lab`
- `npcink/open`
- `npcink/eval-lab`
- `NPCINK_EVAL_LAB`
- `Npcink Eval Lab`
- `npcink_eval_lab_`
- `npcink_eval_task_`

## Allowed Residuals

The following `magick-ai` occurrences are allowed and should not be treated as
identity residue.

### This Allowlist

Allowed:

- this document itself.

Reason: it must name retired ids explicitly so reviewers and future agents know
what to block.

### Primary Local Test Site

Allowed:

- `https://magick-ai.local/`
- `/Users/muze/Local Sites/magick-ai/app/public`
- file names that include `magick-ai-local` because they record a trial against
  that local site.

Reason: `magick-ai.local` is the primary local WordPress acceptance site. It is
a site name, not a package, repository, plugin, ability, or Cloud route id.

### Legacy Source And Migration Records

Allowed:

- ADRs and migration notes that describe the previous source plugin or old
  source repository.
- ability namespace migration maps that explicitly state retired `magick-ai/*`
  ability ids are invalid for active runtime calls.
- harvest notes that point back to old source material.

Reason: these documents preserve migration evidence and guard against reviving
retired ids.

### Test Fixtures And Temporary Artifacts

Allowed:

- screenshot names from old local trials;
- cache directories such as `magick-ai-playwright`;
- temporary output paths such as `/tmp/magick-ai-*`;
- media fixture names used only to find and clean old test artifacts.

Reason: these are storage labels or cleanup selectors, not current identity
contracts.

### Commercial Add-on Carve-out

Allowed only when explicitly documented in the ability namespace migration map:

- old commerce add-on ids such as `magick-ai/wc-*`.

Reason: commerce add-on namespace cleanup is a separate contract migration and
must not be mixed with the already completed Core / Adapter / Abilities /
Cloud / Eval Lab reset.

## Review Commands

Strict current identity scan:

```bash
rg -n "magick-ai-core|magick-ai-adapter|magick-ai-abilities|magick-ai-cloud-addon|magick-ai-toolbox|magick-ai-eval-lab|magick-ai/open|MAGICK_AI_EVAL_LAB|magick-ai/eval-lab|Magick AI Eval Lab|magick_eval_lab_|magick_eval_task_" \
  /Users/muze/gitee/npcink-ai-cloud \
  /Users/muze/gitee/npcink-abilities-toolkit \
  /Users/muze/gitee/npcink-governance-core-primary-site-docs \
  /Users/muze/gitee/npcink-ai-client-adapter \
  /Users/muze/gitee/npcink-toolbox \
  /Users/muze/gitee/npcink-cloud-addon \
  /Users/muze/gitee/npcink-eval-lab \
  --glob '!**/.git/**' \
  --glob '!**/docs/archive/**' \
  --glob '!**/docs/naming-residual-allowlist-2026-06-24.md' \
  --glob '!**/generated/**' \
  --glob '!**/vendor/**' \
  --glob '!**/node_modules/**' \
  --glob '!**/build/**' \
  --glob '!**/dist/**'
```

Broad residual scan:

```bash
rg -n "magick-ai" \
  /Users/muze/gitee/npcink-ai-cloud \
  /Users/muze/gitee/npcink-abilities-toolkit \
  /Users/muze/gitee/npcink-governance-core-primary-site-docs \
  /Users/muze/gitee/npcink-ai-client-adapter \
  /Users/muze/gitee/npcink-toolbox \
  /Users/muze/gitee/npcink-cloud-addon \
  /Users/muze/gitee/npcink-eval-lab \
  --glob '!**/.git/**' \
  --glob '!**/docs/archive/**' \
  --glob '!**/docs/naming-residual-allowlist-2026-06-24.md' \
  --glob '!**/generated/**' \
  --glob '!**/vendor/**' \
  --glob '!**/node_modules/**' \
  --glob '!**/build/**' \
  --glob '!**/dist/**'
```

If a broad-scan result is not covered by this allowlist, treat it as a cleanup
candidate.
