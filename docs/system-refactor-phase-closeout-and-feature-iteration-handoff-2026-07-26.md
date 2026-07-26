# System Refactor Phase Closeout And Feature-Iteration Handoff — 2026-07-26

## Status

Stage closeout, development retrospective, and next-stage handoff.

This document consolidates the major decisions and lessons from the
WordPress-first system refactor, first-install/RDS work, production-validation
discussion, M4 development workflow, Provider configuration remediation, and
the latest WordPress text-loop validation.

It is not:

- a production promotion or GA authorization;
- a claim that the current `master` revision is deployed to production;
- an extension or closure of a CVE exception;
- an authorization to resume image or audio generation testing;
- an implementation approval for Typecho, Z-BlogPHP, Ghost, or another CMS;
- a replacement for accepted ADRs, boundary documents, release policy, or
  date-later evidence.

No secret, host password, database password, setup code, administrator key,
Provider credential, prompt, generated content, or user content belongs in this
record.

## Executive Conclusion

The broad system-refactor stage should close here.

The project has a credible WordPress-first architecture, one hosted Cloud
runtime, a secure first-install and external PostgreSQL 18 contract, bounded
media transport foundations, an explicit multi-platform seam, and a
risk-tiered development/validation workflow. Another general rewrite would
produce less value than improving the real WordPress user experience.

The main contradiction is now:

```text
engineering capability and boundaries are substantially proven
        versus
repeatable user value and product experience are not yet proven
```

The next stage is therefore **WordPress text feature iteration**, not another
infrastructure or architecture program:

```text
real editor task
  -> title, summary, or selected-text rewrite
  -> reviewable Cloud suggestion
  -> explicit local save
  -> metadata-only outcome evidence
  -> fix one observed weakness
  -> repeat
```

Image generation, image transformation product trials, and audio generation
remain paused. Multi-CMS implementation remains deferred. Production remains a
separate operator-approved release target.

## Authority And Evidence Rules

This closeout follows the repository evidence hierarchy:

1. current code and tests;
2. accepted ADRs and active boundary documents;
3. protected `master` and required GitHub checks;
4. accepted M4 promotion evidence;
5. separately authorized production evidence;
6. real-user and commercial evidence.

Historical chat, old branches, a healthy endpoint, a passing local test, or a
candidate M4 sync cannot independently upgrade work to a later state.

The following states must remain distinct:

| State | What it proves | What it does not prove |
| --- | --- | --- |
| Local verified | The changed source seam passed its focused check | Docker/runtime behavior or merge |
| Candidate validated on M4 | The current candidate works in the M4 integration runtime | Git review or accepted `master` |
| PR verified | The pushed revision passed required checks | Merge or runtime visibility |
| Merged into `master` | The change is development integration truth | M4 or production deployment |
| Accepted on M4 | Clean merged `master` was promoted and smoked | Production or user value |
| Production validated | The separately approved deployment passed its gates | GA, retention, or willingness to pay |
| Human accepted | A real editor found the result useful | General market fit |

## What The Refactor Achieved

### 1. Cloud and WordPress ownership is explicit

The durable product boundary is:

- WordPress owns local users, permissions, Abilities, workflows, prompt/context
  assembly, review, approval, preflight, final writes, and local audit;
- `npcink-cloud-addon` validates, signs, transports, and projects bounded Cloud
  results;
- Cloud owns hosted model execution, Provider connections and routing, usage
  and entitlement evidence, queues, health, diagnostics, temporary artifacts,
  and transfer evidence;
- PostgreSQL is durable Cloud truth and Redis is coordination state;
- Cloud does not become a second CMS, Ability registry, workflow registry,
  prompt/preset registry, approval system, or WordPress write owner.

This boundary is more valuable than any individual implementation detail. It
prevents future features from quietly duplicating control truth.

### 2. The architecture contracted before it expanded

The refactor removed or retired thick orchestration, task-pack, prompt/preset
advisor, broad model-operations, and duplicate Portal/Admin control surfaces.
The remaining Cloud surface is intentionally bounded to runtime, account/site
service state, Provider operations, usage/entitlement evidence, health,
diagnostics, audit, and commercial decisions.

