from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
READINESS = ROOT / "scripts/production_wordpress_roundtrip_readiness.py"
CLEANUP = ROOT / "scripts/production_wordpress_roundtrip_cleanup.py"
READINESS_WRAPPER = ROOT / "deploy/wordpress-roundtrip-readiness-to-ssh-host.sh"
CLEANUP_WRAPPER = ROOT / "deploy/wordpress-roundtrip-cleanup-to-ssh-host.sh"
RUNBOOK = ROOT / "docs/production-wordpress-roundtrip-validation-runbook-v1.md"
EVIDENCE = ROOT / "docs/production-wordpress-image-roundtrip-evidence-2026-08-05.md"
PACKAGE = ROOT / "package.json"
INVENTORY = ROOT / "config/engineering-command-inventory-v1.json"


def test_roundtrip_tools_have_separate_read_and_mutation_commands() -> None:
    package = json.loads(PACKAGE.read_text(encoding="utf-8"))
    scripts = package["scripts"]
    assert scripts["production:wordpress-roundtrip:readiness"] == (
        "bash deploy/wordpress-roundtrip-readiness-to-ssh-host.sh"
    )
    assert scripts["production:wordpress-roundtrip:cleanup"] == (
        "bash deploy/wordpress-roundtrip-cleanup-to-ssh-host.sh"
    )

    inventory = INVENTORY.read_text(encoding="utf-8")
    assert '"profile": "remote_read"' in inventory
    assert '"profile": "production_state"' in inventory
    assert '"production:wordpress-roundtrip:readiness"' in inventory
    assert '"production:wordpress-roundtrip:cleanup"' in inventory


def test_readiness_payload_is_read_only_and_denies_acceptance_claims() -> None:
    source = READINESS.read_text(encoding="utf-8")
    assert 'CONTRACT_VERSION = "npcink.production_wordpress_roundtrip_readiness.v1"' in source
    assert "select(version_num from alembic_version)" not in source
    assert 'text("select version_num from alembic_version")' in source
    assert "store.delete(" not in source
    assert "session.commit()" not in source
    assert "update(MediaArtifact)" not in source
    assert '"finalize_authorized": False' in source
    assert '"real_user_acceptance": False' in source
    assert '"commercial_viability": False' in source
    assert "positive_grant_adjustment" in source
    assert 'CreditLedgerEntry.event_type == "consume"' in source
    assert "CreditLedgerEntry.ai_credit_delta < 0" in source
    assert "used = max(0.0, float(consumed_credits))" in source
    assert "remaining = max(0.0, package_limit + float(net_delta))" in source
    assert "used = max(0.0, -float(net_delta))" not in source
    assert "minimum-observation-hours" in source
    assert "rollback_image_map" in source
    assert "previous_release" in source
    assert "StrictHostKeyChecking=yes" in READINESS_WRAPPER.read_text(encoding="utf-8")
    assert "python3.11" in READINESS_WRAPPER.read_text(encoding="utf-8")


def test_cleanup_requires_exact_identity_approval_and_preserves_audit() -> None:
    source = CLEANUP.read_text(encoding="utf-8")
    assert (
        'APPROVAL = "Approved for exact WordPress round-trip fixture cleanup by operator."'
        in source
    )
    for exact_predicate in (
        "MediaArtifact.artifact_id == artifact_id",
        "MediaArtifact.run_id == run_id",
        "MediaArtifact.site_id == site_id",
        "MediaArtifact.storage_key == storage_key",
        "MediaArtifact.checksum == checksum",
        "MediaArtifact.byte_size == byte_size",
        "MediaArtifact.purge_claim_id == claim_id",
    ):
        assert exact_predicate in source
    assert "store.delete(storage_key)" in source
    assert "all deliveries" not in source.lower()
    assert "delivery.acked_at is None" in source
    assert '"run_records"' in source
    assert '"provider_call_records"' in source
    assert '"credit_ledger_entries"' in source
    assert '"media_artifact_deliveries"' in source
    assert "delete(MediaArtifact" not in source
    assert "DELETE FROM" not in source
    assert "StrictHostKeyChecking=yes" in CLEANUP_WRAPPER.read_text(encoding="utf-8")
    assert "python3.11" in CLEANUP_WRAPPER.read_text(encoding="utf-8")


def test_roundtrip_tool_help_and_shell_syntax() -> None:
    for script in (READINESS, CLEANUP):
        subprocess.run([sys.executable, str(script), "--help"], check=True, capture_output=True)
    subprocess.run(
        ["bash", "-n", str(READINESS_WRAPPER), str(CLEANUP_WRAPPER)],
        check=True,
        capture_output=True,
    )


def test_runbook_freezes_efficiency_and_truth_boundaries() -> None:
    text = RUNBOOK.read_text(encoding="utf-8")
    for marker in (
        "normally 1",
        "No post, revision, attachment",
        "positive grant/adjustment",
        "Do not manufacture a paid failure",
        "exact WordPress round-trip fixture cleanup",
        "real-user acceptance",
        "Do not finalize from this runbook automatically",
        "Known pre-import alt-text mismatch",
        "check-first-install-cve-gate.py",
        "Time cost is a first-class constraint",
    ):
        assert marker in text

    evidence = EVIDENCE.read_text(encoding="utf-8")
    for marker in (
        "only `1.78h`",
        "exception_expires_on=2026-08-05",
        "active gate requires the amended exact",
        "No first-install finalize action was run",
        "does not prove real-user acceptance",
    ):
        assert marker in evidence
