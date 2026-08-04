# Production-host Localhost Candidate Canary Standard v1

Status: active operator standard.

Purpose: define the smallest safe rehearsal that may run an exact Cloud release
candidate on the production host without deploying it to production, connecting
to production RDS, changing public traffic, or satisfying a formal production
release gate.

This standard records the reusable method learned from Issue #406. It does not
authorize a canary by itself. Every run still requires an exact candidate and an
explicit operator authorization that names the permitted host mutation.

## 1. Evidence Boundary

A conforming run may prove only that the exact candidate bundle can:

- load and run on the production host architecture;
- migrate a disposable PostgreSQL database to the candidate head;
- start the candidate API, workers, frontend, proxy, and Redis together;
- pass bounded signed runtime smoke;
- expose synthetic Admin and Portal browser surfaces through a local tunnel;
- be removed without changing the production baseline.

It does not prove:

- production deployment or public revision identity;
- production RDS migration, schema compatibility, backup, or restore readiness;
- formal production Admin/Portal identity;
- WordPress Addon reconnect, fresh-key issuance, or old-key revocation;
- external OTLP export, natural production traffic, payment, or observation;
- `production validated`, production human acceptance, external-user
  acceptance, or GA.

M4, local Docker, public liveness, and a production-host localhost canary remain
four different evidence classes.

Every reviewed gate must be classified as `passed`, `blocked`, `not applicable`
with its basis, or `requires operator approval`. `Not applicable` is not a pass,
and a canary receipt must not change a formal release checkbox whose named
evidence class was not executed.

## 2. Authorization Classes

Use separate operator decisions for separate effects:

| Action | Required authority |
| --- | --- |
| Read repository, Issue, Environment names, and host baseline | read-only production preparation authority |
| Run isolated candidate containers on the production host | explicit production-host localhost canary approval |
| Create `master -> production` PR | explicit production-promotion approval |
| Deploy, migrate production RDS, change `current`, DNS, or Cloudflare | protected production mutation approval |
| Run WordPress reconnect/key revocation | explicit connector smoke approval |
| Run paid smoke | separate approval naming amount and account |

An approval for one row never implies approval for a later row.

## 3. Candidate Invariant

Before the first canary mutation, after any operator pause before a later
mutation, and again before evidence closeout, compare the remote GitHub
`master` SHA with the frozen candidate SHA.

If it differs:

1. stop before creating or recreating a container;
2. classify every prior candidate-bound conclusion as stale;
3. do not combine bundle, scan, migration, M4, host, or browser evidence from
   the old and new revisions;
4. restart the release audit from candidate freeze.

The receipt must bind at least:

- source revision and tree;
- exact bundle SHA-256;
- image platform and candidate image identities;
- sole Alembic head;
- canary project and run directory;
- production baseline pointer and container identities.

## 4. Isolation Contract

The canary must use all of the following:

- a dedicated root-owned run directory outside the production release tree;
- a unique Compose project name;
- candidate-specific image tags bound to the exact bundle;
- a disposable PostgreSQL 18 service with no published host port;
- a canary-only Redis and isolated Compose network/volumes;
- exactly one proxy host binding on `127.0.0.1:<dedicated-port>`;
- a local SSH tunnel for browser access when needed;
- synthetic reserved identities such as `example.com` addresses.

The rendered Compose configuration must be rejected if it references:

- the production RDS hostname or database URL;
- `/opt/npcink-ai-cloud/shared` or another production config directory;
- the production Compose project;
- the production `current` pointer;
- a non-loopback published port;
- a host-published PostgreSQL or Redis port;
- a non-candidate application image.

The canary must not modify production source, `.env.deploy`, protected runtime
configuration, the install-state files, the permanent completion sentinel, the
pending first-install marker, production containers, DNS, Cloudflare, or public
traffic.

## 5. Preflight Baseline

Record safe metadata only:

- independently verified SSH host fingerprint;
- exact production `current` target;
- IDs and image identities of every production service container;
- existing listener on the selected canary port;
- candidate bundle digest and candidate image identities;
- current production installation-state classification;
- expected migration head and rollback application revision.

