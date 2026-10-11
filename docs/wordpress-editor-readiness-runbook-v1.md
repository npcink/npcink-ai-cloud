# WordPress Editor Readiness Runbook v1

Status: active operational guide.

Purpose: prevent invalid editor acceptance runs when the local WordPress
environment or the Cloud vector recommendation endpoint is unavailable.

## Scope and boundary

This check is read-only. It does not start Docker, change WordPress options,
write posts, synchronize content, issue keys, or call a provider. WordPress
remains the local approval and final-write owner. Cloud is only checked as the
runtime/detail provider for recommendation requests.

## Run the check

Set the WordPress document root explicitly, then run:

```bash
NPCINK_WP_ROOT="/path/to/app/public" \
  NPCINK_WP_MYSQL_SOCKET="/path/to/mysqld.sock" \
  pnpm run wordpress:editor:readiness -- --json
```

The command checks:

- WordPress root and WP-CLI availability;
- database connectivity through a read-only `SELECT 1` query;
- the site URL;
- active Cloud Addon and Toolbox plugins;
- `http://127.0.0.1:18010/health/live` by default.

Use `--cloud-url` or `NPCINK_CLOUD_EDITOR_URL` when the local Cloud endpoint
uses another port. Plugin slugs can be overridden with
`NPCINK_WP_ADDON_PLUGIN` and `NPCINK_WP_TOOLBOX_PLUGIN`.
For Local sites, pass the site's active `mysqld.sock` through
`NPCINK_WP_MYSQL_SOCKET`; the command then launches WP-CLI with that socket and
does not modify `wp-config.php`.

## Decision rule

Only a result with `status=ready` may proceed to real editor recommendation
acceptance. A `cloud=unavailable` result means that internal-link and related-
article quality are **not validated**; do not treat `candidate_source=local_fallback`
as a cloud vector result.

Coverage validation and vector recommendation validation are separate checks:

1. run readiness;
2. validate indexed/not-indexed coverage;
3. only with Cloud ready, validate related articles and internal links;
4. record HTTP status, retrieval status, candidate source/count, and whether
   WordPress was written.

## Run the read-only acceptance sample

After readiness passes, run the bounded real-consumer check against three
existing posts:

```bash
NPCINK_WP_ROOT="/Users/muze/Local Sites/magick-ai/app/public" \
NPCINK_WP_MYSQL_SOCKET="/path/to/mysqld.sock" \
pnpm run wordpress:editor:acceptance -- --limit 3
```

The command calls both `related_articles` and `internal_links` for each
sampled post. It reports per-request duration, HTTP status, candidate source,
retrieval status, candidate count, Cloud result count, fallback usage, and the
`direct_wordpress_write` boundary. It also compares the post content hash and
modified timestamp before and after the requests. A passing result requires
the sampled posts to remain unchanged; it does not prove recommendation
quality.

To measure the whole acceptance phase in the shared timing receipt:

```bash
pnpm run timing:acceptance -- \
  --receipt .tmp/acceptance-timing.json \
  --stage editor_acceptance \
  --question "Do three existing posts return cloud-vector recommendations without WordPress writes?" \
  -- env \
    NPCINK_WP_ROOT="/Users/muze/Local Sites/magick-ai/app/public" \
    NPCINK_WP_MYSQL_SOCKET="/path/to/mysqld.sock" \
    pnpm run wordpress:editor:acceptance -- --limit 3
```

For targeted reproduction, pass one or more `--post-id` values. Do not place
secrets in command arguments because the timing receipt retains the command
list.

## Summarize natural samples

Save each acceptance JSON output under `.tmp/editor-acceptance-samples/`, then
summarize without contacting WordPress or Cloud again:

```bash
pnpm run wordpress:editor:acceptance:summary -- \
  .tmp/editor-acceptance-samples/*.json
```

The summary reports per-intent p50, maximum, and mean latency, first-request
latency, retrieval-status counts, fallback count, non-`200` count, write-boundary
failures, unchanged-post count, and failed-sample count. Treat fewer than five
natural samples as an observation, not a performance conclusion. Do not clear
caches or add a cache-busting parameter to manufacture a cold sample.

## Evidence

For repeatable reports, preserve the `--json` output beside the editor smoke
receipt. The output includes `write_operations=false`, the failed prerequisite
names, and a safe next action. It is diagnostic evidence, not proof of
recommendation quality or production acceptance.
