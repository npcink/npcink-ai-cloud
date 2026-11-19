# WordPress text input limits v1

Status: active source contract; development candidate on 2026-11-17. Deployment
and verification states below are separate from source behavior.

## Bounds and ownership

For `wordpress_operation.v1` source-text tasks (title, excerpt, meta description,
summary, rewrite, translation and editorial updates), trimmed `source_text` may
contain up to **50,000 Unicode code points**, including markup. This does not
promise 50,000 visible words or 50,000 generated characters. `system_instruction`
remains independently bounded at 12,000 characters. Other prompt/ALT and image
character limits and the 60-second maximum text timeout remain unchanged.
Rewrite, translation and editorial-update output budgets now scale with source
length; see the [approved follow-through contract](wordpress-text-budget-followthrough-2026-11-17.md).
100,000-character input, automatic chunking and automatic retries are not added.

Addon caller source-text envelopes allow at most 512 KiB of JSON encoded with
`JSON_UNESCAPED_UNICODE`; other text prompts use 128 KiB, while ALT retains
its 24,000-byte envelope bound. Image prompts remain 4,000 characters with a
64 KiB caller envelope. Article review retains its independent content limits
while measuring its 120,000-byte caller envelope as UTF-8 JSON. The fixed normalized identity wrapper adds bounded overhead. HMAC hashes the
exact final body sent over HTTP. Cloud's existing 1 MiB
public request cap is unchanged. Cloud source-character validation is independent
of the local byte guard, so bypassing Addon cannot bypass the character cap.

The transport preserves the upstream Ability's source and instructions, apart
from existing outer whitespace normalization. Do not strip formatting, truncate,
rewrite prompts or fan out paid calls to make an oversized request pass. Ability,
prompt and final WordPress writes remain local; Cloud remains runtime only.

## Model capacity and error guidance

Passing the input contract does not prove that a selected model can process it.
Existing context preflight includes estimated input, requested output and safety
margin when model capacity is known. Its existing conservative non-ASCII token
estimate and provider-reported overflow handling remain in force. Missing catalog
capacity is not proof of unlimited capacity. A rejected preflight makes no
provider call; it must not be advertised as completed generation.

Classify structured errors before generic provider failures: source over-limit
asks for shorter input and states 50,000; instruction over-limit states 12,000;
`provider.context_overflow` asks for shorter input or a larger-context model.
Image errors must not inherit the text-specific 50,000-character claim. Keep the
original diagnostic code in copied support evidence.

## Regression and development evidence

The former 24,000-byte Addon guard rejected a 4,200-character Chinese source
because default JSON escaped each character. The observed article had 19,342
raw characters / 26,000 UTF-8 bytes but only 4,663 characters after stripping
markup. Connection checks had not executed generation and could not detect it.

Prevent recurrence by testing Unicode code points and encoded bytes separately:
Chinese, supplementary Unicode, formatted content, exactly 50,000, 50,001,
12,000/12,001 instructions, excessive auxiliary bytes, exact transmitted-byte
signatures, and model context rejection before dispatch. ASCII-only examples or
connection-health checks are not long-input proof. Test doubles must honor real
JSON encoding flags and depth; an encoder stub that ignores flags cannot verify
wire size or Unicode signing behavior. Use fake providers to test
transport and validation without manufacturing paid observations.

Entry points: Cloud API `test_long_source_preserved_through_fake_provider` and
`test_p2_text_source_contract_fails_closed_before_provider`; runtime
`test_context_preflight_fails_closed_without_rewriting_or_upstream_usage`;
Addon `tests/behavior-wordpress-ai-connector-runtime.php` and
`tests/behavior-wordpress-ai-connector-result.php`. Local WordPress and M4
candidate receipts are recorded separately; merge, CI, production and real-model
quality/latency acceptance are not inferred from these tests.

### 2026-11-17 verification receipt

- Local Cloud: 270 API/runtime tests passed, Ruff and targeted mypy passed.
  The additional model-capacity case rejects 50,000 non-ASCII characters with
  unchanged input, zero provider attempts/tokens/cost and no retry.
- Addon: `test:all`, PHPStan, WordPress.org review, POT freshness, rebuilt ZIP
  verification and strict Plugin Check passed. PHP without mbstring also passed
  the focused connector behavior suite. Playground WP 7.0.4 / PHP 8.2 passed.
- M4 candidate: source sync completed; the two focused API/runtime files passed
  270 tests using fake providers. This is a dirty development candidate based on
  `f17354f234d2`, not a merged, accepted or production revision. Final source-byte
  synchronization matched all three changed Python file hashes; the final
  boundary confirmation passed 35 tests. Both receipts are retained alongside
  the initial full-file run.
- Real Local WordPress: mounted Addon source resolved to the existing standalone
  checkout. Article 279790 (19,342 characters / 26,000 bytes) passed local
  normalization unchanged; the 50,000-character HTML/Chinese/emoji boundary
  sample was preserved, with a 175,693-byte normalized UTF-8 wire body.
- Real signed WordPress → M4 negative request: 50,001 characters returned HTTP
  400 / `wordpress_operation.source_text_too_large`. This bypassed the local
  guard only in the external read-only smoke script; no successful provider
  execution was requested. Article title/body/excerpt/status/modified fingerprint
  remained unchanged. Locale guidance is additionally checked under simulated
  REST context, not claimed as browser acceptance.
- Not established: real-model long-input quality/latency, fresh browser error
  rendering, CI, merge, M4 accepted, production deployment or human acceptance.
  No paid generation was performed. Rollback is to revert this task's source,
  byte-encoding and error-classification hunks in both repositories; keep existing
  options, article content and unrelated receipt-recovery changes intact.

External evidence group: `long-text-20261117` (Cloud local/M4 test logs, local
WordPress JSON, Addon gates, package identity and source hashes). The earlier
Pgy tunnel attempt failed to expose a listener; the source transfer itself later
completed. Existing healthy loopback forwarding was reused after checking its
health; no unrelated tunnel was replaced.

The [follow-up limit audit](wordpress-input-limit-audit-2026-11-17.md) records
additional corrected encoding/clipping defects and remaining Toolbox budgets.
