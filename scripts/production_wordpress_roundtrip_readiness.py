#!/usr/bin/env python3
"""Read-only production evidence for one WordPress-to-Cloud operator loop.

This script runs on the SSH host and sends a bounded read-only payload to the
existing API container. It never reads or prints protected configuration
values, provider credentials, API keys, WordPress content, or prompts.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

CONTRACT_VERSION = "npcink.production_wordpress_roundtrip_readiness.v1"
IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,190}$")
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
REQUIRED_SERVICES = (
    "api",
    "worker",
    "callback-worker",
    "ops-worker",
    "frontend",
    "proxy",
    "redis",
)
SERVICE_IMAGE_ROLES = {
    "api": "api",
    "worker": "worker",
    "callback-worker": "callback_worker",
    "ops-worker": "ops_worker",
    "frontend": "frontend",
    "proxy": "external_nginx",
    "redis": "external_redis",
}


class ReadinessError(RuntimeError):
    """Raised when the read-only evidence cannot be trusted."""


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
        raise ReadinessError(message) from error
    return result.stdout.strip()


def _validate_identifier(value: str, label: str) -> str:
    normalized = str(value or "").strip()
    if not IDENTIFIER_RE.fullmatch(normalized):
        raise ReadinessError(f"{label} is invalid")
    return normalized


def _resolve_current_release(managed_root: Path) -> tuple[Path, str]:
    if not managed_root.is_absolute() or not managed_root.is_dir():
        raise ReadinessError("managed root must be an existing absolute directory")
    current = managed_root / "current"
    if not current.is_symlink():
        raise ReadinessError("current must be a symbolic link")
    release = current.resolve(strict=True)
    if release.parent != managed_root or not re.fullmatch(
        r"release-[A-Za-z0-9][A-Za-z0-9._-]*", release.name
    ):
        raise ReadinessError("current does not resolve to a managed release")
    return release, release.name


def _container_for_service(service: str) -> str:
    output = _run(
        [
            "docker",
            "ps",
            "--filter",
            "label=com.docker.compose.project=npcink-ai-cloud",
            "--filter",
            f"label=com.docker.compose.service={service}",
            "--filter",
            "label=com.docker.compose.oneoff=False",
            "--format",
            "{{.ID}}",
        ]
    )
    identifiers = [item for item in output.splitlines() if item.strip()]
    if len(identifiers) != 1:
        raise ReadinessError(
            f"expected exactly one running {service} container, found {len(identifiers)}"
        )
    return identifiers[0]


def _container_state(container_id: str) -> dict[str, Any]:
    raw = _run(
        [
            "docker",
            "inspect",
            container_id,
            "--format",
            "{{json .State}}",
        ]
    )
    state = json.loads(raw)
    restart_count = int(_run(["docker", "inspect", container_id, "--format", "{{.RestartCount}}"]))
    return {
        "running": bool(state.get("Running")),
        "restarting": bool(state.get("Restarting")),
        "restart_count": restart_count,
        "health": str((state.get("Health") or {}).get("Status") or "not_configured"),
        "started_at": str(state.get("StartedAt") or ""),
    }


def _container_image_id(container_id: str) -> str:
    image_id = _run(["docker", "inspect", container_id, "--format", "{{.Image}}"])
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", image_id):
        raise ReadinessError("container image identity is missing or invalid")
    return image_id


def _frontend_revision(container_id: str) -> str:
    raw = _run(
        [
            "docker",
            "inspect",
            container_id,
            "--format",
            "{{json .Config.Env}}",
        ]
    )
    values = json.loads(raw)
    prefix = "NPCINK_CLOUD_FRONTEND_REVISION="
    matches = [value[len(prefix) :] for value in values if value.startswith(prefix)]
    if len(matches) != 1 or not REVISION_RE.fullmatch(matches[0]):
        raise ReadinessError("frontend source revision is missing or invalid")
    return matches[0]


def _release_image_evidence(
    release: Path,
    target_images_path: Path,
    container_ids: dict[str, str],
) -> dict[str, Any]:
    manifest = _read_json(release / "release-bundle-manifest.json")
    target_images = _read_json(target_images_path)
    source = manifest.get("source") or {}
    bundle = target_images.get("bundle") or {}
    roles = target_images.get("roles") or {}
    source_revision = str(source.get("revision") or "")
    if not REVISION_RE.fullmatch(source_revision):
        raise ReadinessError("release manifest source revision is missing or invalid")
    if bundle.get("source_revision") != source_revision:
        raise ReadinessError("target image map source revision does not match the release")
    if bundle.get("release_name") != release.name or bundle.get("release_path") != str(release):
        raise ReadinessError("target image map release binding does not match current")
    if not isinstance(roles, dict):
        raise ReadinessError("target image role map is invalid")

    service_images: dict[str, dict[str, Any]] = {}
    for service, role in SERVICE_IMAGE_ROLES.items():
        role_record = roles.get(role)
        expected_image_id = (
            str(role_record.get("target_daemon_image_id") or "")
            if isinstance(role_record, dict)
            else ""
        )
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", expected_image_id):
            raise ReadinessError(f"target image identity is missing for {service}")
        actual_image_id = _container_image_id(container_ids[service])
        service_images[service] = {
            "role": role,
            "matches": actual_image_id == expected_image_id,
            "expected_image_id": expected_image_id,
            "actual_image_id": actual_image_id,
        }
    return {
        "source_revision": source_revision,
        "service_images": service_images,
    }


def _read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ReadinessError(f"protected state is unreadable: {path.name}") from error
    if not isinstance(payload, dict):
        raise ReadinessError(f"protected state is not an object: {path.name}")
    return payload


def _public_health(base_url: str) -> dict[str, Any]:
    url = base_url.rstrip("/") + "/health/live"
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read(64 * 1024)
            payload = json.loads(body)
            return {"status": response.status, "ok": response.status == 200, "body": payload}
    except (OSError, ValueError, urllib.error.URLError) as error:
        return {"status": 0, "ok": False, "error": type(error).__name__}


def _operational_ready(
    release: Path,
    base_url: str,
    containers: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    worker_cutoff = min(
        _parse_utc(containers[service]["started_at"], f"{service} started_at")
        for service in ("worker", "callback-worker", "ops-worker")
    ) - timedelta(seconds=1)
    cutoff_text = worker_cutoff.isoformat().replace("+00:00", "Z")
    try:
        output = _run(
            [
                "env",
                "NPCINK_CLOUD_RELEASE_TOOL_PYTHON=/usr/bin/python3.11",
                "NPCINK_CLOUD_OPERATIONAL_READY_INTERNAL=1",
                "bash",
                str(release / "deploy/remote-operational-ready.sh"),
                "--base-url",
                base_url,
                "--worker-cutoff",
                cutoff_text,
            ]
        )
    except ReadinessError as error:
        return {"ok": False, "worker_cutoff": cutoff_text, "error": str(error)}
    return {
        "ok": True,
        "worker_cutoff": cutoff_text,
        "checks": [line for line in output.splitlines() if line],
    }


CONTAINER_PAYLOAD = r"""
from __future__ import annotations

