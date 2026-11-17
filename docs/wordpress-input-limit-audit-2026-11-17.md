# WordPress input limit audit — 2026-11-17

Follow-through: the operator subsequently approved all four recommendations.
Their current implementation and evidence are recorded in
[the follow-through contract](wordpress-text-budget-followthrough-2026-11-17.md).
The audit tables and 416-test receipt below describe the preceding checkpoint;
the independent 12k output clipper and unrepaired Toolbox findings are superseded
by that approved candidate.

Scope: source audit of the installed WordPress AI editor path, Addon text/image/
article-review guards, Cloud validators/output normalization, and Toolbox editor/
question context. Deterministic reproductions below are local development evidence;
this is not proof of every product entrypoint or production behavior.

## Confirmed defects corrected in this candidate

| Path | Reproduction before correction | Correction and preserved boundary |
| --- | --- | --- |
| WordPress AI and Toolbox image generation | 4,000 Chinese prompt characters rejected by the 12,000-byte envelope before the 4,000-character guard; emoji also failed earlier | 64 KiB caller-envelope cap, UTF-8 JSON measurement and transport; prompt stays 4,000, image count/context/model budgets unchanged |
| Other WordPress text tasks using `prompt` | 12,000 Chinese/emoji characters could not fit the 24,000-byte envelope even though they satisfy the character contract | 128 KiB caller envelope for non-source text; prompt stays 12,000; ALT retains its 24,000-byte envelope and 500-character prompt |
| Article language review | Twenty blocks × 1,500 Chinese characters passed all block/UTF-16/raw-byte rules but failed the 120,000-byte escaped-JSON guard | Measure and transmit UTF-8 JSON; preserve 30,000 UTF-16 units, 80 blocks, 1,600 units/block and 100,000 raw-text bytes; no automatic splitting or paused-check activation |
| Ability output schema projection | A localized description of 2,500 Chinese characters fits Cloud's 12,000 UTF-8-byte schema budget but Addon escaped JSON exceeded it | Align Addon measurement with Cloud's existing UTF-8 encoding; retain the 12,000-byte schema limit and original schema/hash ownership |
| Shared Addon bounded-text helper | With cap 1,200, 800 Chinese characters became 400; 800 emoji became 300, even with mbstring installed | Unicode substring returns directly; portable fallback also cuts only at Unicode boundaries. Preserve existing character caps and normalization |
| Input/output constant coupling | Prior 50k-input candidate reused the source limit for rewrite/translation/editorial-update output normalization; 13,300 output characters were accepted rather than bounded at the previous 12,000 | Separate `WP_AI_CONNECTOR_MAX_TEXT_OUTPUT_CHARS=12000`; retain 50,000 source input and existing output token defaults. This corrects the preceding candidate's unintended side effect |

Caller-envelope byte caps include auxiliary fields before the fixed identity wrapper
is added. Public Cloud ingress stays at 1 MiB. Exact final transmitted UTF-8 bytes
are HMAC-signed. Regressions cover both image surfaces, supplementary Unicode,
all review blocks, schema acceptance/rejection and exact-byte transport signatures.
Before/after repro data is external group `limit-audit-20261117`; no paid provider
calls were needed. The output-coupling regression failed in all three tasks before
correction. Existing output-bound tests now name the independent output constant.

## Remaining narrower limits: not all are defects

