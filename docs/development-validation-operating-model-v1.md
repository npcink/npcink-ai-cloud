# Development and Validation Operating Model v1

Status: active engineering guide.

Purpose: provide one durable entry point for feature development, bug fixes,
M4 Preview validation, Git publication, CI feedback, and post-merge
acceptance. This guide summarizes the development-system lessons learned during
the July 2026 M4 and CI remediation work. It links to the normative runbooks
and ADRs instead of duplicating their implementation detail.

This guide does not approve production deployment, change Cloud product
ownership, or replace any security, release, M4, or WordPress boundary.

## 1. The Operating Model

The approved topology is:

| Surface | Responsibility |
| --- | --- |
| Authoring Mac | source editing, narrow source/static checks, Git, PR, and operator commands |
| GitHub `master` | reviewed development integration truth |
| M4 | disposable Docker build, runtime, migration, focused integration test, and preview evidence |
| M4 frontend slots | bounded, read-only visual candidates sharing the accepted primary backend |
| Cloudflare Access preview | protected human browser access to the M4 preview |
| Local WordPress | abilities, workflows, settings, approval, preflight, and final-write truth |
| Production | a separate operator-approved release target, never an automatic consequence of development |

The core rule is:

> Source moves from the authoring Mac to M4 for evidence. Runtime fixes move
> back through Git to `master` for acceptance. M4 never becomes source truth.

This split is valuable because it removes routine Docker load from the
authoring Mac while preserving a persistent, realistic integration runtime.
It is only useful while the workflow remains faster than running a release
rehearsal after every edit.

The authoritative details are:

- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md);
- [M4 Preview Development Workflow](m4-preview-development-v1.md);
- [ADR-023: Candidate and Accepted Promotion](decisions/023-m4-preview-candidate-acceptance-promotion.md);
- [ADR-024: Risk-Tiered Validation Authority](decisions/024-risk-tiered-development-validation-authority.md);
- [ADR-025: Source-Only Authoring and AI Checkpoint Dispatch](decisions/025-source-only-authoring-and-ai-m4-checkpoint-dispatch.md);
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md);
- [CI Pytest Sharding](ci-pytest-sharding-v1.md);
- [Release CI Open-Source Patterns](release-ci-open-source-patterns-2026-07.md).

## 2. Evidence States Are Not Interchangeable

Every task moves through explicit evidence states:

| State | What it proves | What it does not prove |
| --- | --- | --- |
| `local verified` | the changed source seam passed its narrow local check | Docker/runtime behavior or merge eligibility |
| `candidate validated on M4` | the current worktree behaved in the M4 integration runtime | the source was committed, reviewed, or merged |
| `PR verified` | the pushed revision passed required GitHub checks | the change is in `master` or visible on M4 |
| `merged into master` | the reviewed change is integration truth | M4 is running that merged revision |
| `accepted on M4` | clean current `master` was promoted and the relevant smoke passed | production release or GA |
| `production validated` | the separately approved production process completed | external customer acceptance or product benefit |

Do not collapse these states into the word "done." A completion report names
the highest state actually evidenced.

The distinction prevents the most expensive historical failure mode: a fix
works on M4, but never reaches Git, so the next deployment silently removes it.
Direct `sync` and `deploy` therefore create a candidate. Only a merged PR plus
`m4:preview:promote` creates accepted M4 evidence.

## 3. Session Entry and Change Envelope

Before editing:

1. run `git status --short --branch`;
2. read `README.md`, `AGENTS.md`, this guide, and the relevant Cloud boundary;
3. fetch `origin` when the current integration baseline matters;
4. preserve all existing user changes;
5. create a clean `codex/*` worktree from current `origin/master` when the
   active checkout is dirty, stale, or on unrelated work;
6. immediately lock any auxiliary worktree created by the session with
   `git worktree lock --reason "codex:<task-id>" <absolute-worktree-path>` and
   verify its reason in `git worktree list --porcelain`;
7. state the change envelope before modifying files.

The change envelope records:

- focused repository and module;
- intended outcome;
- explicit non-goals;
- public contracts touched;
- expected and forbidden files;
- environments and external systems that must not change;
- narrow and integration gates;
- cross-repository matrix requirement;
- rollback.

