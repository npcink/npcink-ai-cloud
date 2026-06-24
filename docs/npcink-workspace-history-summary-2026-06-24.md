# Npcink Workspace History Summary - 2026-06-24

Status: local handoff summary.

This document summarizes the recent workspace cleanup, naming reset, archive
work, and current development baseline after the Magick AI to Npcink transition.
It is intentionally a high-level index; detailed evidence remains in the linked
closeout and harvest documents.

## Why This Work Happened

The initial request was a naming reset. During review, the work expanded because
the repositories were still carrying several kinds of historical residue:

- active package, repository, route, option, prefix, and documentation names
  still using retired Magick AI identifiers;
- temporary worktrees and acceptance clones that made the canonical development
  paths unclear;
- compatibility code that was not needed because the project is still in
  development and has no external compatibility burden;
- an old aggregate workspace at `/Users/muze/gitee/magick-ai-root` that still
  contained useful historical contracts but was no longer an active source of
  truth.

The guiding decision was to use the development phase to make primary keys,
namespaces, local paths, and repository ownership clean instead of preserving
aliases for old names.

## Completed Naming And Namespace Reset

The current canonical local repositories are:

| Area | Canonical path | Branch |
| --- | --- | --- |
| Cloud service | `/Users/muze/gitee/npcink-ai-cloud` | `master` |
| Cloud Addon | `/Users/muze/gitee/npcink-cloud-addon` | `master` |
| Abilities Toolkit | `/Users/muze/gitee/npcink-abilities-toolkit` | `master` |
| Governance Core | `/Users/muze/gitee/npcink-governance-core` | `master` |
| AI Client Adapter | `/Users/muze/gitee/npcink-ai-client-adapter` | `master` |
| Toolbox | `/Users/muze/gitee/npcink-toolbox` | `master` |
| Eval Lab | `/Users/muze/gitee/npcink-eval-lab` | `main` |

Completed reset themes:

- Cloud active route identity now uses the Npcink namespace, including
  `/npcink/open/v1`.
- Eval Lab was renamed to `npcink-eval-lab`, with package, constants, and PHP
  prefixes aligned.
- Caller repositories were updated to consume current Npcink repository and
  package names.
- Cloud Addon legacy option compatibility was removed because there is no
  external compatibility burden.
- Toolbox legacy menu slug compatibility was removed.
- Abilities Toolkit records that retired `magick-ai/*` ability ids are invalid
  for new active runtime paths and should not receive an alias layer.

Detailed record:
`docs/npcink-naming-reset-closeout-2026-06-24.md`.

## Workspace Cleanup

Completed local cleanup:

- Removed temporary acceptance clones:
  - `/Users/muze/gitee/npcink-governance-core-acceptance-clone`
  - `/Users/muze/gitee/npcink-ai-client-adapter-acceptance-clone`
- Removed detached acceptance worktrees:
  - `/Users/muze/gitee/npcink-governance-core-acceptance`
  - `/Users/muze/gitee/npcink-ai-client-adapter-acceptance`
- Normalized Core development back to:
  - `/Users/muze/gitee/npcink-governance-core`
- Deleted old local Core branch:
  - `codex/npcink-governance-core-rename`
- Dropped the temporary Core stash that only backed up
  `.sisyphus/session-breadcrumb.md`.
- Removed the old Gitee remote from the local `npcink-cloud-addon` clone so
  normal publishing uses GitHub `origin`.

The default publishing posture for this repo family is GitHub first. Do not
proactively sync to Gitee unless explicitly requested.

## Old Magick Root Handling

The old aggregate workspace `/Users/muze/gitee/magick-ai-root` was reviewed
before deletion.

Useful material was migrated or indexed:

- key Cloud/Core/Addon boundary contracts were copied into
  `docs/legacy-contracts/magick-ai-root/`;
- a harvest inventory was written at
  `docs/magick-ai-root-harvest-inventory-2026-06-24.md`;
- local Codex skills that previously pointed at the old root were updated to
  use the copied legacy-contract docs instead.

Regenerable directories such as `node_modules`, `dist`, `vendor`,
`.phpstan.cache`, `coverage`, and `test-results` were removed from the old
workspace before final archiving.

The old workspace had local-only Git history and dirty files, so it was archived
before deletion:

`/Users/muze/gitee/_archives/magick-ai-root-20260624T023712+0800`

The archive contains:

- `magick-ai-root-all-refs.bundle`
- `working-tree.diff`
- `staged.diff`
- `untracked-files.tgz`
- status, log, remotes, branches, and tags metadata

After bundle verification and a clone smoke test, the old
`/Users/muze/gitee/magick-ai-root` directory was deleted.

## Preserved Historical Or Local Names

Not every `magick-ai` string is a problem.

Allowed historical/local residuals:

- `https://magick-ai.local/` remains the primary local WordPress deployment and
  test site.
- `/Users/muze/Local Sites/magick-ai/app/public` remains the matching local
  WordPress path.
- archive docs, migration records, and harvest notes may name retired Magick AI
  identifiers when they explicitly describe history.
- old commerce add-on ids such as `magick-ai/wc-*` were not migrated in this
  pass and require a separate commerce/ability namespace decision.

Review aid:
`docs/naming-residual-allowlist-2026-06-24.md`.

## Current Development State

At the time this summary was written:

- `/Users/muze/gitee/npcink-ai-cloud` is on `master`.
- Local `master` is synchronized with `origin/master`.
- The prior `backups/` directory and previously observed portal/service dirty
  files are no longer present.
- New feature work can start from the canonical repository paths above.

Recommended Core start command:

```bash
cd /Users/muze/gitee/npcink-governance-core
git switch master
git pull --ff-only
git switch -c codex/<feature-name>
```

For Eval Lab, use `main` instead of `master`.

## Remaining Watch Items

These are not blockers for new feature development:

- `/Users/muze/gitee/npcink-eval-lab-local-untracked-before-canonical-main-20260624`
  may still exist as an old generated-artifact backup. Remove it only when its
  image-generation evaluation evidence is no longer needed.
- Commerce ability ids such as `magick-ai/wc-*` need a separate namespace
  migration map before they are changed.
- Future MCP, managed GEO, router projection, and Cloud operator UI work should
  consult the legacy contract harvest before implementing new surfaces.

## Practical Rule Going Forward

Use current Npcink names for active package, route, option, repository, ability,
and runtime identities.

Do not add compatibility aliases for retired Magick AI names unless a separate
contract explicitly requires them. During the development phase, prefer a direct
rename and contract-test update over carrying historical compatibility code.
