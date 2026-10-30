# GPT-6.1 Sol inherited reasoning default

Development fix, 2026-10-30; no production configuration change.

The actual public-site answer run `run_7b9832237f104605967a49a92c126afa`
failed with `provider.invalid_request`: the shared connection inherited
`default_reasoning_effort=none`, which GPT-6.1 Sol rejects. This is separate
from the internal Site Knowledge request correction in #1322.

[Official reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning#reasoning-effort)
states that GPT-6.1 Sol supports low, medium, high, xhigh and max, with medium
as its upstream default; none/minimal are unsupported. For an inherited
connection default of none only, the Chat adapter uses low for this model
and its date snapshots. This preserves the connection's low-latency intent.
The existing namespace resolver runs first. Unknown suffixes and other model
families retain their behavior. Explicit request reasoning choices, including
unsupported none, remain authoritative and may still fail upstream.
Explicit reasoning/thinking modes do not receive a contradictory effort.
Responses continues to omit the Chat-only connection default.

The change neither edits stored connection/profile configuration nor adds
retries, model fallback, parameter probing, billing rules or WordPress writes.
Output limits and usage accounting continue through the existing contract.
All regression calls use MockTransport and fake credentials. The new cases
first reproduced five failures; after the fix all 100 adapter tests pass.
Actual grounded-answer quality requires separate bounded consumer evidence.

M4 candidate adapter suite: 100 passed. A subsequent actual Local WordPress
tail-question run `run_973f7e2553da40f686f23b8bc1a92a03` completed in 14 seconds,
with three exact quotes from post 280942 chunks 12/14 and a no-store REST
response. Its claims match the retrieved Nginx 404 instructions. This single
answer is a development functional check, not broad quality or adoption proof.

Rollback: revert this isolated adapter change through normal Git review;
no migration or configuration rollback is required. The affected model's
inherited none requests will fail again until configuration or compatibility
is corrected. M4 candidate/accepted status and production status are separate.
