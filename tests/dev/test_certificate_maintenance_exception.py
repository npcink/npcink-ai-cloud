from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SHA, TREE = "a" * 40, "b" * 40


@pytest.fixture
def module(monkeypatch, tmp_path):
    spec = importlib.util.spec_from_file_location(
        "certificate_maintenance", ROOT / "deploy/certificate-maintenance-exception.py"
    )
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    monkeypatch.setattr(result.time, "time", lambda: result.START + 3600)
    monkeypatch.setattr(result.os, "geteuid", lambda: 0)
    # Metadata remains real; emulate the root owner on this unprivileged workstation.
    original = result.Path.lstat

    def root_stat(path):
        value = original(path)
        fields = list(value)
        fields[4] = 0
        return os.stat_result(fields)

    monkeypatch.setattr(result.Path, "lstat", root_stat)
    protected = tmp_path / "edge"
    protected.mkdir(mode=0o700)
    monkeypatch.setattr(result, "CLAIM", protected / "exception.json")
    result.actual_live = result.live
    monkeypatch.setattr(result, "live", lambda root: {"checked": True})
    return result


def bundle(root, sha=SHA):
    (root / "release-bundle-manifest.json").write_text(
        json.dumps({"source": {"revision": sha, "tree": TREE}})
    )


def claim(module):
    return {
        "schema": module.SCHEMA,
        "state": "claimed",
        "source_sha": SHA,
        "source_tree": TREE,
        "workflow_run_id": "123",
        "expires_at_epoch": module.EXPIRES,
        "renewal_dry_run_passed": False,
        "live_checks": {"checked": True},
    }


def test_deadline_is_exclusive(module):
    module.window(module.START)
    module.window(module.EXPIRES - 1)
    for now in (module.START - 1, module.EXPIRES, module.EXPIRES + 1):
        with pytest.raises(ValueError, match="expired"):
            module.window(now)


def test_official_incident_must_still_be_active_and_exact(module):
    item = {
        "_id": module.INCIDENT,
        "datetime_planned_start": "2026-11-03T16:00:00.000Z",
        "datetime_planned_end": "2026-11-04T21:00:00.000Z",
    }
    payload = {"result": {"maintenance": {"active": [item]}}}
    module.official_maintenance(payload)
    for key in item:
        changed = {**item, key: "different"}
        with pytest.raises(ValueError, match="not active"):
            module.official_maintenance({"result": {"maintenance": {"active": [changed]}}})
    with pytest.raises(ValueError):
        module.official_maintenance({})


def test_recovered_staging_requires_normal_proof(module, monkeypatch):
    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def read(self, limit):
            return b"{}"

    monkeypatch.setattr(module, "official_maintenance", lambda payload: None)
    monkeypatch.setattr(module.urllib.request, "urlopen", lambda *a, **k: Response())
    with pytest.raises(ValueError, match="recovered"):
        module.check_official()


def test_scope_binds_clean_exact_candidate_and_frozen_application(module, monkeypatch):
    outputs = iter([SHA, "", "deploy/certificate-maintenance-exception.py", TREE])
    monkeypatch.setattr(module, "run", lambda *a, **k: next(outputs))
    assert module.scope(ROOT, SHA) == TREE
    for files in ("app/main.py", ".env.deploy", "deploy/common.sh"):
        outputs = iter([SHA, "", files])
        with pytest.raises(ValueError, match="envelope"):
            module.scope(ROOT, SHA)
    outputs = iter(["c" * 40])
    with pytest.raises(ValueError, match="HEAD"):
        module.scope(ROOT, SHA)
    outputs = iter([SHA, " M app/main.py"])
    with pytest.raises(ValueError, match="clean"):
        module.scope(ROOT, SHA)


def test_no_claim_selects_normal_lane(module, tmp_path):
    assert module.selected(tmp_path) is False


@pytest.mark.parametrize(
    "field,value",
    [
        ("source_sha", "c" * 40),
        ("source_tree", "d" * 40),
        ("schema", "other"),
        ("state", "consumed_before_image_mutation"),
        ("expires_at_epoch", 1),
        ("renewal_dry_run_passed", True),
        ("workflow_run_id", ""),
        ("live_checks", {"changed": True}),
    ],
)
def test_claim_tampering_and_binding_drift_fail(module, field, value):
    with pytest.raises(ValueError):
        module.validate_claim({**claim(module), field: value}, SHA, TREE, {"checked": True})


def test_claim_is_exclusive_and_consumed_before_return(module, tmp_path):
    bundle(tmp_path)
    module.save_claim(module.CLAIM, claim(module), exclusive=True)
    with pytest.raises(FileExistsError):
        module.save_claim(module.CLAIM, claim(module), exclusive=True)
    assert module.selected(tmp_path)
    result = module.consume(tmp_path)
    assert result["state"] == "consumed_before_image_mutation"
    assert result["renewal_dry_run_passed"] is False
    assert not module.selected(tmp_path)
    with pytest.raises(ValueError, match="consumed"):
        module.consume(tmp_path)


