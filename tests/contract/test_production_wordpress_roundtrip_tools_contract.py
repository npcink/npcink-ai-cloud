from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
READINESS = ROOT / "scripts/production_wordpress_roundtrip_readiness.py"
ACTIVE_SOAK = ROOT / "scripts/production_internal_validation_active_soak.py"
CLEANUP = ROOT / "scripts/production_wordpress_roundtrip_cleanup.py"
READINESS_WRAPPER = ROOT / "deploy/wordpress-roundtrip-readiness-to-ssh-host.sh"
CLEANUP_WRAPPER = ROOT / "deploy/wordpress-roundtrip-cleanup-to-ssh-host.sh"
RUNBOOK = ROOT / "docs/production-wordpress-roundtrip-validation-runbook-v1.md"
EVIDENCE = ROOT / "docs/production-wordpress-image-roundtrip-evidence-2026-08-05.md"
ACTIVE_SOAK_EVIDENCE = (
    ROOT / "docs/production-internal-validation-active-soak-evidence-2026-08-05.md"
)
CVE_WORKSHEET = (
    ROOT / "docs/python-3-14-6-controlled-validation-operator-worksheet-2026-08-05.md"
)
PACKAGE = ROOT / "package.json"
INVENTORY = ROOT / "config/engineering-command-inventory-v1.json"


def test_roundtrip_tools_have_separate_read_and_mutation_commands() -> None:
    package = json.loads(PACKAGE.read_text(encoding="utf-8"))
    scripts = package["scripts"]
    assert scripts["production:wordpress-roundtrip:readiness"] == (
        "bash deploy/wordpress-roundtrip-readiness-to-ssh-host.sh"
    )
    assert scripts["production:internal-validation:active-soak"] == (
        "python3 scripts/production_internal_validation_active_soak.py"
    )
    assert scripts["production:wordpress-roundtrip:cleanup"] == (
        "bash deploy/wordpress-roundtrip-cleanup-to-ssh-host.sh"
    )

    inventory = INVENTORY.read_text(encoding="utf-8")
    assert '"profile": "remote_read"' in inventory
    assert '"profile": "production_state"' in inventory
    assert '"production:wordpress-roundtrip:readiness"' in inventory
    assert '"production:internal-validation:active-soak"' in inventory
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
    assert 'item["health"] not in {"healthy", "not_configured"}' in source
    assert "frontend_revision != source_revision" in source
    assert "SERVICE_IMAGE_ROLES" in source
    assert 'bundle.get("source_revision") != source_revision' in source
    assert "actual_image_id == expected_image_id" in source
    assert "StrictHostKeyChecking=yes" in READINESS_WRAPPER.read_text(encoding="utf-8")
    assert "python3.11" in READINESS_WRAPPER.read_text(encoding="utf-8")
    assert 'containers[service]["container_id"] = container_id' in source
    assert "NPCINK_CLOUD_OPERATIONAL_READY_INTERNAL=1" in source
    assert "internal operational readiness did not pass" in source


def test_readiness_requires_temporary_rollback_images_until_finalize() -> None:
    spec = importlib.util.spec_from_file_location("production_roundtrip_readiness", READINESS)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    requires = module._requires_current_release_rollback_images
    assert requires(
        installation_state="pending",
        pending_marker_present=True,
        completion_sentinel_present=False,
    )
    assert requires(
        installation_state="complete",
        pending_marker_present=True,
        completion_sentinel_present=False,
    )
    assert requires(
        installation_state="complete",
        pending_marker_present=False,
        completion_sentinel_present=False,
    )
    assert not requires(
        installation_state="complete",
        pending_marker_present=False,
        completion_sentinel_present=True,
    )


def test_active_soak_freezes_zero_call_and_finalization_boundaries() -> None:
    source = ACTIVE_SOAK.read_text(encoding="utf-8")
    for marker in (
        'CONTRACT_VERSION = "npcink.production_internal_validation_active_soak.v1"',
        'APPROVAL = "Approved for internal no-user active soak by operator."',
        '"provider_called": False if outcome == "pass" else None',
        '"wordpress_written": False if outcome == "pass" else None',
        '"finalize_authorized": False',
        '"real_user_acceptance": False',
        '"commercial_viability": False',
        '"non_health_502_count": "not measured"',
        "duration minutes must be between 30 and 60",
        "readiness sample exceeded",
        "active-soak collected too few repeated samples",
    ):
        assert marker in source

    spec = importlib.util.spec_from_file_location("production_active_soak", ACTIVE_SOAK)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    baseline = {
        "source_revision": "a" * 40,
        "migration_revisions": ["0076"],
        "identity": {"site_id": "site_test"},
        "entitlement": {"limit": 300.0},
        "totals": {"provider_calls": 12},
        "lifecycle": {"current_release": "release-a"},
        "containers": {"api": {"container_id": "abc"}},
        "service_images": {"api": {"matches": True}},
        "operational_ready": {"ok": True, "worker_cutoff": "2026-08-05T00:00:00Z"},
    }
    assert module._compare_fingerprints(baseline, baseline.copy(), 1) == []
    changed = dict(baseline)
    changed["totals"] = {"provider_calls": 13}
    assert module._compare_fingerprints(baseline, changed, 1) == [
        "sample 1: totals changed during active soak"
    ]
    assert module._minimum_sample_count(30, 60, 45) == 18
    assert module._minimum_sample_count(30, 300, 45) == 6


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
    for script in (READINESS, ACTIVE_SOAK, CLEANUP):
        subprocess.run([sys.executable, str(script), "--help"], check=True, capture_output=True)
    subprocess.run(
        [sys.executable, str(ACTIVE_SOAK), "--", "--help"],
        check=True,
        capture_output=True,
    )
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
        "preempt **every** `/v1/runtime/execute` request",
        "blocked_non_target",
        "failed gate; do not silently redefine an autosave as zero writes",
        "native autosave without a separate WordPress-owned change envelope",
        "deterministic Local transport failure",
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

    active_soak_evidence = ACTIVE_SOAK_EVIDENCE.read_text(encoding="utf-8")
    for marker in (
        "elapsed_seconds=1802.805",
        "sample_count=30",
        "Provider calls: `0` / `0`",
        "tool-initiated WordPress writes: `0`",
        "Non-health `502` count was not measured",
        "First-install finalization is still not ready",
    ):
        assert marker in active_soak_evidence

    worksheet = CVE_WORKSHEET.read_text(encoding="utf-8")
    for marker in (
        "unsigned worksheet; not a controlled-risk acceptance receipt",
        "4a45f6d2f9d16b42b1b608ee638c12baa321b6af4091a49b609ff537202ea8e0",
        "f01827758d912798ac5073db65ce40212fd21337a419b184d1e5a2eb3026dd53",
        "If the exact original bundle is unavailable, stop",
        "still does not authorize first-install finalization",
    ):
        assert marker in worksheet
