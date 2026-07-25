# Public Frontend Development Retrospective And Standard — 2026-07-25

Status: completed development closeout and reusable working standard.

Scope: the public homepage, public navigation and documents, service-status
explanation, package presentation, Portal authentication entry, visual
regression, and the personal M4 preview loop completed on 2026-07-24 and
2026-07-25.

This is an evidence and working-method record. It does not create a new product
boundary, approve production, certify QQ Open Platform review, or turn Cloud
into a WordPress control plane or general-purpose CMS.

## 1. Executive Summary

The public frontend evolved from a sparse technical landing page into a bounded
product and onboarding surface:

- the homepage explains the hosted runtime value and keeps final control in
  WordPress;
- public navigation exposes capabilities, working boundary, packages, service
  status, and help;
- Free, Plus, Pro, and Agency are compared from the anonymous public plan
  projection instead of hard-coded commercial truth;
- public service health is translated into impact and next actions, with a
  dedicated status page for detail;
- QQ login appears on the actual login and registration paths without making
  QQ subject identifiers the permanent user identity;
- privacy, terms, operator-maintained compliance disclosure, and public contact
  facts have explicit ownership;
- desktop, mobile, and dark-mode visual contracts now cover the most important
  public surfaces;
- source remains on the authoring Mac, Docker remains on M4, and the personal
  browser uses one loopback-only SSH tunnel in both office and dormitory
  networks.

The important lesson is that a homepage is not complete when it merely looks
better. It is complete only when product meaning, commercial truth, service
status, authentication, compliance, responsive behavior, visual evidence, Git
review, and the accepted runtime state agree.

## 2. Delivery History

| Stage | Merged evidence | Outcome |
| --- | --- | --- |
| Public onboarding and QQ entry | `6170df88` | Added the public shell, help/status/legal routes, and bounded QQ login entry |
| Public package projection | PR `#250`, `1da524b4` | Added dynamic Free / Plus / Pro / Agency pricing and rights comparison |
| Personal preview auto-route | PR `#253`, `1cfa808a` | Unified office LAN and dormitory Tailscale preview behind one loopback URL |
| Public/Portal product gaps | PR `#259`, `b12eab52` | Closed remaining public and Portal explanation gaps |
| Versioned compliance workspace | PR `#263`, `dbd892d6` | Added draft/publish separation for operator-maintained public disclosures |
| Homepage service status | PR `#265`, `dd243093` | Added a human-readable public status summary and detail path |
| Central public navigation | PR `#267`, `85747738` | Removed page-local menu drift while keeping navigation code-owned |
| Homepage information architecture | PR `#270`, `3fc59bc5` | Rebalanced the first viewport, content sequence, pricing density, and mobile interaction |
| Dark header correction | PR `#272`, `f06d2dbb` | Restored dark-mode header contrast and added a dedicated visual assertion |

At the end of the application-code sequence, the clean M4 Preview runtime was
accepted from merged `master` revision `f06d2dbb`; the focused marketing suite
reported `3 passed`. Later documentation-only commits may advance `master`
without rebuilding that unchanged application runtime.

## 3. Product And Information Architecture Decisions

### 3.1 The first viewport must answer four questions

Before a visitor scrolls, the page should establish:

1. what the service is;
2. who it is for;
3. what remains under the user's control;
4. what the primary next action is.

For this product, the concise answer is hosted AI execution for WordPress,
with review and publishing control retained by the site owner. Internal terms
such as runtime directory, usage ledger, or operator diagnostics can support
the explanation later, but they must not be the hero's primary language.

### 3.2 Page order follows the visitor's decision path

The useful sequence is:

```text
value and primary action
  -> live public status
  -> capability and trust facts
  -> Cloud/WordPress responsibility boundary
  -> package and rights comparison
  -> final action
```

This order prevents pricing from appearing before value, and prevents
technical health data from becoming an unexplained monitoring console.

### 3.3 Service status is public; private diagnostics are not

The homepage may summarize whether the public entry is operational and link to
`/status`. The public status page explains impact and offers a fresh check.
Site-specific runs, usage evidence, internal topology, provider configuration,
and detailed diagnostics remain authenticated Portal or platform-admin
surfaces.

### 3.4 Commercial presentation reads canonical data

The public frontend may control headings, explanatory copy, visual emphasis,
and layout. It must not independently own prices, limits, purchase mode, or
trial eligibility.

