#!/usr/bin/env python3
"""Transfer an exact Actions bundle over HTTPS; credentials travel only via stdin."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

SCHEMA = "npcink.release-artifact-transfer.v1"
MAX_ARCHIVE_BYTES = 2 * 1024**3
MAX_REQUEST_BYTES = 32 * 1024
DOWNLOAD_SECONDS = 600
CHUNK_BYTES = 1024 * 1024
BUNDLE_NAME = "deploy-bundle.tgz"
CHECKSUM_NAME = BUNDLE_NAME + ".sha256"


class TransferError(ValueError):
    """An acceleration failure; the caller may use its verified SCP path."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_url(value: str) -> None:
    url = urlsplit(value)
    if (
        url.scheme != "https"
        or not re.fullmatch(
            r"productionresultssa[0-9]+\.blob\.core\.windows\.net", url.hostname or ""
        )
        or url.port not in (None, 443)
        or url.username is not None
        or url.password is not None
        or url.fragment
        or not url.query
        or not url.path.startswith("/")
        or any(ord(c) <= 32 or ord(c) == 127 for c in value)
    ):
        raise TransferError("unsupported Actions artifact storage origin")


def validate_request(payload: object) -> dict:
    keys = {"schema", "url", "artifact_sha256", "artifact_size", "bundle_sha256", "bundle_size"}
    if not isinstance(payload, dict) or set(payload) != keys or payload["schema"] != SCHEMA:
        raise TransferError("invalid artifact transfer request")
    for key in ("artifact_sha256", "bundle_sha256"):
        if not isinstance(payload[key], str) or not re.fullmatch(r"[0-9a-f]{64}", payload[key]):
            raise TransferError("invalid transfer digest")
    for key in ("artifact_size", "bundle_size"):
        if type(payload[key]) is not int or not 0 < payload[key] <= MAX_ARCHIVE_BYTES:
            raise TransferError("invalid transfer size")
    if not isinstance(payload["url"], str) or len(payload["url"]) > 16 * 1024:
        raise TransferError("invalid transfer URL")
    validate_url(payload["url"])
    return payload


def prepare_request(args: argparse.Namespace) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repository):
        raise TransferError("invalid repository")
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_sha) or args.run_id <= 0:
        raise TransferError("invalid exact release identity")
    # gh captures metadata only. It must never follow the archive redirect with
    # the GitHub token or print the resulting short-lived bearer URL.
    result = subprocess.run(
        ["gh", "api", f"repos/{args.repository}/actions/runs/{args.run_id}/artifacts?per_page=100"],
        check=True,
        capture_output=True,
        timeout=30,
    )
    if len(result.stdout) > 2 * 1024**2:
        raise TransferError("oversized artifact metadata")
    metadata = json.loads(result.stdout)
    matches = [
        item
        for item in metadata["artifacts"]
        if item.get("name") == f"production-deploy-bundle-{args.source_sha}"
    ]
    if len(matches) != 1:
        raise TransferError("exact production artifact is unavailable or ambiguous")
    artifact = matches[0]
    workflow = artifact.get("workflow_run", {})
    if (
        artifact.get("expired") is not False
        or workflow.get("id") != args.run_id
        or workflow.get("head_sha") != args.source_sha
        or workflow.get("head_branch") != "production"
        or not isinstance(artifact.get("id"), int)
        or not re.fullmatch(r"sha256:[0-9a-f]{64}", artifact.get("digest") or "")
    ):
        raise TransferError("artifact does not bind the exact production CI run")
    token = os.environ.get("GH_TOKEN", "")
    if not token:
        raise TransferError("missing Actions read credential")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{args.repository}/actions/artifacts/{artifact['id']}/zip",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=30):
            raise TransferError("Actions archive did not return a storage redirect")
    except urllib.error.HTTPError as error:
        if error.code != 302:
            raise TransferError("Actions archive URL resolution failed") from None
        signed_url = error.headers.get("Location", "")
    bundle = Path(args.bundle)
    return validate_request(
        {
            "schema": SCHEMA,
            "url": signed_url,
            "artifact_sha256": artifact["digest"].removeprefix("sha256:"),
            "artifact_size": artifact.get("size_in_bytes"),
            "bundle_sha256": sha256(bundle),
            "bundle_size": bundle.stat().st_size,
        }
    )


