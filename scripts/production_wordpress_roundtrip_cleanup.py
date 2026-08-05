#!/usr/bin/env python3
"""Purge exactly one adopted WordPress round-trip fixture from Cloud storage.

The command runs on the SSH host, validates immutable artifact identity, and
uses an exact database claim before deleting one storage object. Run, provider,
ledger, artifact, and delivery audit rows are preserved.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

CONTRACT_VERSION = "npcink.production_wordpress_roundtrip_cleanup.v1"
APPROVAL = "Approved for exact WordPress round-trip fixture cleanup by operator."
IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,190}$")
STORAGE_KEY_RE = re.compile(r"^obj_[0-9a-f]{32}$")
CHECKSUM_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


class CleanupError(RuntimeError):
    """Raised when an exact cleanup assertion fails."""


def _run(command: list[str], *, input_text: str | None = None) -> str:
    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            input=input_text,
        )
    except subprocess.CalledProcessError as error:
        message = (error.stderr or error.stdout or "command failed").strip()
        raise CleanupError(message) from error
    return result.stdout.strip()


def _validate_identifier(value: str, label: str) -> str:
    normalized = str(value or "").strip()
    if not IDENTIFIER_RE.fullmatch(normalized):
        raise CleanupError(f"{label} is invalid")
    return normalized


def _resolve_current_release(managed_root: Path) -> Path:
    current = managed_root / "current"
    if not managed_root.is_absolute() or not managed_root.is_dir() or not current.is_symlink():
        raise CleanupError("managed root/current layout is invalid")
    release = current.resolve(strict=True)
    if release.parent != managed_root or not re.fullmatch(
        r"release-[A-Za-z0-9][A-Za-z0-9._-]*", release.name
    ):
        raise CleanupError("current does not resolve to a managed release")
    return release


def _api_container() -> str:
    output = _run(
        [
            "docker",
            "ps",
            "--filter",
            "label=com.docker.compose.project=npcink-ai-cloud",
            "--filter",
            "label=com.docker.compose.service=api",
            "--filter",
            "label=com.docker.compose.oneoff=False",
            "--format",
            "{{.ID}}",
        ]
    )
    identifiers = [item for item in output.splitlines() if item.strip()]
    if len(identifiers) != 1:
        raise CleanupError(f"expected exactly one running API container, found {len(identifiers)}")
    return identifiers[0]


CONTAINER_PAYLOAD = r"""
from __future__ import annotations

import json
import sys
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import func, select, update

from app.core.config import get_settings
from app.core.db import get_session
from app.core.models import (
    CreditLedgerEntry,
    MediaArtifact,
    MediaArtifactDelivery,
    ProviderCallRecord,
    RunRecord,
)
from app.domain.media_artifacts import build_artifact_store
from app.domain.media_artifacts.store import ArtifactStoreError

(
    artifact_id,
    run_id,
    site_id,
    storage_key,
    checksum,
    byte_size_raw,
    expected_delivery_count_raw,
) = sys.argv[1:]
byte_size = int(byte_size_raw)
expected_delivery_count = int(expected_delivery_count_raw)
settings = get_settings()
store = build_artifact_store(settings)


def audit_counts(session):
    return {
        "run": int(session.scalar(
            select(func.count()).select_from(RunRecord).where(RunRecord.run_id == run_id)
        ) or 0),
        "provider_calls": int(session.scalar(
            select(func.count()).select_from(ProviderCallRecord).where(
                ProviderCallRecord.run_id == run_id
            )
        ) or 0),
        "ledger_entries": int(session.scalar(
            select(func.count()).select_from(CreditLedgerEntry).where(
                CreditLedgerEntry.run_id == run_id
            )
        ) or 0),
        "deliveries": int(session.scalar(
            select(func.count()).select_from(MediaArtifactDelivery).where(
                MediaArtifactDelivery.artifact_id == artifact_id
            )
        ) or 0),
    }


def object_present():
    try:
        metadata = store.metadata(storage_key)
        return True, {"byte_size": metadata.byte_size, "checksum": metadata.checksum}
    except ArtifactStoreError:
        return False, None


