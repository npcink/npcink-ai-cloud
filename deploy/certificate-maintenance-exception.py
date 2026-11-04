#!/usr/bin/env python3
"""One release, one attempt: defer only the 2026-11-04 CA maintenance dry run."""

from __future__ import annotations

import argparse
import base64
import contextlib
import hashlib
import json
import os
import re
import signal
import socket
import ssl
import stat
import subprocess
import time
import urllib.request
from pathlib import Path

APPROVAL = "Defer the renewal dry run for the approved 2026-11-04 release."
BASE = "a1e38cf4303256370e13dd694294231f601e0aa1"
INSTALLED = "b8cc6049da7d1c33cbfffc9f8e5521f332a1adb5"
START = 1793718000  # 2026-11-03 15:00 UTC; includes operator preparation.
EXPIRES = 1793851200  # 2026-11-05 04:00 UTC = 12:00 Asia/Shanghai.
INCIDENT = "6ae128f23dbbeb05d762175d"
STATUS_URL = "https://letsencrypt.status.io/1.0/status/55957a99e800baa4470002da"
CLAIM = Path("/var/lib/npcink-ai-cloud/edge/maintenance-20261104-deployment.json")
ALLOWED = frozenset(
    {
        "deploy/certificate-maintenance-exception.py",
        "deploy/certificate-renewal-readiness.sh",
        "deploy/remote-load-and-up.sh",
        ".github/scripts/production-promotion-preflight.py",
        ".github/workflows/deploy-production.yml",
        "tests/dev/test_certificate_maintenance_exception.py",
        "tests/dev/test_production_promotion_preflight.py",
        "tests/contract/test_certificate_renewal_readiness_contract.py",
        "tests/contract/test_production_maintenance_certificate_readiness_contract.py",
        "docs/cloud-production-release-policy-v1.md",
        "docs/certificate-maintenance-exception-2026-11-04.md",
        "docs/compatibility-matrix.md",
        "scripts/check-release-policy.sh",
    }
)
SCHEMA = "npcink.certificate_maintenance_exception.v1"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def window(now: float | None = None) -> None:
    require(
        START <= (time.time() if now is None else now) < EXPIRES,
        "maintenance authorization is not active or has expired",
    )


def run(command: list[str], *, cwd: Path | None = None, timeout: int = 60) -> str:
    with subprocess.Popen(
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    ) as process:
        try:
            output, _ = process.communicate(timeout=timeout)
        except BaseException:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise
        require(process.returncode == 0, f"required check failed: {Path(command[0]).name}")
    return output.strip()


def scope(root: Path, sha: str) -> str:
    require(re.fullmatch(r"[0-9a-f]{40}", sha) is not None, "full source SHA required")
    require(run(["git", "rev-parse", "HEAD"], cwd=root) == sha, "source must equal HEAD")
    require(not run(["git", "status", "--porcelain"], cwd=root), "source must be clean")
    changed = set(run(["git", "diff", "--name-only", BASE, sha], cwd=root).splitlines())
    require(
        bool(changed) and changed <= ALLOWED, "source exceeds the approved release-tooling envelope"
    )
    return run(["git", "rev-parse", sha + "^{tree}"], cwd=root)


def official_maintenance(payload: dict, now: float | None = None) -> None:
    window(now)
    require(isinstance(payload, dict), "invalid official status response")
    result = payload.get("result")
    require(isinstance(result, dict), "invalid official status result")
    maintenance = result.get("maintenance")
    require(isinstance(maintenance, dict), "invalid official maintenance response")
    active = maintenance.get("active")
    require(isinstance(active, list), "invalid active maintenance list")
    require(
        any(
            isinstance(item, dict)
            and item.get("_id") == INCIDENT
            and item.get("datetime_planned_start") == "2026-11-03T16:00:00.000Z"
            and item.get("datetime_planned_end") == "2026-11-04T21:00:00.000Z"
            for item in active
        ),
        "the approved official maintenance is not active; use normal renewal readiness",
    )


def check_official() -> None:
    with urllib.request.urlopen(STATUS_URL, timeout=15) as response:
        require(response.status == 200, "official maintenance status unavailable")
        body = response.read(262145)
        require(len(body) <= 262144, "official status response too large")
        official_maintenance(json.loads(body))
    # When staging is already usable, do the ordinary full renewal proof.
    try:
        with urllib.request.urlopen(
            "https://acme-staging-v02.api.letsencrypt.org/directory", timeout=8
        ) as response:
            available = response.status == 200
    except (OSError, TimeoutError):
        available = False
    require(not available, "staging has recovered; use normal renewal readiness")


def safe_parent(path: Path) -> None:
    metadata = path.parent.lstat()
    require(
        path.parent.resolve() == path.parent
        and stat.S_ISDIR(metadata.st_mode)
        and metadata.st_uid == 0
        and stat.S_IMODE(metadata.st_mode) == 0o700,
        "exception directory unsafe",
    )


