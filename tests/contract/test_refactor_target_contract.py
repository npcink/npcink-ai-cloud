from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


TARGET_CONTRACTS = (
    "docs/refactor-master-plan-v1.md",
    "docs/decisions/004-wordpress-first-cloud-runtime-refactor.md",
    "docs/multi-platform-connector-boundary-v1.md",
    "docs/media-runtime-boundary-v1.md",
    "docs/refactor-deletion-inventory-v1.md",
)


def test_readme_links_all_accepted_target_contracts() -> None:
    readme = _read("README.md")

    assert "## Target Refactor Contracts" in readme
    assert "accepted target contracts for the P0-P5 refactor" in readme
    assert "not evidence" in readme
    assert "implementation is complete" in readme
    assert "WordPress-first through P5" in readme
    assert "other CMS adapters are post-P5 validation work" in readme

    for path in TARGET_CONTRACTS:
        assert (ROOT / path).is_file()
        assert path in readme


def test_master_plan_freezes_the_wordpress_first_p0_p5_sequence() -> None:
    master = _read("docs/refactor-master-plan-v1.md")

    for phase_heading in (
        "### P0 — Target Contracts And Baseline",
        "### P1 — Identity, Site, And Runtime Foundation",
        "### P2 — WordPress Text Runtime Loop",
        "### P3 — Media Runtime",
        "### P4 — Portal And Admin Contraction",
        "### P5 — Hardening, Matrix, And Release Closure",
    ):
        assert phase_heading in master

    for required in (
        "`WORDPRESS_FIRST`",
        "During P0-P5",
        "`NO_COMPATIBILITY_LAYER`",
        "## Post-P5 Validation — Typecho PoC",
        "thin Typecho adapter",
        "cross-platform connector and Media Runtime target contracts",
        "current API/schema/module deletion inventory",
    ):
        assert required in master


def test_wordpress_first_adr_freezes_the_refactor_decisions() -> None:
    adr = _read("docs/decisions/004-wordpress-first-cloud-runtime-refactor.md")

    for marker in (
        "WORDPRESS_FIRST",
        "PLATFORM_CHANNEL_ORTHOGONAL",
        "NO_COMPATIBILITY_LAYER",
        "ONE_ACTIVE_CONTRACT_VERSION",
        "NO_FULL_REWRITE",
    ):
        assert marker in adr

    assert "WordPress/Core remains the local control plane" in adr


def test_connector_contract_freezes_one_suggestion_only_runtime() -> None:
    connector = _read("docs/multi-platform-connector-boundary-v1.md")

    for required in (
        "WORDPRESS_ONLY_NOW",
        "PLATFORM_CHANNEL_ORTHOGONAL",
        "LOCAL_CAPABILITY_TRUTH",
        "ONE_CLOUD_RUNTIME",
        "SUGGESTION_ONLY",
        "platform_kind=wordpress",
        "site_url",
        "object_revision",
        "npcink-ai-client-adapter",
        "## Post-P5 Typecho PoC Acceptance",
    ):
        assert required in connector


def test_media_contract_is_explicitly_a_not_yet_implemented_target() -> None:
    media = _read("docs/media-runtime-boundary-v1.md")

    for required in (
        "Status: Accepted target contract; not yet implemented.",
        "TEMPORARY_MEDIA_RUNTIME",
        "STREAMED_MEDIA_BYTES",
        "NO_DATABASE_BLOB",
        "SIGNED_PULL",
        "LOCAL_MEDIA_WRITE",
        "POST /v1/runtime/media/uploads",
        "POST /v1/runtime/media/jobs",
        "GET /v1/runtime/media/artifacts/{artifact_id}/download",
        "POST /v1/runtime/media/artifacts/{artifact_id}/delivery-ack",
        "## 7. ArtifactStore Boundary",
        "delivery acknowledgement is never proof of local application",
    ):
        assert required in media


def test_deletion_inventory_freezes_items_and_phase_exit_proof() -> None:
    inventory = _read("docs/refactor-deletion-inventory-v1.md")

    for item_id in (
        "IDN-01",
        "CON-01",
        "RUN-01",
        "RUN-02",
        "RUN-03",
        "RUN-04",
        "MED-01",
        "MED-02",
        "MED-03",
        "MED-04",
        "PORT-01",
        "ADM-01",
    ):
        assert item_id in inventory

    assert "NO_COMPATIBILITY_LAYER" in inventory
    assert "## Phase Exit Proof" in inventory
