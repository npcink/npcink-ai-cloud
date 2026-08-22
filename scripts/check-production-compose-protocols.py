#!/usr/bin/env python3
"""Fail closed when production Compose publishes a UDP port."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

DEFAULT_COMPOSE_FILES = ("docker-compose.prod.yml", "docker-compose.runtime.yml")
REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def published_protocol(port: object) -> str:
    if isinstance(port, str):
        suffix = port.rsplit("/", 1)
        return suffix[1].strip().lower() if len(suffix) == 2 else "tcp"
    if isinstance(port, dict):
        protocol = port.get("protocol", "tcp")
        if not isinstance(protocol, str) or not protocol.strip():
            raise ValueError(f"invalid Compose port protocol: {protocol!r}")
        return protocol.strip().lower()
    raise ValueError(f"invalid Compose port entry: {port!r}")


def udp_publications(model: object) -> list[str]:
    if not isinstance(model, dict):
        raise ValueError("normalized Compose model must be an object")
    services = model.get("services")
    if not isinstance(services, dict):
        raise ValueError("normalized Compose model has no services object")

    findings: list[str] = []
    for service_name, service in services.items():
        if not isinstance(service_name, str) or not isinstance(service, dict):
            raise ValueError("normalized Compose service entry is invalid")
        ports = service.get("ports", [])
        if ports is None:
            continue
        if not isinstance(ports, list):
            raise ValueError(f"service {service_name!r} ports must be a list")
        for index, port in enumerate(ports):
            if published_protocol(port) == "udp":
                findings.append(f"{service_name}.ports[{index}]")
    return findings


def normalized_compose_model(path: Path) -> dict[str, Any]:
    environment = os.environ.copy()
    environment.update(
        {
            "NPCINK_CLOUD_BACKEND_ENV_FILE": "/dev/null",
            "NPCINK_CLOUD_CONFIG_DIR_HOST": "/tmp/npcink-cloud-config",
        }
    )
    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(path),
            "config",
            "--format",
            "json",
        ],
        check=False,
        capture_output=True,
        text=True,
        env=environment,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown Compose error"
        raise RuntimeError(f"failed to normalize {path}: {detail}")
    try:
        model = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid normalized Compose JSON for {path}: {exc}") from exc
    if not isinstance(model, dict):
        raise RuntimeError(f"normalized Compose model for {path} must be an object")
    return model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "compose_files",
        nargs="*",
        default=[str(REPOSITORY_ROOT / name) for name in DEFAULT_COMPOSE_FILES],
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    for raw_path in args.compose_files:
        path = Path(raw_path)
        try:
            findings = udp_publications(normalized_compose_model(path))
        except (OSError, RuntimeError, ValueError) as exc:
            print(f"[fail] {exc}", file=sys.stderr)
            return 1
        if findings:
            print(
                f"[fail] UDP publication invalidates the OpenSSL exception in {path}: "
                + ", ".join(findings),
                file=sys.stderr,
            )
            return 1
    print("[ok] Production Compose models publish no UDP ports")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