with get_session(settings.database_url) as session:
    artifact = session.scalar(
        select(MediaArtifact)
        .where(MediaArtifact.artifact_id == artifact_id)
        .with_for_update()
    )
    if artifact is None:
        raise SystemExit("artifact does not exist")
    immutable_identity = {
        "run_id": artifact.run_id,
        "site_id": artifact.site_id,
        "storage_key": artifact.storage_key,
        "checksum": artifact.checksum,
        "byte_size": artifact.byte_size,
    }
    expected_identity = {
        "run_id": run_id,
        "site_id": site_id,
        "storage_key": storage_key,
        "checksum": checksum,
        "byte_size": byte_size,
    }
    if immutable_identity != expected_identity:
        raise SystemExit("artifact immutable identity mismatch")
    deliveries = list(
        session.scalars(
            select(MediaArtifactDelivery)
            .where(MediaArtifactDelivery.artifact_id == artifact_id)
            .with_for_update()
        )
    )
    if len(deliveries) != expected_delivery_count:
        raise SystemExit("artifact delivery count mismatch")
    if any(delivery.acked_at is None for delivery in deliveries):
        raise SystemExit("artifact has an unacknowledged delivery")
    audit_before = audit_counts(session)
    if audit_before["run"] != 1:
        raise SystemExit("artifact run audit row is missing or ambiguous")
    if audit_before["deliveries"] != expected_delivery_count:
        raise SystemExit("artifact delivery audit rows are missing or ambiguous")

    present_before, metadata_before = object_present()
    if artifact.status == "purged" and artifact.purged_at is not None:
        if present_before:
            raise SystemExit("purged artifact still has storage bytes")
        print(json.dumps({
            "outcome": "already_purged",
            "artifact_id": artifact_id,
            "status": artifact.status,
            "purged_at": artifact.purged_at.isoformat(),
            "bytes_present": False,
            "audit_before": audit_before,
            "audit_after": audit_before,
        }, sort_keys=True))
        raise SystemExit(0)
    if artifact.status != "available" or artifact.purged_at is not None:
        raise SystemExit("artifact is not in the exact available state")
    if artifact.purge_claim_id is not None or artifact.purge_claim_expires_at is not None:
        raise SystemExit("artifact already has a purge claim")
    if not present_before or metadata_before != {
        "byte_size": byte_size,
        "checksum": checksum,
    }:
        raise SystemExit("artifact storage identity mismatch")

    claim_id = f"pcl_{uuid4().hex}"
    claimed_at = datetime.now(UTC)
    artifact.status = "purge_pending"
    artifact.purge_claim_id = claim_id
    artifact.purge_claim_expires_at = claimed_at + timedelta(minutes=5)
    artifact.purge_attempt_count = int(artifact.purge_attempt_count or 0) + 1
    artifact.purge_last_attempt_at = claimed_at
    artifact.purge_next_attempt_at = None
    artifact.purge_last_error_code = None
    session.commit()

try:
    store.delete(storage_key)
except Exception:
    failed_at = datetime.now(UTC)
    with get_session(settings.database_url) as session:
        session.execute(
            update(MediaArtifact)
            .where(
                MediaArtifact.artifact_id == artifact_id,
                MediaArtifact.run_id == run_id,
                MediaArtifact.site_id == site_id,
                MediaArtifact.storage_key == storage_key,
                MediaArtifact.purge_claim_id == claim_id,
                MediaArtifact.status == "purge_pending",
                MediaArtifact.purged_at.is_(None),
            )
            .values(
                purge_claim_id=None,
                purge_claim_expires_at=None,
                purge_next_attempt_at=failed_at + timedelta(seconds=30),
                purge_last_error_code="artifact_store.delete_failed",
            )
        )
        session.commit()
    raise

