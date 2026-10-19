#!/usr/bin/env python3
"""Run five bounded business-rule regressions; never contact a live system."""

from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts import verify_critical as critical  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "config/business-acceptance-v1.json"
AREAS = ("writing", "usage", "quota", "permissions", "isolation")
PHP_COMPLETED = "NPCINK_BUSINESS_PHP_COMPLETED"
PHP_DISABLED = (
    "exec,passthru,shell_exec,system,proc_open,popen,pcntl_exec,"
    "fsockopen,pfsockopen,stream_socket_client,stream_socket_server,"
    "socket_create,socket_connect,socket_sendto,curl_init,curl_exec,curl_multi_exec,"
    "mail,gethostbyname,gethostbynamel,gethostbyaddr,dns_get_record,"
    "putenv,dl"
)


def load_manifest() -> dict[str, Any]:
    data = json.loads(MANIFEST.read_text())
    if data.get("schema_version") != 1 or tuple(data.get("areas", {})) != AREAS:
        raise ValueError("business manifest must declare the five ordered areas")
    for area in data["areas"].values():
        if not isinstance(area.get("production_gap"), str) or not area["production_gap"]:
            raise ValueError("every area needs an explicit production gap")
        for lane, suffix in (("cloud", ".py"), ("addon", ".php")):
            values = area.get(lane)
            if not isinstance(values, list) or not values or len(set(values)) != len(values):
                raise ValueError("each area needs unique test selectors")
            for value in values:
                path, *nodes = value.split("::")
                if (
                    not path.startswith("tests/")
                    or ".." in Path(path).parts
                    or not path.endswith(suffix)
                    or "\\" in path
                ):
                    raise ValueError("test selectors must stay in tests/")
                if lane == "cloud" and (len(nodes) != 1 or not nodes[0].startswith("test_")):
                    raise ValueError("Cloud selectors must name exact test functions")
                if lane == "addon" and nodes:
                    raise ValueError("Addon selectors must name PHP files")
    return data


def selectors(data: dict[str, Any], lane: str) -> list[str]:
    return list(dict.fromkeys(test for area in data["areas"].values() for test in area[lane]))


def verify_cloud_evidence(path: Path, expected: list[str]) -> int:
    cases = ET.parse(path).getroot().findall(".//testcase")
    observed = set()
    for case in cases:
        if any(case.find(tag) is not None for tag in ("skipped", "error", "failure")):
            raise ValueError("Cloud evidence contains a skipped or failed case")
        node = (
            case.attrib["classname"].replace(".", "/") + ".py::" + case.attrib["name"].split("[")[0]
        )
        observed.add(node)
    if not cases or observed != set(expected):
        raise ValueError("Cloud evidence must contain every exact selected function and no extras")
    return len(cases)


def run_command(command: list[str], cwd: Path, log: Path) -> None:
    with log.open("w") as stream:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            env=critical.clean_environment(),
            stdout=stream,
            stderr=stream,
            start_new_session=True,
        )
        try:
            code = process.wait(timeout=300)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            raise
        if code:
            raise ValueError(f"command exited {code}; inspect {log.name}")


def git(repo: Path, *args: str) -> str:
    return subprocess.check_output(
        ["git", *args], cwd=repo, text=True, env=critical.clean_environment(), timeout=30
    ).strip()


def snapshot_addon(repo: Path, destination: Path) -> dict[str, Any]:
    """Export one committed tree, excluding all other sessions' working changes."""
    head = git(repo, "rev-parse", "HEAD")
    tree = git(repo, "rev-parse", f"{head}^{{tree}}")
    dirty = bool(git(repo, "status", "--porcelain"))
    archive = subprocess.check_output(
        ["git", "archive", "--format=tar", head],
        cwd=repo,
        env=critical.clean_environment(),
        timeout=30,
    )
    destination.mkdir()
    with tarfile.open(fileobj=io.BytesIO(archive)) as contents:
        members = contents.getmembers()
        if sum(member.size for member in members) > 100_000_000:
            raise ValueError("Addon source archive exceeds the bounded snapshot size")
        for member in members:
            if (
                member.name.startswith("/")
                or ".." in Path(member.name).parts
                or not (member.isfile() or member.isdir())
            ):
                raise ValueError("Addon archive contains an unsafe entry")
        # Extract only validated regular entries; support the Mac system Python
        # without relying on newer tarfile extraction-filter APIs.
        for member in members:
            target = destination / member.name
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                source = contents.extractfile(member)
                if source is None:
                    raise ValueError("Addon archive regular file has no contents")
                with source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)
    return {
        "head": head,
        "tree": tree,
        "working_changes_excluded": True,
        "source_checkout_dirty": dirty,
        "evidence_kind": "committed_source_snapshot",
    }


