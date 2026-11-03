import json
import subprocess
from copy import deepcopy
from hashlib import sha256

import pytest

from app.domain.site_knowledge.internal_link_context import text_sha256
from app.domain.site_knowledge.service import _normalize_public_document
from scripts.preview_internal_link_context import main, read_frozen, replay, source_revision


def fixture() -> tuple[dict, dict]:
    document = {
        "post_id": 100, "post_type": "post", "post_status": "publish",
        "title": "intro.js tutorial", "url": "https://site.test/100",
        "content_excerpt": "A tutorial for intro.js.",
    }
    normalized = _normalize_public_document(document)
    assert normalized is not None
    probes = {
        "contract": "retrieval_probe_input.v4", "split": "development",
        "cases": [{"case_id": f"case-{i}", "payload": {
            "intent": "internal_links", "current_post_id": i,
            "query": "intro.js", "source_passages": ["Try intro.js."],
        }} for i in range(1, 21)],
        "corpus_documents": [{"document": document}],
    }
    rows = [{
        "post_id": 100, "source_type": "post", "chunk_index": 0,
        "title": document["title"], "url": document["url"],
        "chunk": document["content_excerpt"], "anchor_or_context": "intro.js",
        "anchor_evidence": {"source_passage_index": 0},
    }]
    baseline = {
        "split": "development", "provenance": {"probe_input_sha256": "fixture"},
        "shared_index_mutated": False, "wordpress_write": False,
        "cloud_source_sha256": {},
        "index": {"documents": 1, "document_fingerprints": [{
            "post_id": 100, "content_hash": normalized["content_hash"],
        }]},
        "cases": [{
            "case_id": f"case-{i}", "intent": "internal_links", "source_post_id": i,
            "query_sha256": text_sha256("intro.js"), "source_passage_count": 1,
            "response": {"status": "ready", "intent": "internal_links", "results": rows},
        } for i in range(1, 21)],
    }
    return probes, baseline


def test_replay_runs_the_projection_and_keeps_every_frozen_result() -> None:
    probes, baseline = fixture()
    before = deepcopy((probes, baseline))
    report = replay(probes, baseline, "fixture")
    assert len(report["cases"]) == 20
    assert report["new_retrieval"] is False
    assert (probes, baseline) == before


@pytest.mark.parametrize("mutation", [
    "holdout", "wrong_hash", "duplicate_input", "missing_case", "source_id",
    "query", "passages", "target_body", "forged_target_hash", "incomplete_corpus",
])
def test_replay_rejects_mixed_or_forged_evidence(mutation: str) -> None:
    probes, baseline = fixture()
    if mutation == "holdout":
        probes["split"] = "holdout"
    elif mutation == "wrong_hash":
        baseline["provenance"]["probe_input_sha256"] = "other"
    elif mutation == "duplicate_input":
        probes["cases"].append(probes["cases"][0])
    elif mutation == "missing_case":
        baseline["cases"].pop()
    elif mutation == "source_id":
        baseline["cases"][0]["source_post_id"] = 99
    elif mutation == "query":
        probes["cases"][0]["payload"]["query"] = "other"
    elif mutation == "passages":
        probes["cases"][0]["payload"]["source_passages"].append("other")
    elif mutation in {"target_body", "forged_target_hash"}:
        document = probes["corpus_documents"][0]["document"]
        document["content_excerpt"] = "Changed text"
        if mutation == "forged_target_hash":
            document["content_hash"] = baseline["index"]["document_fingerprints"][0]["content_hash"]
    elif mutation == "incomplete_corpus":
        probes["corpus_documents"] = []
    with pytest.raises(ValueError):
        replay(probes, baseline, "fixture")


def test_file_digest_is_checked_before_json_parse(tmp_path) -> None:
    path = tmp_path / "input.json"
    path.write_text('{"cases": []}', encoding="utf-8")
    assert read_frozen(path, text_sha256(path.read_text())) == {"cases": []}
    with pytest.raises(ValueError, match="sha256"):
        read_frozen(path, "wrong")
    path.write_bytes(b'{\r\n"cases": []\r\n}')
    assert read_frozen(path, sha256(path.read_bytes()).hexdigest()) == {"cases": []}


def test_cli_binds_real_file_hashes_and_refuses_output_overwrite(tmp_path, monkeypatch) -> None:
    probes, baseline = fixture()
    input_path, baseline_path, output_path = [tmp_path / n for n in ("in", "base", "out")]
    input_path.write_text(json.dumps(probes), encoding="utf-8")
    input_hash = sha256(input_path.read_bytes()).hexdigest()
    baseline["provenance"]["probe_input_sha256"] = input_hash
    baseline_path.write_text(json.dumps(baseline), encoding="utf-8")
    baseline_hash = sha256(baseline_path.read_bytes()).hexdigest()
    monkeypatch.setattr("sys.argv", [
        "preview", "--probes", str(input_path), "--baseline", str(baseline_path),
        "--output", str(output_path), "--probes-sha256", input_hash,
        "--baseline-sha256", baseline_hash,
    ])
    main()
    result = output_path.read_bytes()
    report = json.loads(result)
    assert report["provenance"]["probe_input_sha256"] == input_hash
    assert report["provenance"]["baseline_sha256"] == baseline_hash
    with pytest.raises(ValueError, match="new_output"):
        main()
    assert output_path.read_bytes() == result


@pytest.mark.parametrize("error", [FileNotFoundError(), subprocess.CalledProcessError(128, "git")])
def test_git_failure_is_explicit_and_does_not_invent_a_revision(
    error, tmp_path, monkeypatch,
) -> None:
    def fail(*args, **kwargs):
        raise error
    monkeypatch.setattr(subprocess, "check_output", fail)
    with pytest.raises(ValueError, match="projection_revision_unavailable"):
        source_revision(tmp_path)
