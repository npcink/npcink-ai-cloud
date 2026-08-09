# Engineering Command Inventory Standard v1

Status: active repository policy.

Purpose: keep the root and frontend package command surfaces discoverable,
risk-classified, and removable through evidence instead of accumulating
undocumented aliases.

This standard governs package command entry points only. It does not authorize
production operations, change Cloud or WordPress ownership, or replace the
runbook that owns a command's behavior.

## 1. Sources of Truth

- `package.json` and `frontend/package.json` remain executable command truth.
- `config/engineering-command-inventory-v1.json` is the governance inventory.
- `config/ai-development-validation-rules-v1.json` maps changed domains to the
  minimum validation tier, required context, specialized local gate, and
  non-mutating follow-up evidence used by `check:changed` and CI.
- `scripts/check_engineering_command_inventory.py` verifies that both sources
  cover exactly the same command names and that every inventory entry has
  complete risk and lifecycle metadata.
- `tests/contract/test_engineering_command_inventory_contract.py` keeps the
  checker in the existing CI contract lane.

Do not add a second generated package file or another package command merely
to run the checker. Run it directly:

```bash
python3 scripts/check_engineering_command_inventory.py
python3 scripts/check_engineering_command_inventory.py --format markdown
```

## 2. Required Metadata

Every command inherits these fields from exactly one inventory group:

| Field | Meaning |
| --- | --- |
| `purpose` | The operator or developer job performed by the command. |
| `profile` | A reusable environment, side-effect, and approval classification. |
| `owner_doc` | The active document that owns safe use and recovery guidance. |
| `used_by` | Whether the entry is evidenced by CI, release, runbook, contract, automation, or manual use. |
| `status` | `active`, `review_required`, or `deprecated`. |
| `evidence` | Existing repository paths supporting the declared ownership or usage. |

The checker also derives `observed_usage` and `observed_evidence` from exact
`pnpm run ...` / `npm run ...` callers. In a Git worktree, `git ls-files`
remains the authoritative file list and untracked files do not affect the
result. In the controlled M4 source bundle, where `.git` is intentionally
absent, the checker uses a deterministic repository-root-bounded filesystem
fallback. That fallback excludes dependency, build, cache, test-report, and
temporary directories; rejects paths that escape the repository or cannot be
classified safely; and must not turn an unreadable command surface into a
silent skip. `manual` means no caller was found through the authoritative file
list available in that environment; it does not mean the underlying script or
operator workflow is automatically safe to delete. The Markdown report shows
this observed value so declared intent and actual repository callers are not
confused.

Profiles must state:

- environment: authoring Mac, local Docker, local browser, shared M4,
  remote host, production, GitHub CI, or external provider;
- effect: read-only, local-state mutation, source-tree mutation,
  shared-runtime mutation, remote-state mutation, production mutation, or
  external-call/quota consumption;
- approval: none, coordination when occupied, shared-runtime owner,
  provider budget, operator target, or production approval.

`read_only` describes the command's intended project-state effect. Test tools
may still create disposable caches and reports.

## 3. Lifecycle

Use the following lifecycle:

```text
active -> review_required -> deprecated -> removed
```

- `active`: current evidence or an explicit operator workflow justifies the
  entry.
- `review_required`: the entry may still be useful, but its package alias has
  no clear current CI, release, runbook, contract, or automation caller.
- `deprecated`: a named replacement exists. Keep the entry during the evidence
  window so callers receive a reviewable migration path.
- `removed`: delete the package entry and inventory entry together in a later
  focused PR after the removal condition is satisfied.

Deprecation is not deletion authority. A deprecated command must record both a
replacement and a removal condition. Do not batch-delete commands merely
because repository search found no caller; external operator habits and
runbooks must be checked first.

## 4. Change Rule

Any addition, rename, behavior change, deprecation, or removal under either
package `scripts` map must:

1. update the inventory in the same change;
2. keep the command in exactly one inventory group;
3. choose the smallest accurate risk profile;
4. name an active owner document and evidence path;
5. run the focused inventory contract;
6. update callers and runbooks before marking the old entry removable.

Focused gate:

```bash
.venv/bin/python -m pytest \
  tests/contract/test_engineering_command_inventory_contract.py -q
```

If the repository-local virtual environment is unavailable, the standard
library checker still provides the narrow structural gate:

```bash
python3 scripts/check_engineering_command_inventory.py
```

## 5. Current Baseline

After the reviewed legacy Mini Preview removal on 2026-08-03, the inventory
contains:

- root package: 110 commands;
- frontend package: 31 commands;
- total: 141 commands.

`check:changed` is the single-session local gate router. It classifies the
current diff, reports its tier and matched domain contracts, runs only focused
local checks, and reports browser or M4 work as follow-up evidence rather than
mutating shared or external systems. Domain rules remain declarative and
fail closed when their schema or command shape is invalid. PR CI reuses the
same selected specialized commands instead of maintaining a second path map.
`worktree:audit` inventories registered worktrees without unlocking, pruning,
removing, or changing them.

The nine legacy remote-Mac-mini preview aliases and their four dedicated
scripts were removed after repository search and operator review found no
current bounded-recovery caller. Governed `m4:preview:*` commands remain the
supported shared Cloud preview interface. Dated evidence continues to describe
the historical commands without keeping them executable.

This baseline is an observation and governance gate, not proof that every
active command should exist forever. Later cleanup must use the inventory's
usage, owner, replacement, and evidence fields rather than command-count goals.