- published `plan_versions` own limits and entitlements;
- active global `plan_offers` own public Plus and Pro prices;
- Free is the zero-price entry;
- Agency is quote-based and must not receive an invented public price;
- missing or retired commercial facts render as unavailable rather than
  falling back to stale frontend constants.

The complete contract is
[Public Plan Catalog And Homepage Display v1](public-plan-catalog-and-homepage-display-v1.md).

### 3.5 QQ is an authentication option, not identity truth

QQ login belongs on the login and registration surfaces required by actual
users and QQ Open Platform review. The stable Cloud identity remains
`principal_id`; QQ OpenID/UnionID-style values are provider bindings.

Real callback URLs, application identifiers, enabled state, and review
material must come from operator configuration and the actual deployment.
Development placeholders do not prove external review readiness.

### 3.6 Keep page management deliberately small

The current public navigation is code-owned in
`frontend/src/lib/public-navigation.ts`. Public compliance facts use a bounded,
versioned operator workspace with draft and publish separation.

Do not introduce a general database-backed page builder merely to edit a few
menus or policy facts. A heavier CMS becomes justified only when repeated,
non-developer publishing needs require:

- multiple independent content authors;
- scheduled publication or revisions;
- arbitrary page creation and ordering;
- reusable content blocks across many pages;
- an approval workflow beyond the existing compliance projection.

Even then, page content must not become commercial, authentication, runtime,
WordPress workflow, or final-write truth.

## 4. Visual Design And Regression Standard

### 4.1 Review the page as a system

A full-page screenshot alone is too coarse. It can pass while the hero is too
tall, pricing is difficult to scan, or the header loses contrast. Public
frontend review must cover:

- desktop and mobile;
- light and dark themes;
- the first viewport;
- the pricing section;
- mobile menu and package accordion behavior;
- live-data loading, success, unavailable, and error postures.

### 4.2 Stable screenshot prerequisites

Before capturing:

- wait for `document.fonts.ready`;
- emulate reduced motion;
- disable animations and hide the caret;
- stub health and public plan responses with deterministic fixtures;
- use the repository's fixed viewport and screenshot names.

The current marketing test keeps a `0.02` maximum differing-pixel ratio. Do not
raise that tolerance to hide a real layout change.

### 4.3 Update an obsolete baseline intentionally

When the intended page height or composition changes, the old image is no
longer the contract. The correct sequence is:

1. inspect the diff and confirm it matches the approved design;
2. review desktop, mobile, hero, pricing, and dark-header captures;
3. replace only the affected baselines;
4. rerun the test against the new files;
5. record why the baseline changed in the PR.

An unexplained percentage difference is not a reason to loosen the threshold.

### 4.4 Dark mode requires computed-style proof

The header defect showed that a plausible Tailwind class can still compile to
no useful rule. The invalid `dark:bg-[#09101c]/88` variant left the sticky
header without the intended dark background.

For critical contrast, assert both:

- the computed CSS value, such as
  `background-color: rgb(9, 16, 28)`;
- a focused screenshot of the header.

This catches invalid utility syntax, class omission, and broader visual
regression without relying on a full-page image alone.

## 5. Personal Preview And Delivery Model

### 5.1 Ownership

| Concern | Owner |
| --- | --- |
| Source editing, worktrees, Git, PR initiation | authoring Mac |
| Development Docker build and runtime | office M4 |
| Merge authority | GitHub required checks on `master` |
| Personal browser entry | authoring Mac `127.0.0.1:18010` |
| External review and QQ audit | separately deployed real server |
| Production | `production` branch and production release policy |

M4 is not a second Git checkout or source control plane. The relay is not a
runtime. The public domain is not the default personal preview.

### 5.2 Company and dormitory use one command

Run:

```bash
pnpm run m4:preview:auto
```

The browser always opens:

```text
http://127.0.0.1:18010
```

The command tests M4-local HTTP through office LAN first and Tailscale second,
then opens a loopback-only SSH forward to M4 `127.0.0.1:8010`. A successful TCP
connection alone is not considered application health.

For the seeded development identity, use the documented `/portal/dev-entry`
URL. The normal `/portal/login` path sends a real email verification code.
Without configured email delivery, `portal.email_not_configured` is the
expected fail-closed response, not a bad demo password.

