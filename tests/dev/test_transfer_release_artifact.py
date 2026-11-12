from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import urllib.error
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "transfer_release_artifact", ROOT / "scripts/transfer-release-artifact.py"
)
assert SPEC is not None and SPEC.loader is not None
transfer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(transfer)
SIGNED_URL = "https://productionresultssa6.blob.core.windows.net/artifact/exact.zip?sig=secret"
BUNDLE = b"fixture exact scanned bundle"
CHECKSUM = hashlib.sha256(BUNDLE).hexdigest() + "  deploy-bundle.tgz\n"


def artifact_fixture(members=None):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in members or [
            (transfer.BUNDLE_NAME, BUNDLE),
            (transfer.CHECKSUM_NAME, CHECKSUM.encode()),
        ]:
            archive.writestr(name, content)
    data = stream.getvalue()
    return data, {
        "schema": transfer.SCHEMA,
        "url": SIGNED_URL,
        "artifact_sha256": hashlib.sha256(data).hexdigest(),
        "artifact_size": len(data),
        "bundle_sha256": hashlib.sha256(BUNDLE).hexdigest(),
        "bundle_size": len(BUNDLE),
    }


class Response(io.BytesIO):
    status = 200


def install_download(monkeypatch, data):
    class Opener:
        def open(self, url, timeout):
            assert url == SIGNED_URL
            assert timeout == 30
            return Response(data)

    monkeypatch.setattr(transfer.urllib.request, "build_opener", lambda *args: Opener())


def test_receive_publishes_only_identical_bundle_and_cleans_zip(tmp_path, monkeypatch):
    tmp_path.chmod(0o700)
    data, payload = artifact_fixture()
    install_download(monkeypatch, data)
    transfer.receive(payload, tmp_path)
    assert {p.name for p in tmp_path.iterdir()} == {transfer.BUNDLE_NAME, transfer.CHECKSUM_NAME}
    assert (tmp_path / transfer.BUNDLE_NAME).read_bytes() == BUNDLE
    assert (tmp_path / transfer.CHECKSUM_NAME).read_text() == CHECKSUM
    assert (tmp_path / transfer.BUNDLE_NAME).stat().st_mode & 0o777 == 0o600


@pytest.mark.parametrize(
    "failure",
    [
        "digest",
        "truncated",
        "oversized",
        "wrong-bundle",
        "wrong-checksum",
        "extra-member",
        "duplicate-member",
        "symlink-member",
        "deadline",
    ],
)
def test_bad_download_leaves_no_published_or_partial_files(tmp_path, monkeypatch, failure):
    tmp_path.chmod(0o700)
    data, payload = artifact_fixture()
    if failure == "digest":
        payload["artifact_sha256"] = "0" * 64
    elif failure == "truncated":
        data = data[:-1]
    elif failure == "oversized":
        data += b"extra"
    elif failure == "wrong-bundle":
        payload["bundle_sha256"] = "0" * 64
    elif failure == "wrong-checksum":
        data, payload = artifact_fixture(
            [(transfer.BUNDLE_NAME, BUNDLE), (transfer.CHECKSUM_NAME, b"wrong")]
        )
    elif failure == "extra-member":
        data, payload = artifact_fixture(
            [
                (transfer.BUNDLE_NAME, BUNDLE),
                (transfer.CHECKSUM_NAME, CHECKSUM.encode()),
                ("../escape", b"must not extract"),
            ]
        )
    elif failure == "duplicate-member":
        with pytest.warns(UserWarning, match="Duplicate name"):
            data, payload = artifact_fixture(
                [(transfer.BUNDLE_NAME, BUNDLE), (transfer.BUNDLE_NAME, BUNDLE)]
            )
    elif failure == "symlink-member":
        member = zipfile.ZipInfo(transfer.BUNDLE_NAME)
        member.external_attr = 0o120777 << 16
        data, payload = artifact_fixture(
            [(member, BUNDLE), (transfer.CHECKSUM_NAME, CHECKSUM.encode())]
        )
    elif failure == "deadline":
        ticks = iter([0, transfer.DOWNLOAD_SECONDS + 1])
        monkeypatch.setattr(transfer.time, "monotonic", lambda: next(ticks))
    install_download(monkeypatch, data)
    with pytest.raises(transfer.TransferError):
        transfer.receive(payload, tmp_path)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize(
    "url",
    [
        "http://productionresultssa6.blob.core.windows.net/a?sig=x",
        "https://127.0.0.1/a?sig=x",
        "https://example.com/a?sig=x",
        "https://productionresultssa6.blob.core.windows.net.attacker.test/a?sig=x",
        "https://user@productionresultssa6.blob.core.windows.net/a?sig=x",
        "https://productionresultssa6.blob.core.windows.net:444/a?sig=x",
        SIGNED_URL + "#fragment",
        SIGNED_URL + "\nHeader:x",
    ],
)
def test_rejects_non_actions_origins_before_any_request(tmp_path, monkeypatch, url):
    _, payload = artifact_fixture()
    payload["url"] = url
    monkeypatch.setattr(transfer.urllib.request, "build_opener", lambda *_: pytest.fail("network"))
    with pytest.raises(transfer.TransferError):
        transfer.receive(payload, tmp_path)