def receive(payload: dict, output_dir: Path) -> None:
    payload = validate_request(payload)
    metadata = output_dir.stat()
    if (
        output_dir.is_symlink()
        or not output_dir.is_dir()
        or metadata.st_uid != os.geteuid()
        or stat.S_IMODE(metadata.st_mode) != 0o700
        or any(
            (output_dir / name).exists() or (output_dir / name).is_symlink()
            for name in (BUNDLE_NAME, CHECKSUM_NAME)
        )
    ):
        raise TransferError("artifact destination must be a private unused incoming directory")
    if (
        shutil.disk_usage(output_dir).free
        < payload["artifact_size"] + payload["bundle_size"] + 16 * 1024**2
    ):
        raise TransferError("insufficient staging space for the artifact and exact bundle")
    # Two bounded sequential files on disk, never an in-memory image archive.
    # The temporary ZIP and all unpublished output disappear on any failure.
    with tempfile.TemporaryDirectory(prefix=".artifact-", dir=output_dir) as temporary:
        stage = Path(temporary)
        archive_path = stage / "artifact.zip"
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        started = time.monotonic()
        digest = hashlib.sha256()
        size = 0
        with opener.open(payload["url"], timeout=30) as response, archive_path.open("xb") as target:
            if response.status != 200:
                raise TransferError("artifact download did not return the complete object")
            while True:
                chunk = response.read(CHUNK_BYTES)
                if not chunk:
                    break
                size += len(chunk)
                if size > payload["artifact_size"] or time.monotonic() - started > DOWNLOAD_SECONDS:
                    raise TransferError("artifact download exceeded its byte or time budget")
                digest.update(chunk)
                target.write(chunk)
        if size != payload["artifact_size"] or digest.hexdigest() != payload["artifact_sha256"]:
            raise TransferError("Actions artifact digest or size mismatch")
        with zipfile.ZipFile(archive_path) as archive:
            members = archive.infolist()
            if len(members) != 2 or {item.filename for item in members} != {
                BUNDLE_NAME,
                CHECKSUM_NAME,
            }:
                raise TransferError("artifact must contain only the exact bundle and checksum")
            for item in members:
                expected_size = payload["bundle_size"] if item.filename == BUNDLE_NAME else 256
                if (
                    item.flag_bits & 1
                    or item.is_dir()
                    or stat.S_IFMT(item.external_attr >> 16) not in (0, stat.S_IFREG)
                    or item.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                    or item.file_size > expected_size
                ):
                    raise TransferError("unsafe or oversized artifact member")
                with archive.open(item) as source, (stage / item.filename).open("xb") as target:
                    extracted = 0
                    while chunk := source.read(CHUNK_BYTES):
                        extracted += len(chunk)
                        if extracted > expected_size:
                            raise TransferError("artifact member exceeded its byte budget")
                        target.write(chunk)
            bundle = stage / BUNDLE_NAME
            expected_checksum = f"{payload['bundle_sha256']}  {BUNDLE_NAME}\n".encode()
            if (
                bundle.stat().st_size != payload["bundle_size"]
                or sha256(bundle) != payload["bundle_sha256"]
                or (stage / CHECKSUM_NAME).read_bytes() != expected_checksum
            ):
                raise TransferError(
                    "downloaded bundle differs from the locally verified exact bundle"
                )
        for name in (BUNDLE_NAME, CHECKSUM_NAME):
            (stage / name).chmod(0o600)
            os.replace(stage / name, output_dir / name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    request = commands.add_parser("request")
    request.add_argument("--repository", required=True)
    request.add_argument("--run-id", required=True, type=int)
    request.add_argument("--source-sha", required=True)
    request.add_argument("--bundle", required=True)
    download = commands.add_parser("receive")
    download.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    try:
        if args.command == "request":
            print(json.dumps(prepare_request(args), separators=(",", ":")))
        else:
            raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
            if len(raw) > MAX_REQUEST_BYTES:
                raise TransferError("oversized artifact transfer request")
            receive(json.loads(raw), Path(args.output_dir))
            print("[ok] Downloaded the exact Actions bundle; release verification still required.")
        return 0
    except Exception as error:
        # urllib/ZIP/JSON exceptions may contain a bearer URL or untrusted member
        # name. Keep both the shell log and remote stderr free of those values.
        reason = str(error) if isinstance(error, TransferError) else type(error).__name__
        print(
            f"[warn] Direct artifact transfer unavailable ({reason}); use verified SSH upload.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
