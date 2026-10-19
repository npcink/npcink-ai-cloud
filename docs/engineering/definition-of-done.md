# Definition of Done (Cloud)

Status: active engineering checklist for agent-delivered changes.

Companion to root [`AGENTS.md`](../../AGENTS.md). Does not authorize production
Deploy.

A change is done only when all applicable items hold:

1. **Scope** matches the change envelope; non-goals stayed out.
2. **Boundary** preserved: Cloud is not a WordPress write owner or second local
   control plane ([cloud-content-generation-boundary-v1.md](../cloud-content-generation-boundary-v1.md)).
3. **Tests / gates** for the changed seam ran and passed (or were explicitly
   marked not applicable with reason). Prefer
   [verification-commands.md](verification-commands.md).
4. **PR body** includes Scope, Boundary, Verification, and Risk when publishing
   ([pr-contract.md](pr-contract.md)).
5. **No secrets** or production credentials in the diff, receipts, or chat.
6. **Evidence states** are named separately (local / CI / M4 / production /
   human). Green CI is not production proof.
7. **Paused features** stay paused unless a reviewed source change restores them
   ([reversible-feature-pauses-v1.md](../reversible-feature-pauses-v1.md)).
8. **Human acceptance** is required for merge/release outcomes the operator
   requested; agents do not self-certify production readiness.

Phase 1 product Done for the editor loop additionally follows
[wordpress-ai-loop-verification-checklist-2026-09-22.md](../wordpress-ai-loop-verification-checklist-2026-09-22.md).