def test_existing_or_symlink_output_is_not_overwritten(tmp_path, monkeypatch):
    tmp_path.chmod(0o700)
    _, payload = artifact_fixture()
    outside = tmp_path.parent / "retained"
    outside.write_text("retained")
    (tmp_path / transfer.BUNDLE_NAME).symlink_to(outside)
    with pytest.raises(transfer.TransferError):
        transfer.receive(payload, tmp_path)
    assert outside.read_text() == "retained"


def test_insufficient_space_falls_back_before_downloading(tmp_path, monkeypatch):
    tmp_path.chmod(0o700)
    _, payload = artifact_fixture()
    monkeypatch.setattr(transfer.shutil, "disk_usage", lambda _: argparse.Namespace(free=0))
    monkeypatch.setattr(transfer.urllib.request, "build_opener", lambda *_: pytest.fail("network"))
    with pytest.raises(transfer.TransferError, match="insufficient staging space"):
        transfer.receive(payload, tmp_path)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("bad_identity", [None, "sha", "run", "expired", "duplicate"])
def test_request_binds_ci_artifact_and_never_sends_token_to_blob(
    tmp_path, monkeypatch, bad_identity
):
    bundle = tmp_path / transfer.BUNDLE_NAME
    bundle.write_bytes(BUNDLE)
    artifact = {
        "name": "production-deploy-bundle-" + "a" * 40,
        "id": 15,
        "workflow_run": {"id": 25, "head_sha": "a" * 40, "head_branch": "production"},
        "expired": False,
        "digest": "sha256:" + "b" * 64,
        "size_in_bytes": 1000,
    }
    if bad_identity == "sha":
        artifact["workflow_run"]["head_sha"] = "c" * 40
    elif bad_identity == "run":
        artifact["workflow_run"]["id"] = 99
    elif bad_identity == "expired":
        artifact["expired"] = True
    artifacts = [artifact, artifact] if bad_identity == "duplicate" else [artifact]
    monkeypatch.setattr(
        transfer.subprocess,
        "run",
        lambda *a, **kw: argparse.Namespace(stdout=json.dumps({"artifacts": artifacts}).encode()),
    )
    monkeypatch.setenv("GH_TOKEN", "private-test-token")

    class Opener:
        def open(self, request, timeout):
            assert (
                request.full_url
                == "https://api.github.com/repos/npcink/npcink-ai-cloud/actions/artifacts/15/zip"
            )
            assert request.get_header("Authorization") == "Bearer private-test-token"
            raise urllib.error.HTTPError(
                request.full_url, 302, "redirect", {"Location": SIGNED_URL}, None
            )

    monkeypatch.setattr(transfer.urllib.request, "build_opener", lambda *args: Opener())
    args = argparse.Namespace(
        repository="npcink/npcink-ai-cloud", run_id=25, source_sha="a" * 40, bundle=str(bundle)
    )
    if bad_identity:
        with pytest.raises(transfer.TransferError):
            transfer.prepare_request(args)
    else:
        request = transfer.prepare_request(args)
        assert request["bundle_sha256"] == hashlib.sha256(BUNDLE).hexdigest()
        assert "private-test-token" not in json.dumps(request)
        assert transfer.NoRedirect().redirect_request(None, None, None, None, None, None) is None


