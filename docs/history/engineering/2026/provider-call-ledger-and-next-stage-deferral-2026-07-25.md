# Provider Call Ledger And Next-Stage Deferral — 2026-07-25

Status: source/local verified. This record is the operator entrypoint for
future bounded real-Provider experiments. It does not authorize a Provider
call, production change, M4 mutation, WordPress plugin change, or GA rollout.

## Decision

Use one minimal local shared ledger before any future real-Provider experiment.
The ledger lives under the Git common directory of the Cloud clone, so all
worktrees of that clone observe the same budget. Each real Provider dispatch
must successfully claim exactly one call before it is sent.

This is deliberately development/operator tooling:

- it is not a Cloud API;
- it is not stored in PostgreSQL;
- it is not runtime quota, entitlement, AI-credit, invoice, or billing truth;
- it does not change Provider routing or execution;
- it does not own WordPress approval, preflight, audit, or writes;
- it records only bounded identifiers, counters, timestamps, and a close
  reason code—never prompts, results, credentials, commands, or customer
  content.

The default state is local and untracked:

```text
$(git rev-parse --git-common-dir)/npcink-provider-call-ledgers/
```

Files are mode `0600`; the state directory is mode `0700`. An exclusive file
lock and same-directory atomic replacement serialize initialization, claims,
status reads, and close operations.

## Operator Flow

Initialize one experiment and reserve the complete budget:

```bash
pnpm run provider:call-ledger init \
  --experiment-id provider-trial-20260725 \
  --max-calls 30 \
  --item title-e2e=3 \
  --item browser-cohort=27
```

Immediately before each real Provider dispatch, claim exactly one call:

```bash
pnpm run provider:call-ledger claim \
  --experiment-id provider-trial-20260725 \
  --item-id title-e2e \
  --dispatch-id title-e2e-001
```

Only a zero exit status and
`"provider_dispatch_allowed": true` authorize that one dispatch. A claim is
conservative: if execution stops after the claim but before the upstream call,
the call is not refunded. Reusing the same dispatch ID for the same item is an
idempotent replay and does not consume another call. Reusing it for another
item fails closed.

Inspect or close the experiment:

```bash
pnpm run provider:call-ledger status \
  --experiment-id provider-trial-20260725

pnpm run provider:call-ledger close \
  --experiment-id provider-trial-20260725 \
  --reason-code completed
```

Budget exhaustion, item exhaustion, an unknown item, a closed ledger, corrupt
state, or an expanded state shape returns a non-zero exit and forbids the
dispatch.

## Scope And Limitations

The ledger closes the concrete same-clone/concurrent-worktree failure that
allowed a requested maximum of thirty calls to become thirty-nine calls. It
does not technically prevent a human, another clone, another machine, or an
unmodified external script from bypassing the CLI. Therefore:

1. name this ledger in the change envelope before any paid call;
2. use one controlling Cloud clone for the experiment;
3. require a successful claim immediately before every dispatch;
4. reconcile final Provider records with ledger claims;
5. stop the experiment if bypass or aggregate uncertainty appears.

Do not convert this local guard into a new public API or runtime control plane
without a separate architecture and boundary review.

## Deferred Next-Stage Work

The user explicitly deferred the following work:

| Item | Lifecycle | Reopening condition |
| --- | --- | --- |
| Python 3.14.6 CVE exception resolution | deferred but time-bound | act on the first supported fixed image candidate; current exception expires `2026-08-05` |
| Small real-user/real-editor observation loop | deferred | start only after the CVE exception is resolved and a bounded trial is approved |
| Intentional `master` to production promotion for that trial | deferred | define the exact release scope after the security gate passes |
| Gateway settlement-price acceptance | `deferred_until_real_user_or_invoice_evidence` | reopen for a trustworthy tariff, invoice, settlement record, first paid-user decision, or explicit spend threshold |
| Further cache/latency optimization | deferred | reopen only when absolute spend, latency, or user evidence shows material benefit |
| Streaming and additional CMS/platform expansion | deferred | reopen only under a versioned connector contract and measured product demand |

These deferrals do not authorize unlimited Provider spend and do not convert
the official OpenAI list-price runtime estimate into gateway settlement or
user billing truth.

## Verification

Required focused gate:

```bash
.venv/bin/python -m pytest tests/scripts/test_provider_call_ledger.py -q
.venv/bin/ruff check scripts/provider_call_ledger.py tests/scripts/test_provider_call_ledger.py
git diff --check
```

The tests must prove:

- identical initialization is idempotent and a changed budget fails;
- per-item and aggregate budgets fail closed;
- duplicate dispatch IDs do not double count;
- concurrent CLI claims never exceed the shared budget;
- corrupt or expanded JSON state fails closed;
- independent worktrees resolve the same default state directory;
- closing the ledger prevents further claims.

Local verification on `2026-07-25` passed:

- `7` focused tests, including a `20`-process race for `7` available claims;
- Ruff over the script and focused tests;
- system Python `3.9` CLI initialization, claim, idempotent replay, and
  item-budget rejection;
- `git diff --check`.

This is a local-only development-tool lane under the M4 Preview AI Development
Standard. It changes no Cloud runtime source, dependency, image, Compose,
migration, API, worker, frontend, or WordPress behavior, so no M4 candidate
sync or deployment is required.

## Rollback

Revert the script, focused test, package command, and this record. Local ledger
files may be retained as scalar evidence or removed by the operator after the
experiment is reconciled. No database, runtime, production, Provider, or
WordPress rollback is required.
