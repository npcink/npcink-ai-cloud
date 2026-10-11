# Performance and Security Remediation Closeout and Standard v1

Status: active engineering record and reusable development standard.

Date: 2026-09-12

## Purpose

This document records the September 2026 Cloud performance and security review,
the fixes that reached `master`, and the verification evidence that supports
future work. It is a development and runtime standard, not production release
authorization.

## Findings and decisions

| Finding | Remediation | Durable rule |
| --- | --- | --- |
| Statistics loaded all historical runs and Provider calls before filtering | Push time-window predicates into SQL and add `site_id + started_at` and `created_at + run_id` indexes | Heavy analytics must bound data at the database boundary; output limits are not scan limits |
| Public callbacks shared the general `/v1/` rate pool | Give `/open/` its own Nginx rate zone | Public callback traffic needs an independent budget from runtime traffic |
| Browser security headers lacked CSP and Permissions Policy | Add CSP Report-Only and disable unused browser capabilities | Observe CSP violations before enforcement; keep browser capability allowlists explicit |
| External rerank calls could exhaust worker/upstream concurrency | Add a configurable bounded semaphore with overload failure | Every external Provider call needs timeout, concurrency, and safe fallback behavior |

## Evidence

- PR #939 merged to `master` at commit `7fcbc3a3adc0d72768f983611e13a8eaab24c5ae`.
- M4 promotion reached `acceptance_state=accepted` from clean `origin/master`.
- Alembic head: `20260912_0083`.
- Local focused tests: health/statistics suite 30 passed; Site Knowledge suite 55 passed.
- M4 focused health/statistics tests: 26 passed.
- M4 focused Site Knowledge tests: 46 passed.
- CI passed backend static, backend pytest shards, frontend, CodeQL, secret scan,
  dependency audit, PostgreSQL regression, and production image smoke.

## Required follow-up gates

1. Run production-scale `EXPLAIN (ANALYZE, BUFFERS)` and record scan rows and
   P95/P99 latency for analytics endpoints.
2. Collect CSP Report-Only violations from real browser paths, then narrow the
   policy before changing to enforcement.
3. Exercise OAuth, payment callback replay, CSRF, forwarded-header, and rate
   limit behavior in a controlled dynamic security run.
4. Revisit full Runtime async boundary design before converting synchronous
   Provider calls to async clients; do not perform a local one-call rewrite.

## Rollback and ownership

Rollback is a reviewed revert of the merged change followed by the normal M4
promotion path. The database index migration has a downgrade path. M4 owns
runtime execution and evidence; the authoring worktree owns source and Git.
Production remains a separate operator-authorized release lane.

## Reusable review checklist

- Bound heavy reads in SQL before applying application-level limits.
- Separate rate and concurrency budgets by route and tenant scope.
- Use safe failure and redaction for external Provider calls.
- Add security headers at every response boundary, including the reverse proxy.
- Keep candidate, merged, accepted-M4, and production evidence distinct.
- Record unresolved dynamic or scale-dependent risks as explicit follow-up gates.