def test_cli_error_does_not_log_signed_url_or_untrusted_input(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/transfer-release-artifact.py"),
            "receive",
            "--output-dir",
            str(tmp_path),
        ],
        input=json.dumps({"url": SIGNED_URL}),
        text=True,
        capture_output=True,
    )
    assert result.returncode == 1
    assert SIGNED_URL not in result.stderr + result.stdout
    assert "secret" not in result.stderr + result.stdout


@pytest.mark.parametrize(
    "selective,stage,request_ok,receive_ok,expected_download,expected_upload",
    [
        (0, 0, True, True, True, False),
        (0, 0, True, False, True, True),
        (0, 0, False, False, False, True),
        (1, 0, True, True, False, True),
        (0, 1, True, True, False, True),
    ],
)
def test_real_deployer_transport_selection_and_scp_fallback(
    tmp_path, selective, stage, request_ok, receive_ok, expected_download, expected_upload
):
    source = (ROOT / "deploy/deploy-to-ssh-host.sh").read_text()
    block = source[
        source.index("DIRECT_ARTIFACT_TRANSFER=0") : source.index(
            'if [ "${SELECTIVE_TRANSFER}" = "1" ]; then', source.index("DIRECT_ARTIFACT_TRANSFER=0")
        )
    ]
    fixture = """
set -euo pipefail
ROOT_DIR=source
SCP_ARGS=(-o StrictHostKeyChecking=yes)
SSH_ARGS=(-o StrictHostKeyChecking=yes)
SSH_TARGET=host
DEPLOY_HOST_PYTHON=python
REMOTE_PREFLIGHT_DIR=/incoming/preflight
REMOTE_INCOMING_DIR=/incoming
REMOTE_BUNDLE_PATH=/incoming/deploy-bundle.tgz
REMOTE_BUNDLE_CHECKSUM_PATH=/incoming/deploy-bundle.tgz.sha256
UPLOAD_BUNDLE_PATH=/local/deploy-bundle.tgz
UPLOAD_BUNDLE_CHECKSUM_PATH=/local/deploy-bundle.tgz.sha256
BUNDLE_PATH=/local/deploy-bundle.tgz
LOCAL_RELEASE_TOOL_PYTHON=request_helper
request_helper() { printf '{"url":"private-signed-url"}'; test "$REQUEST_OK" = 1; }
remote_shell_arg() { printf "'%s'" "$1"; }
npcink_ai_cloud_run_timed() { printf '%s\\n' "$1" >>"$CALL_LOG"; shift; "$@"; }
scp() { printf 'scp:%s\\n' "$*" >>"$CALL_LOG"; }
ssh() { cat >"$STDIN_CAPTURE"; test "$RECEIVE_OK" = 1; }
"""
    log = tmp_path / "calls"
    request_path = tmp_path / "request.json"
    stdin_capture = tmp_path / "stdin"
    result = subprocess.run(
        ["bash", "-s"],
        input=fixture + block,
        text=True,
        capture_output=True,
        env={
            **os.environ,
            "SELECTIVE_TRANSFER": str(selective),
            "STAGE_ONLY": str(stage),
            "REQUEST_OK": str(int(request_ok)),
            "RECEIVE_OK": str(int(receive_ok)),
            "CALL_LOG": str(log),
            "STDIN_CAPTURE": str(stdin_capture),
            "NPCINK_CLOUD_DEPLOY_ARTIFACT_RUN_ID": "123",
            "LOCAL_ARTIFACT_REQUEST_PATH": str(request_path),
        },
    )
    assert result.returncode == 0, result.stderr
    calls = log.read_text()
    assert ("download deploy bundle from Actions artifact" in calls) == expected_download
    assert ("upload deploy bundle\n" in calls) == expected_upload
    assert "private-signed-url" not in calls + result.stdout + result.stderr
    if expected_download:
        assert "private-signed-url" in stdin_capture.read_text()
        assert request_path.stat().st_mode & 0o777 == 0o600