| Surface | Current source limit | Assessment / next step |
| --- | --- | --- |
| Toolbox Smart Ask plus four insight-pack question bridges | 2,000 **bytes**, about 666 ordinary Chinese characters; one bridge says “2000 characters” | Confirmed source-level unit mismatch and restrictive multilingual question budget. All consumers must agree before changing; do not widen only the entry screen. No live user failure reproduced and no change in this candidate |
| Toolbox content-support context | selected text 2,000 characters; full-article context 30,000 | Separate endpoint from the official WordPress AI source-text path. Source confirms clipping; which active intent consumes each context and whether truncation is visible must be verified before expanding. Do not claim all editor tasks support 50k |
| Toolbox shared payload/text helpers | Some `mb_strlen` checks fall through to byte-based `substr` when under the character cap, matching the Addon defect pattern | Source finding only for Toolbox. Fix requires its own consumer/encoding regressions; no Toolbox source edited in this candidate |
| Article formatting | 100,000 UTF-8 input bytes (roughly 33,333 Chinese characters before markup), 200,000 output bytes | WordPress and Cloud agree; deterministic HTML formatting has a separate bounded contract. It is narrower than 50k Chinese text, but no cross-layer mismatch proved |
| WordPress text rewrite/translation default output | Rewrite fallback budget 512 tokens; editorial updates 256; translation fallback depends on task family; consumer `max_tokens` can override defaults | A 50k source allowance is not a promise of 50k output. End-to-end token budgeting, incomplete-result detection and latency need a separately defined long-output requirement; do not simply lift numeric caps |
| WordPress title/summary/excerpt outputs | 80 / 220 / 180 characters in Cloud output normalization | Intent-specific short suggestions; retain rather than treating them as article limits |
| ALT input and retrieved evidence | ALT prompt 500 characters; Site Knowledge passages 1,200 each / 12,000 total; retrieval chunks 900 | Task or retrieval context budgets, not full-article source contracts. No evidence here justifies raising them |
| Audio generation | 5,000 text characters | Runtime paused; retain pause and existing implementation, no limit expansion |

Toolbox source anchors: `includes/Smart_Ask.php`, the four
`Rest_*_Insight_Bridges.php` question validators, `Rest_Editor_Content_Support.php`,
`Provider_Client_Support.php` and `Editor_Content_Format.php`. Cloud anchors:
`app/domain/wordpress_ai_connector/{contracts,runtime}.py`,
`app/domain/article_review/contract.py`, `app/domain/content_formatting/engine.py`.
Addon anchors: `class-cloud-runtime-request-guards.php`,
`class-cloud-runtime-client.php`, `class-cloud-ai-task-contract.php`.

## Engineering rule and verification

Track content characters, UTF-16 offsets, raw UTF-8 bytes, encoded JSON bytes,
provider token/context capacity and result limits separately. Each budget needs a
named owner and unit; bytes must not silently substitute for advertised characters.
A serialization limit must accommodate the maximum allowed localized content plus
its bounded wrapper. A long input contract must not share a constant with an
output clipper. Reaching a guard is not proof of provider generation, quality or
successful adoption. Preserve input; expose truncation where it is intentional.

Final verification: local Cloud and M4 candidate each passed **416 tests** across
WordPress operation normalization, signed API contracts and provider context
preflight. Ruff and targeted mypy passed. Final changed Python file hashes match
M4's source bytes. Addon `test:all`, PHPStan, WordPress.org review guard, POT
freshness, rebuilt package verification and strict Plugin Check passed; Playground
WP 7.0.4/PHP 8.2 passed. The focused connector suite also passed with PHP mbstring
disabled.

Real Local WordPress pure-guard replay accepted both 4,000-character image prompts
and the complete 30,000-character Chinese review snapshot; it preserved the
800-character Chinese/emoji helper samples at a 1,200-character cap. The mounted
source was the existing standalone Addon checkout. No network/provider call was
made by that replay; persisted article fingerprint was unchanged. Exact-byte HMAC
transport proof is from the HTTP doubles, not claimed as paid image/review E2E.
No UI layout or copy changed; no fresh browser rendering acceptance is claimed.

External evidence group: `limit-audit-20261117`, including before/after JSON,
failing-before output regression, real WordPress replay, local/M4 logs and source/
package hashes. CI, merge, M4 accepted, production and human acceptance remain
unverified. Toolbox findings remain source-audit findings, not repaired or E2E
accepted. No secrets, runtime pauses, production configuration or WordPress writes
changed. Roll back only these audit hunks; preserve the preceding 50k-source and
unrelated receipt/support changes.
