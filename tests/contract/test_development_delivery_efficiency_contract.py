from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STANDARD = ROOT / "docs" / "development-delivery-efficiency-standard-v1.md"
RETROSPECTIVE = (
    ROOT
    / "docs"
    / "development-delivery-efficiency-closeout-and-retrospective-2026-08-11.md"
)
DOCS_INDEX = ROOT / "docs" / "README.md"
OPERATING_MODEL = ROOT / "docs" / "development-validation-operating-model-v1.md"
CHANGED_GATE = ROOT / "scripts" / "check_changed.py"


def test_efficiency_standard_is_active_and_discoverable() -> None:
    standard = STANDARD.read_text(encoding="utf-8")
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")
    operating_model = OPERATING_MODEL.read_text(encoding="utf-8")

    assert "Status: active engineering standard." in standard
    assert STANDARD.name in docs_index
    assert STANDARD.name in operating_model


def test_efficiency_standard_preserves_safety_and_evidence_authority() -> None:
    standard = STANDARD.read_text(encoding="utf-8")

    for required_text in (
        "Optimize Two Clocks Separately",
        "Use the Smallest Valid Lane",
        "Reuse Evidence by Identity",
        "Make CI Path-Aware and Fail Closed",
        "Build and Scan Once per Artifact Identity",
        "Execute a Release Plan, Not a Fixed Ritual",
        "Smoke Tests Have Different Jobs",
        "Measure Comparable Work",
        "After two consecutive failures with the same external-transfer signature",
        "Do not claim projected savings as measured savings",
        "production only after separate operator authorization",
    ):
        assert required_text in standard


def test_retrospective_keeps_pending_samples_explicit() -> None:
    retrospective = RETROSPECTIVE.read_text(encoding="utf-8")
    normalized_retrospective = " ".join(retrospective.split())
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")

    assert "Status: time-bounded evidence" in retrospective
    assert RETROSPECTIVE.name in docs_index
    assert (
        "does not claim measured production acceleration" in normalized_retrospective
    )
    assert "executed GitHub Actions" in retrospective
    assert "job sets do not match" in retrospective
    assert "one natural ordinary backend PR" in retrospective
    assert "one separately authorized compatible production `full/runtime` release" in retrospective


def test_changed_gate_runs_frontend_node_contracts_from_frontend_workspace() -> None:
    changed_gate = CHANGED_GATE.read_text(encoding="utf-8")

    assert 'path.removeprefix("frontend/")' in changed_gate
    assert '["pnpm", "--dir", "frontend", "exec", "node", path]' in changed_gate