This contraction reduced three risks:

- duplicate sources of truth;
- platform-by-channel combination growth;
- tests protecting obsolete compatibility rather than current product value.

The project had no real users during the refactor, so breaking cleanup and
fresh initialization were preferable to compatibility aliases, dual reads,
dual writes, and legacy migrations.

### 3. Identity has one canonical user key

`principal_id` is the stable Cloud identity. Email and future external-provider
subjects are login aliases that map back to the principal. `account_id`,
membership, site, and a CMS-local user ID remain separate dimensions.

This avoids creating a second "unique user ID" for each login method, CMS, or
site and gives future authentication providers a stable binding point.

### 4. First install and PostgreSQL 18 have a clean contract

ADR-022 established a one-time installer and a fresh external Alibaba Cloud RDS
PostgreSQL 18 database:

- no PostgreSQL 16 data migration, dual write, or compatibility path;
- setup begins only after host control is proven with a high-entropy setup code;
- setup and administrator key plaintext are displayed only once and only their
  digests are retained;
- PostgreSQL major version must be exactly 18;
- the database must be empty or match the same interrupted installation;
- the connection uses TLS `verify-full` and an RDS CA chain;
- runtime secrets and database fields live in protected structured
  configuration, not in release archives or ordinary `.env.deploy`;
- workers remain behind the installation-state gate;
- successful installation never reopens Setup because the database is down;
- a lost administrator key is rotated by the host helper, invalidating the old
  key and sessions together.

The validation RDS specification `pg.n2e.1c.1m` is intentionally low cost. It
is not approved for the first real user, paid workload, or irreplaceable data.
Upgrade to a high-availability edition and complete a real restore drill first.

### 5. Private RDS is the current security boundary

The current installer accepts the approved private RDS endpoint only. The
earlier `setup.database_unreachable` diagnosis exposed two different cases:

- a private endpoint is unreachable when the Cloud host is outside the
  matching VPC/security path or is absent from the RDS allowlist;
- a public RDS endpoint is also rejected when the installer is intentionally
  enforcing the private-address policy.

These cases must not share a misleading generic explanation in future UI.

Public-database support remains deferred. Reopening it requires an explicit,
warned operator choice while retaining:

- hostname verification with TLS `verify-full`;
- an authoritative CA chain;
- an exact and narrow outbound-IP whitelist;
- DNS-rebinding and resolved-address checks;
- classified, actionable errors;
- atomic protected configuration;
- no password or CA values in logs, URLs, browser storage, or deploy
  environment files.

The RDS CA field is for verifying the PostgreSQL server certificate. It is not
the public HTTPS Edge certificate, a client certificate, or a private key.
The setup UI should keep concise inline help and an expandable authoritative
retrieval guide. A separate Alibaba Cloud API integration is unnecessary.

### 6. Media gained a reusable runtime foundation

The media direction is:

```text
CMS-local source
  -> signed bounded upload
  -> Cloud validation and typed processing
  -> temporary artifact metadata and bytes outside relational payload truth
  -> signed pull
  -> local verification and review
  -> local governed write
  -> transfer-only ACK and TTL cleanup
```

This foundation can later support more image, audio, or other media operations
without letting Cloud write the CMS directly. ACK proves transfer, not
approval, import, featured-image assignment, insertion, or publication.

The foundation is retained, but image and audio feature testing is paused until
the user deliberately reopens it. Deferred work must not consume the current
WordPress text-iteration budget.

### 7. Multi-platform support has a seam, not an implementation program

The long-term model remains:

```text
one Cloud runtime
  + one platform-neutral connector contract
  + thin CMS-local adapters
```

CMS host and access channel are independent axes:

- WordPress, Typecho, Z-BlogPHP, and Ghost are host platforms;
- the editor, MCP, OpenClaw, and other integrations are access channels.

They must not be collapsed into one adapter dimension.

WordPress stays the only implementation priority. A future Typecho PoC may
validate only title suggestions, summaries, and selected-text rewrites with
`suggestion_only`. It must reuse the same Cloud runtime, error semantics,
idempotency, and diagnostics. A proposed `/v1/typecho/*` runtime, second queue,
Cloud Ability registry, or direct CMS write is evidence that the abstraction
has failed.