See
[M4 Personal Preview Auto-Route Retrospective](m4-personal-preview-auto-route-retrospective-2026-07-25.md)
for the exact URL and troubleshooting table.

### 5.3 Source sync is deliberate, not per-save automation

Saving or committing a file does not automatically mutate M4. Once a user has
authorized a Cloud code task, the active agent should dispatch a coherent
candidate checkpoint without asking for a second deployment instruction:

- use `m4:preview:sync` when dependency and build inputs are unchanged;
- use `m4:preview:deploy` when they changed;
- treat the script's dependency-fingerprint refusal as a fail-closed request to
  deploy, not as a broken sync;
- do not add a file watcher, Git hook, background daemon, or GitHub-held M4
  credential.

Documentation-only changes do not trigger M4.

### 5.4 Candidate and accepted states stay separate

The closed loop is:

```text
source/static checks
  -> M4 candidate
  -> focused browser/runtime evidence
  -> PR and required checks
  -> merge to master
  -> clean master promotion
  -> accepted M4 smoke
```

A reachable candidate page does not prove review or merge. A merged PR does
not prove that M4 runs the merged revision. Production and external QQ review
remain later, separately authorized gates.

## 6. Transfer And Dependency Lessons

### 6.1 The 4.6 MB delay was a path problem

Direct SFTP, SCP, and raw SSH had similarly poor throughput over the
endpoint-to-endpoint relay path. The compressed source bundle was already
small; changing file-transfer syntax or compressing it again could not remove
the dominant round-trip/path cost.

ADR-026 split the transfer into two independently terminated links:

```text
authoring Mac -> private Tailscale relay -> M4
```

The 4,823,040-byte proof completed upload through M4 SHA-256 verification in
18 seconds. Candidate observations then moved similar bundles in seconds per
leg. Size and SHA-256 are verified before extraction, and transient relay state
is removed on success and failure.

### 6.2 A source relay is not a webpage proxy

The relay exists only as a transient byte buffer. Using it as the personal
website entry would add persistent reverse-proxy, cookies, WebSocket, logging,
availability, and security responsibilities while making the browser path
longer. SSH local forwarding is the smaller and safer personal-preview
solution.

### 6.3 Package timeout required streaming and reuse

The old package proxy buffered a complete wheel or npm tarball before returning
headers. Its upstream timeout was 120 seconds while pip/pnpm could give up
after 60 seconds. The later `BrokenPipeError` was a downstream consequence.

ADR-027 fixed the mechanism:

- stream immutable artifact bodies after upstream headers;
- populate an atomic, validated M4 cache;
- keep metadata buffered for safe URL rewriting;
- use bounded 300-second client timeouts and retries;
- reuse the BuildKit pnpm store;
- keep canonical lock files and package integrity as dependency truth.

Cold-cache validation crossed the old timeout window successfully: pip
completed in `88.1 s`, pnpm installed 430 packages in `146.5 s`, and the cache
stored about 220 MB with no partial files. A warm 12,178,508-byte artifact was
served locally in about `0.0069 s`.

This removes repeated cold downloads; it cannot guarantee that every first-time
upstream artifact is fast. Cold misses remain bounded and observable rather
than silently hanging.

## 7. Time Accounting Standard

Do not describe the whole delivery interval as “frontend coding time”. Report
at least:

1. source and design work;
2. local static or focused checks;
3. source transfer;
4. M4 image build or container restart;
5. browser/runtime tests;
6. PR required checks and queue time;
7. rebase or branch-advance reruns;
8. post-merge accepted promotion and smoke.

The long tail in this cycle came mainly from deterministic builds, protected CI
and accepted-state closure. The transfer issue was real, but after ADR-026 it
was no longer the dominant duration. Clear stage timing prevents an eight-minute
CI gate or a dependency rebuild from being misreported as thirty minutes of
page editing.

## 8. Work Review

### Original goals

- turn a technical placeholder homepage into a credible public product entry;
- hide internal/admin emphasis from ordinary visitors;
- expose human-readable health, packages, rights, help, and legal information;
- support QQ review through a real authentication entry;
- provide lightweight navigation/content management without creating a heavy
  CMS;
- make office and dormitory personal preview fast and predictable;
- close source, runtime, Git, and accepted evidence rather than stopping after
  local edits.

### Completion

