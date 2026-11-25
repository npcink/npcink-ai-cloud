# Python 3.15.2 Alpine Image Candidate — 2026-11-23

## Status

This is a bounded security candidate on branch
`codex/python-3.15.2-image-candidate`. It is not merged, M4 accepted, or
authorized for production deployment.

## Decision

Use the official `python:3.15.2-alpine3.24` multi-architecture image as the
candidate production runtime base. Keep the development and static-analysis
toolchain on Python 3.12 until compatibility evidence requires a separate
toolchain change.

The image index was checked on 2026-11-23. The locked index digest is:

```text
sha256:0f9552bb28711333da16915ec146f5e6bb44a7fdac9ced15dc17c2e0206346dd
```

The checked Linux platform manifests were:

- `linux/amd64`: `sha256:a943ed02f4e22d024d2b4fc5083619497dfb9bc1c64c193861f3bc6d3074f5b1`
- `linux/arm64`: `sha256:4e2ab0675612ba77cc94ed8d3522d1c7c1ec5c521bc4db61c6e3d00a011841f9`

## Implemented Surface

- `Dockerfile` uses the exact candidate digest for builder and runtime stages.
- `deploy/image-lock/production-images.json` records the exact tag, digest,
  Python version and required platforms.
- M4 base-image prefetch and source-rewrite checks use the same reference.
- The production Python extras smoke exports dependencies for Python 3.15.
- The upstream Python image watcher follows the exact candidate tag instead of
  a retired floating `3.14-alpine` tag.
- CI and contract tests describe the candidate image.
- The authoritative non-affected Python metadata is keyed to the candidate
  package version and its lock hash is refreshed.

## Pending at Initial Candidate Build

The initial build still carried the `CVE-2026-119170` allowlist entry for
the former `3.14.10` image. The candidate cannot merge until the formal
governed-platform scan has no blocking findings.

Before merge, the release lane must independently:

1. Build the default and `[zilliz]` production variants for the governed
   platform.
2. Remove the obsolete allowlist entry and update the active policy, checklist
   and contract expectations in the same PR as the base replacement.
3. Run the exact image scan and prove `CVE-2026-119170` absent, with no new
   blocking or unknown findings.
4. Pass CI, then run the separately authorized M4 candidate validation.

None of these steps authorizes production promotion or deployment.

## Follow-up Evidence — 2026-11-23

The initial M4 build exposed two Python 3.15 wheel gaps in the package proxy.
They were resolved through the declared parent packages, not by editing
transitive lock entries manually:

- `psycopg` `3.3.4` -> `3.3.9`, bringing `psycopg-binary` to `3.3.9`;
- `pydantic` `2.13.4` -> `2.14.4`, bringing `pydantic-core` to `2.50.5`;
- the previously updated Python 3.15-compatible wheels remain locked for the
  other native packages (`cffi`, `grpcio`, `httptools`, `librt`, `markupsafe`,
  `numpy`, `orjson`, `pandas`, `pyyaml`, and `uvloop`).

M4 `prepare` then completed successfully on the `aarch64` target. It installed
the locked dependency graph, passed `pip check`, and produced the candidate
runtime image without changing running containers. The subsequent M4 deploy
was intentionally stopped before source transfer because port `11434` is
owned by an unmanaged Ollama process; the ownership guard must remain fail
closed and the unmanaged process must not be taken over by this task.

The local ARM64 production smoke built and verified both the default and
`[zilliz]` variants. Python 3.15, application import, lock manifest, the
PostgreSQL DBAPI, and SQLite removal all passed. A focused Syft/Grype scan of
the zilliz image found zero matches for `CVE-2026-119170`, but it found ten
unallowlisted blocking matches: five OpenSSL CVEs, each reported against both
`libcrypto3` and `libssl3` at `3.5.9-r1`. The OpenSSL advisory states that the
3.5 fixes are scheduled for version `3.5.10` on 2026-12-01. This is evidence
that the expired Python exception's target finding is gone, not evidence that
the candidate is currently mergeable; the new unfixed findings still block the
fresh release scan.

The canonical CVE allowlist was restored unchanged after the focused scan.
The expired `CVE-2026-119170` entry was not removed or extended. The formal
Linux/AMD64 CI scan remains required, and no merge, promotion, or production
deployment is authorized by this record.

The GitHub Actions run `45129221281` then exercised the candidate on Linux
amd64. Both default and `[zilliz]` image builds completed their runtime smoke
checks, including application import, dependency manifests, PostgreSQL DBAPI,
and SQLite removal. The job stopped at the existing fail-closed policy check:
`CVE-2026-119170` was expired on 2026-11-22, so the formal Syft/Grype release
scan did not run. This confirms the CI failure is policy state, not a Python
3.15 runtime failure. The same expired exception caused the two shard-1 and
nine shard-3 contract-test failures; the other backend shards, frontend,
static checks, dependency audit, CodeQL, and PostgreSQL cutover regression
passed.

## Exception Retirement for the Candidate Scan — 2026-11-25

The former Python 3.14.10 exception is removed only on the draft branch that
pins Python 3.15.2. This lets CI reach the full AMD64 image scan with no
allowlisted findings. The earlier OpenSSL findings remain unresolved until
the exact image scan says otherwise. No release gate is waived.

## Local Evidence

Passed:

- `python3 -m py_compile scripts/check-python-cve-upstream.py scripts/production-image-supply.py`
- `bash -n scripts/m4-preview.sh scripts/production-python-extras-smoke.sh scripts/check-release-policy.sh`
- JSON parsing for the updated image lock and authoritative metadata
- `git diff --check`
- `uvx --from uv==0.12.10 uv lock --check`
- M4 `prepare` with the Python 3.15 dependency graph
- local ARM64 default and `[zilliz]` production image smoke
- local ARM64 focused Syft/Grype scan: target CVE absent; five newer OpenSSL
  CVEs remain unallowlisted and blocking

Not complete:

- Formal Linux/AMD64 CI image scan: the candidate reached CI amd64 image
  smoke, but the scan was intentionally blocked before execution by the
  expired `CVE-2026-119170` exception; it must be rerun only after the
  governed exception/remediation decision.
- M4 candidate deploy: blocked before source transfer by the unmanaged Ollama
  ownership guard; no running M4 containers were changed by the failed deploy.
- Production validation and deployment: separately gated and not authorized.
