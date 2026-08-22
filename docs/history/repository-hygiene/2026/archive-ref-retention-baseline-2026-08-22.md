# Archive-Ref Retention Baseline - 2026-08-22

Status: historical evidence; not deletion authorization.

## Scope and Outcome

This receipt records the local Git archive-ref baseline after the 2026-08-22
repository stage-transition cleanup. It applies only to `refs/archive/**` in
this repository. No archive refs or bundles were deleted.

The inventory contained 173 refs:

| Namespace category | Ref count |
| --- | ---: |
| `damaged-worktrees` | 19 |
| `dirty-worktrees` | 8 |
| `local-branches` | 111 |
| `remote-branches` | 28 |
| `worktrees` | 7 |
| **Total** | **173** |

The dated namespace buckets were:

| Namespace date | Ref count | Earliest retention review |
| --- | ---: | --- |
| `20260808` | 100 | 2026-09-07 |
| `20260822` | 73 | 2026-09-21 |

These dates are the earliest times at which the respective refs may be
reviewed. Eligibility for review is not authorization to delete any ref.

## Recovery Evidence

All 173 refs were included in one complete baseline bundle:

- path: `/Users/muze/gitee/.archives/npcink-ai-cloud-stage-transition-20260822/archive-refs-baseline-20260822.bundle`
- size: 26,465,335 bytes
- mode: `600`
- SHA-256: `66fee41bb1f7f3d3e02f95b0f72725128f89472b70bab90c3f880253fe4ca54c`
- verification: `git bundle verify` passed on 2026-08-22

The bundle is external recovery evidence and is not committed to the
repository. It remains subject to the retention and explicit-review rules in
the [Repository Stage-Transition Cleanup Standard](../../../repository-stage-transition-cleanup-standard-v1.md).

## Boundaries and Rollback

This was a documentation-only, local Git evidence activity. It made no Cloud
runtime, M4, Provider, production, deployment, or WordPress mutation.

The documentation change can be rolled back by reverting its commit. The
external bundle remains available independently, and reverting documentation
does not authorize deleting it or any covered ref.
