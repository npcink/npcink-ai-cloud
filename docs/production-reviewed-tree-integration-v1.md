# Reviewed-tree production integration v1

Status: local candidate preparation; never production authorization.

## When this lane applies

Production squash promotions can have a distant merge base even when their
complete source tree equals an already-reviewed master commit. A later normal
merge may conflict on historical files outside the actual release delta.
Do not resolve those files by guessing, rewriting branches, changing merge
protection, or merging accumulated production history back into master.

This bounded lane is available only when the **entire current production tree**
equals a master ancestor of the frozen reviewed release source. That equality
proves no production-only source protection is being discarded. If it does not
hold, stop: classify and forward-port each production-only difference through
a separate reviewed fix before using this lane.

## Prepare and review

1. Fetch `origin/master` and `origin/production`. Freeze the production SHA,
   reviewed master SHA, equivalent master baseline SHA, exact changed-path list,
   master CI receipt, and rollback plan. A later master commit is a separate
   batch; it must not silently expand this frozen scope.
2. Run the tool without `--apply` and inspect the JSON plan:

   ```bash
   python3 .github/scripts/prepare-production-integration.py \
     --production-sha <full-production-sha> \
     --reviewed-master-sha <full-reviewed-master-sha> \
     --equivalent-master-sha <full-equivalent-baseline-sha> \
     --reviewed-paths-file <reviewed-paths.txt> \
     --branch release-fix/<unique-reviewed-release>
   ```

3. Repeat with `--apply` only after the plan matches the reviewed release. It
   creates one new **local** branch with a single-parent integration commit:
   current production is its parent, and its tree is exactly the reviewed master
   tree. The commit message binds the reviewed master identity and scope hash.
   This also fits the publisher's linear-commit replay contract; no merge commit
   or historical development commits need replaying. The ref update cannot
   overwrite an existing branch. It does not touch any checkout, index,
   existing branch, remote, or runtime.
4. Verify `git diff <production-sha> <candidate-sha>` against the reviewed
   paths and patch, `git diff <reviewed-master-sha> <candidate-sha>` is empty,
   and `git merge-tree --write-tree <production-sha> <candidate-sha>` succeeds
   with the same tree. Review changed security/CI/release files explicitly;
   whole-tree equality does not replace their original content review.
5. Save the JSON receipt and path/patch evidence outside the candidate source.
   Review the candidate separately from any tooling or documentation changes.
   Never add convenience fixes to the frozen release tree.

All SHA arguments are full commit identities. The tool checks locally fetched
tracking refs, not live GitHub state; refresh and recheck both remote identities
before publication. It rejects shallow history, mismatched scope, an existing
candidate branch, a source outside fetched master history, and a production
baseline mismatch. It does not verify that a source's review or CI passed.
The path-list hash binds scope, not content approval: exact source CI and the
original review remain necessary.

## Later publication remains separately gated

This tool does not create a PR, request auto-merge, dispatch certificate
readiness, build images, invoke a Provider, edit production configuration, or
deploy. A local candidate is not merged, accepted, or production-ready.

After publication is authorized, use the candidate's own clean worktree and
the normal publisher with `--base production`, the standard PR template, the
operator-approval sentence, promotion preflight, and all required checks. The
existing `release-fix/*` head contract and protected squash policy remain in
force. Recheck live production and frozen source identities; if either release
input changes, stop and prepare a fresh uniquely named candidate with a fresh
reviewed scope. Never force-push an old candidate to fit new inputs.

The snapshot does not import master ancestry into production. This lane makes
equivalent-tree integration repeatable; it does **not** claim
to permanently align the branch graph. Each later release still validates its
own baseline and scope. A merge-strategy change would be a separate policy
decision, not a hidden exception in this repair.

## Verification and rollback

Run the focused `tests/dev/test_prepare_production_integration.py`, existing
promotion/base-contract tests, and `pnpm run check:release-policy`. This is
Git/process-only work: no M4 or paid Provider evidence is needed. Existing
application evidence is reusable only because the candidate tree is identical
to the reviewed source, not because a skipped CI lane was green.

Before publication, leave the local candidate unmerged to withdraw it; existing
branches and runtimes need no rollback. After production publication, use the
normal production release/rollback policy and exact prior bundle identities.
Never reset production, erase database records, or treat a source revert as a
completed runtime rollback.