@pytest.mark.parametrize("failure", ["expired", "changed_tls", "wrong_bundle"])
def test_consume_failure_never_marks_claim_consumed(module, tmp_path, monkeypatch, failure):
    bundle(tmp_path, "c" * 40 if failure == "wrong_bundle" else SHA)
    module.save_claim(module.CLAIM, claim(module), exclusive=True)
    if failure == "expired":
        monkeypatch.setattr(module.time, "time", lambda: module.EXPIRES)
        assert not module.selected(tmp_path)
    elif failure == "changed_tls":
        monkeypatch.setattr(module, "live", lambda root: {"changed": True})
    with pytest.raises(ValueError):
        module.consume(tmp_path)
    assert json.loads(module.CLAIM.read_text())["state"] == "claimed"


@pytest.mark.parametrize("unsafe", ["symlink", "mode", "parent"])
def test_unsafe_claim_is_rejected(module, unsafe):
    module.save_claim(module.CLAIM, claim(module), exclusive=True)
    if unsafe == "symlink":
        target = module.CLAIM.with_suffix(".target")
        module.CLAIM.rename(target)
        module.CLAIM.symlink_to(target)
    elif unsafe == "mode":
        module.CLAIM.chmod(0o644)
    else:
        module.CLAIM.parent.chmod(0o777)
    with pytest.raises(ValueError, match="unsafe"):
        module.safe_file(module.CLAIM)


def test_host_live_failure_cleans_lock_and_does_not_claim(module, tmp_path, monkeypatch):
    managed = tmp_path / "managed"
    managed.mkdir()
    current = managed / "release-installed"
    current.mkdir()
    bundle(current, module.INSTALLED)
    (managed / ".installation-complete").touch()
    (managed / "current").symlink_to(current)

    def failure(root):
        raise ValueError("TLS failure")

    monkeypatch.setattr(module, "live", failure)
    with pytest.raises(ValueError, match="TLS failure"):
        module.host_check(tmp_path, managed, SHA, TREE, "123", claim=True)
    assert not (managed / ".deploy-lock").exists()
    assert not module.CLAIM.exists()


def test_expired_or_unapproved_cli_never_connects_to_host():
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "deploy/certificate-maintenance-exception.py"),
            "--phase",
            "promotion",
            "--sha",
            SHA,
        ],
        env={**os.environ, "NPCINK_CLOUD_CERTIFICATE_MAINTENANCE_APPROVAL": "yes"},
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "approval required" in result.stderr or "expired" in result.stderr


def test_subprocess_timeout_is_bounded(module):
    with pytest.raises(subprocess.TimeoutExpired):
        module.run([sys.executable, "-c", "import time; time.sleep(10)"], timeout=0.1)


def test_host_claim_is_bound_to_one_attempt_and_rejects_changed_baseline(module, tmp_path):
    managed = tmp_path / "managed"
    managed.mkdir()
    current = managed / "release-installed"
    current.mkdir()
    bundle(current, module.INSTALLED)
    (managed / ".installation-complete").touch()
    (managed / "current").symlink_to(current)
    inspection = module.host_check(tmp_path, managed, SHA, TREE, "", claim=False)
    assert inspection["state"] == "inspection_only"
    assert not module.CLAIM.exists()
    record = module.host_check(tmp_path, managed, SHA, TREE, "123", claim=True)
    assert record["source_sha"] == SHA and record["source_tree"] == TREE
    assert record["workflow_run_id"] == "123"
    assert record["renewal_dry_run_passed"] is False
    with pytest.raises(FileExistsError):
        module.host_check(tmp_path, managed, SHA, TREE, "124", claim=True)
    assert not (managed / ".deploy-lock").exists()
    bundle(current, "d" * 40)
    with pytest.raises(ValueError, match="baseline changed"):
        module.host_check(tmp_path, managed, SHA, TREE, "123", claim=False)


def test_public_tls_enforces_protocol_floor_hostname_and_leaf(module, monkeypatch):
    from contextlib import nullcontext

    leaf = b"trusted-public-leaf"
    checks = {
        key: "a" * 64
        for key in ("nginx_binding_sha256", "deploy_hook_sha256", "renewal_exec_start_sha256")
    }
    checks.update(
        status="maintenance_live_checks_passed",
        renewal_dry_run_passed=False,
        certificate_leaf_sha256=module.hashlib.sha256(leaf).hexdigest(),
    )
    monkeypatch.setattr(module, "run", lambda *a, **k: json.dumps(checks))
    context = module.ssl.create_default_context()
    # Simulate a host whose default floor has been weakened; explicit policy must win.
    context.minimum_version = module.ssl.TLSVersion.MINIMUM_SUPPORTED

    class TrustedSocket:
        def getpeercert(self, binary_form=False):
            assert binary_form
            return leaf

    class Context:
        minimum_version = context.minimum_version

        def wrap_socket(self, connection, server_hostname):
            assert self.minimum_version >= module.ssl.TLSVersion.TLSv1_2
            assert server_hostname == "cloud.npc.ink"
            assert context.verify_mode == module.ssl.CERT_REQUIRED and context.check_hostname
            return nullcontext(TrustedSocket())

    monkeypatch.setattr(module.ssl, "create_default_context", Context)
    monkeypatch.setattr(module.socket, "create_connection", lambda *a, **k: nullcontext(object()))
    assert module.actual_live(ROOT) == checks
    checks["certificate_leaf_sha256"] = "b" * 64
    with pytest.raises(ValueError, match="leaves differ"):
        module.actual_live(ROOT)
