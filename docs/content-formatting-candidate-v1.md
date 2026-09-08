# Content Formatting Candidate v1

Status: development candidate with a WordPress editor consumer; merge and
accepted-runtime evidence must be recorded separately.

## Structure Candidate v2

The existing endpoint also accepts `content_format_request.v2` for HTML only.
It returns the full `content_format_candidate.v2` body and adds integer
`structural_changes`; `inserted_spaces` counts spacing insertions only, not
serialized byte delta. v1 retains spacing-only behavior for existing callers.
No operation plan or WordPress write authority is returned.

v2 repairs only plain top-level paragraphs: repeated existing BR/star list
markers permit missing BR insertion before an unambiguous Han/star/Han item;
two or more contiguous Chinese-label links following an introduction sentence,
with a final labeled numeric scalar, can become a native unordered list.
Existing feature-list stars remain visible, as in the operator's reference.
Eligible paragraphs longer than 180 non-whitespace characters are checked
for balanced sentence-boundary splits. Each side needs at least two complete
sentences and 40 non-whitespace characters. Closing quotes/brackets remain with
their sentence. This is a conservative readability heuristic, not semantic
paragraph understanding or a hard maximum length. No comma/space fallback,
paragraph merging, global star replacement, rewriting, model
calls or theme/CSS edits. Ambiguous cases and attributed/nested paragraphs
remain outside structural repair. Media and link source fragments are retained.

Rich paragraph support uses visible-text-to-source offsets for `a`, `strong`,
`em`, `b`, `i`, `s`, `del`, and opaque inline `code`. Cuts are eligible only
after all inline tags close. Tags are never duplicated/reopened to force a
cut; a whole paragraph wrapped in emphasis may therefore remain unsplit.
Recognized entities retain their exact source spelling. Unknown/malformed
markup, BR-bearing prose and attributed/nested paragraph blocks remain
outside this generic split path. WordPress protects inline-code text just as
strictly as link text, including when supported sibling content changes.

### Semantic Experiment Decision (2026-09-08)

The default runtime still makes zero model/embedding calls. Eval-lab compared
the rule baseline with temporary sentence-window embeddings and JSON-only
model boundary proposals on four original-blog paragraph pairs. Pairs were
joined only in ignored evaluation fixtures; source articles were read-only.
Original author boundaries are a reference, not human-reviewed gold.

The trial used existing M4 `qwen3-embedding:0.6b` and `qwen3.5:9b`: 11 local
requests, no paid provider, new model download or vector database. Embeddings
improved one reference match but overfragmented another sample. Two model
cases failed output validation; one further case added cuts on repeat.
Do not enable either method in the editor based on this pilot. Further semantic
research is paused by operator decision. A future explicitly approved trial
would need allowed-boundary constraints and a varied held-out set; do not tune
on these four cases and call it general gain.
The eval tool and receipt live in eval-lab `content-format/README.md` and its
ignored `.local-evidence/content-format/` directory. Cloud exports source-bound
rule baselines through `scripts/export_content_format_samples.py`; eval-lab
does not import production modules or acquire WordPress write authority.

### Reference Adoption (2026-09-08)