### 8. Development and validation are now an explicit pipeline

The accepted development topology is:

- authoring Mac: source, narrow checks, Git, PR, operator commands;
- GitHub `master`: reviewed integration truth;
- M4: disposable Docker/runtime/database/worker/browser evidence;
- Local WordPress: real consumer, local review, and final-write truth;
- production: separate operator-approved release.

The normal loop is:

```text
reproduce
  -> trace the consumer path
  -> edit one owning seam
  -> run the narrowest relevant check
  -> use M4 only when runtime evidence is required
  -> validate the actual consumer
  -> inspect and stage named files
  -> PR and required checks
  -> merge
  -> promote clean master when M4 acceptance is needed
```

Full suites remain valuable as integration or release gates. They are not the
default response to every copy, matcher, or small UI fix.

## Latest Practical WordPress Text Evidence

On 2026-07-26, the Local WordPress text path was exercised through the M4 Cloud
runtime using the native, loopback-only M4 Ollama model `qwen3.5:9b`.

The bounded tasks were:

- title suggestion;
- content summary;
- selected whole-paragraph rewrite.

Observed evidence:

- all three WordPress AI requests returned HTTP `200`;
- review and insertion produced `0` WordPress writes before explicit save;
- one explicit local save produced one post write and revision delta `+1`;
- non-target paragraph sentinels remained unchanged;
- the temporary draft and short-lived WordPress session were removed;
- metadata-only monitoring produced three generation events and three
  `saved_exact_output` outcome events;
- M4 Cloud stored all six events with zero duplicate and zero pending session;
- the Cloud quality projection remained read-only and retained no raw content.

The run also found a real acceptance-harness defect: a case-insensitive
`\sOR\s` matcher treated the ordinary English word "or" as evidence of
multiple alternatives. The Addon fix narrowed the assertion to explicit
multi-candidate phrases. `npcink-cloud-addon` PR `#62` passed its focused tests
and required CI and merged.

This evidence proves the current development loop and write boundary. It does
not prove broad editorial quality, real-user retention, paid Provider
compatibility for every model, production readiness, or willingness to pay.

M4 Ollama is appropriate for frequent, low-cost inner-loop validation. It must
remain loopback-only and development-only; production must not depend on the
office M4 or its Ollama service.

## Operator And User-Experience Lessons

Several real configuration failures showed that correctness includes the
operator's ability to recover:

- an internal `connection_id` should normally be generated by Cloud instead of
  requiring an administrator to understand an English slug rule;
- Provider catalog visibility is not proof that a model is executable;
- authentication, model, network, TLS, and database failures should explain the
  next operator action in Chinese instead of exposing only an internal code;
- RDS CA help must explain purpose, accepted PEM shape, authoritative source,
  and the difference from Edge TLS;
- setup code and administrator key rotation need exact, interactive host
  commands and must fail closed when the Compose target is ambiguous;
- one root failure should not appear as multiple independent notices.

Some corrective implementation existed on non-authoritative development
branches during the historical work. Current `master` must be inspected before
claiming each item landed. Future work should reproduce the current symptom and
port only the smallest still-needed correction through a focused PR.

## Work Review

### Original goals

The refactor intended to:

- improve performance, security, and maintainability without preserving
  unused compatibility;
- establish a stable Cloud/WordPress ownership boundary;
- support secure first installation and external PostgreSQL 18;
- preserve a future multi-CMS seam without distracting from WordPress;
- build reusable media transport foundations;
- create a faster but trustworthy development and release workflow.

### Completion

- [x] Cloud/WordPress ownership and no-direct-write boundary are durable.
- [x] Canonical identity, connector, runtime, Portal/Admin contraction, and
  Provider/runtime foundations are present.
- [x] Secure one-time installation and RDS PostgreSQL 18 contracts are present.
- [x] Media artifact/transfer foundations are present.
- [x] Multi-platform boundary exists without premature additional adapters.
- [x] Risk-tiered local/M4/CI/production evidence states are documented.
- [x] The WordPress title/summary/rewrite loop passed a real Local WordPress and
  M4 Ollama development validation.
