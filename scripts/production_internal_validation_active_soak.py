#!/usr/bin/env python3
"""Run a bounded, zero-call production readiness soak from the operator Mac.

The command repeatedly invokes the existing read-only WordPress round-trip
readiness command. It does not call a Provider, contact WordPress, mutate Cloud,
or authorize first-install finalization.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CONTRACT_VERSION = "npcink.production_internal_validation_active_soak.v1"
APPROVAL = "Approved for internal no-user active soak by operator."
TOTAL_FIELDS = (
    "used",
    "remaining",
    "limit",
    "ledger",
    "runs",
    "provider_calls",
    "positive_grant_adjustment",
)


class ActiveSoakError(RuntimeError):
    """Raised when a sample cannot support the active-soak claim."""


def _utc_now() -> datetime:
    # The operator Mac may expose Apple Python 3.9 even though Cloud uses 3.12+.
    return datetime.now(timezone.utc)  # noqa: UP017


def _fingerprint(receipt: dict[str, Any]) -> dict[str, Any]:
    lifecycle = receipt.get("lifecycle") or {}
    cloud = receipt.get("cloud") or {}
    totals = cloud.get("totals") or {}
    containers = receipt.get("containers") or {}
    release_images = lifecycle.get("release_image_evidence") or {}
    service_images = release_images.get("service_images") or {}
    return {
        "source_revision": receipt.get("source_revision"),
        "migration_revisions": cloud.get("migration_revisions"),
        "identity": cloud.get("identity"),
        "entitlement": cloud.get("entitlement"),
        "totals": {field: totals.get(field) for field in TOTAL_FIELDS},
        "lifecycle": {
            field: lifecycle.get(field)
            for field in (
                "installation_state",
                "database_contract",
                "pending_marker_present",
                "pending_marker_contract",
                "completion_sentinel_present",
                "current_release",
                "previous_release",
                "previous_release_exists",
                "rollback_map",
                "rollback_map_exists",
                "rollback_images_count",
                "target_image_evidence_present",
            )
        },
        "containers": {
            service: {
                field: state.get(field)
                for field in (
                    "container_id",
                    "running",
                    "restarting",
                    "restart_count",
                    "health",
                    "started_at",
                )
            }
            for service, state in sorted(containers.items())
        },
        "service_images": {
            service: {
                "matches": evidence.get("matches"),
                "expected_image_id": evidence.get("expected_image_id"),
                "actual_image_id": evidence.get("actual_image_id"),
            }
            for service, evidence in sorted(service_images.items())
        },
        "operational_ready": receipt.get("operational_ready"),
    }


def _sample_summary(index: int, observed_at: datetime, receipt: dict[str, Any]) -> dict[str, Any]:
    cloud = receipt.get("cloud") or {}
    lifecycle = receipt.get("lifecycle") or {}
    return {
        "index": index,
        "observed_at": observed_at.isoformat(),
        "outcome": receipt.get("outcome"),
        "source_revision": receipt.get("source_revision"),
        "migration_revisions": cloud.get("migration_revisions"),
        "current_release": lifecycle.get("current_release"),
        "totals": (cloud.get("totals") or {}).copy(),
        "public_health": {
            "status": (receipt.get("public_health") or {}).get("status"),
            "ok": (receipt.get("public_health") or {}).get("ok"),
        },
        "operational_ready": {
            "ok": (receipt.get("operational_ready") or {}).get("ok"),
            "worker_cutoff": (receipt.get("operational_ready") or {}).get("worker_cutoff"),
        },
        "container_restart_counts": {
            service: state.get("restart_count")
            for service, state in sorted((receipt.get("containers") or {}).items())
        },
    }


def _compare_fingerprints(
    baseline: dict[str, Any], current: dict[str, Any], sample_index: int
) -> list[str]:
    blockers: list[str] = []
    for field in (
        "source_revision",
        "migration_revisions",
        "identity",
        "entitlement",
        "totals",
        "lifecycle",
        "containers",
        "service_images",
        "operational_ready",
    ):
        if current.get(field) != baseline.get(field):
            blockers.append(f"sample {sample_index}: {field} changed during active soak")
    return blockers


def _readiness_command(args: argparse.Namespace) -> list[str]:
    command = [
        "bash",
        str(args.readiness_wrapper),
        "--ssh-host",
        args.ssh_host,
        "--ssh-user",
        args.ssh_user,
        "--ssh-port",
        str(args.ssh_port),
        "--site-id",
        args.site_id,
        "--account-id",
        args.account_id,
        "--minimum-observation-hours",
        "0",
    ]
    if args.identity_file:
        command.extend(["--identity-file", str(args.identity_file)])
    expected = {
        "--expected-source-revision": args.expected_source_revision,
        "--expected-migration": args.expected_migration,
        "--expected-used": args.expected_used,
        "--expected-remaining": args.expected_remaining,
        "--expected-limit": args.expected_limit,
        "--expected-ledger": args.expected_ledger,
        "--expected-runs": args.expected_runs,
        "--expected-provider-calls": args.expected_provider_calls,
    }
    for option, value in expected.items():
        command.extend([option, str(value)])
    return command


def _collect_readiness(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    output = result.stdout.strip()
    if not output:
        detail = result.stderr.strip() or f"readiness exited {result.returncode}"
        raise ActiveSoakError(detail)
    try:
        receipt = json.loads(output)
    except json.JSONDecodeError as error:
        raise ActiveSoakError("readiness returned invalid JSON") from error
    if not isinstance(receipt, dict):
        raise ActiveSoakError("readiness receipt must be an object")
    if result.returncode != 0 or receipt.get("outcome") != "pass":
        blockers = receipt.get("blockers") or [receipt.get("error") or "readiness blocked"]
        raise ActiveSoakError("; ".join(str(item) for item in blockers))
    return receipt


def build_parser() -> argparse.ArgumentParser:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--readiness-wrapper",
        type=Path,
        default=root / "deploy/wordpress-roundtrip-readiness-to-ssh-host.sh",
    )
    parser.add_argument("--ssh-host", required=True)
    parser.add_argument("--ssh-user", default="root")
    parser.add_argument("--ssh-port", type=int, default=22)
    parser.add_argument("--identity-file", type=Path)
    parser.add_argument("--site-id", required=True)
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--expected-source-revision", required=True)
    parser.add_argument("--expected-migration", required=True)
    parser.add_argument("--expected-used", type=float, required=True)
    parser.add_argument("--expected-remaining", type=float, required=True)
    parser.add_argument("--expected-limit", type=float, required=True)
    parser.add_argument("--expected-ledger", type=int, required=True)
    parser.add_argument("--expected-runs", type=int, required=True)
    parser.add_argument("--expected-provider-calls", type=int, required=True)
    parser.add_argument("--duration-minutes", type=float, default=30.0)
    parser.add_argument("--sample-interval-seconds", type=int, default=60)
    parser.add_argument("--approval", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    if raw_argv[:1] == ["--"]:
        raw_argv = raw_argv[1:]
    args = build_parser().parse_args(raw_argv)
    started_at = _utc_now()
    started_monotonic = time.monotonic()
    samples: list[dict[str, Any]] = []
    blockers: list[str] = []
    baseline: dict[str, Any] | None = None
    try:
        if args.approval != APPROVAL:
            raise ActiveSoakError("operator approval sentence does not match")
        if not 30 <= args.duration_minutes <= 60:
            raise ActiveSoakError("duration minutes must be between 30 and 60")
        if not 30 <= args.sample_interval_seconds <= 300:
            raise ActiveSoakError("sample interval seconds must be between 30 and 300")
        if not args.readiness_wrapper.is_file():
            raise ActiveSoakError("readiness wrapper does not exist")
        if args.identity_file and not args.identity_file.is_file():
            raise ActiveSoakError("SSH identity file does not exist")

        command = _readiness_command(args)
        deadline = started_monotonic + args.duration_minutes * 60
        sample_index = 0
        while True:
            observed_at = _utc_now()
            readiness = _collect_readiness(command)
            current = _fingerprint(readiness)
            if baseline is None:
                baseline = current
            else:
                blockers.extend(_compare_fingerprints(baseline, current, sample_index))
            samples.append(_sample_summary(sample_index, observed_at, readiness))
            if blockers or time.monotonic() >= deadline:
                break
            sample_index += 1
            remaining = max(0.0, deadline - time.monotonic())
            time.sleep(min(args.sample_interval_seconds, remaining))
    except (ActiveSoakError, OSError, ValueError) as error:
        blockers.append(str(error))

    ended_at = _utc_now()
    elapsed_seconds = max(0.0, time.monotonic() - started_monotonic)
    duration_complete = elapsed_seconds >= args.duration_minutes * 60
    if not duration_complete and not blockers:
        blockers.append("active-soak duration did not complete")
    outcome = "pass" if duration_complete and not blockers else "blocked"
    receipt = {
        "contract_version": CONTRACT_VERSION,
        "outcome": outcome,
        "blockers": blockers,
        "operator_declaration": {
            "approval": APPROVAL,
            "external_users": False,
            "natural_traffic": False,
            "purpose": "internal_first_install_validation_only",
        },
        "window": {
            "started_at": started_at.isoformat(),
            "ended_at": ended_at.isoformat(),
            "required_minutes": args.duration_minutes,
            "elapsed_seconds": round(elapsed_seconds, 3),
            "sample_interval_seconds": args.sample_interval_seconds,
            "sample_count": len(samples),
        },
        "baseline": baseline,
        "samples": samples,
        "limitations": {
            "non_health_502_count": "not measured",
            "real_user_acceptance": False,
            "commercial_viability": False,
        },
        "claims": {
            "provider_called": False if outcome == "pass" else None,
            "wordpress_written": False if outcome == "pass" else None,
            "tool_initiated_provider_call": False,
            "tool_initiated_wordpress_write": False,
            "quota_ledger_run_provider_totals_unchanged": outcome == "pass",
            "finalize_authorized": False,
            "real_user_acceptance": False,
            "commercial_viability": False,
        },
    }
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if outcome == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
