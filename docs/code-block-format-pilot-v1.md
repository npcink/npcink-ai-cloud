# Code block format pilot v1

Opt-in development only. This does not change the body-format contract or its
code protection. One explicit editor request sends a single snippet and its
author-selected language, never the article, post ID, or WordPress block ID.

Use signed `POST /v1/runtime/execute`: ability `npcink-toolbox/format-code-block`,
contract `code_format_request.v1`, existing `content_format` execution kind and
`content-format.managed` profile, `text` family, `editor` channel, `inline`, `pii`,
`no_store`, 10-second request budget, no callbacks, retries, or retention.
Input keys: `code` (1–16384 UTF-8 bytes, nonblank), `language` (`javascript`,
`css`, `json`), `source_sha256` (exact code bytes). Cloud returns
`code_format_candidate.v1` with `language`, `source_sha256`, `candidate_sha256`,
`candidate`, `status` (`CHANGED`, `UNCHANGED`, `SKIPPED`) and
`direct_wordpress_write: false`. Non-changed statuses return the source exactly;
the result is bounded to 65536 UTF-8 bytes. Replays never return code.

Pinned Prettier parses and prints, without executing snippets, loading user
configuration, or accessing a provider. Parsed before/after trees must match
under Prettier's normalized comparison, and a second format must be identical.
This is a conservative guard, not a proof of equivalent behavior. Parse errors,
mixed line endings, ignore directives, and invariant failures are skipped.
WordPress separately validates status and digests and only applies a reviewed
candidate to the original selected block in visible editor state. No Cloud save.

For an isolated Cloud development checkout with Node and npm available:

```sh
npm ci --prefix app/domain/content_formatting/code_formatter --ignore-scripts
NPCINK_TEST_CODE_FORMAT_PILOT=1 uv run --locked --extra dev pytest tests/api/test_code_formatting_runtime.py
```

Set `NPCINK_CODE_FORMAT_PILOT=1` on the isolated Cloud API process to enable
the signed preview. The contract also requires `NPCINK_CLOUD_ENVIRONMENT` to
be `development` or `test`; staging and production cannot enable it. This pilot
does not add Node to the default Cloud image, change a shared M4 instance, or
authorize a release. Remove the flag to disable it. Never submit secrets.