- [ ] Real-user usefulness, retention, and willingness to pay are not proven.
- [ ] The validation RDS instance is not approved for real-user availability.
- [ ] Current `master` is not automatically a production release.
- [ ] Image/audio product value and multi-CMS value remain deliberately
  untested.

### Problems found and corrections

| Severity | Concrete problem | Root cause | Correction |
| --- | --- | --- | --- |
| Must keep visible | Engineering, M4, merge, production, and user acceptance were sometimes described with one word such as "done" | Evidence states were not named early enough | Every closeout must state the highest proven evidence state |
| Must keep visible | A Python CVE exception risks becoming either a development freeze or an indefinite waiver | Development and release risk were treated as one gate | Continue development; keep release/real-user promotion fail-closed and time-bounded |
| Should correct | Small UI or matcher changes sometimes triggered repeated broad test suites | Test depth was chosen by habit rather than changed seam and risk | Start narrow, use CI for merge authority, broaden only for a named risk |
| Should correct | Architecture work continued after the major boundary problem was already solved | Engineering completeness was easier to measure than product usefulness | Close the refactor and redirect effort to actual editor tasks |
| Should correct | Operator-facing internal identifiers and raw error codes leaked implementation detail | Backend contracts were designed before the recovery experience | Generate opaque identifiers and map failures to operator actions |
| Should correct | Live runtime or branch experiments could be mistaken for source truth | Runtime convenience and Git authority were not always separated | Fix on the authoring Mac, publish through Git, then promote accepted source |
| Suggested improvement | Historical branches contained useful documents mixed with obsolete implementation | History was valued as a whole instead of selectively reconciled | Extract only current, authoritative knowledge onto clean `master` |
| Suggested improvement | The first quality evidence arrived late in the refactor | Contract correctness was prioritized before observable adoption | Keep metadata-only outcome correlation in every editor trial |

### What worked

- Clean worktrees protected unrelated user changes.
- Focused commits and named-file staging kept rollback understandable.
- External open-source projects were used for mechanisms and test ideas without
  importing their product ownership or control plane.
- Removing compatibility in a no-user phase reduced long-term test and
  migration cost.
- Real WordPress browser tests found errors that unit and API tests could not.
- M4 Ollama provided inexpensive, repeatable model execution while preserving
  production separation.
- Metadata-only quality evidence measured generation/adoption without retaining
  prompts or generated content.
- Fail-closed setup, TLS, configuration, and key rotation protected the most
  sensitive bootstrap seam.

### If this work were restarted

The more efficient order would be:

1. freeze ownership and deletion goals;
2. select three representative WordPress tasks immediately;
3. implement the smallest platform-neutral runtime seam;
4. validate those tasks through a real editor earlier;
5. add only infrastructure required by observed failures;
6. separate inner-loop, integration, release, and production gates from the
   beginning;
7. stop the refactor as soon as boundary, security, and consumer evidence are
   sufficient.

## Current Known Limits And Deferred Work

| Item | Current posture | Reopen condition |
| --- | --- | --- |
| Python 3.14.6 governed findings | Development continues; production/real-user promotion remains governed | Supported fixed image plus pin, fresh scan, exact-bundle replay and merge, or a new explicit risk decision |
| RDS Basic Edition | Validation only | Upgrade to HA before first real user/paid/irreplaceable data |
| Public RDS endpoint | Unsupported by current installer | Explicit operator mode with TLS, DNS, whitelist, error, and secret-handling review |
| RDS CA help | Required experience improvement; verify current `master` before implementation claims | Reproduce current Setup UI and add authoritative bounded guidance |
| Provider configuration UX | Fix only current reproducible issues | Focused Admin/backend contract and browser evidence |
| Production deployment | Separate from development | Intentional production scope, exact release gates, operator approval and rollback |
| Image generation/processing test | Paused | User explicitly reopens the feature |
| Audio generation test | Paused | User explicitly reopens the feature |
| Typecho/Z-BlogPHP/Ghost | Deferred | Repeated WordPress value and one approved thin Typecho PoC |
| FC/OSS migration | Deferred | Measured image load, queue/SLO pressure, and a bounded comparison proving benefit |
| Language rewrite or sidecar | Rejected without evidence | Repeated workload-specific failure after Provider/network/query/worker tuning |
| Real-user trial | Not yet performed | Security/release gate and separately approved bounded trial |