purged_at = datetime.now(UTC)
with get_session(settings.database_url) as session:
    result = session.execute(
        update(MediaArtifact)
        .where(
            MediaArtifact.artifact_id == artifact_id,
            MediaArtifact.run_id == run_id,
            MediaArtifact.site_id == site_id,
            MediaArtifact.storage_key == storage_key,
            MediaArtifact.checksum == checksum,
            MediaArtifact.byte_size == byte_size,
            MediaArtifact.purge_claim_id == claim_id,
            MediaArtifact.status == "purge_pending",
            MediaArtifact.purged_at.is_(None),
        )
        .values(
            status="purged",
            purged_at=purged_at,
            purge_claim_id=None,
            purge_claim_expires_at=None,
            purge_next_attempt_at=None,
            purge_last_error_code=None,
        )
    )
    session.commit()
    if result.rowcount != 1:
        raise SystemExit("fenced artifact finalization was superseded")
    audit_after = audit_counts(session)
    final_artifact = session.scalar(
        select(MediaArtifact).where(MediaArtifact.artifact_id == artifact_id)
    )

present_after, _ = object_present()
if present_after:
    raise SystemExit("artifact bytes remain after purge")
if audit_after != audit_before:
    raise SystemExit("run/provider/ledger/delivery audit counts changed during purge")
if final_artifact is None or final_artifact.status != "purged" or final_artifact.purged_at is None:
    raise SystemExit("artifact row did not reach purged state")

print(json.dumps({
    "outcome": "purged",
    "artifact_id": artifact_id,
    "status": final_artifact.status,
    "purged_at": final_artifact.purged_at.isoformat(),
    "bytes_present": False,
    "audit_before": audit_before,
    "audit_after": audit_after,
}, sort_keys=True))
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--managed-root", default="/opt/npcink-ai-cloud")
    parser.add_argument("--artifact-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--site-id", required=True)
    parser.add_argument("--storage-key", required=True)
    parser.add_argument("--checksum", required=True)
    parser.add_argument("--byte-size", required=True, type=int)
    parser.add_argument("--expected-delivery-count", required=True, type=int)
    parser.add_argument("--approval", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.approval != APPROVAL:
            raise CleanupError("exact operator cleanup approval is missing")
        artifact_id = _validate_identifier(args.artifact_id, "artifact_id")
        run_id = _validate_identifier(args.run_id, "run_id")
        site_id = _validate_identifier(args.site_id, "site_id")
        if not STORAGE_KEY_RE.fullmatch(args.storage_key):
            raise CleanupError("storage_key is invalid")
        if not CHECKSUM_RE.fullmatch(args.checksum):
            raise CleanupError("checksum is invalid")
        if args.byte_size < 1 or args.byte_size > 64 * 1024 * 1024:
            raise CleanupError("byte_size is outside the bounded fixture range")
        if args.expected_delivery_count < 1 or args.expected_delivery_count > 8:
            raise CleanupError("expected_delivery_count is outside the bounded range")

        managed_root = Path(args.managed_root).resolve()
        release = _resolve_current_release(managed_root)
        if (managed_root / ".deploy-lock").exists():
            raise CleanupError("deployment lock is present")
        if (managed_root / ".first-install-finalizing.json").exists():
            raise CleanupError("first-install finalization is in progress")
        api_container = _api_container()
        output = _run(
            [
                "docker",
                "exec",
                "-i",
                api_container,
                "python",
                "-",
                artifact_id,
                run_id,
                site_id,
                args.storage_key,
                args.checksum,
                str(args.byte_size),
                str(args.expected_delivery_count),
            ],
            input_text=CONTAINER_PAYLOAD,
        )
        evidence = json.loads(output)
        receipt = {
            "contract_version": CONTRACT_VERSION,
            "outcome": evidence.get("outcome"),
            "current_release": release.name,
            "artifact": evidence,
            "preserved_truth": [
                "run_records",
                "provider_call_records",
                "credit_ledger_entries",
                "media_artifact_deliveries",
                "media_artifacts audit row",
            ],
            "claims": {
                "wordpress_data_deleted": False,
                "provider_called": False,
                "first_install_finalized": False,
            },
        }
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0
    except (CleanupError, OSError, ValueError, json.JSONDecodeError) as error:
        print(
            json.dumps(
                {
                    "contract_version": CONTRACT_VERSION,
                    "outcome": "error",
                    "error": str(error),
                },
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
