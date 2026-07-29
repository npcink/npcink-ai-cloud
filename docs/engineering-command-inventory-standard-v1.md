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
tracked `pnpm run ...` / `npm run ...` callers. `manual` means no tracked
package-alias caller was found; it does not mean the underlying script or
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

## 5. Initial Baseline

The v1 baseline inventories all commands without deleting any:

- root package: 115 commands;
- frontend package: 32 commands;
- total: 147 commands.

The legacy remote-Mac-mini preview aliases are deprecated because the current
development standard assigns the shared Cloud preview lane to governed M4
commands. Their scripts are retained for historical evidence and bounded
recovery until the recorded removal condition is reviewed.

This baseline is an observation and governance gate, not proof that every
active command should exist forever. Later cleanup must use the inventory's
usage, owner, replacement, and evidence fields rather than command-count goals.