Never obtain a clean tree by resetting, stashing, checking out over, or broadly
staging user work. A clean focused worktree is cheaper than reconstructing
ownership after unrelated changes are mixed.

The worktree lock is a lifecycle guard, not a substitute for conflict-domain,
merge-lane, or shared-runtime ownership. Keep it through implementation,
review, and merge. Unlock only after the task has ended, the PR is confirmed
merged, and the worktree is clean. No-deliverable closeout, handoff, and
stale-lock recovery follow
[Parallel AI Collaboration Standard Section 4.1](parallel-ai-collaboration-standard-v1.md#41-task-worktree-lifecycle-lock);
path names and modification times are not cleanup authority.

## 4. Select the Smallest Valid Development Lane

| Change | First feedback | Runtime checkpoint |
| --- | --- | --- |
| Documentation or repository policy | links, formatting, policy contract | no M4 action by default |
| WordPress-only PHP/UI | focused plugin test and Local browser | no Cloud sync unless the Cloud contract changed |
| Ordinary Cloud Python/frontend/worker source | exact local test, lint, or type check | `pnpm run m4:preview:sync` |
| Dependency, lock, Dockerfile, Compose, proxy, or deployment input | focused source/static gate | `pnpm run m4:preview:deploy` |
| Migration, persistence, worker, recovery, or network behavior | focused contract plus risk-specific checks | M4 runtime evidence; full gate only when justified |
| CI-only change | focused script/contract replay | GitHub Actions is the runtime; do not deploy M4 |

For a frontend-only appearance change, an owned ephemeral slot may replace the
primary `sync` checkpoint when it needs no mutation, dependency, API,
migration, worker, persistence, proxy, or runtime-config change. The slot must
attach to a clean accepted primary runtime and use its foreground loopback
tunnel. This is a concurrency exception for rendering only, not a second
integration stack.

`sync` is the default for ordinary source. It must fail closed when a changed
fingerprint requires `deploy`. Do not choose a cold rebuild merely because it
feels more complete.

## 5. Feature and Bug-Fix Loop

Use the same loop for a new feature and a defect:

1. reproduce or precisely state the observed and expected behavior;
2. trace the full consumer path before editing;
3. change only the owning seam in the authoring worktree;
4. run the narrowest useful local check;
5. dispatch the appropriate M4 candidate checkpoint when Cloud runtime
   behavior is involved;
6. validate the actual consumer: API, worker, browser, or disposable Local
   WordPress;
7. repeat until the source and runtime evidence agree;
8. inspect the diff and stage only named task files;
9. commit, push, and publish a focused PR using the repository PR template;
10. let required GitHub checks decide merge eligibility;
11. merge into `master`;
12. promote clean current `master` to M4 and run the relevant smoke;
13. report exact states, revisions, tests, limitations, and rollback.

Do not commit every experimental save, and do not wait until after merge to
discover whether the feature works in the real integration runtime. Candidate
validation is intentionally before merge; accepted promotion is intentionally
after merge.

## 6. Consumer Paths Must Stay Separate

The correct endpoint depends on the consumer:

| Consumer | Endpoint | Reason |
| --- | --- | --- |
| Human preview | `https://cloud.mqzjmax.top` | Cloudflare Access provides protected browser login |
| Disposable Local WordPress connector | `http://127.0.0.1:18010` | foreground SSH tunnel returns the expected JSON API |
| M4 operator transport | the documented private SSH/Tailscale path | management transport, not an application endpoint |
| Production WordPress | the approved production Cloud endpoint | production only, never a local-development shortcut |

Start the local connector path with:

```bash
pnpm run m4:preview:tunnel
```

Cloudflare Access can return an HTML login or redirect where an automated
connector expects JSON. Therefore the protected browser hostname is not a
substitute for the local WordPress tunnel. Conversely, loopback is not a
public preview URL; it is intentionally local to the machine that owns the
tunnel.

Keep the tunnel foreground and disposable. Do not add Access service tokens to
the addon, expose M4 application ports to LAN/Tailscale, or create a permanent
second tunnel controller for convenience.

## 7. Test Depth Is Chosen by Risk

The inner loop and the acceptance loop answer different questions:

1. an exact test or static check answers whether the changed seam is coherent;
2. a focused M4 test answers whether that seam works in the Docker/runtime
   environment;
3. GitHub required checks answer whether the revision may merge;
4. post-merge promotion answers whether visible M4 runtime source equals clean
   reviewed `master`;
5. a full M4 suite answers an additional M4-specific high-risk question.

The normal bug-fix target is:

```bash
pnpm run m4:preview:test -- --focused <test-path-or-node-id>
```

Use `--contract`, `--domain`, or `--full` only when the broader suite answers a
real risk question. Do not run the same full contract/domain suite multiple
times for one revision without recording the different evidence each run
provides.

Historical reference measurements from this workflow were:

- ordinary source sync: about 18.41 seconds;
- post-merge source promotion: about 23.05 seconds;
- full M4 contract/domain gate: about nine minutes.

These observations are not guarantees. They show why focused feedback should
remain the inner loop and the full suite should remain a closeout or high-risk
gate.

## 8. CI Feedback Is a Governed Closed Loop

The pytest scheduling loop is:

```text
master full CI
  -> upload per-shard JUnit and selected-file artifacts
  -> report predicted/actual balance and material file drift
  -> observe natural successful master runs
  -> refresh variance-aware weights in a focused PR when warranted
  -> required checks and merge
  -> observe the refreshed master assignment
```

The repeatable refresh command is:

```bash
pnpm run ci:pytest:weights:refresh -- --recent-master 5
```

The loop is automated for collection and diagnosis, but deliberately keeps
weight changes behind human review and a PR. A single slow hosted runner must
not rewrite scheduling truth.

PR `#248` closed the first imbalance remediation cycle. Its merge commit was
`c02bde02`. The first natural post-merge `master` run, `30141177591`, completed
successfully with:

- pytest job wall times of about 8:43, 8:12, and 8:05;
- recorded JUnit times of 493.139, 438.812, and 435.754 seconds;
- an actual maximum-to-minimum recorded-time ratio of 1.13.

The result met the `<= 1.30` target. Three file-drift warnings represented
tests completing materially faster than their conservative predictions, not a
new critical-path regression. Continue natural observation; do not manufacture
full runs solely to complete a sample count.

Add a fourth shard only when three shards remain balanced but the critical
path still misses the agreed feedback target. Split sustained slow files or
remove repeated fixture setup before adding more scheduling metadata.

## 9. Lessons From the Remediation History

### Fix source, not only the runtime

An M4-side edit is temporary and unreviewed. Reproduce on M4, implement on the
authoring Mac, validate the candidate, merge through Git, then promote.

### Verify the consumer that reported the defect

An admin mutation succeeding does not prove that Portal or WordPress shows the
new balance. An API health response does not prove that the browser receives
JSON through its selected route. Trace write, canonical storage, projection,
cache/refresh, and final consumer rendering.

### Do not diagnose a transport with the wrong probe

A successful TCP connection does not prove a successful HTTP response. Test
M4-local HTTP, the authoring-Mac tunnel, and the protected browser path
separately. Record which layer failed.

### Stable commands require a stable operations checkout

A missing `m4:preview:tunnel` script in an older checkout was a source-version
problem, not an M4 problem. Run deployment and promotion commands from a
long-lived clean operations worktree kept at current `master`; do not rely on
an arbitrary feature or dirty checkout.

### Error presentation is part of correctness

One root failure should not appear as duplicate independent notices. Preserve
one canonical diagnostic and make secondary surfaces reference it instead of
re-emitting the same message.

### PR structure is a contract

Required PR sections are not cosmetic. Use:

```bash
pnpm run pr:publish -- --title "<title>" --body-file <path>
```

The publisher and template preserve scope, boundary, verification, and risk
evidence. Do not bypass them with ad hoc PR text when protected automation
expects the contract.

### Full validation is valuable when it is informative

A nine-minute suite is reasonable as an integration gate and wasteful as a
save-time loop. Optimize selection, sharding, fixture reuse, and parallel
feedback before deleting coverage or adding infrastructure.

### Runtime convenience must not create another control plane

M4, tunnels, caches, Cloudflare, and CI are delivery and evidence mechanisms.
They do not own Git, WordPress settings, approvals, workflows, prompts, or
production release decisions.

## 10. When M4 Remains Worthwhile

Keep M4 as the normal Cloud integration runtime while:

- ordinary edit-to-preview normally stays below two minutes;
- focused bug-fix feedback normally stays below five minutes;
- network, tunnel, and synchronization friction stays below ten minutes per
  working day;
- full gates remain occasional instead of becoming the edit loop;
- one operator does not experience material queueing;
- M4 catches Docker, database, Redis, worker, proxy, browser, or WordPress
  integration defects that source-only checks cannot.

First diagnose transfer, tunnel, rebuild frequency, test scope, resource
pressure, or architecture parity when these thresholds fail.

A dedicated cloud development server becomes justified when persistent uptime,
public webhook reachability, multiple concurrent stateful isolated environments,
x86_64 production parity, or weekly M4 downtime is the dominant constraint.
It should not be purchased merely to avoid using the focused workflow already
available.

## 11. Failure and Recovery

- Candidate failure: fix or revert in the authoring worktree, then sync again.
- Broken merged `master`: use a reviewed revert or focused fix PR, then
  promote corrected `master`.
- M4/Docker restart: inspect `m4:preview:status`, then use
  `m4:preview:recover` when the expected containers still exist.
- Missing container or changed build fingerprint: use `m4:preview:deploy`.
- Stale operation lock: inspect the recorded owner/process before removing only
  the exact managed lock.
- Tunnel failure: keep source work intact, verify SSH/Tailscale reachability,
  restart the foreground tunnel, and retest HTTP.
- CI imbalance: collect natural successful runs, inspect the advisory report,
  and refresh through a focused PR only when thresholds persist.

Never patch source on M4, silently substitute local Docker, broadly prune
Docker/volumes, print protected environment values, or alter production,
Cloudflare, DNS, Access, or Tunnel state as an unreported recovery.

## 12. Completion Checklist

Before reporting a feature or fix complete:

- [ ] focused module and product boundary remained intact;
- [ ] unrelated dirty work was preserved;
- [ ] every auxiliary task worktree created by this session recorded
      `locked codex:<task-id>` immediately after creation;
- [ ] the narrowest meaningful gate passed;
- [ ] candidate M4 behavior was verified when the Cloud runtime was involved;
- [ ] the actual browser, worker, API, or WordPress consumer was checked;
- [ ] only task files were staged;
- [ ] focused commit and PR were published with the required template;
- [ ] GitHub required checks passed and the PR merged into `master`;
- [ ] current clean `master` was promoted when M4 acceptance was required;
- [ ] status shows the expected revision, clean source, and acceptance state;
- [ ] the task worktree remained locked while its PR was open, or was unlocked
      only after the documented merged/clean closeout conditions were met;
- [ ] production and external human acceptance were reported separately;
- [ ] known limitations and rollback were recorded.

For a documentation-only closeout, M4 candidate and promotion steps are
normally not applicable. Validate the document links, repository contracts,
formatting, and protected docs-only CI instead.

## 13. Development-Stage Closeout

Task completion and development-stage completion are different scopes. One
task may be merged and accepted while later batches still own the merge queue,
shared M4, or a declared conflict domain.

Before declaring a development stage closed:

1. inventory every batch already admitted to that stage;
2. confirm that each batch is merged, explicitly withdrawn, or handed to a
   later stage;
3. confirm clean-current-`master` M4 acceptance where required;
4. confirm that no stage candidate remains active;
5. obtain explicit release of both the human Cloud merge lane and shared M4;
6. record local-only candidates, retained worktrees, blockers, rollback, and
   next owners;
7. record the operator decision that selects the next queue.

If the next queue is controlled production validation, create a durable
handoff but do not treat that record as deployment authorization. Freeze the
exact candidate only after the stage-close conditions hold, then follow the
current production release policy and checklist. The full ownership,
double-release, scheduling, and release-handoff rules are normative in
[Parallel AI Collaboration Standard Section 11](parallel-ai-collaboration-standard-v1.md#11-development-stage-closeout-and-release-handoff).
