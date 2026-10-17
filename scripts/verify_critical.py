#!/usr/bin/env python3
"""Run a fixed zero-paid regression scope without Docker or shared runtimes."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "config/critical-regression-v1.json"
STAGES = ("type-check", "contracts", "api", "browser")


def working_tree_hash() -> str:
    digest = hashlib.sha256(subprocess.check_output(
        ["git", "diff", "HEAD", "--binary", "--", ".", ":(exclude)frontend/next-env.d.ts"],
        cwd=ROOT,
    ))
    untracked = subprocess.check_output(
        ["git", "ls-files", "--others", "--exclude-standard", "-z"], cwd=ROOT,
    ).decode().split("\0")
    for name in sorted(filter(None, untracked)):
        digest.update(name.encode())
        digest.update(b"\0")
        digest.update((ROOT / name).read_bytes())
    return digest.hexdigest()


def clean_environment() -> dict[str, str]:
    allowed = ("PATH", "HOME", "USER", "TMPDIR", "LANG", "SYSTEMROOT", "PATHEXT")
    env = {key: os.environ[key] for key in allowed if key in os.environ}
    env.update({
        "NEXT_TELEMETRY_DISABLED": "1",
        "NEXT_PUBLIC_ENV": "test",
        "NPCINK_CLOUD_ENVIRONMENT": "test",
        "NPCINK_CLOUD_DATABASE_URL": "sqlite+pysqlite:///:memory:",
        "NPCINK_CLOUD_SETUP_STATE_OVERRIDE": "complete",
        "CLOUD_API_BASE_URL": "http://127.0.0.1:9",
        "CLOUD_PUBLIC_BASE_URL": "http://127.0.0.1:3307",
        "NPCINK_CLOUD_FRONTEND_PORT": "3307",
        "NPCINK_CLOUD_CRITICAL_OFFLINE": "1",
        "PLAYWRIGHT_BROWSERS_PATH": str(
            Path.home() / ".local/share/magick-ai-playwright"
        ),
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
    })
    return env


def load_manifest() -> dict[str, Any]:
    data = json.loads(MANIFEST.read_text())
    if data.get("schema_version") != 1:
        raise ValueError("critical manifest schema must be 1")
    for key in ("contracts", "api_tests", "browser_files", "browser_titles"):
        values = data.get(key)
        if (not isinstance(values, list) or not values
                or not all(isinstance(v, str) and v for v in values)
                or len(values) != len(set(values))):
            raise ValueError(f"critical manifest has invalid {key}")
    for value in data["contracts"]:
        if not value.startswith("tests/unit/") or ".." in value.split("/"):
            raise ValueError("contract must stay inside frontend/tests/unit")
    for value in data["api_tests"]:
        path = value.split("::")[0]
        if not path.startswith("tests/") or ".." in path.split("/"):
            raise ValueError("API test must stay inside tests")
    if any(Path(value).name != value for value in data["browser_files"]):
        raise ValueError("browser files must be basenames")
    return data


def commands(data: dict[str, Any], output: Path) -> dict[str, list[list[str]]]:
    return {
        "type-check": [["pnpm", "--dir", "frontend", "exec", "tsc", "--noEmit",
                        "--project", "tsconfig.critical.json"]],
        "contracts": [["node", str(ROOT / "frontend" / path)]
                      for path in data["contracts"]],
        "api": [[str(ROOT / ".venv/bin/python"), "-m", "pytest",
                 "-p", "scripts.critical_offline", *data["api_tests"], "-q",
                 f"--junitxml={output / 'api.xml'}"]],
        "browser": [["node", "scripts/run-cloud-frontend-playwright.js", "test",
                     "-c", "playwright.critical.config.ts", "--reporter=line,json"]],
    }


def prerequisites(selected: list[str]) -> list[str]:
    missing = []
    if "api" in selected and not (ROOT / ".venv/bin/python").is_file():
        missing.append("repository .venv/bin/python is required (no auto-install)")
    if any(stage != "api" for stage in selected):
        for name in ("typescript", "@playwright/test"):
            if not (ROOT / "frontend/node_modules" / name).is_dir():
                missing.append(f"frontend dependency missing: {name}")
    if "browser" in selected:
        for path in (ROOT / "frontend").glob(".env*"):
            if path.name != ".env.example":
                missing.append(f"browser build refuses local dotenv file: {path.name}")
        try:
            result = subprocess.run(
                ["node", "-e", "process.stdout.write(require('@playwright/test')"
                 ".chromium.executablePath())"],
                cwd=ROOT / "frontend", env=clean_environment(),
                capture_output=True, text=True, timeout=15, check=True,
            )
            if not Path(result.stdout).is_file():
                missing.append("shared Playwright Chromium is missing (no auto-download)")
        except (OSError, subprocess.SubprocessError):
            missing.append("cannot resolve installed Playwright Chromium")
    return missing


def verify_evidence(stage: str, output: Path, data: dict[str, Any]) -> None:
    if stage == "api":
        suites = ET.parse(output / "api.xml").getroot()
        cases = suites.findall(".//testcase")
        if not cases or any(c.find(tag) is not None for c in cases
                            for tag in ("skipped", "failure", "error")):
            raise ValueError("API evidence is empty, skipped or failed")
    if stage == "browser":
        report = json.loads((output / "browser.json").read_text())
        stats = report["stats"]
        titles: list[str] = []

        def visit(suite: dict[str, Any]) -> None:
            for spec in suite.get("specs", []):
                titles.append(spec["title"])
            for child in suite.get("suites", []):
                visit(child)

        for suite in report.get("suites", []):
            visit(suite)
        if (sorted(titles) != sorted(data["browser_titles"])
                or stats["expected"] != len(titles)
                or any(stats[key] for key in ("unexpected", "flaky", "skipped"))):
            raise ValueError("browser selection/evidence incomplete or skipped")


def run_stage(stage: str, calls: list[list[str]], output: Path,
              data: dict[str, Any], env: dict[str, str]) -> None:
    for command in calls:
        cwd = ROOT / "frontend" if stage == "contracts" else ROOT
        with (output / f"{stage}.log").open("a") as log:
            process = subprocess.Popen(command, cwd=cwd, env=env,
                                       stdout=log, stderr=log, start_new_session=True)
            try:
                status = process.wait(timeout=900 if stage == "browser" else 300)
            except (subprocess.TimeoutExpired, KeyboardInterrupt):
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                raise
            if status:
                raise ValueError(f"command exited {status}; see {stage}.log")
    verify_evidence(stage, output, data)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--doctor", action="store_true")
    parser.add_argument("--only", action="append", choices=STAGES)
    args = parser.parse_args()
    selected = [stage for stage in STAGES if not args.only or stage in args.only]
    data = load_manifest()
    if args.plan:
        print(json.dumps({"stages": commands(data, Path("<receipt>")),
                          "selected": selected, "scope": data,
                          "docker": False, "m4": "not_run", "production": "not_run"},
                         indent=2))
        return 0
    missing = prerequisites(selected)
    if args.doctor or missing:
        print(json.dumps({"ready": not missing, "missing": missing}, indent=2))
        return int(bool(missing))
    parent = ROOT / ".tmp/critical-regression"
    parent.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix="run-", dir=parent))
    source = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True)
    dirty = subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True)
    receipt: dict[str, Any] = {
        "schema_version": 1, "head": source.strip(), "source_dirty": bool(dirty),
        "working_diff_sha256": working_tree_hash(),
        "scope": "local zero-paid fake regression; not M4 or production acceptance",
        "complete": False, "selected": selected, "steps": [],
        "m4": "not_run", "production": "not_run",
    }
    env = clean_environment()
    env["PLAYWRIGHT_JSON_OUTPUT_FILE"] = str(output / "browser.json")
    calls = commands(data, output)
    print(f"[critical] receipt directory: {output}", flush=True)
    try:
        for stage in selected:
            started = time.monotonic()
            step: dict[str, Any] = {"stage": stage, "status": "running"}
            receipt["steps"].append(step)
            print(f"[run] {stage}", flush=True)
            try:
                run_stage(stage, calls[stage], output, data, env)
                step["status"] = "passed"
            except (OSError, ValueError, subprocess.SubprocessError, KeyboardInterrupt) as exc:
                step["status"] = "failed"
                step["reason"] = type(exc).__name__
                print(f"[fail] {stage}; inspect {output / (stage + '.log')}", flush=True)
                return 1
            finally:
                step["seconds"] = round(time.monotonic() - started, 3)
        if working_tree_hash() != receipt["working_diff_sha256"]:
            receipt["failure"] = "source_changed_during_run"
            print("[fail] source changed during the selected stages; evidence is incomplete")
            return 1
        receipt["complete"] = True
        print("[ok] selected local critical stages passed; M4/production not run")
        return 0
    finally:
        (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
