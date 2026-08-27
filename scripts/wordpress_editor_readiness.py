#!/usr/bin/env python3
"""Read-only readiness checks for the local WordPress editor acceptance path."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def run(command: list[str], timeout: float = 10.0) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "command": command}
    except OSError as exc:
        return {"status": "unavailable", "command": command, "detail": str(exc)}
    return {
        "status": "ok" if completed.returncode == 0 else "failed",
        "command": command,
        "returncode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def cloud_check(url: str, timeout: float) -> dict[str, Any]:
    endpoint = url.rstrip("/") + "/health/live"
    try:
        with urllib.request.urlopen(endpoint, timeout=timeout) as response:
            body = response.read(4096).decode("utf-8", errors="replace")
            return {
                "status": "ok" if 200 <= response.status < 300 else "failed",
                "endpoint": endpoint,
                "http_status": response.status,
                "body": body,
            }
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {"status": "unavailable", "endpoint": endpoint, "detail": str(exc)}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check the local WordPress editor acceptance prerequisites without writes."
    )
    parser.add_argument(
        "--wp-root",
        default=os.environ.get("NPCINK_WP_ROOT"),
        help="WordPress document root (also NPCINK_WP_ROOT).",
    )
    parser.add_argument(
        "--cloud-url",
        default=os.environ.get("NPCINK_CLOUD_EDITOR_URL", "http://127.0.0.1:18010"),
        help="Cloud base URL (also NPCINK_CLOUD_EDITOR_URL).",
    )
    parser.add_argument(
        "--addon-plugin",
        default=os.environ.get("NPCINK_WP_ADDON_PLUGIN", "npcink-cloud-addon"),
    )
    parser.add_argument(
        "--toolbox-plugin",
        default=os.environ.get("NPCINK_WP_TOOLBOX_PLUGIN", "npcink-workflow-toolbox"),
    )
    parser.add_argument(
        "--mysql-socket",
        default=os.environ.get("NPCINK_WP_MYSQL_SOCKET"),
        help="Local MySQL socket (also NPCINK_WP_MYSQL_SOCKET).",
    )
    parser.add_argument(
        "--php-bin",
        default=os.environ.get("NPCINK_WP_PHP_BIN", "php"),
        help="PHP binary used to launch WP-CLI (also NPCINK_WP_PHP_BIN).",
    )
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    checks: dict[str, Any] = {}
    failures: list[str] = []

    if not args.wp_root:
        checks["wordpress_root"] = {
            "status": "blocked",
            "detail": "--wp-root or NPCINK_WP_ROOT is required",
        }
        failures.append("wordpress_root")
    else:
        root = Path(args.wp_root).expanduser()
        checks["wordpress_root"] = {
            "status": "ok" if root.is_dir() else "missing",
            "path": str(root),
        }
        if not root.is_dir():
            failures.append("wordpress_root")

    wp = shutil.which("wp")
    checks["wp_cli"] = {"status": "ok", "path": wp} if wp else {
        "status": "missing",
        "detail": "wp was not found on PATH",
    }
    if not wp:
        failures.append("wp_cli")

    if wp and args.wp_root and Path(args.wp_root).is_dir():
        # WP-CLI treats the path value as empty on some installations when the
        # option and its value are passed as separate argv entries.
        php = shutil.which(args.php_bin) if not Path(args.php_bin).is_file() else args.php_bin
        base = [wp, f"--path={Path(args.wp_root).expanduser()}"]
        if args.mysql_socket:
            if not php:
                checks["php_bin"] = {"status": "missing", "detail": args.php_bin}
                failures.append("php_bin")
            else:
                base = [
                    php,
                    "-d",
                    f"mysqli.default_socket={Path(args.mysql_socket).expanduser()}",
                    wp,
                    f"--path={Path(args.wp_root).expanduser()}",
                ]
        checks["wp_version"] = run([*base, "cli", "version"], args.timeout)
        checks["database"] = run(
            [
                *base,
                "eval",
                "global $wpdb; echo $wpdb->get_var('SELECT 1');",
            ],
            args.timeout,
        )
        checks["site_url"] = run([*base, "option", "get", "siteurl"], args.timeout)
        checks["addon_plugin"] = run(
            [*base, "plugin", "is-active", args.addon_plugin], args.timeout
        )
        checks["toolbox_plugin"] = run(
            [*base, "plugin", "is-active", args.toolbox_plugin], args.timeout
        )
        for name in ("database", "site_url", "addon_plugin", "toolbox_plugin"):
            if checks[name]["status"] != "ok":
                failures.append(name)

    checks["cloud"] = cloud_check(args.cloud_url, args.timeout)
    if checks["cloud"]["status"] != "ok":
        failures.append("cloud")

    result = {
        "schema_version": 1,
        "status": "ready" if not failures else "blocked",
        "failures": failures,
        "checks": checks,
        "next_safe_action": (
            "run_editor_acceptance" if not failures else "fix_readiness_before_editor_acceptance"
        ),
        "write_operations": False,
    }
    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print(f"status={result['status']}")
        for name, check in checks.items():
            print(f"{name}={check.get('status', 'unknown')}")
        if failures:
            print("failures=" + ",".join(failures))
        print("next_safe_action=" + result["next_safe_action"])
        print("write_operations=false")
    return 0 if result["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
