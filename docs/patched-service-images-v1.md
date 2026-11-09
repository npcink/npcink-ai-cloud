# Bounded security patches for packaged service images

Status: source contract; a merged change is not production deployment evidence.

The official Redis/NGINX Alpine images can lag an available distribution
security fix. For the 2026-11-09 zlib scan finding, the verified official tags
still contain `1.3.2-r1`, while Alpine publishes `1.4-r0` as the fix for
`CVE-2026-4738`. Keep the existing empty CVE allowlist and fail-closed scanner.

## Build and identity

`Dockerfile.redis` and `Dockerfile.nginx` add only the minimum-version zlib APK
upgrade to the already locked official upstream bases. They inherit the
upstream entrypoint, command, user, paths and exposed ports. The production
Compose services and their local release aliases remain the same.

The image lock declares the upstream references as `dockerfile_base` inputs
and the patched images as scanned local outputs `external_redis` and
`external_nginx`. The existing bundle builder builds these extra outputs once,
scans the resulting image IDs, then packages those exact scanned archives.
Archive paths and deployment roles remain `dist/external-redis.tar.gz` /
`external_redis` and `dist/external-nginx.tar.gz` / `external_nginx`.

The patched output is a local build. Its source identity is its declared
release alias and actual scanned image ID; it must not claim the unmodified
upstream image's RepoDigest. The locked `FROM` and checksummed source inputs
record upstream provenance. The verifier distinguishes built outputs from
upstream external roles by the reviewed lock, rather than the `external_`
prefix alone. Legacy bundles retaining unmodified external images continue to
require their exact upstream RepoDigests.

## Verification and removal

Before release, build the exact candidate for the target platform, verify the
installed APK version, compare inherited runtime metadata to the locked base,
and exercise Redis PING and NGINX configuration/HTTP behavior in disposable
containers. Run a fresh canonical scan of all four distinct packaged images;
worker aliases still require actual image-ID equivalence to API. A focused
package probe or custom scan does not establish exact-release acceptance.

No image registry, additional runtime service or new provider execution is
required. When official images include the fix, remove these two patch layers
through a reviewed lock/Dockerfile change and repeat the same release gates.
Do not mutate live containers or patch application images directly on a host.
