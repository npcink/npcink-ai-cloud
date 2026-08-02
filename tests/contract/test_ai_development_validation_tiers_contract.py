from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STANDARD = ROOT / "docs" / "ai-development-validation-tiers-v1.md"
OPERATING_MODEL = ROOT / "docs" / "development-validation-operating-model-v1.md"
AGENTS = ROOT / "AGENTS.md"


def test_ai_validation_tiers_are_actionable_and_linked_from_session_entry() -> None:
    standard = STANDARD.read_text(encoding="utf-8")
    operating_model = OPERATING_MODEL.read_text(encoding="utf-8")
    agents = AGENTS.read_text(encoding="utf-8")

    assert "ai-development-validation-tiers-v1.md" in operating_model
    assert "ai-development-validation-tiers-v1.md" in agents

    for required_text in (
        "preview clock",
        "closeout clock",
        "L0: appearance only",
        "L1: route composition",
        "L2: shared or runtime-sensitive",
        "Immediate Upward Reclassification",
        "Parallel AI Sessions",
        "local-ready",
        "m4:preview:sync",
        "m4:preview:deploy",
        "accepted on M4",
        "production validated",
        "Do not repeat the same full contract/domain or visual matrix",
    ):
        assert required_text in standard


def test_ai_validation_tiers_preserve_external_and_product_boundaries() -> None:
    standard = STANDARD.read_text(encoding="utf-8")

    for protected_boundary in (
        "production",
        "Cloudflare",
        "DNS",
        "Access",
        "Tunnel",
        "Cloud/WordPress ownership",
    ):
        assert protected_boundary in standard