import json
import sys
from sqlalchemy import func, select, text

from app.core.config import get_settings
from app.core.db import get_session
from app.core.models import (
    Account,
    AccountEntitlementSnapshot,
    AccountSubscription,
    CreditLedgerEntry,
    MediaArtifact,
    MediaArtifactDelivery,
    ProviderCallRecord,
    RunRecord,
    Site,
)
from app.domain.media_artifacts import build_artifact_store
from app.domain.media_artifacts.store import ArtifactStoreError

site_id, account_id, artifact_id, run_id = sys.argv[1:]
settings = get_settings()
store = build_artifact_store(settings)

with get_session(settings.database_url) as session:
    site = session.scalar(select(Site).where(Site.site_id == site_id))
    account = session.scalar(select(Account).where(Account.account_id == account_id))
    subscriptions = list(
        session.scalars(
            select(AccountSubscription)
            .where(AccountSubscription.account_id == account_id)
            .order_by(AccountSubscription.created_at.desc())
        )
    )
    snapshots = list(
        session.scalars(
            select(AccountEntitlementSnapshot)
            .where(AccountEntitlementSnapshot.account_id == account_id)
            .order_by(AccountEntitlementSnapshot.generated_at.desc())
        )
    )
    ledger_count = session.scalar(
        select(func.count()).select_from(CreditLedgerEntry).where(
            CreditLedgerEntry.account_id == account_id
        )
    ) or 0
    net_delta = session.scalar(
        select(func.coalesce(func.sum(CreditLedgerEntry.ai_credit_delta), 0.0)).where(
            CreditLedgerEntry.account_id == account_id
        )
    ) or 0.0
    consumed_credits = session.scalar(
        select(func.coalesce(func.sum(-CreditLedgerEntry.ai_credit_delta), 0.0)).where(
            CreditLedgerEntry.account_id == account_id,
            CreditLedgerEntry.event_type == "consume",
            CreditLedgerEntry.ai_credit_delta < 0,
        )
    ) or 0.0
    positive_adjustments = session.scalar(
        select(func.count()).select_from(CreditLedgerEntry).where(
            CreditLedgerEntry.account_id == account_id,
            CreditLedgerEntry.event_type.in_(["grant", "adjustment"]),
            CreditLedgerEntry.ai_credit_delta > 0,
        )
    ) or 0
    runs = session.scalar(
        select(func.count()).select_from(RunRecord).where(RunRecord.site_id == site_id)
    ) or 0
    provider_calls = session.scalar(
        select(func.count())
        .select_from(ProviderCallRecord)
        .join(RunRecord, ProviderCallRecord.run_id == RunRecord.run_id)
        .where(RunRecord.site_id == site_id)
    ) or 0
    migration_rows = list(session.execute(text("select version_num from alembic_version")))

    snapshot = snapshots[0] if snapshots else None
    budgets = dict(getattr(snapshot, "budgets_json", None) or {})
    package_limit = float(budgets.get("max_ai_credits_per_period") or 0.0)
    used = max(0.0, float(consumed_credits))
    remaining = max(0.0, package_limit + float(net_delta)) if package_limit > 0 else 0.0
    limit = used + remaining if package_limit > 0 else 0.0
    artifact_payload = None
    if artifact_id:
        artifact = session.scalar(
            select(MediaArtifact).where(MediaArtifact.artifact_id == artifact_id)
        )
        if artifact is not None:
            deliveries = list(
                session.scalars(
                    select(MediaArtifactDelivery).where(
                        MediaArtifactDelivery.artifact_id == artifact_id
                    )
                )
            )
            bytes_present = True
            try:
                metadata = store.metadata(artifact.storage_key)
                store_evidence = {
                    "byte_size": metadata.byte_size,
                    "checksum": metadata.checksum,
                }
            except ArtifactStoreError:
                bytes_present = False
                store_evidence = None
            artifact_payload = {
                "artifact_id": artifact.artifact_id,
                "run_id": artifact.run_id,
                "site_id": artifact.site_id,
                "storage_key": artifact.storage_key,
                "status": artifact.status,
                "byte_size": artifact.byte_size,
                "checksum": artifact.checksum,
                "purged_at": artifact.purged_at.isoformat() if artifact.purged_at else None,
                "purge_claim_id": artifact.purge_claim_id,
                "delivery_count": len(deliveries),
                "acked_delivery_count": sum(1 for item in deliveries if item.acked_at),
                "bytes_present": bytes_present,
                "store_evidence": store_evidence,
            }

    run_payload = None
    if run_id:
        run = session.scalar(select(RunRecord).where(RunRecord.run_id == run_id))
        if run is not None:
            run_payload = {
                "run_id": run.run_id,
                "site_id": run.site_id,
                "status": run.status,
                "ability_name": run.ability_name,
                "ability_family": run.ability_family,
                "provider_call_count": session.scalar(
                    select(func.count()).select_from(ProviderCallRecord).where(
                        ProviderCallRecord.run_id == run_id
                    )
                ) or 0,
                "ledger_entry_count": session.scalar(
                    select(func.count()).select_from(CreditLedgerEntry).where(
                        CreditLedgerEntry.run_id == run_id
                    )
                ) or 0,
            }

    payload = {
        "migration_revisions": sorted(str(row[0]) for row in migration_rows),
        "identity": {
            "site_exists": site is not None,
            "site_id": site_id,
            "site_status": getattr(site, "status", None),
            "site_account_id": getattr(site, "account_id", None),
            "site_platform_kind": getattr(site, "platform_kind", None),
            "account_exists": account is not None,
            "account_id": account_id,
            "account_status": getattr(account, "status", None),
        },
        "entitlement": {
            "subscription_count": len(subscriptions),
            "latest_subscription_status": getattr(subscriptions[0], "status", None)
            if subscriptions
            else None,
            "snapshot_count": len(snapshots),
            "latest_snapshot_status": getattr(snapshot, "status", None),
            "limit": limit,
        },
        "totals": {
            "used": used,
            "remaining": remaining,
            "limit": limit,
            "ledger": int(ledger_count),
            "runs": int(runs),
            "provider_calls": int(provider_calls),
            "positive_grant_adjustment": int(positive_adjustments),
        },
        "artifact": artifact_payload,
        "run": run_payload,
    }
