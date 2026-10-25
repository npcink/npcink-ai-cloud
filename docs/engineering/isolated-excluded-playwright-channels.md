# Isolated historical Playwright channels

Status: active local test runbook. This does not authorize deployment or real
installation. Portal remains PC-only under [Portal UI spec](../portal-ui-spec.md).

## Scope and entry points

The historical restricted 425-key selection had two native opt-in skips
(pending installation and optional mobile) and two additional safety exclusions
(complete installation and live metadata). Keep those historical results intact;
this runner exercises the four keys separately against current source.

```bash
pnpm --dir frontend run test:e2e:isolated-channels
pnpm --dir frontend run test:e2e:isolated-channels pending-install complete-install metadata
pnpm --dir frontend run test:e2e:isolated-channels optional-mobile
node scripts/test-cloud-isolated-channel-guard.cjs
```

The optional positional arguments select distinct channel names. Every invocation
builds current frontend source with webpack in the test environment, then runs
one worker and zero retries. It requires installed frontend dependencies and the
existing Chromium cache; it does not download dependencies or browsers.

Default receipts live in `frontend/test-results/isolated-channels-<timestamp>`.
Set `NPCINK_CLOUD_ISOLATED_OUTPUT` to a new local receipt directory if needed.
Do not reuse a receipt directory. Source inputs (including original snapshots)
are hashed before build and after execution. The frontend and local Mock bind
only loopback with fresh ports and stop after each channel. The runner never
uses the external frontend/backend targets inherited from the shell.

## Acceptance matrix

| Channel | Original contract and current check | Real local HTTP writes | Synthetic business writes |
| --- | --- | --- | --- |
| pending-install | Dedicated pending opt-in; admin/API/health gates, secret storage/URL checks, exact install payload and idempotency key, once-only key acknowledgement | POST health → 503; unknown setup route → 404, both handled by real Next | Browser fixtures answer setup session, database test and install; none reaches Next or upstream |
| complete-install | Setup page is 404/no-store and setup session POST is 404 `setup.already_complete` | POST setup session reaches real Next gate | None; upstream must remain unused |
| metadata | Advisor remains paused; current supplier page opens; authenticated metadata projection stays read-only with local WordPress write ownership; collapsed media workflow and technical metadata can be read | No frontend POST; dev-entry GET causes exactly one upstream **local Mock POST** `/admin/auth/login` | Mock login cookie and read-only upstream responses only; no Provider test or workflow execution |
| optional-mobile | Explicitly opts into the existing 390×844 login and register baseline assertions | None; login APIs remain browser fixtures | No submit action; observations only, outside PC acceptance |

Metadata's former `supplier=capability` tab and “Cloud runtime metadata” title
were superseded by the supplier IA consolidation (#1201). The bookmark still
opens the supplier page. Its ownership contract is now checked through
`GET /api/admin/agent-workflow-metadata`, the corresponding backend API contract,
and the retained media metadata panel. Advanced evidence and page explanations
must be opened/focused before asserting visibility. No old product tab is
restored to satisfy a historical assertion.

Original native skip conditions stay in the specs. The isolated runner supplies
their opt-ins; it does not remove tests or rewrite skip labels. Mobile screenshot
comparisons use soft assertions so a failed login comparison cannot suppress
the register comparison; either mismatch still fails the test and runner.
**Do not update baselines merely to make this channel green.**

## Bounded baseline maintenance (2026-10-25)

The retained Darwin mobile login image last entered Git in #830. Source/image
comparison attributed its 1270→1126px height change to the later #1079/#1080
label, footer and copy removals (24 + 64 + 56px). After review of those receipts,
the coordinating parent explicitly authorized maintaining only this baseline
using the already preserved actual image, SHA256
`6afda1ebb4b589c21b909b1c9c2df55b36b4d80e3895c5fb57d325c9b50ff85e`.
This is agent maintenance of a stale baseline, **not human mobile visual
acceptance**. Old expected/actual/diff and the failed run remain in task receipts.
Registration and PC baselines, product source, assertions and the 2% threshold
stay unchanged. The runner explicitly sets `updateSnapshots: 'none'`; the
maintenance does not use a batch snapshot-update command. Mobile remains an
optional observation outside the PC product gate. Merge authority follows the
current session authorization; this record grants no production authority.

## Network and evidence limits

The preloaded Node guard rejects non-allowlisted TCP, Unix socket and TLS
connections. It logs real frontend requests without bodies, cookies or query
strings and rejects all business writes accidentally missed by browser fixtures.
Only the original gate-probe POSTs are allowed into Next. The local Mock rejects
unknown routes/methods; only metadata has the synthetic login POST handler.
The browser context rejects external requests not already answered by page
fixtures. Request-API probes bypass page routes and are constrained by the Node
connection guard plus fixed loopback base URL. Guard self-tests exercise these
fail-closed paths before use.

Receipts distinguish browser responses, actual frontend HTTP and upstream Mock
HTTP. A successful lane requires exactly one passed original test, zero skips,
flaky tests, report errors and unexpected network events. Pending additionally
proves its three business POST responses occurred in-browser and never entered
Next. Complete and mobile require zero upstream calls. Metadata requires the
single synthetic login POST and all expected read paths.

This is a JavaScript process/browser-context guard, **not an OS sandbox**. The
build is fresh but is not run under that runtime guard. Native Chromium
background/OS subprocess egress is not independently proven. No result proves
real database installation, backend authentication, live Provider execution,
M4, production state or human visual acceptance. The API-only complete gate has
no original visual contract; do not invent a screenshot pass for it.
