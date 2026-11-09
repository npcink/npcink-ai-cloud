from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("failure", ["", "stop", "image-remove"])
def test_empty_host_recovery_removes_container_references_before_image_tags(
    tmp_path: Path, failure: str,
) -> None:
    source = (ROOT / "deploy/deploy-to-ssh-host.sh").read_text()
    functions = []
    for name in (
        "force_recovery_services_stopped", "restore_release_image_tags", "recover_failed_cutover",
    ):
        start = source.index(f"\n{name}() {{")
        end = source.index("\n}\n", start) + 3
        functions.append(source[start:end])
    references = tmp_path / "references"
    references.mkdir()
    for role in ("redis", "worker"):
        (references / role).touch()
    image_tag = tmp_path / "image-tag"
    image_tag.touch()
    image_map = tmp_path / "rollback-images.tsv"
    image_map.write_text("candidate:prod\t-\t-\n")
    # Docker rejects deleting an image's last tag while any container uses it.
    # Exercise the real recovery functions against that constraint, including
    # Redis, which the public/write-only fail-closed path intentionally omits.
    shell = r"""
set -euo pipefail
CUTOVER_PHASE=verify-worker-operational-readiness
CUTOVER_MUTATION_STARTED=1
PREVIOUS_RELEASE_DIR=''
MIGRATION_STARTED=1
RETAIN_DEPLOY_LOCK=0
COMPOSE_PROJECT_NAME_EFFECTIVE=npcink-ai-cloud
RECOVERY_REQUIRED_SERVICES=(redis proxy frontend api worker callback-worker ops-worker)
application_container_ids() {
    [ ! -f "${REFERENCES}/$1" ] || printf '%s\n' "$1"
    return 0
}
assert_governed_one_off_absent() { return 0; }
prove_fail_closed_recovery() { printf '%s\n' "$1" >"${OUTCOME}"; }
docker() {
    if [ "$1" = stop ]; then
        [ "${FAILURE}" != stop ]
    elif [ "$1" = rm ]; then
        [ "${FAILURE}" != stop ] || return 1
        rm "${REFERENCES}/${*: -1}"
    elif [ "$1 ${2:-}" = 'image inspect' ]; then
        [ -f "${IMAGE_TAG}" ]
    elif [ "$1 ${2:-}" = 'image rm' ]; then
        [ "${FAILURE}" != image-remove ] || return 1
        [ -z "$(ls -A "${REFERENCES}")" ] || return 1
        rm "${IMAGE_TAG}"
    elif [ "$1" = ps ]; then
        local role="${*: -1}"
        role="${role#label=com.docker.compose.service=}"
        application_container_ids "${role}"
    elif [ "$1" = info ]; then
        return 0
    else
        return 99
    fi
}
""" + "\n".join(functions) + r"""
status=0
recover_failed_cutover || status=$?
printf '%s\n%s\n' "${status}" "${RETAIN_DEPLOY_LOCK}" >"${RESULT}"
"""
    env = os.environ | {
        "REFERENCES": str(references), "IMAGE_TAG": str(image_tag),
        "ROLLBACK_IMAGE_MAP": str(image_map), "OUTCOME": str(tmp_path / "outcome"),
        "RESULT": str(tmp_path / "result"), "FAILURE": failure,
    }
    completed = subprocess.run(
        ["bash", "-c", shell], env=env, capture_output=True, text=True, check=False,
    )
    assert completed.returncode == 0, completed.stderr
    assert (tmp_path / "result").read_text().splitlines() == (
        ["1", "1" if failure == "stop" else "0"] if failure else ["0", "0"]
    )
    assert (tmp_path / "outcome").read_text().strip() == (
        "recovery_incomplete" if failure else "fail_closed_after_migration_started"
    )
    assert image_tag.exists() == bool(failure)
    assert bool(list(references.iterdir())) == (failure == "stop")


@pytest.mark.parametrize("timeout", ["0", "61", "-1", "NaN", "1.5", "999999999999999999999"])
def test_operational_timeout_rejects_invalid_or_unbounded_values(timeout: str) -> None:
    completed = subprocess.run(
        ["bash", "-c", '. deploy/common.sh; npcink_ai_cloud_operational_request_timeout'],
        cwd=ROOT,
        env=os.environ | {"NPCINK_CLOUD_OPERATIONAL_READY_REQUEST_TIMEOUT_SECONDS": timeout},
        capture_output=True, text=True, check=False,
    )
    assert completed.returncode != 0
    assert not completed.stdout
    assert "integer from 1 to 60" in completed.stderr