def php_command(php: str, snapshot: Path, test: str) -> list[str]:
    # No php.ini/extensions from the operator, external streams, native sockets,
    # subprocesses or files outside the exported source. WP HTTP uses test stubs.
    return [
        php,
        "-n",
        "-d",
        "allow_url_fopen=0",
        "-d",
        "allow_url_include=0",
        "-d",
        f"disable_functions={PHP_DISABLED}",
        "-d",
        f"open_basedir={snapshot}",
        "-r",
        f'require $argv[1]; echo "\\n{PHP_COMPLETED}\\n";',
        str(snapshot / test),
    ]


def verify_php_evidence(log: Path) -> int:
    lines = log.read_text().splitlines()
    count = sum(line.startswith("[ok] ") for line in lines)
    if (
        not count
        or not lines
        or lines[-1] != PHP_COMPLETED
        or any(line.startswith("[fail]") for line in lines)
    ):
        raise ValueError("Addon evidence is empty, failed or exited before completion")
    return count


def prerequisites(addon: Path | None, data: dict[str, Any]) -> list[str]:
    missing = critical.prerequisites(["api"])
    if not shutil.which("php"):
        missing.append("PHP CLI is required; no automatic installation")
    if addon is None:
        missing.append("--addon-root must identify the trusted Addon Git checkout")
    else:
        try:
            if Path(git(addon, "rev-parse", "--show-toplevel")).resolve() != addon:
                missing.append("Addon root must be the Git repository root")
            for name in selectors(data, "addon") + ["tests/helpers.php", "npcink-cloud-addon.php"]:
                if not git(addon, "ls-tree", "--name-only", "HEAD", "--", name):
                    missing.append(f"Addon committed source missing: {name}")
        except (OSError, subprocess.SubprocessError):
            missing.append("Addon Git source is unavailable")
    for test in selectors(data, "cloud"):
        if not (ROOT / test.split("::")[0]).is_file():
            missing.append(f"Cloud test missing: {test}")
    return missing


def report(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "mode": "offline_business_regression",
        "complete": False,
        "production_accepted": False,
        "real_provider_calls": "not_run",
        "m4": "not_run",
        "production": "not_run",
        "steps": [],
        "areas": {
            name: {
                "local_status": "not_run",
                "cloud_status": "not_run",
                "addon_status": "not_run",
                "production_status": "not_run",
                "cloud_tests": area["cloud"],
                "addon_tests": area["addon"],
                "production_gap": area["production_gap"],
            }
            for name, area in data["areas"].items()
        },
    }


