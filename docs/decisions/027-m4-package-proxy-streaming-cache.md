# ADR-027: M4 Package Proxy Streaming Cache

## Status

Accepted.

## Date

2026-07-25.

## Context

M4 Docker build containers cannot reliably complete registry TLS through the
Docker Desktop network path, while the M4 macOS host can. The existing
loopback-only proxy therefore fetched from fixed public PyPI and npm
destinations on the host and exposed rewritten URLs to build containers.

The proxy buffered every response before sending HTTP headers. A large wheel
or npm tarball could therefore spend the package manager's complete 60-second
idle timeout upstream. The client then closed its socket, while the proxy
continued for its own 120-second timeout and reported `BrokenPipeError`.
Increasing only the client timeout would reduce frequency but preserve full
redownloads and the mismatched whole-body buffering behavior.

Direct M4 host probes on 2026-07-25 showed that registry artifacts can arrive
quickly when the path is healthy, so the problem is intermittent latency and
duplicate cold downloads rather than a consistently slow registry.

## Decision

Keep registry metadata buffered for safe URL rewriting, but stream immutable
wheel and npm tarball bodies to the build client as soon as upstream headers
arrive.

At the same time:

- write streamed public artifacts to an atomic, content-length-validated cache
  under `~/.cache/npcink-ai-cloud-m4-dev/package-proxy`;
- key entries by the SHA-256 of the fixed allowlisted upstream URL;
- serialize duplicate fills for one URL inside the managed proxy process;
- finish a valid cache fill after a downstream disconnect when upstream still
  succeeds;
- reject symlinked, truncated, malformed, orphaned, and partial entries;
- cap the cache at 2 GiB and expire entries unused for 14 days;
- expose only aggregate shutdown counters and no URLs, credentials, or package
  names;
- use a 300-second pip and pnpm fetch timeout, four pnpm retries, and pnpm
  network concurrency eight in M4-only generated recipes;
- persist the BuildKit pnpm store across frontend image rebuilds;
- leave canonical Dockerfiles, lock files, dependencies, and production
  behavior unchanged.

The cache is disposable M4 build state. It is not source or Git truth,
dependency truth, an accepted-revision cache, a private-package repository, or
another Cloud control plane. Frozen lock files and package-manager integrity
checks remain authoritative.

## Alternatives Considered

### Increase package-manager timeouts only

Rejected as the complete remedy. It helps a slow request finish but retains
the first-byte delay and repeats every large download after an image-cache
miss.

### Use a public third-party PyPI or npm mirror

Rejected. It changes the supply path and trust boundary without evidence that
the fixed upstream registries are consistently slow. The M4 host already
reaches the canonical public registries.

### Cache registry metadata

Rejected for this iteration. Metadata is small, mutable, and requires URL
rewriting. Caching only immutable artifact bodies gives most of the benefit
without stale package-index behavior.

### Store artifacts on the private source relay

Rejected. ADR-026 defines that relay as a transient source-bundle transport
buffer. Making it a package repository would add retention, availability, and
dependency-trust responsibilities to the wrong host.

### Copy dependency trees or built images from the authoring Mac

Rejected. M4 remains the only routine Cloud Docker build/runtime host, and
platform-specific dependency trees are not portable source.

## Consequences

- Build clients receive headers before the proxy downloads a complete large
  artifact.
- A healthy first request can populate a validated cache; later image rebuilds
  can serve that artifact locally.
- A downstream timeout no longer creates an uncaught broken-pipe traceback or
  a corrupt cache hit.
- M4 retains up to 2 GiB of disposable package artifacts and a separate
  BuildKit pnpm store cache.
- Registry metadata and first-time artifact downloads still depend on current
  M4 host connectivity.
- Aggregate proxy counters make cold, warm, and disconnect behavior observable
  without logging dependency URLs or credentials.

## Rollback

Stop the active M4 operation, remove only
`~/.cache/npcink-ai-cloud-m4-dev/package-proxy`, and revert the proxy,
deployment-script, contract-test, and documentation changes through the normal
GitHub workflow. The prior proxy then resumes buffered, non-persistent
behavior. Do not delete Docker volumes, unrelated M4 caches, or source-relay
state as part of this rollback.
