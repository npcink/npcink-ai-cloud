# M4 Package Proxy Streaming Cache Validation

Date: 2026-07-25 (Asia/Shanghai).

Status: implementation, local contract validation, and M4 candidate validation
passed. GitHub integration and accepted M4 promotion remain separate gates.

## Purpose

Verify that M4 dependency builds receive large package responses promptly,
reuse validated public artifacts, tolerate client disconnects, and preserve
the source, dependency, security, and production boundaries in ADR-027.

## Root Cause Evidence

The former proxy downloaded a complete wheel or npm tarball into a spooled
temporary file before sending HTTP headers. Its upstream socket timeout was
120 seconds, while the effective pip and pnpm fetch timeout was 60 seconds.
Historical build output showed the client timing out first and the proxy then
writing to a closed socket. The resulting `BrokenPipeError` was a consequence,
not the upstream cause.

Fresh M4 host probes showed that the same public registry path is not
consistently slow:

| Artifact | Bytes | Time to first byte | Total |
| --- | ---: | ---: | ---: |
| `@next/swc-linux-arm64-musl` | 42,303,110 | 1.73 seconds | 12.07 seconds |
| `echarts` | 12,178,508 | 1.37 seconds | 3.87 seconds |

This supports treating the failure as intermittent upstream latency amplified
by whole-body buffering and repeated cold downloads.

## Implemented Checks

The focused contract suite proves:

- npm tarballs are classified as streamable binary artifacts;
- headers are written before the fake upstream body is read;
- a completed miss becomes an atomic cache hit without another upstream call;
- a downstream disconnect is counted and the valid upstream fill completes;
- a truncated upstream body is never published as a cache hit;
- corrupt and symlinked entries are rejected;
- abandoned partial files and oldest over-capacity entries are removed;
- the managed M4 proxy uses a 2 GiB cache and 14-day retention;
- pip and pnpm use bounded 300-second fetch timeouts;
- pnpm uses four retries, concurrency eight, and a persistent BuildKit store;
- canonical Dockerfiles remain unchanged.

## M4 Candidate Evidence

The first deployment intentionally changed the dependency fingerprint and
forced both M4 images to rebuild. The source transfer took five seconds from
the authoring Mac to the private relay and one second from the relay to M4.

Cold-cache observations:

| Stage | Result |
| --- | --- |
| pip locked install | completed in 88.1 seconds with `--timeout 300` |
| pnpm frozen install | downloaded and added 430 packages in 146.5 seconds |
| proxy requests | 575 |
| artifact cache misses | 502 |
| upstream artifact bytes | 220,280,737 |
| cache hits | 0, as expected for the new cache |
| downstream disconnects | 0 |

Both installs crossed the former 60-second failure window and continued making
progress. The captured build output contained no `ERR_SOCKET_TIMEOUT` or
uncaught `BrokenPipeError`.

After the build, the cache contained:

```text
cache_kib=222212
object_files=502
metadata_files=502
partial_files=0
```

A separate managed-proxy process then fetched the already cached
`echarts-6.1.0.tgz` artifact:

```text
X-Npcink-M4-Cache: hit
warm_elapsed_seconds=0.006908
warm_bytes=12178508
requests=1 cache_hits=1 cache_misses=0
upstream_bytes=0 cache_bytes=12178508 downstream_disconnects=0
```

This verifies that the 12,178,508-byte warm response came entirely from the M4
cache rather than another registry request.

The deployed runtime and frontend images started successfully. API, frontend,
proxy, PostgreSQL, and Redis were healthy, the preview root and live endpoint
returned HTTP `200`, and private diagnostics remained hidden through the
preview proxy.

Focused M4 verification:

```text
tests/contract/test_m4_preview_development_contract.py
22 passed, 1 skipped in 0.67s
```

The skip is the existing Git-worktree-only source-transfer test: packaged M4
source intentionally omits `.git`.

Candidate evidence does not become accepted evidence until the PR is merged to
`master` and the clean merged revision is promoted through the documented M4
acceptance flow.