def safe_file(path: Path) -> None:
    safe_parent(path)
    metadata = path.lstat()
    require(
        stat.S_ISREG(metadata.st_mode)
        and metadata.st_uid == 0
        and stat.S_IMODE(metadata.st_mode) == 0o600,
        "protected exception file is unsafe",
    )


def manifest(root: Path) -> dict:
    return json.loads((root / "release-bundle-manifest.json").read_text())


def live(root: Path) -> dict:
    result = json.loads(
        run(
            [
                "bash",
                str(root / "deploy/certificate-renewal-readiness.sh"),
                "inspect-maintenance",
                "--domain",
                "cloud.npc.ink",
                "--certificate-path",
                "/etc/letsencrypt/live/cloud.npc.ink/fullchain.pem",
                "--owner",
                "certbot",
                "--timer",
                "certbot-renew.timer",
                "--deploy-hook-path",
                "/etc/letsencrypt/renewal-hooks/deploy/reload-nginx",
                "--evidence-path",
                "/var/lib/npcink-ai-cloud/edge/certificate-renewal-readiness.json",
            ]
        )
    )
    require(
        result.get("status") == "maintenance_live_checks_passed"
        and result.get("renewal_dry_run_passed") is False,
        "live certificate checks are incomplete",
    )
    for key in (
        "certificate_leaf_sha256",
        "nginx_binding_sha256",
        "deploy_hook_sha256",
        "renewal_exec_start_sha256",
    ):
        require(
            re.fullmatch(r"[0-9a-f]{64}", str(result.get(key))) is not None,
            "live binding digest invalid",
        )
    # Validate the public trust chain as well as the loopback/PEM binding.
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    with socket.create_connection(("cloud.npc.ink", 443), timeout=10) as connection:
        with context.wrap_socket(connection, server_hostname="cloud.npc.ink") as tls:
            require(
                hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest()
                == result["certificate_leaf_sha256"],
                "public and local certificate leaves differ",
            )
    return result


def validate_claim(record: dict, sha: str, tree: str, checks: dict) -> None:
    window()
    require(
        record.get("schema") == SCHEMA
        and record.get("state") == "claimed"
        and record.get("source_sha") == sha
        and record.get("source_tree") == tree
        and record.get("expires_at_epoch") == EXPIRES
        and record.get("renewal_dry_run_passed") is False
        and re.fullmatch(r"[1-9][0-9]*", str(record.get("workflow_run_id"))) is not None,
        "exception is consumed, expired or bound to another release",
    )
    require(record.get("live_checks") == checks, "live TLS/timer/hook bindings changed")


