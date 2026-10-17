#!/usr/bin/env python3
"""Bounded, GET-only Docker resource sampling; no third-party dependencies."""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import math
import os
import re
import shlex
import shutil
import socket
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

CONTRACT = "runtime_resource_baseline.v1"
REQUIRED = {"api", "frontend", "proxy", "redis", "worker", "callback-worker", "ops-worker"}
STATE_KEYS = {
    "acceptance_state",
    "promotion_pr",
    "source_revision",
    "source_branch",
    "source_dirty",
    "source_bundle_sha256",
    "frontend_mode",
    "runtime_image_id",
    "frontend_image_id",
    "deployed_at_utc",
}
MIB = 1024 * 1024


class CollectionError(Exception):
    """A safe error code, never a raw Docker/SSH response or configuration."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()  # noqa: UP017 - macOS system Python 3.9


class UnixConnection(http.client.HTTPConnection):
    def __init__(self, path: str) -> None:
        super().__init__("localhost", timeout=5)
        self.path = path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


class DockerReadClient:
    def __init__(self) -> None:
        docker = shutil.which("docker") or next(
            (
                path
                for path in (
                    "/usr/local/bin/docker",
                    "/opt/homebrew/bin/docker",
                    "/Applications/Docker.app/Contents/Resources/bin/docker",
                )
                if Path(path).is_file()
            ),
            None,
        )
        if docker is None:
            raise CollectionError("docker_cli_unavailable")
        host = os.environ.get("DOCKER_HOST")
        if not host:
            result = subprocess.run(
                [docker, "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            if result.returncode:
                raise CollectionError("docker_context_unavailable")
            host = result.stdout.strip()
        if not host.startswith("unix://"):
            raise CollectionError("local_unix_docker_socket_required")
        self.path = host.removeprefix("unix://")
        version = self.get("/version")
        api_version = version["ApiVersion"]
        if not re.fullmatch(r"1\.[0-9]+", api_version):
            raise CollectionError("invalid_docker_api_version")
        self.prefix = "/v" + api_version

    def get(self, path: str) -> dict | list:
        connection = UnixConnection(self.path)
        try:
            connection.request("GET", path)
            response = connection.getresponse()
            if response.status != 200:
                raise CollectionError("docker_read_failed")
            body = response.read(8 * 1024 * 1024 + 1)
            if len(body) > 8 * 1024 * 1024:
                raise CollectionError("docker_response_too_large")
            return json.loads(body)
        finally:
            connection.close()

    def api(self, path: str) -> dict | list:
        return self.get(self.prefix + path)


def deployment_state(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    state_path = Path(path).expanduser()
    if not state_path.is_file():
        raise CollectionError("deployment_state_missing")
    result = {}
    for line in state_path.read_text().splitlines():
        key, separator, value = line.partition("=")
        if separator and key in STATE_KEYS:
            result[key] = value[:256]
    return result


def inventory(client: DockerReadClient, project: str) -> list[dict]:
    filters = json.dumps({"label": ["com.docker.compose.project=" + project]})
    rows = client.api("/containers/json?" + urlencode({"all": "true", "filters": filters}))
    result = []
    for row in rows:
        labels = row.get("Labels", {})
        if labels.get("com.docker.compose.oneoff", "false").lower() == "true":
            continue
        service = labels.get("com.docker.compose.service", "")
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", service):
            raise CollectionError("invalid_compose_service")
        detail = client.api("/containers/" + row["Id"] + "/json")
        state = detail["State"]
        command = detail.get("Config", {}).get("Cmd") or []
        result.append(
            {
                "id": row["Id"],
                "service": service,
                "image_id": detail["Image"],
                "started_at": state.get("StartedAt"),
                "status": state.get("Status"),
                "health": state.get("Health", {}).get("Status"),
                "oom_killed": bool(state.get("OOMKilled")),
                "restart_count": detail.get("RestartCount", 0),
                "configured_memory_limit_bytes": detail.get("HostConfig", {}).get("Memory", 0),
                "reload_enabled": "--reload" in command,
            }
        )
    if not REQUIRED.issubset({row["service"] for row in result}):
        raise CollectionError("required_project_service_missing")
    if any(row["status"] != "running" for row in result):
        raise CollectionError("project_service_not_running")
    return sorted(result, key=lambda row: row["id"])


def identity(rows: list[dict]) -> list[tuple]:
    return [(row["id"], row["image_id"], row["started_at"], row["restart_count"]) for row in rows]


def host_memory() -> dict:
    # A macOS host's free RAM is not Docker's Linux VM free RAM.
    path = Path("/proc/meminfo")
    if not path.is_file():
        return {
            "scope": "operator_host",
            "available_bytes": None,
            "note": "Linux VM available memory and swap are not measured on macOS",
        }
    values = {}
    for line in path.read_text().splitlines():
        key, _, raw = line.partition(":")
        if key in {"MemTotal", "MemAvailable", "SwapTotal", "SwapFree"}:
            values[key] = int(raw.split()[0]) * 1024
    swap = {}
    for line in Path("/proc/vmstat").read_text().splitlines():
        key, value = line.split()
        if key in {"pswpin", "pswpout"}:
            swap[key] = int(value)
    return {
        "scope": "operator_host",
        "total_bytes": values.get("MemTotal"),
        "available_bytes": values.get("MemAvailable"),
        "swap_used_bytes": values["SwapTotal"] - values["SwapFree"]
        if {"SwapTotal", "SwapFree"}.issubset(values)
        else None,
        "swap_counters_pages": swap,
    }


def resource_stats(raw: dict, previous: dict | None) -> dict:
    memory = raw.get("memory_stats", {})
    fields = memory.get("stats", {})
    usage = int(memory.get("usage", 0))
    # Match Docker CLI: v1 total_inactive_file, v2 inactive_file, old cache fallback.
    cache = int(
        fields.get("total_inactive_file", fields.get("inactive_file", fields.get("cache", 0)))
    )
    cpu = raw.get("cpu_stats", {})
    percent = None
    if previous:
        old = previous.get("cpu_stats", {})
        used = cpu.get("cpu_usage", {}).get("total_usage")
        old_used = old.get("cpu_usage", {}).get("total_usage")
        system = cpu.get("system_cpu_usage")
        old_system = old.get("system_cpu_usage")
        online = cpu.get("online_cpus") or len(cpu.get("cpu_usage", {}).get("percpu_usage", []))
        if all(isinstance(value, int) for value in (used, old_used, system, old_system)):
            system_delta = system - old_system
            if system_delta > 0 and used >= old_used and online:
                percent = (used - old_used) / system_delta * online * 100
    networks = raw.get("networks", {})
    return {
        "raw_memory_bytes": usage,
        "inactive_file_bytes": cache,
        "working_memory_bytes": usage - cache if cache < usage else usage,
        "anon_or_rss_bytes": fields.get("anon", fields.get("total_rss", fields.get("rss"))),
        "kernel_lifetime_peak_bytes": memory.get("max_usage") or None,
        "cpu_percent": percent,
        "pids": raw.get("pids_stats", {}).get("current"),
        "network_rx_bytes": sum(value["rx_bytes"] for value in networks.values())
        if networks and all("rx_bytes" in value for value in networks.values())
        else None,
        "network_tx_bytes": sum(value["tx_bytes"] for value in networks.values())
        if networks and all("tx_bytes" in value for value in networks.values())
        else None,
    }


def emit(record: dict) -> None:
    print(json.dumps(record, sort_keys=True), flush=True)


def agent(args: argparse.Namespace) -> int:
    complete = False
    count = 0
    try:
        client = DockerReadClient()
        info = client.api("/info")
        state = deployment_state(args.state_file)
        initial = inventory(client, args.project)
        emit(
            {
                "type": "metadata",
                "contract_version": CONTRACT,
                "collector_sha256": getattr(args, "collector_sha256", None),
                "at": utc_now(),
                "project": args.project,
                "scenario": args.scenario,
                "deployment": state,
                "duration_seconds": args.duration_seconds,
                "interval_seconds": args.interval_seconds,
                "docker": {
                    key: info.get(key)
                    for key in (
                        "ServerVersion",
                        "Architecture",
                        "OperatingSystem",
                        "NCPU",
                        "MemTotal",
                        "CgroupVersion",
                        "Driver",
                    )
                },
                "containers": initial,
                "boundary": {
                    "docker_methods": ["GET"],
                    "collector_triggered_provider_calls": 0,
                    "contains_configuration_or_content": False,
                },
            }
        )
        previous = {}
        started = time.monotonic()
        deadline = started + args.duration_seconds
        while True:
            tick = time.monotonic()
            current = inventory(client, args.project)
            if identity(current) != identity(initial) or deployment_state(args.state_file) != state:
                raise CollectionError("runtime_identity_changed")
            resources = []
            for row in current:
                raw = client.api("/containers/" + row["id"] + "/stats?stream=false&one-shot=true")
                if "usage" not in raw.get("memory_stats", {}):
                    raise CollectionError("container_memory_unavailable")
                resources.append({**row, **resource_stats(raw, previous.get(row["id"]))})
                previous[row["id"]] = raw
            # Discard a snapshot if the runtime changed while the counters were read.
            if (
                identity(inventory(client, args.project)) != identity(initial)
                or deployment_state(args.state_file) != state
            ):
                raise CollectionError("runtime_identity_changed")
            emit(
                {
                    "type": "sample",
                    "at": utc_now(),
                    "elapsed_seconds": time.monotonic() - started,
                    "collection_seconds": time.monotonic() - tick,
                    "host": host_memory(),
                    "containers": resources,
                    "stack_working_bytes": sum(row["working_memory_bytes"] for row in resources),
                    "stack_raw_bytes": sum(row["raw_memory_bytes"] for row in resources),
                }
            )
            count += 1
            if time.monotonic() >= deadline:
                complete = True
                break
            time.sleep(max(0, min(tick + args.interval_seconds, deadline) - time.monotonic()))
    except CollectionError as error:
        emit({"type": "error", "at": utc_now(), "code": str(error)})
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        subprocess.SubprocessError,
        http.client.HTTPException,
    ):
        emit({"type": "error", "at": utc_now(), "code": "resource_collection_failed"})
    except KeyboardInterrupt:
        emit({"type": "error", "at": utc_now(), "code": "operator_interrupted"})
    emit({"type": "end", "at": utc_now(), "complete": complete, "samples": count})
    return 0 if complete else 1


def distribution(values: list[float]) -> dict:
    ordered = sorted(values)
    return {
        "median": statistics.median(ordered),
        "p95": ordered[max(0, math.ceil(len(ordered) * 0.95) - 1)],
        "observed_max": max(ordered),
    }


def summarize(records: list[dict]) -> dict:
    metadata = next((row for row in records if row["type"] == "metadata"), {})
    samples = [row for row in records if row["type"] == "sample"]
    errors = [row["code"] for row in records if row["type"] == "error"]
    # An end marker alone cannot establish a successful capture or transport.
    complete = bool(
        metadata
        and samples
        and not errors
        and records[0]["type"] == "metadata"
        and sum(row["type"] == "metadata" for row in records) == 1
        and sum(row["type"] == "end" for row in records) == 1
        and records[-1]["type"] == "end"
        and records[-1].get("complete") is True
        and records[-1].get("samples") == len(samples)
        and metadata.get("duration_seconds", 0) > 0
        and samples[-1]["elapsed_seconds"] >= metadata["duration_seconds"]
    )
    groups = {}
    for sample in samples:
        for row in sample["containers"]:
            groups.setdefault(row["id"], []).append(row)
    containers = []
    for rows in groups.values():
        cpus = [row["cpu_percent"] for row in rows if row["cpu_percent"] is not None]
        containers.append(
            {
                "service": rows[0]["service"],
                "id": rows[0]["id"],
                "samples": len(rows),
                "working_bytes": distribution([row["working_memory_bytes"] for row in rows]),
                "raw_bytes": distribution([row["raw_memory_bytes"] for row in rows]),
                "cpu_percent": distribution(cpus) if cpus else None,
                "restart_count": rows[-1]["restart_count"],
                "oom_killed": any(row["oom_killed"] for row in rows),
                "unhealthy_samples": sum(row["health"] == "unhealthy" for row in rows),
            }
        )
    containers.sort(key=lambda row: row["service"])
    application = [
        sum(
            row["working_memory_bytes"]
            for row in sample["containers"]
            if row["service"] != "postgres"
        )
        for sample in samples
    ]
    available = [
        sample["host"]["available_bytes"]
        for sample in samples
        if sample["host"].get("available_bytes") is not None
    ]
    return {
        "contract_version": CONTRACT,
        "metadata": metadata,
        "complete": complete,
        "errors": errors,
        "samples": len(samples),
        "elapsed_seconds": samples[-1]["elapsed_seconds"] if samples else 0,
        "containers": containers,
        "stack_working_bytes": distribution([row["stack_working_bytes"] for row in samples])
        if samples
        else None,
        "application_working_bytes_excluding_postgres": distribution(application)
        if application
        else None,
        "collection_seconds": distribution([row["collection_seconds"] for row in samples])
        if samples
        else None,
        "minimum_operator_host_available_bytes": min(available) if available else None,
        "limitations": [
            "Passive traffic; not a proven idle baseline or workload capacity test.",
            "Observed sample maxima can miss sub-interval spikes; lifetime peaks are separate.",
            "Stack snapshots are sequential reads, with collection duration recorded.",
            "PostgreSQL is excluded only from the application subtotal, not deleted.",
            "macOS host RAM is not Docker Linux VM RAM; no VM free-memory claim.",
            "No production capacity, merge, or accepted M4 claim.",
        ],
    }


def markdown(report: dict) -> str:
    meta = report["metadata"]
    state = meta.get("deployment", {})
    lines = [
        "# Runtime resource observation",
        "",
        f"Project: `{meta.get('project')}`; scenario: `{meta.get('scenario')}`.",
        f"Revision: `{state.get('source_revision', 'not supplied')}`; "
        f"acceptance: `{state.get('acceptance_state', 'not supplied')}`; "
        f"dirty: `{state.get('source_dirty', 'not supplied')}`.",
        f"Samples: {report['samples']}; duration: {report['elapsed_seconds']:.1f}s; "
        f"complete: {report['complete']}.",
        "",
        "Memory is in MiB; CPU 100% represents one logical CPU.",
        "",
        "| Service | Median working | P95 working | Observed max working | Max raw | P95 CPU % |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in report["containers"]:
        memory = row["working_bytes"]
        cpu = f"{row['cpu_percent']['p95']:.2f}" if row["cpu_percent"] else "not measured"
        lines.append(
            f"| {row['service']} | {memory['median'] / MIB:.1f} | "
            f"{memory['p95'] / MIB:.1f} | {memory['observed_max'] / MIB:.1f} | "
            f"{row['raw_bytes']['observed_max'] / MIB:.1f} | {cpu} |"
        )
    lines.extend(
        ["", "Aggregate maxima are calculated per snapshot, not by summing service maxima."]
    )
    for key in ("stack_working_bytes", "application_working_bytes_excluding_postgres"):
        if report[key]:
            lines.append(
                f"- {key}: median {report[key]['median'] / MIB:.1f} MiB; "
                f"observed max {report[key]['observed_max'] / MIB:.1f} MiB."
            )
    lines.extend(["", "Limitations:", "", *[f"- {item}" for item in report["limitations"]]])
    if report["errors"]:
        lines.extend(["", "Errors: " + ", ".join(report["errors"])])
    return "\n".join(lines) + "\n"


def save_summary(path: Path) -> dict:
    snapshot = path.read_text()
    lines = snapshot.splitlines()
    records = []
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            # An ongoing writer can be midway through its final record.
            if index == len(lines) - 1 and not snapshot.endswith("\n"):
                records.append({"type": "error", "code": "unfinished_record"})
                break
            raise
    report = summarize(records)
    path.with_name("summary.json").write_text(json.dumps(report, indent=2) + "\n")
    path.with_name("summary.md").write_text(markdown(report))
    return report


def collect(args: argparse.Namespace) -> int:
    directory = Path(args.output_dir)
    directory.mkdir(parents=True, mode=0o700, exist_ok=False)
    agent_source = Path(__file__).read_bytes()
    agent_args = [
        "collect",
        "--agent",
        "--project",
        args.project,
        "--scenario",
        args.scenario,
        "--duration-seconds",
        str(args.duration_seconds),
        "--interval-seconds",
        str(args.interval_seconds),
        "--collector-sha256",
        hashlib.sha256(agent_source).hexdigest(),
    ]
    if args.state_file:
        agent_args += ["--state-file", args.state_file]
    if args.ssh_host:
        remote = ["env"]
        if args.docker_config:
            remote.append("DOCKER_CONFIG=" + args.docker_config)
        remote += [args.remote_python, "-u", "-", *agent_args]
        command = [
            "ssh",
            "-p",
            str(args.ssh_port),
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "ConnectionAttempts=1",
            "-o",
            "ServerAliveInterval=10",
            "-o",
            "ServerAliveCountMax=2",
            args.ssh_host,
            shlex.join(remote),
        ]
    else:
        command = [sys.executable, "-u", __file__, *agent_args]
    process_env = os.environ.copy()
    if args.docker_config and not args.ssh_host:
        process_env["DOCKER_CONFIG"] = args.docker_config
    raw_path = directory / "samples.jsonl"
    process = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        env=process_env,
    )
    last_progress = 0.0
    code = 1
    try:
        if args.ssh_host:
            process.stdin.write(agent_source.decode("utf-8"))
        process.stdin.close()
        with raw_path.open("x") as output:
            os.chmod(raw_path, 0o600)
            for line in process.stdout:
                record = json.loads(line)
                output.write(json.dumps(record) + "\n")
                output.flush()
                if record["type"] == "sample" and time.monotonic() - last_progress >= 60:
                    print(
                        f"[resource-baseline] elapsed={record['elapsed_seconds']:.1f}s "
                        f"stack_working={record['stack_working_bytes'] / MIB:.1f}MiB",
                        flush=True,
                    )
                    last_progress = time.monotonic()
        code = process.wait(timeout=10)
        if code:
            with raw_path.open("a") as output:
                output.write(
                    json.dumps({"type": "error", "at": utc_now(), "code": f"agent_exit_{code}"})
                    + "\n"
                )
    except (KeyboardInterrupt, OSError, ValueError, subprocess.SubprocessError):
        with raw_path.open("a") as output:
            output.write(
                json.dumps(
                    {"type": "error", "code": "operator_or_transport_interrupted", "at": utc_now()}
                )
                + "\n"
            )
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        process.stdout.close()
    report = save_summary(raw_path)
    print(
        f"[resource-baseline] complete={report['complete']} samples={report['samples']} "
        f"report={directory / 'summary.md'}",
        flush=True,
    )
    return code if code else (0 if report["complete"] else 1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    sampling = commands.add_parser("collect")
    sampling.add_argument("--project", required=True)
    sampling.add_argument("--scenario", default="passive")
    sampling.add_argument("--duration-seconds", type=int, default=900)
    sampling.add_argument("--interval-seconds", type=float, default=5)
    sampling.add_argument("--output-dir")
    sampling.add_argument("--state-file")
    sampling.add_argument("--ssh-host")
    sampling.add_argument("--ssh-port", type=int, default=22)
    sampling.add_argument("--docker-config")
    sampling.add_argument("--remote-python", default="/usr/bin/python3")
    sampling.add_argument("--agent", action="store_true", help=argparse.SUPPRESS)
    sampling.add_argument("--collector-sha256", help=argparse.SUPPRESS)
    summary = commands.add_parser("summarize")
    summary.add_argument("input", type=Path)
    args = parser.parse_args()
    if args.command == "collect":
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,80}", args.project):
            parser.error("project must be a Compose project name")
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,80}", args.scenario):
            parser.error("scenario must be a plain label")
        if not 1 <= args.duration_seconds <= 7200 or not 1 <= args.interval_seconds <= 60:
            parser.error("duration must be 1..7200s and interval 1..60s")
        if not 1 <= args.ssh_port <= 65535:
            parser.error("invalid SSH port")
        if args.ssh_host and not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.:@-]*", args.ssh_host):
            parser.error("invalid SSH host")
        if not args.agent and not args.output_dir:
            parser.error("--output-dir is required")
    return args


def main() -> int:
    args = parse_args()
    if args.command == "summarize":
        report = save_summary(args.input)
        print(markdown(report))
        return 0
    return agent(args) if args.agent else collect(args)


if __name__ == "__main__":
    raise SystemExit(main())