Report environment configuration by variable name and presence only. Never
print passwords, private keys, API keys, tokens, database credentials, complete
environment files, session cookies, or one-time codes.

If the production lifecycle is internally inconsistent, for example
`install-state.json` says `complete` while the permanent completion sentinel is
absent and a pending marker remains, record the blocker and keep the canary
isolated. A canary must never repair or bypass the lifecycle state.

## 6. Compose Invocation Envelope

Every Compose invocation, including a later single-service recreate, must use
the same complete invocation envelope:

- exact project name;
- exact base and override files;
- exact canary port;
- exact canary config and backend env paths;
- exact candidate image variables for API, all workers, frontend, Redis, and
  proxy;
- test-only setup-state override only inside the canary frontend;
- canary-only synthetic identity variables.

Do not rely on Compose defaults after the initial launch. A later `up` or
`--force-recreate` with an incomplete environment can silently select ordinary
`:prod` tags or the default production port.

After every recreate:

1. inspect each canary container's actual image ID and configured image name;
2. verify the only published binding is the intended loopback port;
3. verify the production container IDs again;
4. rerun the narrow health or browser check affected by the recreate.

If frontend or API recreation changes an internal Docker address, recreate only
the canary proxy under the same complete invocation envelope. Never restart the
production proxy to repair a canary upstream.

## 7. Synthetic Browser Identity

Synthetic browser validation is allowed only when the exact candidate supports
a test/development entry seam and the canary environment is explicitly `test`.

- Generate a random canary Admin key; inject the same value into canary API and
  frontend; never print it.
- Register Portal through the candidate's public test-only registration
  contract when the release image intentionally excludes development seed
  modules.
- Parse a development verification code in memory and immediately submit it;
  never write or print it.
- Use temporary in-memory or restricted cookie storage and report only HTTP
  status, final route, and cookie count.
- Synthetic login proves route/session behavior only. It is not formal
  production identity or mailbox evidence.

## 8. Runtime Verification

The minimum useful canary gate is:

1. render and mechanically inspect Compose configuration;
2. start disposable PostgreSQL and Redis;
3. migrate from empty state to the sole candidate head;
4. run the migration a second time when the harness supports idempotency proof;
5. start API, workers, frontend, and proxy;
6. run the repository's signed remote smoke without weakening its assertions;
7. optionally establish synthetic Admin and Portal sessions;
8. verify production baseline identities remain unchanged.

Static public-origin checks may be classified not applicable when the only
authorized ingress is localhost. The receipt must name that limitation; it must
not silently count skipped public checks as passed.

## 9. Failure and Cleanup

Harness failures must automatically remove canary resources. A deliberately
kept browse canary must remain running only until the operator reports the
inspection complete.

Cleanup must target exact canary names and then prove:

- zero canary containers, networks, and volumes remain;
- zero candidate canary image tags remain;
- no listener remains on the canary port;
- the SSH tunnel is stopped;
- production `current` is unchanged;
- all recorded production container IDs are unchanged;
- production liveness still succeeds.

Preserve the restricted run directory and receipt unless the operator
explicitly requests deletion. Update the receipt atomically with final status,
cleanup result, evidence classification, and SHA-256.

## 10. Stop Conditions

Stop immediately when:

- candidate SHA or bundle digest changes;
- rendered Compose references production state or a non-loopback port;
- a candidate service resolves to a non-candidate image;
- the chosen port is unexpectedly occupied and ownership is not proven;
- production `current`, container IDs, or service health changes;
- production RDS or protected config would be required;
- a secret would need to be printed or passed in a process argument;
- the requested next action exceeds the operator's current authorization.

Record `blocked`; do not improvise a bypass.

## 11. Status Language

Closeout must report these independently:

| State | Meaning |
| --- | --- |
| candidate canary passed | isolated exact candidate ran and was cleaned safely |
| synthetic browser inspection completed | operator inspected canary Admin/Portal behavior |
| production validated | protected production deployment and required production gates completed |
| human accepted | authorized human accepted the target production journey/result |
| GA | separate rollout decision after all Required gates and observation |

The first two states never imply the last three.
