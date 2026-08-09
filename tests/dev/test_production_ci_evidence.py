from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "production-ci-evidence.py"
SHA = "1" * 40
HEAD_SHA = "2" * 40
TESTED_SHA = "3" * 40
TREE_SHA = "4" * 40


def _load_script():
    spec = importlib.util.spec_from_file_location("production_ci_evidence", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["production_ci_evidence"] = module
    spec.loader.exec_module(module)
    return module


production_ci_evidence = _load_script()


def _ordinary_receipt() -> dict[str, object]:
    return production_ci_evidence.create_receipt(
        repository="npcink/npcink-ai-cloud",
        pr_number=600,
        head_sha=HEAD_SHA,
        run_id=12345,
        tested_sha=TESTED_SHA,
        tested_tree=TREE_SHA,
        static_terms_only=False,
        secret_scan="success",
        backend="success",
        frontend="success",
        static_terms="skipped",
    )


def _associated_pulls() -> list[dict[str, object]]:
    return [
        {
            "number": 600,
            "base": {"ref": "production"},
            "head": {
                "sha": HEAD_SHA,
                "ref": "codex/release",
                "repo": {"full_name": "npcink/npcink-ai-cloud"},
            },
            "merged_at": "2026-08-10T00:00:00Z",
            "merge_commit_sha": SHA,
        }
    ]


def _ci_run() -> dict[str, object]:
    return {
        "id": 12345,
        "event": "pull_request",
        "conclusion": "success",
        "path": ".github/workflows/ci.yml",
        "head_sha": HEAD_SHA,
    }


def test_ordinary_production_receipt_requires_all_reusable_gates() -> None:
    receipt = _ordinary_receipt()

    assert receipt["gates"] == {
        "static_terms_only": False,
        "secret_scan": "success",
        "backend": "success",
        "frontend": "success",
        "static_terms": "skipped",
    }

    with pytest.raises(
        production_ci_evidence.EvidenceError,
        match="ordinary production PRs require backend/frontend success",
    ):
        production_ci_evidence.create_receipt(
            repository="npcink/npcink-ai-cloud",
            pr_number=600,
            head_sha=HEAD_SHA,
            run_id=12345,
            tested_sha=TESTED_SHA,
            tested_tree=TREE_SHA,
            static_terms_only=False,
            secret_scan="success",
            backend="skipped",
            frontend="success",
            static_terms="skipped",
        )


def test_static_terms_receipt_requires_the_static_gate_only() -> None:
    receipt = production_ci_evidence.create_receipt(
        repository="npcink/npcink-ai-cloud",
        pr_number=601,
        head_sha=HEAD_SHA,
        run_id=12346,
        tested_sha=TESTED_SHA,
        tested_tree=TREE_SHA,
        static_terms_only=True,
        secret_scan="success",
        backend="skipped",
        frontend="skipped",
        static_terms="success",
    )

    assert receipt["gates"]["static_terms_only"] is True


def test_verify_accepts_same_repository_pr_and_identical_tested_tree() -> None:
    result = production_ci_evidence.verify_production_evidence(
        repository="npcink/npcink-ai-cloud",
        production_sha=SHA,
        production_commit={"sha": SHA, "tree": {"sha": TREE_SHA}},
        associated_pull_requests=_associated_pulls(),
        ci_run=_ci_run(),
        receipt=_ordinary_receipt(),
    )

    assert result == {
        "schema": "npcink.production_ci_reuse_verification.v1",
        "repository": "npcink/npcink-ai-cloud",
        "production_sha": SHA,
        "production_tree": TREE_SHA,
        "pull_request_number": 600,
        "pull_request_head_sha": HEAD_SHA,
        "ci_run_id": 12345,
        "tested_sha": TESTED_SHA,
        "evidence_reused": True,
    }


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("tree", "production commit tree does not match"),
        ("fork", "exactly one merged same-repository production PR"),
        ("run", "CI evidence run head SHA does not match"),
        ("receipt", "receipt PR number does not match"),
    ],
)
def test_verify_fails_closed_on_identity_or_tree_drift(
    mutation: str, message: str
) -> None:
    production_commit = {"sha": SHA, "tree": {"sha": TREE_SHA}}
    associated_pulls = _associated_pulls()
    ci_run = _ci_run()
    receipt = _ordinary_receipt()
    if mutation == "tree":
        production_commit["tree"] = {"sha": "5" * 40}
    elif mutation == "fork":
        associated_pulls[0]["head"]["repo"]["full_name"] = "outside/fork"
    elif mutation == "run":
        ci_run["head_sha"] = "6" * 40
    else:
        receipt["pull_request"]["number"] = 999

    with pytest.raises(production_ci_evidence.EvidenceError, match=message):
        production_ci_evidence.verify_production_evidence(
            repository="npcink/npcink-ai-cloud",
            production_sha=SHA,
            production_commit=production_commit,
            associated_pull_requests=associated_pulls,
            ci_run=ci_run,
            receipt=receipt,
        )


def test_cli_does_not_log_receipt_fields(tmp_path: Path) -> None:
    output = tmp_path / "receipt.json"
    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "create",
            "--repository",
            "npcink/npcink-ai-cloud",
            "--pr-number",
            "600",
            "--head-sha",
            HEAD_SHA,
            "--run-id",
            "12345",
            "--tested-sha",
            TESTED_SHA,
            "--tested-tree",
            TREE_SHA,
            "--static-terms-only",
            "false",
            "--secret-scan",
            "success",
            "--backend",
            "success",
            "--frontend",
            "success",
            "--static-terms",
            "skipped",
            "--output",
            str(output),
        ],
        text=True,
        capture_output=True,
        check=True,
    )

    assert completed.stdout == "[ok] production CI evidence create completed\n"
    assert "secret_scan" not in completed.stdout
    assert HEAD_SHA not in completed.stdout
