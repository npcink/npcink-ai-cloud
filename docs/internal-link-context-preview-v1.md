# Internal-link contextual evidence preview v1

Status: development-only projection. Not wired into search, runtime APIs, provider
dispatch or the editor. No ranking, filtering or Apply behavior changes.

Consumer: Toolbox internal-link recommendations. Decision: can the existing
ranked candidates carry traceable source/target context before a semantic judge
is considered? The [Eval Lab contextual study](https://github.com/npcink/npcink-eval-lab/blob/main/docs/link-recommendation-contextual-study-2026-10-27.md)
found that shared phrases and model votes do not establish a correct reference.

## Scope and contract

`app/domain/site_knowledge/internal_link_context.py` exposes the pure
`build_internal_link_context_preview()` function. It accepts at most ten
already-ranked public post/page results, the existing bounded source passages,
and an optional map of same-site sanitized ingestion documents. The caller owns
site authorization, public-source qualification and freshness. This function is
not an endpoint or a substitute for those gates.

It emits `internal_link_context_preview.v1` with the input candidate order and
count intact, `ranking_changed=false`, `apply_authority=false`, and
`write_posture=suggestion_only`. It never mutates the supplied result objects.
It does not return arbitrary result metadata, fetch a URL, call a model, index
content, create a queue or write WordPress state.

Each candidate records:

- Source passage: recheck the supplied passage index and literal anchor rather
  than trusting `exact_source_passage_match`. Missing anchor, missing location,
  absent match and repeated occurrences remain separate states. Repeated
  occurrences have no selected occurrence; up to eight spans plus the total
  occurrence count are reported. Local editor Apply remains authoritative.
- Target: retain the actual retrieved chunk separately from the title and up
  to two 900-character windows around literal anchor occurrences in the
  existing ingestion body. These are **lexical locations**, not passages proven
  to support the reference. A missing body occurrence does not reject a useful
  target. The original retrieved chunk also remains available.
- Provenance: text SHA-256, character count and half-open `[start,end)` offsets
  refer to the exact supplied string, counting Unicode code points. They are
  not HTML, byte or Gutenberg block offsets. No whitespace normalization occurs
  in the projector. The optional body is explicitly bounded ingestion text,
  not a complete-article guarantee.
- Identity: expose at most eight literal public HTTP(S) URL tokens per side,
  excluding credentials, query/fragment-bearing tokens and literal local
  targets. Do not resolve DNS or follow links. Shared tokens do not establish
  resource identity; `identity_status=not_established` always remains explicit.
- Semantics: `semantic_support=not_assessed` regardless of exact matches or
  shared references. None of these fields is a model verdict or write grant.

Source limits follow the existing editor input: 24 passages, 1,200 characters
each, 12,000 total. Optional target bodies are capped at 50,000 characters;
titles, anchors and returned chunks retain existing bounds. Over-limit or
malformed candidates raise a stable `ValueError` code without embedding text.
No candidate is silently truncated, reordered or dropped to fit a limit.
Missing/stale/nonpublic target documents remain explicit and their body is
not projected. Candidate identity includes source type, post ID and chunk index.

This artifact can contain public article text. Keep it in local ignored
evidence, never telemetry, PR bodies or general logs. Treat all text, titles and
URLs as untrusted data when consuming it in AI prompts or UI.

## Reproducible development replay

From this Cloud root, use the existing Eval Lab v4 **development** probes and
their exact Cloud domain baseline:

```sh
python -m scripts.preview_internal_link_context \
  --probes /absolute/path/editor-probes.json \
  --baseline /absolute/path/domain-baseline.json \
  --probes-sha256 <original-probe-file-sha256> \
  --baseline-sha256 <original-baseline-file-sha256> \
  --output /absolute/path/new-local-preview.json
```

The CLI checks file bytes against both supplied hashes and the baseline's
original probe hash, preserves twenty ordered development cases, verifies query
hashes and passage counts, and recomputes the entire public corpus using the
existing Cloud normalizer. A supplied `content_hash` cannot bypass recomputation.
The normalized corpus must match every frozen indexed document fingerprint.
It refuses holdout inputs and existing output files. No database, embedding or
provider request is made. Output separates the historical retrieval source
hashes from the current projection revision and exact file hashes. An uncommitted
projection is identified by file hashes; HEAD alone does not claim its contents.

This is replay of historical candidates, not new retrieval, API/Addon evidence,
an accepted M4 deployment, production evidence, or human quality acceptance.
Tests cover input invariants, Unicode positions, stale/private targets, repeated
anchors, missing evidence, size limits and forged/cross-baseline inputs.

## Integration gate

Do not connect this preview to runtime merely because the projector passes.
First establish a named stable runtime/corpus and review source/target evidence
coverage, including useful positives, clear wrong tasks and entity uncertainty.
Keep target usefulness, anchor reference and destination support separate. Model
agreement or valid quotations cannot become automatic acceptance.

Any later runtime integration must specify authenticated site scoping,
freshness, response size, provider budget/timeout, uncertainty and failure
behavior. It must use Cloud's existing semantic/provider seams, retain Toolbox/
Toolkit editor checks, and preserve normal local Publish/Update ownership.
No provider, prompt/router registry, new index or automatic link writer is
introduced here. Removal of this module and CLI rolls back the prototype;
existing search behavior does not depend on them.

Measured development results and remaining gaps are recorded separately in
[the October 27 replay receipt](internal-link-context-preview-2026-10-27.md).