def markdown_report(receipt: dict[str, Any]) -> str:
    names = {
        "writing": "写作",
        "usage": "用量",
        "quota": "额度",
        "permissions": "权限",
        "isolation": "账户与站点隔离",
    }
    lines = [
        "# WordPress → Cloud 最小业务验收",
        "",
        f"零付费回归完整通过：{receipt['complete']}；生产验收通过：False。",
        "",
        "本报告不代表真实模型、WordPress 浏览器操作、M4 或生产验收通过。",
        "",
        "| 范围 | Cloud 隔离回归 | Addon 桩测试 | 生产实测缺口 |",
        "| --- | --- | --- | --- |",
    ]
    for key, area in receipt["areas"].items():
        lines.append(
            f"| {names[key]} | {area['cloud_status']} | {area['addon_status']} | "
            f"{area['production_gap']} |"
        )
    lines.extend(
        [
            "",
            "源码及逐步日志见同目录 receipt.json；Addon 仅验证固定提交，"
            "其他会话未提交修改不参与本次测试。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--plan", action="store_true")
    mode.add_argument("--doctor", action="store_true")
    parser.add_argument("--addon-root", type=Path)
    args = parser.parse_args()
    data = load_manifest()
    receipt = report(data)
    if args.plan:
        print(json.dumps(receipt, ensure_ascii=False, indent=2))
        return 0
    addon = args.addon_root.resolve() if args.addon_root else None
    missing = prerequisites(addon, data)
    if args.doctor or missing:
        print(json.dumps({"ready": not missing, "missing": missing}, ensure_ascii=False, indent=2))
        return int(bool(missing))
    assert addon is not None
    parent = ROOT / ".tmp/business-acceptance"
    parent.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix="run-", dir=parent))
    receipt["cloud_source"] = {
        "head": git(ROOT, "rev-parse", "HEAD"),
        "source_dirty": bool(git(ROOT, "status", "--porcelain")),
        "working_diff_sha256": critical.working_tree_hash(),
    }
    # Registration tests deliberately verify the packaged plugin basename.
    snapshot = output / "npcink-cloud-addon"
    print(f"[business] receipt: {output / 'receipt.json'}", flush=True)
    current: dict[str, Any] = {}
    try:
        receipt["addon_source"] = snapshot_addon(addon, snapshot)
        lanes = [("cloud", "fake_api_sqlite"), ("addon", "php_stub_behavior")]
        for lane, kind in lanes:
            current = {"lane": lane, "evidence_kind": kind, "status": "running"}
            receipt["steps"].append(current)
            started = time.monotonic()
            print(f"[run] {lane}", flush=True)
            if lane == "cloud":
                tests = selectors(data, lane)
                run_command(
                    [
                        str(ROOT / ".venv/bin/python"),
                        "-m",
                        "pytest",
                        "-p",
                        "scripts.critical_offline",
                        *tests,
                        "-q",
                        "-o",
                        "addopts=",
                        f"--junitxml={output / 'cloud.xml'}",
                    ],
                    ROOT,
                    output / "cloud.log",
                )
                current["test_count"] = verify_cloud_evidence(output / "cloud.xml", tests)
                for area in receipt["areas"].values():
                    area["cloud_status"] = "passed_offline"
            else:
                current["files"] = []
                for index, test in enumerate(selectors(data, lane)):
                    log = output / f"addon-{index}.log"
                    run_command(
                        php_command(str(shutil.which("php")), snapshot, test), snapshot, log
                    )
                    count = verify_php_evidence(log)
                    current["files"].append({"test": test, "assertions": count, "log": log.name})
                    passed = {item["test"] for item in current["files"]}
                    for area in receipt["areas"].values():
                        if set(area["addon_tests"]) <= passed:
                            area["addon_status"] = "passed_offline"
            current.update(status="passed", seconds=round(time.monotonic() - started, 3))
        original = receipt["cloud_source"]
        if (
            git(ROOT, "rev-parse", "HEAD") != original["head"]
            or critical.working_tree_hash() != original["working_diff_sha256"]
        ):
            raise ValueError("Cloud source changed during run")
        receipt["complete"] = True
        for area in receipt["areas"].values():
            area["local_status"] = "passed_offline"
        print("[pass] five offline areas; production acceptance remains pending", flush=True)
        return 0
    except (
        OSError,
        ValueError,
        subprocess.SubprocessError,
        ET.ParseError,
        tarfile.TarError,
        KeyboardInterrupt,
    ) as exc:
        if current.get("status") == "running":
            current["status"] = "failed"
        receipt["failure"] = type(exc).__name__
        print(f"[fail] {exc}; no automatic retry", flush=True)
        return 1
    finally:
        shutil.rmtree(snapshot, ignore_errors=True)
        (output / "receipt.json").write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
        )
        (output / "report.md").write_text(markdown_report(receipt))


if __name__ == "__main__":
    # Support both `python scripts/verify_business.py` and module imports.
    raise SystemExit(main())