The read-only upstream check executed for this closeout at
`2026-07-26T14:12:01Z` still reported:

- `status=waiting_for_candidate`;
- `python_version=3.14.6`;
- `fixed_image_claimed=false`;
- exception expiry `2026-08-05`.

This observation does not prove that the image is safe and does not extend the
exception.

## Next-Stage Operating Plan

### Primary objective

Make the existing WordPress text abilities clearly useful, simple, and
reliable before adding more platforms or infrastructure.

### Initial feature set

Keep the active scope to:

- title suggestions;
- content summaries;
- selected-text rewrites.

### Iteration unit

Each batch should contain:

1. one real user task or reproduced defect;
2. one owning module;
3. one measurable expected improvement;
4. the narrowest relevant source check;
5. Local WordPress browser evidence when UI or write behavior changes;
6. M4 runtime evidence only when Cloud runtime behavior changes;
7. required GitHub checks;
8. a concise outcome record.

### What to measure

Prefer:

- technical success and classified failure rate;
- time to first useful suggestion;
- original acceptance, edited acceptance, or rejection;
- save-before/write violations, which must remain zero;
- retries and operator intervention;
- accepted outcome per Provider cost;
- duplicated calls, charges, or side effects;
- user-reported task time saved.

Do not use raw token count, model-call count, page count, or CMS count as the
primary success metric.

### Model strategy

- use M4 Ollama for frequent deterministic or low-cost development loops;
- use a real external Provider only for bounded compatibility/quality evidence
  with an explicit call budget;
- never treat Ollama quality as proof for a production Provider;
- never make production depend on M4;
- keep image and audio models outside the active test matrix until reopened.

### Stop conditions

Stop and reassess if:

- Cloud starts owning WordPress approval or writes;
- Setup grows into a general infrastructure control panel;
- the next batch requires a second workflow engine, queue, CMS registry, or
  compatibility layer;
- full suites become the default feedback loop for small changes;
- M4 transfer/tunnel/runtime friction dominates daily development;
- feature additions are justified only by hypothetical future platforms;
- real usage shows that the feature does not save time or produce acceptable
  results.

## Final Decision

The system refactor is **closed as an engineering phase**.

The project is **not closed** and is **not GA**. Work continues as focused
WordPress product development under the existing boundaries:

```text
retain the architecture
  -> improve the actual editor experience
  -> measure bounded outcomes
  -> fix observed problems
  -> make production and expansion decisions from evidence
```

Do not reopen the broad refactor without a measured failure that the current
architecture cannot resolve economically.

## References

- [Refactor Master Plan v1](refactor-master-plan-v1.md)
- [ADR-004: WordPress-First Cloud Runtime Refactor](decisions/004-wordpress-first-cloud-runtime-refactor.md)
- [ADR-022: One-Time Cloud Install and Fresh RDS PostgreSQL 18](decisions/022-one-time-cloud-install-and-rds-postgresql-18.md)
- [Cloud First Install Contract v1](cloud-first-install-contract-v1.md)
- [Cloud First Install RDS PostgreSQL 18 Runbook](cloud-first-install-rds-pg18-runbook.md)
- [Cloud Content Generation Boundary v1](cloud-content-generation-boundary-v1.md)
- [Multi-Platform Connector Boundary v1](multi-platform-connector-boundary-v1.md)
- [Media Runtime Boundary v1](media-runtime-boundary-v1.md)
- [Development and Validation Operating Model v1](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)
- [Cloud Production Release Policy v1](cloud-production-release-policy-v1.md)
- [Production and Master Delta Audit](production-master-delta-audit-2026-07-25.md)
- [Post-Refactor Runtime Stack and GA-Readiness Retrospective](post-refactor-runtime-stack-and-ga-readiness-retrospective-2026-07-25.md)
- [Editor-Assist Quality Flywheel Closeout](editor-assist-quality-flywheel-closeout-and-development-retrospective-2026-07-26.md)