- [pangu.js](https://github.com/vinta/pangu.js/): adopt CJK/ASCII spacing on
  eligible text only; do not process serialized HTML or Markdown as plain text.
- [Heti](https://github.com/sivan/heti): distinguish typography presentation
  from saved content. Do not inject its global CSS, punctuation compression or
  DOM auto-spacing into the editor. Theme typography is a separate decision.
- [Chinese copywriting guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines):
  adopt CJK/English/digit spacing; exclude casing, brand, punctuation, fullwidth,
  unit and terminology rewrites from the preservation-first default.
- [SSPAI manual](https://manual.sspai.com/rules/manual-of-style/): use actual
  paragraphs, not empty lines for visual spacing; avoid one-sentence fragmentation.
  Logical paragraph grouping cannot be guaranteed by deterministic rules.
  Do not invent captions, turn technical terms into code, or normalize prose.

Existing source text, images, tables, code and links take priority over style
rules. Unsupported rich paragraphs remain unchanged structurally. Preservation
and idempotence gates are mandatory; an automated score is not human acceptance.

Consumers must independently compare text order, inline attributes, links,
and protected block sequences while allowing only paragraph/list/BR changes.
The old exact-markup/inserted-byte-delta validator is not suitable for v2.
WordPress performs native block validation and one undoable editor transaction,
not backend saving. New split blocks can have new IDs; unchanged blocks retain
their existing identities. Actual UI and frontend-style evidence are required
before claiming operator usefulness.

## Ownership and Scope

Cloud executes deterministic formatting. WordPress Toolbox owns the native
editor entry, independent validation and undoable application; Cloud Addon owns
signed transport. It does not register a second Cloud
ability registry, create a standalone product webpage, or write WordPress data.
The `npcink-toolbox/format-content` identifier is reserved for its local caller;
cross-repository consumer acceptance must precede product closeout.

There are no model calls, prompts, Nano features, paragraph rewriting, format
conversion, server-side WordPress saving, publication or restore in Cloud.
Existing site authentication, entitlement and run metering remain authoritative.

## Request

Use the existing HMAC-signed `POST /v1/runtime/execute` endpoint with a fresh
idempotency key. Required runtime fields are:

| Field | Value |
| --- | --- |
| ability_name | `npcink-toolbox/format-content` |
| ability_family | `text` |
| contract_version | `content_format_request.v1` |
| execution_kind | `content_format` |
| profile_id | `content-format.managed` |
| execution_pattern | `inline` |
| storage_mode | `no_store` |

`input` contains exactly `content` (1-100000 UTF-8 bytes), `format` (`html` or
`markdown`), and `source_sha256` (hex SHA-256 of the exact UTF-8 source).
Use `data_classification=pii` for editor content that may contain personal data.
The existing secret-data guard still rejects secret content. Callbacks, task
backends, retries, and retention are forbidden; timeout is bounded to 0-30 seconds.
Unsupported contract fields and source-digest mismatch fail before run creation.

## Result and Safety

The normal runtime envelope returns `content_format_candidate.v1` in `result`.
Its fields include `format`, `source_sha256`, `candidate_sha256`, `candidate`,
`status`, `inserted_spaces`, `visible_characters_preserved`, and
`protected_content_skipped`. `direct_wordpress_write` is always false.

Only ASCII spaces between Han characters and ASCII letters/digits are inserted.
Python's HTML parser provides source text offsets. `markdown-it-py` provides
CommonMark block spans; blocks with unsupported inline constructs are skipped.
Neither parser serializes the source: attributes, comments, original line
endings, and unmodified spans remain byte-identical.

- `CHANGED`: spacing insertions without skipped protected content.
- `UNCHANGED`: no spacing insertion and no identified protected construct.
- `PARTIAL`: supported spans changed, while protected content stayed identical.
- `REVIEW`: protected content was skipped without changing the candidate.
  This is not approval or permission to write.

Known conservative limits: links, code, tables, URL/path/email-bearing spans,
inline Markdown markup, math, shortcode-bearing documents, front matter,
unknown HTML tags, and unsupported Gutenberg blocks are protected. Balanced
gallery, image and custom blocks are preserved while supported siblings can
change. Unknown unwrapped HTML structure skips the whole HTML document. Markdown Gutenberg/shortcode
markers skip the whole Markdown document. Cross-inline-node spacing is deferred.
Common Gutenberg presentation attributes are supported; bindings and unknown
attribute keys are protected.
Non-whitespace invariant failure returns `candidate=null` and `REVIEW`.

Cloud output is untrusted presentation data. A WordPress consumer must check the
result contract, format, source digest, candidate digest and invariant again,
discard a candidate if the editor changed during the request, and validate native
blocks before editor application. Cloud supplies no save or publish action.
Malformed HTML declarations return unchanged `REVIEW` results, not parser errors.
Marked declarations (`<![...]>`) are explicitly protected: Python 3.12 and 3.14
parse them differently, so exception handling alone is not a portable guard.
Regression evidence must include both source and actual runtime environments.

## Retention and Replay

Source and result bodies are not persisted in run records. The first response
contains the transient candidate. Idempotent replay returns the same run id but
does not recover candidate text; the caller must make a new explicit request
with a new key. Never imply that replay can restore the candidate.

## Verification and Rollback

Focused gates are `tests/domain/test_content_formatting.py` and
`tests/api/test_content_formatting_runtime.py`, plus changed Python quality.
The existing media-batch API tests guard the neighboring deterministic path.
An M4 image rebuild is required for the added Markdown parser dependency.

Rollback removes the formatting dispatch and module and restores the prior
dependency manifest/lock from reviewed Git. No database migration or WordPress
data rollback is needed. M4 rollback requires the governed candidate operation
from the known-good source; source restoration alone does not restore its image.