def save_claim(path: Path, record: dict, *, exclusive: bool) -> None:
    # A crash leaves a non-reusable claim; never silently repair/reissue it.
    flags = os.O_WRONLY | os.O_NOFOLLOW | (os.O_CREAT | os.O_EXCL if exclusive else os.O_TRUNC)
    safe_parent(path)
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(record, stream, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def host_check(root: Path, managed: Path, sha: str, tree: str, run_id: str, *, claim: bool) -> dict:
    window()
    require(os.geteuid() == 0, "root is required for live certificate inspection")
    require(
        managed.is_absolute() and managed.resolve() == managed, "managed root must be canonical"
    )
    current = (managed / "current").resolve(strict=True)
    require(
        current.parent == managed and current.name.startswith("release-"), "invalid current release"
    )
    require(
        manifest(current)["source"]["revision"] == INSTALLED
        and (managed / ".installation-complete").is_file(),
        "installed release baseline changed",
    )
    lock = managed / ".deploy-lock"
    lock.mkdir(mode=0o700)  # Never join another mutating operation.
    try:
        checks = live(root)
        window()
        require((managed / "current").resolve() == current, "current release changed")
        record = {
            "schema": SCHEMA,
            "certificate_evidence_state": "maintenance_exception",
            "state": "claimed" if claim else "inspection_only",
            "source_sha": sha,
            "source_tree": tree,
            "workflow_run_id": run_id,
            "expires_at_epoch": EXPIRES,
            "renewal_dry_run_passed": False,
            "live_checks": checks,
            "checked_at_epoch": int(time.time()),
        }
        if claim:
            require(re.fullmatch(r"[1-9][0-9]*", run_id) is not None, "exact workflow run required")
            save_claim(CLAIM, record, exclusive=True)
        else:
            require(
                not CLAIM.exists() and not CLAIM.is_symlink(),
                "one deployment attempt was already claimed",
            )
        return record
    finally:
        lock.rmdir()


def consume(root: Path) -> dict:
    require(os.geteuid() == 0, "root is required")
    window()
    safe_file(CLAIM)
    record = json.loads(CLAIM.read_text())
    source = manifest(root)["source"]
    checks = live(root)
    validate_claim(record, source["revision"], source["tree"], checks)
    record.update(state="consumed_before_image_mutation", consumed_at_epoch=int(time.time()))
    save_claim(CLAIM, record, exclusive=False)
    return record


def selected(root: Path) -> bool:
    if not CLAIM.exists() and not CLAIM.is_symlink():
        return False
    safe_file(CLAIM)
    record = json.loads(CLAIM.read_text())
    return (
        START <= time.time() < EXPIRES
        and record.get("state") == "claimed"
        and record.get("source_sha") == manifest(root)["source"]["revision"]
    )


def remote(root: Path, sha: str, tree: str, run_id: str, *, claim: bool) -> dict:
    host = os.environ["NPCINK_CLOUD_DEPLOY_SSH_HOST"]
    user = os.environ.get("NPCINK_CLOUD_DEPLOY_SSH_USER", "root")
    require(user == "root", "production SSH user must be root")
    managed = os.environ.get("NPCINK_CLOUD_DEPLOY_REMOTE_DIR", "/opt/npcink-ai-cloud")
    require(
        re.fullmatch(r"/[A-Za-z0-9_./-]+", managed) is not None
        and all(part not in {".", ".."} for part in managed.split("/")),
        "unsafe managed root",
    )
    files = {
        name: base64.b64encode((root / name).read_bytes()).decode()
        for name in [
            "deploy/certificate-maintenance-exception.py",
            "deploy/certificate-renewal-readiness.sh",
            "deploy/common.sh",
        ]
    }
    payload = json.dumps(
        {
            "files": files,
            "sha": sha,
            "tree": tree,
            "run_id": run_id,
            "managed": managed,
            "claim": claim,
        }
    )
    bootstrap = """import base64,json,os,pathlib,subprocess,tempfile
os.umask(0o077)
payload=json.loads(PAYLOAD)
with tempfile.TemporaryDirectory(prefix="npcink-certificate-inspection-") as directory:
 root=pathlib.Path(directory)
 (root/"deploy").mkdir(mode=0o700)
 for name,content in payload["files"].items():
  path=root/name
  path.write_bytes(base64.b64decode(content))
  path.chmod(0o700)
 command=["/usr/bin/python3.11",str(root/"deploy/certificate-maintenance-exception.py"),
          "--phase","host-claim" if payload["claim"] else "host-check",
          "--root",str(root),"--managed-root",payload["managed"],"--sha",payload["sha"],
          "--tree",payload["tree"],"--run-id",payload["run_id"]]
 result=subprocess.run(command,env={**os.environ,"NPCINK_CLOUD_RELEASE_TOOL_PYTHON":"/usr/bin/python3.11"})
 raise SystemExit(result.returncode)
""".replace("PAYLOAD", repr(payload))
    command = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ConnectTimeout=10",
        "-p",
        os.environ.get("NPCINK_CLOUD_DEPLOY_SSH_PORT", "22"),
    ]
    identity = os.environ.get("NPCINK_CLOUD_DEPLOY_IDENTITY_FILE")
    if identity:
        command += ["-i", identity, "-o", "IdentitiesOnly=yes"]
    command += [user + "@" + host, "/usr/bin/python3.11 -"]
    result = subprocess.run(command, input=bootstrap, capture_output=True, text=True, timeout=100)
    require(
        result.returncode == 0,
        "protected live maintenance inspection failed; no exception admitted",
    )
    return json.loads(result.stdout)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--phase",
        required=True,
        choices=["promotion", "deploy", "host-check", "host-claim", "consume", "selected"],
    )
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--managed-root", type=Path, default=Path("/opt/npcink-ai-cloud"))
    parser.add_argument("--sha", default="")
    parser.add_argument("--tree", default="")
    parser.add_argument("--run-id", default="")
    args = parser.parse_args()

    def terminate(_signum: int, _frame: object) -> None:
        raise SystemExit("maintenance inspection interrupted")

    signal.signal(signal.SIGTERM, terminate)
    try:
        if args.phase == "selected":
            print("selected" if selected(args.root) else "not_selected")
            return
        window()
        if args.phase == "consume":
            result = consume(args.root)
        elif args.phase.startswith("host-"):
            result = host_check(
                args.root,
                args.managed_root,
                args.sha,
                args.tree,
                args.run_id,
                claim=args.phase == "host-claim",
            )
        else:
            require(
                os.environ.get("NPCINK_CLOUD_CERTIFICATE_MAINTENANCE_APPROVAL") == APPROVAL,
                "exact maintenance approval required; ordinary readiness remains mandatory",
            )
            tree = scope(args.root, args.sha)
            check_official()
            result = remote(args.root, args.sha, tree, args.run_id, claim=args.phase == "deploy")
        print(json.dumps(result, indent=2, sort_keys=True))
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as exc:
        raise SystemExit(f"[certificate-maintenance:fail] {exc}") from None


if __name__ == "__main__":
    main()