print(json.dumps(payload, sort_keys=True))
"""


def _cloud_evidence(
    api_container: str,
    *,
    site_id: str,
    account_id: str,
    artifact_id: str,
    run_id: str,
) -> dict[str, Any]:
    output = _run(
        [
            "docker",
            "exec",
            "-i",
            api_container,
            "python",
            "-",
            site_id,
            account_id,
            artifact_id,
            run_id,
        ],
        input_text=CONTAINER_PAYLOAD,
    )
    try:
        payload = json.loads(output)
    except json.JSONDecodeError as error:
        raise ReadinessError("API container returned invalid evidence JSON") from error
    if not isinstance(payload, dict):
        raise ReadinessError("API container evidence must be an object")
    return payload


def _assert_expected(actual: Any, expected: Any, label: str, blockers: list[str]) -> None:
    if expected is not None and actual != expected:
        blockers.append(f"{label}: expected {expected!r}, observed {actual!r}")


def _parse_utc(value: str, label: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as error:
        raise ReadinessError(f"{label} is not an ISO-8601 timestamp") from error
    if parsed.tzinfo is None:
        raise ReadinessError(f"{label} must include a UTC offset")
    return parsed.astimezone(UTC)


def _safe_release_reference(managed_root: Path, raw: Any, label: str) -> tuple[str, bool]:
    if not isinstance(raw, str) or not raw:
        return "", False
    candidate = Path(raw)
    try:
        resolved = candidate.resolve(strict=True)
    except OSError:
        return candidate.name, False
    valid = (
        resolved.parent == managed_root
        and re.fullmatch(r"release-[A-Za-z0-9][A-Za-z0-9._-]*", resolved.name) is not None
    )
    if not valid:
        raise ReadinessError(f"{label} escapes the managed release root")
    return resolved.name, True


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--managed-root", default="/opt/npcink-ai-cloud")
    parser.add_argument("--base-url", default="https://cloud.npc.ink")
    parser.add_argument("--site-id", required=True)
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--artifact-id", default="")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--expected-source-revision")
    parser.add_argument("--expected-migration")
    parser.add_argument("--expected-used", type=float)
    parser.add_argument("--expected-remaining", type=float)
    parser.add_argument("--expected-limit", type=float)
    parser.add_argument("--expected-ledger", type=int)
    parser.add_argument("--expected-runs", type=int)
    parser.add_argument("--expected-provider-calls", type=int)
    parser.add_argument("--minimum-observation-hours", type=float, default=0.0)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        site_id = _validate_identifier(args.site_id, "site_id")
        account_id = _validate_identifier(args.account_id, "account_id")
        artifact_id = (
            _validate_identifier(args.artifact_id, "artifact_id") if args.artifact_id else ""
        )
        run_id = _validate_identifier(args.run_id, "run_id") if args.run_id else ""
        managed_root = Path(args.managed_root).resolve()
        release, release_name = _resolve_current_release(managed_root)
        install_state = _read_json(managed_root / "shared/config/install-state.json")
        pending_marker_path = managed_root / ".first-install-pending.json"
        pending_marker = _read_json(pending_marker_path) if pending_marker_path.exists() else None
        release_state = managed_root / ".release-state" / release_name
        rollback_images = release_state / "rollback-images.tsv"
        target_images = release_state / "target-daemon-images.json"

        containers: dict[str, dict[str, Any]] = {}
        container_ids: dict[str, str] = {}
        for service in REQUIRED_SERVICES:
            container_id = _container_for_service(service)
            container_ids[service] = container_id
            containers[service] = _container_state(container_id)
            containers[service]["container_id"] = container_id

        release_images = _release_image_evidence(release, target_images, container_ids)
        source_revision = release_images["source_revision"]
        frontend_revision = _frontend_revision(container_ids["frontend"])
        cloud = _cloud_evidence(
            container_ids["api"],
            site_id=site_id,
            account_id=account_id,
            artifact_id=artifact_id,
            run_id=run_id,
        )
        public_health = _public_health(args.base_url)
        operational_ready = _operational_ready(release, args.base_url, containers)

        blockers: list[str] = []
        if (managed_root / ".deploy-lock").exists():
            blockers.append("deployment lock is present")
        if any(not item["running"] or item["restarting"] for item in containers.values()):
            blockers.append("one or more required containers are unstable")
        if any(
            item["health"] not in {"healthy", "not_configured"}
            for item in containers.values()
        ):
            blockers.append("one or more required containers are not healthy")
        if frontend_revision != source_revision:
            blockers.append("frontend revision does not match the current release revision")
        if any(
            not item["matches"] for item in release_images["service_images"].values()
        ):
            blockers.append("one or more required containers do not match current release images")
        if not public_health.get("ok"):
            blockers.append("public live health did not return HTTP 200")
        if not operational_ready.get("ok"):
            blockers.append("internal operational readiness did not pass")
        if len(cloud.get("migration_revisions") or []) != 1:
            blockers.append("database does not have exactly one Alembic revision")
        identity = cloud.get("identity") or {}
        if not identity.get("site_exists") or not identity.get("account_exists"):
            blockers.append("site/account identity is missing")
        if identity.get("site_account_id") != account_id:
            blockers.append("site/account identity does not match")
        if identity.get("site_status") != "active" or identity.get("account_status") != "active":
            blockers.append("site/account is not active")
        entitlement = cloud.get("entitlement") or {}
        if entitlement.get("latest_subscription_status") != "active":
            blockers.append("latest subscription is not active")
        if entitlement.get("latest_snapshot_status") != "active":
            blockers.append("latest entitlement snapshot is not active")
        if args.minimum_observation_hours < 0 or args.minimum_observation_hours > 168:
            raise ReadinessError("minimum observation hours must be between 0 and 168")
        api_started_at = _parse_utc(containers["api"]["started_at"], "API started_at")
        observation_hours = max(
            0.0,
            (datetime.now(UTC) - api_started_at).total_seconds() / 3600,
        )
        if observation_hours < args.minimum_observation_hours:
            blockers.append(
                "observation window is incomplete: "
                f"required {args.minimum_observation_hours:g}h, observed {observation_hours:.2f}h"
            )

        previous_release_name, previous_release_exists = _safe_release_reference(
            managed_root,
            (pending_marker or {}).get("previous_release"),
            "pending previous_release",
        )
        rollback_map_name = ""
        rollback_map_exists = False
        rollback_map_raw = (pending_marker or {}).get("rollback_image_map")
        if isinstance(rollback_map_raw, str) and rollback_map_raw:
            rollback_map = Path(rollback_map_raw)
            try:
                rollback_map_resolved = rollback_map.resolve(strict=True)
                rollback_map_exists = rollback_map_resolved.is_file()
                rollback_map_name = rollback_map_resolved.name
            except OSError:
                rollback_map_name = rollback_map.name
        rollback_line_count = 0
        if rollback_images.is_file():
            rollback_line_count = len(
                [line for line in rollback_images.read_text(encoding="utf-8").splitlines() if line]
            )
        if pending_marker is not None and not previous_release_exists:
            blockers.append("pending first-install previous release is unavailable")
        if pending_marker is not None and not rollback_map_exists:
            blockers.append("pending first-install rollback image map is unavailable")
        if not rollback_images.is_file() or rollback_line_count < 1:
            blockers.append("current release rollback image evidence is unavailable")
        if not target_images.is_file():
            blockers.append("current release target image evidence is unavailable")

        expected_revision = args.expected_source_revision
        if expected_revision and not REVISION_RE.fullmatch(expected_revision):
            raise ReadinessError("expected source revision is invalid")
        _assert_expected(source_revision, expected_revision, "source_revision", blockers)
        if args.expected_migration:
            _assert_expected(
                cloud.get("migration_revisions"),
                [args.expected_migration],
                "migration_revisions",
                blockers,
            )
        totals = cloud.get("totals") or {}
        _assert_expected(totals.get("used"), args.expected_used, "used", blockers)
        _assert_expected(totals.get("remaining"), args.expected_remaining, "remaining", blockers)
        _assert_expected(totals.get("limit"), args.expected_limit, "limit", blockers)
        _assert_expected(totals.get("ledger"), args.expected_ledger, "ledger", blockers)
        _assert_expected(totals.get("runs"), args.expected_runs, "runs", blockers)
        _assert_expected(
            totals.get("provider_calls"),
            args.expected_provider_calls,
            "provider_calls",
            blockers,
        )

        lifecycle = {
            "installation_state": install_state.get("installation_state"),
            "database_contract": install_state.get("database_contract"),
            "pending_marker_present": pending_marker is not None,
            "pending_marker_contract": (pending_marker or {}).get("contract"),
            "completion_sentinel_present": (managed_root / ".installation-complete").exists(),
            "current_release": release_name,
            "current_release_path_matches": release == (managed_root / "current").resolve(),
            "previous_release": previous_release_name,
            "previous_release_exists": previous_release_exists,
            "rollback_map": rollback_map_name,
            "rollback_map_exists": rollback_map_exists,
            "rollback_images_count": rollback_line_count,
            "target_image_evidence_present": target_images.is_file(),
            "release_image_evidence": release_images,
            "observation_hours": round(observation_hours, 2),
            "minimum_observation_hours": args.minimum_observation_hours,
        }
        receipt = {
            "contract_version": CONTRACT_VERSION,
            "outcome": "pass" if not blockers else "blocked",
            "blockers": blockers,
            "source_revision": source_revision,
            "lifecycle": lifecycle,
            "containers": containers,
            "public_health": public_health,
            "operational_ready": operational_ready,
            "cloud": cloud,
            "manual_gates_required": [
                "operator reviews WordPress adoption and cleanup receipt",
                "operator confirms rollback and backup evidence",
                "operator confirms applicable passive-window or internal active-soak evidence",
                "operator separately authorizes first-install finalize",
            ],
            "claims": {
                "finalize_authorized": False,
                "real_user_acceptance": False,
                "commercial_viability": False,
            },
        }
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0 if not blockers else 2
    except (ReadinessError, OSError, ValueError, json.JSONDecodeError) as error:
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