The application-code goals are merged and were accepted on M4 at `f06d2dbb`.
The remaining external facts—real operating entity/contact, final
refund/retention terms, complete third-party list, and QQ callback/review
material—still require truthful operator input and a real review deployment.
They must not be guessed by code or documentation.

### Problems found

| Severity | Specific problem | Root cause | Improvement |
| --- | --- | --- | --- |
| High | The original homepage mainly exposed Portal, admin, and health actions | Work started from available routes instead of a visitor decision inventory | Freeze audience, value, trust, package, status, compliance, and CTA requirements before layout work |
| High | Dark-mode header text became unreadable | Critical contrast relied on an invalid utility class and light-theme coverage | Assert computed CSS plus a focused dark screenshot |
| Medium | The full-page baseline became stale and obscured layout quality | One tall screenshot carried too much of the visual contract | Keep full-page evidence but add stable hero, pricing, mobile, and header captures |
| Medium | The first layout remained too long and repetitive | Sections were added incrementally without a total page rhythm budget | Review first viewport, section purpose, repetition, and mobile scan length together |
| Medium | A small source bundle took minutes over the direct path | Diagnosis initially focused on SFTP rather than the shared network path | Compare transports, localize the bottleneck, then change topology with measured integrity proof |
| Medium | First-time dependency builds timed out on individual artifacts | Whole-body buffering and mismatched timeouts amplified intermittent registry latency | Stream bodies, validate/cache immutable artifacts, retain bounded cold-miss behavior |
| Medium | End-to-end completion appeared to be “30 minutes of frontend work” | Build, CI, rebase, promotion, and smoke were not surfaced as separate stages | Report stage timing and the currently active gate |
| Low | Demo email login returned `portal.email_not_configured` | A seeded development identity was used on the real email-code route | Use `/portal/dev-entry` for local preview and reserve `/portal/login` for configured email delivery |

### What worked well

- Product copy consistently preserved the Cloud/WordPress control boundary.
- Commercial data was projected from canonical plan facts instead of duplicated
  into a page manager.
- Service status was made understandable without exposing private diagnostics.
- The preview solution kept one browser URL and did not widen M4 network
  exposure.
- Transfer and dependency fixes were based on measurements, integrity checks,
  failure cleanup, and explicit rollback paths.
- Focused visual tests caught the dark-header regression and now guard the
  exact failure mode.
- Candidate, merge, accepted runtime, production, and external review claims
  remained distinct.

### Next focus

- obtain and publish truthful operating-entity, contact, refund, retention,
  third-party-service, and QQ review facts;
- validate QQ callback and authentication on the dedicated real review
  deployment;
- observe the public plan catalog's unavailable/error state in a browser smoke;
- periodically review whether page-management demand has actually crossed the
  threshold for a larger system;
- retain timing evidence so slow cold builds are not confused with source
  transfer regressions.

## 9. Quick Entry For Future AI Sessions

For the next public-frontend task:

1. run the repository startup protocol and preserve unrelated dirty work;
2. read this document plus the directly relevant public contract;
3. state the Cloud/WordPress boundary and a compact change envelope;
4. inventory the visitor question or failure before editing layout;
5. keep dynamic commercial, status, identity, and compliance truth in their
   existing owners;
6. test desktop/mobile and light/dark at the narrowest useful visual sections;
7. choose local-only, M4 sync, or M4 deploy from the actual changed inputs;
8. make candidate evidence visible, then complete PR/CI/merge;
9. promote clean merged source only when the lane requires M4 acceptance;
10. report production and external human review as separate states.

## 10. Related Authority

- [Development Validation Operating Model v1](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)
- [ADR-025: Source-Only Authoring And AI M4 Checkpoint Dispatch](decisions/025-source-only-authoring-and-ai-m4-checkpoint-dispatch.md)
- [ADR-026: Private Source Relay Transfer](decisions/026-private-source-relay-transfer.md)
- [M4 Private Source Relay Transfer Validation](m4-source-relay-transfer-validation-2026-07-24.md)
- [ADR-027: M4 Package Proxy Streaming Cache](decisions/027-m4-package-proxy-streaming-cache.md)
- [M4 Package Proxy Streaming Cache Validation](m4-package-proxy-streaming-cache-validation-2026-07-25.md)
- [ADR-028: Versioned Public Site Compliance Projection](decisions/028-versioned-public-site-compliance-projection.md)
- [Frontend Public/Portal Release Checklist v1](frontend-public-portal-release-checklist-v1.md)
