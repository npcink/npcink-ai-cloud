from __future__ import annotations

import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import textwrap
import time
from pathlib import Path
from urllib.request import urlopen

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "m4-preview.sh"
REDACTOR = ROOT / "scripts" / "redact-m4-preview-logs.py"
PACKAGE_PROXY = ROOT / "scripts" / "m4-package-proxy.py"
OVERLAY = ROOT / "docker-compose.m4-preview.yml"
PREVIEW_PROXY = ROOT / "deploy" / "nginx.m4-preview.conf"
RUNBOOK = ROOT / "docs" / "m4-preview-development-v1.md"
AI_STANDARD = ROOT / "docs" / "m4-preview-ai-development-standard-v1.md"
VALIDATION_ADR = (
    ROOT / "docs" / "decisions" / "024-risk-tiered-development-validation-authority.md"
)
CHECKPOINT_ADR = (
    ROOT
    / "docs"
    / "decisions"
    / "025-source-only-authoring-and-ai-m4-checkpoint-dispatch.md"
)
SOURCE_RELAY_ADR = (
    ROOT / "docs" / "decisions" / "026-private-source-relay-transfer.md"
)
SOURCE_RELAY_VALIDATION = (
    ROOT / "docs" / "m4-source-relay-transfer-validation-2026-07-24.md"
)
PACKAGE_PROXY_ADR = (
    ROOT / "docs" / "decisions" / "027-m4-package-proxy-streaming-cache.md"
)
PACKAGE_PROXY_VALIDATION = (
    ROOT
    / "docs"
    / "m4-package-proxy-streaming-cache-validation-2026-07-25.md"
)
OLLAMA_LAUNCH_AGENT = ROOT / "deploy" / "top.mqzj.npcink-ollama-preview.plist"


def _write_fake_lsof(fake_bin: Path, *, port_is_occupied: bool) -> None:
    fake_lsof = fake_bin / "lsof"
    fake_lsof.write_text(
        f"#!/bin/sh\nexit {0 if port_is_occupied else 1}\n",
        encoding="utf-8",
    )
    fake_lsof.chmod(0o755)


def _marked_shell_block(source: str, name: str) -> str:
    begin = f"# BEGIN {name}"
    end = f"# END {name}"
    assert begin in source
    assert end in source
    return source.split(begin, 1)[1].split(end, 1)[0].strip()


def _run_frontend_volume_guard(
    tmp_path: Path,
    *,
    primary_ids: list[str],
    consumers: dict[str, str],
    canonical_ids: dict[str, str] | None = None,
    volume_exists: bool = True,
    volume_names: list[str] | None = None,
    volume_ls_error: bool = False,
    volume_inspect_error: bool = False,
    volume_project_label: str = "npcink-ai-cloud-m4-dev",
    volume_key_label: str = "cloud-frontend-node-modules-dev",
    primary_state: Path | None = None,
    slot_state_base: Path | None = None,
    after_guard: str = "",
) -> tuple[subprocess.CompletedProcess[str], Path]:
    source = SCRIPT.read_text(encoding="utf-8")
    guard = _marked_shell_block(source, "frontend dependency volume consumer guard")
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    docker_log = tmp_path / "docker.log"
    docker_fixture = tmp_path / "docker-fixture.json"
    resolved_canonical_ids = {
        container_id: container_id for container_id in (*primary_ids, *consumers)
    }
    if canonical_ids is not None:
        resolved_canonical_ids.update(canonical_ids)
    listed_volume_names = (
        volume_names
        if volume_names is not None
        else (
            ["npcink-ai-cloud-m4-dev_cloud-frontend-node-modules-dev"]
            if volume_exists
            else []
        )
    )
    docker_fixture.write_text(
        json.dumps(
            {
                "primary_ids": primary_ids,
                "consumers": consumers,
                "canonical_ids": resolved_canonical_ids,
                "volume": {
                    "exists": volume_exists,
                    "names": listed_volume_names,
                    "ls_error": volume_ls_error,
                    "inspect_error": volume_inspect_error,
                    "project_label": volume_project_label,
                    "key_label": volume_key_label,
                },
            }
        ),
        encoding="utf-8",
    )
    fake_docker = fake_bin / "docker"
    fake_docker.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env python3
            import json
            import os
            import sys

            args = sys.argv[1:]
            with open(os.environ["FAKE_DOCKER_FIXTURE"], encoding="utf-8") as handle:
                fixture = json.load(handle)
            with open(os.environ["FAKE_DOCKER_LOG"], "a", encoding="utf-8") as handle:
                handle.write(" ".join(args) + "\\n")
            if args[0] == "compose":
                print(*fixture["primary_ids"], sep="\\n")
            elif args[:2] == ["volume", "ls"]:
                if fixture["volume"]["ls_error"]:
                    raise SystemExit(76)
                print(*fixture["volume"]["names"], sep="\\n")
            elif args[:2] == ["volume", "inspect"]:
                if fixture["volume"]["inspect_error"]:
                    raise SystemExit(77)
                if not fixture["volume"]["exists"]:
                    raise SystemExit(1)
                if "-f" in args:
                    template = args[args.index("-f") + 1]
                    if "com.docker.compose.project" in template:
                        print(fixture["volume"]["project_label"])
                    elif "com.docker.compose.volume" in template:
                        print(fixture["volume"]["key_label"])
                    else:
                        raise SystemExit(97)
            elif args[:2] == ["ps", "-a"]:
                print(*fixture["consumers"], sep="\\n")
            elif args[:2] == ["inspect", "-f"]:
                container_id = args[-1]
                template = args[2]
                canonical_id = fixture["canonical_ids"][container_id]
                if template == "{{.Id}}":
                    print(canonical_id)
                elif template.startswith("{{.Id}}|"):
                    print(canonical_id + "|" + fixture["consumers"][container_id])
                else:
                    print(fixture["consumers"][container_id])
            else:
                raise SystemExit(97)
            """
        ),
        encoding="utf-8",
    )
    fake_docker.chmod(0o755)
    state_file = primary_state or (tmp_path / "primary-state.txt")
    state_base = slot_state_base or (tmp_path / "slots")
    harness = tmp_path / "guard.sh"
    harness.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            {guard}
            project_name=npcink-ai-cloud-m4-dev
            state_file={state_file}
            frontend_slot_state_base={state_base}
            primary_compose=(docker compose)
            guard_frontend_dependency_volume_consumers \
              npcink-ai-cloud-m4-dev_cloud-frontend-node-modules-dev
            {after_guard}
            """
        ),
        encoding="utf-8",
    )
    harness.chmod(0o755)
    completed = subprocess.run(
        ["bash", str(harness)],
        cwd=ROOT,
        env={
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "FAKE_DOCKER_FIXTURE": str(docker_fixture),
            "FAKE_DOCKER_LOG": str(docker_log),
        },
        text=True,
        capture_output=True,
        check=False,
    )
    return completed, docker_log


def test_m4_preview_commands_are_explicit() -> None:
    scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]

    expected = {
        "m4:preview:prepare": "bash scripts/m4-preview.sh prepare",
        "m4:preview:deploy": "bash scripts/m4-preview.sh deploy",
        "m4:preview:sync": "bash scripts/m4-preview.sh sync",
        "m4:preview:promote": "bash scripts/m4-preview.sh promote",
        "m4:preview:tunnel": "bash scripts/m4-preview.sh tunnel",
        "m4:preview:auto": "bash scripts/m4-preview.sh tunnel --auto",
        "m4:preview:status": "bash scripts/m4-preview.sh status",
        "m4:preview:logs": "bash scripts/m4-preview.sh logs",
        "m4:preview:test": "bash scripts/m4-preview.sh test",
        "m4:preview:recover": "bash scripts/m4-preview.sh recover",
        "m4:preview:ollama:install": "bash scripts/m4-preview.sh ollama-install",
        "m4:preview:ollama:configure": "bash scripts/m4-preview.sh ollama-configure",
        "m4:preview:ollama:status": "bash scripts/m4-preview.sh ollama-status",
        "m4:preview:ollama:restart": "bash scripts/m4-preview.sh ollama-restart",
        "m4:preview:restart": "bash scripts/m4-preview.sh restart",
        "m4:preview:stop": "bash scripts/m4-preview.sh stop",
    }
    assert {name: scripts.get(name) for name in expected} == expected


def test_m4_preview_frontend_responses_cannot_reuse_stale_candidate_assets() -> None:
    proxy = PREVIEW_PROXY.read_text(encoding="utf-8")

    for location in ("location /_next/ {", "location /api/ {", "location / {"):
        block = proxy.split(location, 1)[1].split("\n    }", 1)[0]
        assert "proxy_hide_header Cache-Control;" in block
        assert "proxy_hide_header Expires;" in block
        assert (
            'add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;'
            in block
        )
        assert 'add_header Pragma "no-cache" always;' in block
        assert 'add_header Expires "0" always;' in block


def test_m4_preview_shell_contract_is_syntax_valid_and_fail_closed() -> None:
    subprocess.run(["bash", "-n", str(SCRIPT)], cwd=ROOT, check=True)
    source = SCRIPT.read_text(encoding="utf-8")

    assert "npcink-ai-cloud-m4-dev" in source
    assert "npcink-ai-cloud-m4-preview)" in source
    assert "legacy project name is forbidden" in source
    assert "operation.lock" in source
    assert 'if ! mkdir "${lock_dir}"' in source
    assert "lock_acquired=0" in source
    assert 'if [ "${lock_acquired}" = "1" ]; then' in source
    assert "built_runtime_image_marker" in source
    assert "built_frontend_image_marker" in source
    assert "deployed_runtime_image_marker" in source
    assert "deployed_frontend_image_marker" in source
    assert "deployed_orchestration_marker" in source
    assert "deployed_config_marker" in source
    assert "deployed_worker_source_marker" in source
    assert "deployed_migration_source_marker" in source
    assert "prepared image inputs are not deployed" in source
    assert 'test ! -L "${remote_dir}"' in source
    assert 'resolved_remote_dir="$(cd "${remote_dir}" && pwd -P)"' in source
    assert 'work_dir="${staging}"' in source
    assert 'work_dir="${remote_dir}"' in source
    assert "com.docker.compose.service" in source
    assert "source_bundle_sha256" in source
    assert "source_transfer_mode" in source
    assert "NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE" in source
    assert "NPCINK_CLOUD_M4_RELAY_SSH_HOST" in source
    assert "ConnectionAttempts=3" in source
    assert "root@100.90.87.36" in source
    assert "74.82.195.160" not in source
    assert "source relay download complete" in source
    assert "source relay bundle integrity mismatch" in source
    assert "source relay cleanup failed" in source
    assert "M4 relay SSH host contains unsupported characters" in source
    assert "source transfer holds" in source
    assert "systemd-run --quiet --collect" in source
    assert '--bind "${bind_ip}"' in source
    assert "--retry-all-errors" in source
    assert "--max-time 120" in source
    assert "--speed-time 20" in source
    assert "source_dirty_paths" in source
    assert "frontend_source_fingerprint" in source
    assert 'export NPCINK_CLOUD_FRONTEND_REVISION="${frontend_runtime_revision}"' in source
    assert "frontend source, image, and config are unchanged; recreate skipped" in source
    assert "frontend_recreate=" in source
    assert "service-plan migration=" in source
    assert "worker_restart=" in source
    assert "migration source is unchanged; Alembic upgrade skipped" in source
    assert "live database revision matches the expected Alembic head" in source
    assert "live database revision drifted; Alembic upgrade required" in source
    assert "worker source is unchanged; worker restart skipped" in source
    assert "proxy config is unchanged; proxy reload skipped" in source
    assert '"${compose[@]}" up -d --no-build --pull never --force-recreate frontend' in source
    assert "acceptance_state" in source
    assert "promotion_pr" in source
    assert "deployed_at_utc" in source
    assert "git ls-files -z --cached --others --exclude-standard" in source
    assert "--exclude '.env'" in source
    assert "--exclude '.env.local'" in source
    assert "--exclude 'frontend/.next'" in source
    assert "--exclude 'node_modules'" in source
    assert "docker system prune" not in source
    assert "docker volume prune" not in source
    assert "docker image save" not in source
    assert "docker image load" not in source
    assert "docker compose" in source
    assert "exec --interactive=false -T" in source
    assert "building runtime image on M4" in source
    assert "building frontend image on M4" in source
    assert "image-plan runtime_build=" in source
    assert "runtime_image_input_sha256" in source
    assert "frontend_image_input_sha256" in source
    assert "deployment_orchestration_sha256" in source
    assert "deployment orchestration changed" in source
    assert "ghcr.nju.edu.cn/astral-sh/uv:" in source
    assert "m.daocloud.io/docker.io/library/python:" in source
    assert "m.daocloud.io/docker.io/library/node:" in source
    assert "crane pull" in source
    assert "remote_config_digest" in source
    assert "verified M4-local base aliases" in source
    assert "scripts/m4-package-proxy.py" in source
    assert '--secret "id=pip_index_url' in source
    assert "NPCINK_CLOUD_M4_NPM_REGISTRY" in source
    assert 'frontend_volume="${project_name}_cloud-frontend-node-modules-dev"' in source
    assert "com.docker.compose.project" in source
    assert "prepare complete: images and Compose config are ready" in source
    assert "validate_staged_runtime_inputs" in source
    assert "nginx:1.27-alpine nginx -t" in source
    assert "--delay-updates --delete-delay" in source
    assert "--exclude 'deploy/nginx.m4-preview.conf'" in source
    assert 'mv -f "${nginx_config_incoming}"' in source
    assert "--force-recreate proxy" in source
    assert "equivalent_gate=pnpm run check:fast" in source
    assert "test_scope=focused" in source
    assert "test_scope=contract" in source
    assert "test_scope=domain" in source
    assert "test_scope=full" in source
    assert 'if [ "${#test_targets[@]}" -gt 0 ]; then' in source
    assert 'remote_locked_operation test "${test_scope}"' in source
    assert 'label=com.docker.compose.oneoff=False' in source
    assert "recovery requires existing container" in source
    assert '"${compose[@]}" start postgres redis' in source
    assert '"${compose[@]}" start api frontend proxy worker callback-worker ops-worker' in source
    assert "recovery complete" in source
    assert 'key.startswith("NPCINK_CLOUD_")' in source
    assert "pytest.main(sys.argv[1:])" in source
    assert "tests/contract" in source
    assert "tests/domain" in source
    assert "NPCINK_CLOUD_M4_TUNNEL_LOCAL_PORT" in source
    assert 'forward="127.0.0.1:${local_port}:127.0.0.1:${M4_PORT}"' in source
    assert "ExitOnForwardFailure=yes" in source
    assert "ServerAliveCountMax=3" in source
    assert "top.mqzj.npcink-ollama-preview" in source
    assert "m4:preview:ollama:install" in source
    assert "scripts/configure_m4_ollama_preview.py" in source
    assert "env PYTHONPATH=/app python scripts/configure_m4_ollama_preview.py" in source
    assert "managed Ollama is not installed; skipping preview recovery" in source
    assert "127.0.0.1:${M4_OLLAMA_PORT}" in source
    assert 'source_branch}" = "master"' in source
    assert "promotion requires a clean master worktree" in source
    assert "refs/remotes/origin/master" in source
    assert "PR #${pr_number} is not merged" in source
    assert "PR #${pr_number} targets ${pr_base}, not master" in source
    assert "m4:preview:promote -- --pr ${promotion_pr} --deploy" in source

    prepare_block = source.rsplit('if [ "${mode}" = "prepare" ]; then', 1)[1].split(
        'elif [ "${mode}" = "deploy" ]; then',
        1,
    )[0]
    assert "deployed_runtime_image_marker" not in prepare_block
    assert "deployed_frontend_image_marker" not in prepare_block
    assert "deployed_orchestration_marker" not in prepare_block
    assert "deployed_config_marker" not in prepare_block
    assert source.index("wait_for_http") < source.index(
        '> "${deployed_runtime_image_marker}"'
    )
    assert source.index("wait_for_http") < source.index(
        '> "${deployed_frontend_image_marker}"'
    )
    assert source.index("wait_for_http") < source.index(
        '> "${deployed_orchestration_marker}"'
    )
    assert source.index("wait_for_http") < source.index(
        '> "${deployed_frontend_source_marker}"'
    )


def test_m4_frontend_recreate_is_selected_only_for_frontend_relevant_change() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    selection = source.split(
        'if [ "${frontend_source_changed}" = "1" ] ||',
        1,
    )[1].split("\nfi\n", 1)[0]
    assert '"${frontend_config_changed}" = "1"' in selection
    assert '"${frontend_volume_refresh_required}" = "1"' in selection
    assert '"${compose[@]}" ps -q frontend' in selection
    assert "frontend_recreate_required=1" in selection
    assert "service-plan migration=" in source
    assert "worker_restart=" in source
    assert "frontend_recreate=" in source
    assert '[[ "${previous_frontend_revision}" =~ ^[0-9a-f]{40}$ ]]' in source
    assert '"${compose[@]}" config --format json' in source
    assert "deployed_frontend_config_marker" in source
    assert "frontend_config_sha256" in source

    deploy_block = source.split('elif [ "${mode}" = "deploy" ]; then', 1)[1].split(
        "\nelse\n",
        1,
    )[0]
    assert (
        '"${compose[@]}" up -d --no-build --pull never \\\n'
        "\t\tpostgres redis api worker callback-worker ops-worker"
    ) in deploy_block
    assert "postgres redis api frontend worker" not in deploy_block
    assert '--force-recreate frontend' in deploy_block
    assert "recreate skipped" in deploy_block


def test_m4_frontend_source_fingerprint_ignores_backend_and_tracks_frontend(
    tmp_path: Path,
) -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    function_body = source.split("frontend_source_fingerprint() {", 1)[1].split(
        "\n}\n\nsource_path_allowed()",
        1,
    )[0]
    repo = tmp_path / "repo"
    repo.mkdir()
    for relative, content in {
        "README.md": "backend-only\n",
        "package.json": "{}\n",
        "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
        "pnpm-workspace.yaml": "packages: [frontend]\n",
        "frontend/package.json": "{}\n",
        "frontend/src/page.tsx": "export default 1;\n",
    }.items():
        path = repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    runner = tmp_path / "fingerprint.sh"
    runner.write_text(
        "#!/usr/bin/env bash\nset -euo pipefail\n"
        f"frontend_source_fingerprint() {{{function_body}\n}}\n"
        "frontend_source_fingerprint\n",
        encoding="utf-8",
    )
    runner.chmod(0o755)

    def fingerprint() -> str:
        return subprocess.run(
            ["bash", str(runner)],
            env={**os.environ, "ROOT_DIR": str(repo)},
            text=True,
            capture_output=True,
            check=True,
        ).stdout.strip()

    initial = fingerprint()
    (repo / "README.md").write_text("changed backend-only\n", encoding="utf-8")
    assert fingerprint() == initial

    (repo / "frontend/src/page.tsx").write_text(
        "export default 2;\n",
        encoding="utf-8",
    )
    changed = fingerprint()
    assert changed != initial

    (repo / "frontend/src/page.tsx").unlink()
    deleted = fingerprint()
    assert deleted != initial
    assert deleted != changed


def test_m4_runtime_and_frontend_image_fingerprints_are_independent(
    tmp_path: Path,
) -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    fingerprint_functions = "image_fingerprint() {" + source.split(
        "image_fingerprint() {",
        1,
    )[1].split("\nconfig_fingerprint() {", 1)[0]
    repo = tmp_path / "repo"
    repo.mkdir()
    for relative, content in {
        "Dockerfile": "runtime dockerfile\n",
        "pyproject.toml": "[project]\nname='runtime'\n",
        "uv.lock": "version = 1\n",
        ".dockerignore": ".git\n",
        "frontend/Dockerfile.dev": "frontend dockerfile\n",
        "frontend/package.json": "{}\n",
        "package.json": "{}\n",
        "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
        "pnpm-workspace.yaml": "packages: [frontend]\n",
        "scripts/m4-preview.sh": (
            "orchestration=v1\n"
            "# BEGIN M4 runtime image build recipe\n"
            "runtime_recipe=v1\n"
            "# END M4 runtime image build recipe\n"
            "# BEGIN M4 frontend image build recipe\n"
            "frontend_recipe=v1\n"
            "# END M4 frontend image build recipe\n"
        ),
    }.items():
        path = repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    runner = tmp_path / "image-fingerprint.sh"
    runner.write_text(
        "#!/usr/bin/env bash\nset -euo pipefail\n"
        f"{fingerprint_functions}\n"
        'case "$1" in\n'
        "  runtime) runtime_image_fingerprint ;;\n"
        "  frontend) frontend_image_fingerprint ;;\n"
        "  orchestration) deployment_orchestration_fingerprint ;;\n"
        "  *) exit 64 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    runner.chmod(0o755)
    shasum = tmp_path / "shasum"
    shasum.write_text(
        "#!/usr/bin/env python3\n"
        "import hashlib\n"
        "import sys\n"
        "args = sys.argv[1:]\n"
        "if args[:2] != ['-a', '256']:\n"
        "    raise SystemExit(64)\n"
        "paths = args[2:]\n"
        "if paths:\n"
        "    for path in paths:\n"
        "        digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()\n"
        "        print(f'{digest}  {path}')\n"
        "else:\n"
        "    digest = hashlib.sha256(sys.stdin.buffer.read()).hexdigest()\n"
        "    print(f'{digest}  -')\n",
        encoding="utf-8",
    )
    shasum.chmod(0o755)

    def fingerprint(kind: str) -> str:
        return subprocess.run(
            ["bash", str(runner), kind],
            env={
                **os.environ,
                "PATH": f"{tmp_path}:{os.environ['PATH']}",
                "ROOT_DIR": str(repo),
            },
            text=True,
            capture_output=True,
            check=True,
        ).stdout.strip()

    initial_runtime = fingerprint("runtime")
    initial_frontend = fingerprint("frontend")
    initial_orchestration = fingerprint("orchestration")

    preview_script = repo / "scripts/m4-preview.sh"
    preview_script.write_text(
        preview_script.read_text(encoding="utf-8").replace(
            "orchestration=v1",
            "orchestration=v2",
        ),
        encoding="utf-8",
    )
    assert fingerprint("runtime") == initial_runtime
    assert fingerprint("frontend") == initial_frontend
    changed_orchestration = fingerprint("orchestration")
    assert changed_orchestration != initial_orchestration

    (repo / "Dockerfile").write_text("runtime dockerfile v2\n", encoding="utf-8")
    assert fingerprint("runtime") != initial_runtime
    assert fingerprint("frontend") == initial_frontend
    assert fingerprint("orchestration") == changed_orchestration
    (repo / "Dockerfile").write_text("runtime dockerfile\n", encoding="utf-8")

    (repo / "frontend/Dockerfile.dev").write_text(
        "frontend dockerfile v2\n",
        encoding="utf-8",
    )
    assert fingerprint("runtime") == initial_runtime
    assert fingerprint("frontend") != initial_frontend
    assert fingerprint("orchestration") == changed_orchestration
    (repo / "frontend/Dockerfile.dev").write_text(
        "frontend dockerfile\n",
        encoding="utf-8",
    )

    preview_script.write_text(
        preview_script.read_text(encoding="utf-8").replace(
            "runtime_recipe=v1",
            "runtime_recipe=v2",
        ),
        encoding="utf-8",
    )
    assert fingerprint("runtime") != initial_runtime
    assert fingerprint("frontend") == initial_frontend
    assert fingerprint("orchestration") == changed_orchestration


def test_m4_worker_and_migration_source_fingerprints_are_independent(
    tmp_path: Path,
) -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    fingerprint_functions = "scoped_source_fingerprint() {" + source.split(
        "scoped_source_fingerprint() {",
        1,
    )[1].split("\nsource_path_allowed() {", 1)[0]
    repo = tmp_path / "repo"
    repo.mkdir()
    for relative, content in {
        "README.md": "unrelated\n",
        "alembic.ini": "[alembic]\n",
        "app/main.py": "VALUE = 1\n",
        "migrations/env.py": "VALUE = 1\n",
        "migrations/versions/0001_test.py": "VALUE = 1\n",
    }.items():
        path = repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    source_stage = tmp_path / "source-stage"
    shutil.copytree(repo, source_stage)
    runner = tmp_path / "source-fingerprint.sh"
    runner.write_text(
        "#!/usr/bin/env bash\nset -euo pipefail\n"
        f"{fingerprint_functions}\n"
        'case "$1" in\n'
        "  worker) worker_source_fingerprint ;;\n"
        "  migration) migration_source_fingerprint ;;\n"
        "  *) exit 64 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    runner.chmod(0o755)

    def fingerprint(kind: str) -> str:
        return subprocess.run(
            ["bash", str(runner), kind],
            cwd=repo,
            env={
                **os.environ,
                "ROOT_DIR": str(repo),
                "SOURCE_STAGE_PATH": str(source_stage),
            },
            text=True,
            capture_output=True,
            check=True,
        ).stdout.strip()

    initial_worker = fingerprint("worker")
    initial_migration = fingerprint("migration")
    (source_stage / "README.md").write_text("unrelated change\n", encoding="utf-8")
    assert fingerprint("worker") == initial_worker
    assert fingerprint("migration") == initial_migration

    (repo / "app/main.py").write_text("VALUE = 2\n", encoding="utf-8")
    assert fingerprint("worker") == initial_worker
    (source_stage / "app/main.py").write_text("VALUE = 2\n", encoding="utf-8")
    assert fingerprint("worker") != initial_worker
    assert fingerprint("migration") == initial_migration
    (source_stage / "app/main.py").write_text("VALUE = 1\n", encoding="utf-8")

    (source_stage / "migrations/versions/0001_test.py").write_text(
        "VALUE = 2\n",
        encoding="utf-8",
    )
    assert fingerprint("worker") == initial_worker
    assert fingerprint("migration") != initial_migration


def test_m4_unchanged_source_sync_skips_runtime_mutations() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    sync_block = _marked_shell_block(source, "selective M4 source sync")

    migration_guard = sync_block.split(
        'if [ "${migration_required}" = "1" ]; then',
        1,
    )[1].split("\n\tfi", 1)[0]
    worker_guard = sync_block.split(
        'if [ "${worker_restart_required}" = "1" ]; then',
        1,
    )[1].split("\n\tfi", 1)[0]
    frontend_guard = sync_block.split(
        'if [ "${frontend_recreate_required}" = "1" ]; then',
        1,
    )[1].split("\n\tfi", 1)[0]
    proxy_guard = sync_block.split(
        'if [ "${nginx_config_changed}" = "1" ]; then',
        1,
    )[1].split("\n\tfi", 1)[0]

    assert "alembic upgrade head" in migration_guard
    assert "stack_touched=1" in migration_guard
    assert "restart worker callback-worker ops-worker" in worker_guard
    assert "stack_touched=1" in worker_guard
    assert "--force-recreate frontend" in frontend_guard
    assert "stack_touched=1" in frontend_guard
    assert "nginx -s reload" in proxy_guard
    assert "restart proxy" in proxy_guard
    assert "proxy config is unchanged; proxy reload skipped" in sync_block


def test_m4_migration_skip_requires_live_database_head_proof() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    proof_start = source.index(
        'if [ "${mode}" != "prepare" ] && [ "${migration_required}" = "0" ]; then'
    )
    proof_end = source.index('\nfi\n\nif [ "${mode}" != "prepare" ]; then', proof_start)
    proof = source[proof_start:proof_end]

    assert "alembic heads" in proof
    assert "alembic current" in proof
    assert "migration_required=1" in proof
    assert source.index("service-plan migration=", proof_end) > proof_end


def test_m4_image_build_and_frontend_volume_plans_are_independent() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    build_block = source.split(
        'if [ "${mode}" != "sync" ] &&',
        1,
    )[1].split("\nfi\n\nrefresh_frontend_dependency_volume()", 1)[0]
    image_builds = build_block.split("\n\tstart_package_proxy\n", 1)[1]
    runtime_branch = image_builds.split(
        'if [ "${runtime_image_needs_build}" = "1" ]; then',
        1,
    )[1].split("\n\tfi", 1)[0]
    frontend_branch = image_builds.split(
        'if [ "${frontend_image_needs_build}" = "1" ]; then',
        1,
    )[1].split("\n\tfi", 1)[0]
    assert "build_runtime_image" in runtime_branch
    assert "build_frontend_image" not in runtime_branch
    assert "built_runtime_image_marker" in runtime_branch
    assert "build_frontend_image" in frontend_branch
    assert "build_runtime_image" not in frontend_branch
    assert "built_frontend_image_marker" in frontend_branch

    volume_plan = source.split("frontend_volume_refresh_required=0", 1)[1].split(
        'if [ "${mode}" = "prepare" ]; then',
        1,
    )[0]
    assert 'if [ "${frontend_image_needs_build}" = "1" ]; then' in volume_plan
    assert '"${runtime_image_needs_build}" = "1"' not in volume_plan


def test_m4_deploy_guards_frontend_dependency_volume_before_runtime_mutation() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    guard_function = source.split(
        "guard_frontend_dependency_volume_consumers() {",
        1,
    )[1].split("\n}\n# END frontend dependency volume consumer guard", 1)[0]
    volume_discovery = guard_function.index("docker volume ls --quiet")
    early_label_proof = guard_function.index(
        'verify_frontend_dependency_volume_labels "${frontend_volume}"'
    )
    consumer_discovery = guard_function.index(
        'docker ps -a -q --filter "volume=${frontend_volume}"'
    )
    assert volume_discovery < early_label_proof < consumer_discovery

    slot_lock_call = source.index(
        "\t\tacquire_frontend_slot_operation_locks\n"
    )
    guard_call = source.index(
        'guard_frontend_dependency_volume_consumers "${frontend_volume}"'
    )
    staged_validation = source.index("\nvalidate_staged_runtime_inputs\n")
    live_rsync = source.index("\trs" + "ync -a --delay-updates --delete-delay")
    live_stack_touched = source.rindex("\tstack_touched=1", guard_call, live_rsync)
    build_call = source.index("\n\tstart_package_proxy\n", guard_call)
    refresh_call = source.index("\trefresh_frontend_dependency_volume", build_call)
    migrate = source.index(
        '"${compose[@]}" run --interactive=false -T --rm --pull never api '
        "alembic upgrade head",
        refresh_call,
    )

    assert staged_validation < slot_lock_call < guard_call < live_stack_touched < live_rsync
    assert live_rsync < build_call < refresh_call < migrate

    refresh_function = source.split(
        "refresh_frontend_dependency_volume() {",
        1,
    )[1].split('\n}\n\nif [ "${mode}" = "prepare" ]; then', 1)[0]
    race_guard = refresh_function.index(
        'guard_frontend_dependency_volume_consumers "${frontend_volume}"'
    )
    first_label_proof = refresh_function.index(
        'verify_frontend_dependency_volume_labels "${frontend_volume}"'
    )
    stack_touched = refresh_function.index("stack_touched=1")
    stop_frontend = refresh_function.index('"${compose[@]}" stop frontend')
    remove_frontend = refresh_function.index('"${compose[@]}" rm -f frontend')
    second_label_proof = refresh_function.index(
        'verify_frontend_dependency_volume_labels "${frontend_volume}"',
        first_label_proof + 1,
    )
    remove_volume = refresh_function.index('docker volume rm "${frontend_volume}"')
    release_slot_locks = refresh_function.index(
        "release_frontend_slot_operation_locks"
    )
    assert race_guard < first_label_proof < stack_touched < stop_frontend
    assert stop_frontend < remove_frontend < second_label_proof < remove_volume
    assert remove_volume < release_slot_locks

    cleanup_block = source.split("cleanup_remote() {", 1)[1].split(
        "\n}\ntrap cleanup_remote",
        1,
    )[0]
    failure_cleanup = cleanup_block.index(
        'if [ "${status}" -ne 0 ] && [ "${stack_touched}" = "1" ]; then'
    )
    cleanup_slot_locks = cleanup_block.index(
        "release_frontend_slot_operation_locks"
    )
    cleanup_primary_lock = cleanup_block.index('rm -f "${lock_dir}/owner.txt"')
    assert failure_cleanup < cleanup_slot_locks < cleanup_primary_lock

    deploy_block = source.split('elif [ "${mode}" = "deploy" ]; then', 1)[1].split(
        "\nelse\n",
        1,
    )[0]
    refresh = deploy_block.index("refresh_frontend_dependency_volume")
    start_data = deploy_block.index('"${compose[@]}" up -d --pull never postgres redis')
    migrate_data = deploy_block.index("alembic upgrade head")
    start_stack = deploy_block.index(
        '"${compose[@]}" up -d --no-build --pull never'
    )
    assert refresh < start_data < migrate_data < start_stack


def test_m4_staged_nginx_validation_precedes_atomic_live_commit() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    validation_block = source.index("# BEGIN staged runtime input validation")
    validation_call = source.index("\nvalidate_staged_runtime_inputs\n")
    live_touch = source.index("\tstack_touched=1", validation_call)
    atomic_block = source.index("# BEGIN atomic M4 source commit")
    install_candidate = source.index("\tinstall -m 644", atomic_block)
    live_rsync = source.index(
        "\trsync -a --delay-updates --delete-delay",
        atomic_block,
    )
    atomic_rename = source.index(
        '\tmv -f "${nginx_config_incoming}"',
        live_rsync,
    )
    runtime_branch = source.index('elif [ "${mode}" = "deploy" ]; then', atomic_rename)
    proxy_recreate = source.index("--force-recreate proxy", runtime_branch)

    assert validation_block < validation_call < live_touch < atomic_block
    assert live_rsync < install_candidate < atomic_rename < proxy_recreate


def test_m4_atomic_nginx_commit_preserves_old_config_until_rsync_succeeds(
    tmp_path: Path,
) -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    commit_block = _marked_shell_block(source, "atomic M4 source commit")
    staging = tmp_path / "staging"
    remote = tmp_path / "remote"
    fake_bin = tmp_path / "bin"
    (staging / "deploy").mkdir(parents=True)
    (remote / "deploy").mkdir(parents=True)
    fake_bin.mkdir()
    candidate = "events { worker_connections 16; } http { server { listen 8080; } }\n"
    previous = "events { worker_connections 8; } http { server { listen 8080; } }\n"
    (staging / "deploy" / "nginx.m4-preview.conf").write_text(
        candidate, encoding="utf-8"
    )
    live_config = remote / "deploy" / "nginx.m4-preview.conf"
    live_config.write_text(previous, encoding="utf-8")
    fake_rsync = fake_bin / "rsync"
    fake_rsync.write_text(
        textwrap.dedent(
            """\
            #!/bin/sh
            test "$(cat "$LIVE_CONFIG")" = "$EXPECTED_OLD" || exit 91
            exit 23
            """
        ),
        encoding="utf-8",
    )
    fake_rsync.chmod(0o755)
    harness = tmp_path / "commit.sh"
    harness.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            staging={staging}
            remote_dir={remote}
            run_id=fault-injection
            nginx_config_incoming=""
            {commit_block}
            """
        ),
        encoding="utf-8",
    )
    harness.chmod(0o755)

    completed = subprocess.run(
        ["bash", str(harness)],
        cwd=ROOT,
        env={
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "LIVE_CONFIG": str(live_config),
            "EXPECTED_OLD": previous.rstrip("\n"),
        },
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode == 23
    assert live_config.read_text(encoding="utf-8") == previous
    incoming = remote / "deploy" / ".nginx.m4-preview.conf.fault-injection.incoming"
    assert not incoming.exists()

    fake_rsync.write_text(
        textwrap.dedent(
            """\
            #!/bin/sh
            test "$(cat "$LIVE_CONFIG")" = "$EXPECTED_OLD" || exit 91
            exit 0
            """
        ),
        encoding="utf-8",
    )
    completed = subprocess.run(
        ["bash", str(harness)],
        cwd=ROOT,
        env={
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "LIVE_CONFIG": str(live_config),
            "EXPECTED_OLD": previous.rstrip("\n"),
        },
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode == 0
    assert live_config.read_text(encoding="utf-8") == candidate
    assert not incoming.exists()


def test_m4_deploy_refuses_an_inflight_slot_before_live_source_mutation(
    tmp_path: Path,
) -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    release_slot_locks = (
        "release_frontend_slot_operation_locks() {"
        + source.split("release_frontend_slot_operation_locks() {", 1)[1].split(
            "\n}\n\ncleanup_remote()",
            1,
        )[0]
        + "\n}"
    )
    guard = _marked_shell_block(source, "frontend dependency volume consumer guard")
    slot_state_base = tmp_path / "slots"
    active_lock = slot_state_base / "slot-2" / "operation.lock"
    active_lock.mkdir(parents=True)
    (active_lock / "owner.txt").write_text(
        "owner=codex:slot-sync\n",
        encoding="utf-8",
    )
    remote_sentinel = tmp_path / "remote-sentinel.txt"
    remote_sentinel.write_text("accepted\n", encoding="utf-8")
    harness = tmp_path / "slot-lock-guard.sh"
    harness.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            frontend_slot_locks_acquired=0
            {release_slot_locks}
            {guard}
            frontend_slot_state_base={slot_state_base}
            run_id=contract-race
            acquire_frontend_slot_operation_locks
            printf 'candidate\\n' > {remote_sentinel}
            """
        ),
        encoding="utf-8",
    )
    harness.chmod(0o755)

    completed = subprocess.run(
        ["bash", str(harness)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode == 75
    assert "another operation holds frontend slot 2" in completed.stderr
    assert "owner=codex:slot-sync" in completed.stderr
    assert remote_sentinel.read_text(encoding="utf-8") == "accepted\n"
    assert not (slot_state_base / "slot-1" / "operation.lock").exists()
    assert active_lock.is_dir()


@pytest.mark.parametrize("acquired_count", (0, 1, 2, 3))
def test_m4_slot_lock_release_is_bash3_safe_idempotent_and_exact(
    tmp_path: Path,
    acquired_count: int,
) -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    release_slot_locks = (
        "release_frontend_slot_operation_locks() {"
        + source.split("release_frontend_slot_operation_locks() {", 1)[1].split(
            "\n}\n\ncleanup_remote()",
            1,
        )[0]
        + "\n}"
    )
    slot_state_base = tmp_path / "slots"
    for slot in range(1, acquired_count + 1):
        lock_dir = slot_state_base / f"slot-{slot}" / "operation.lock"
        lock_dir.mkdir(parents=True)
        (lock_dir / "owner.txt").write_text(
            "owner=primary-dependency-volume-refresh\n",
            encoding="utf-8",
        )
    foreign_lock = slot_state_base / "slot-foreign" / "operation.lock"
    foreign_lock.mkdir(parents=True)
    foreign_owner = foreign_lock / "owner.txt"
    foreign_owner.write_text("owner=codex:other-task\n", encoding="utf-8")
    harness = tmp_path / "release-slot-locks.sh"
    harness.write_text(
        textwrap.dedent(
            f"""\
            #!/bin/bash
            set -euo pipefail
            frontend_slot_state_base={slot_state_base}
            frontend_slot_locks_acquired={acquired_count}
            {release_slot_locks}
            release_frontend_slot_operation_locks
            release_frontend_slot_operation_locks
            test "${{frontend_slot_locks_acquired}}" = "0"
            """
        ),
        encoding="utf-8",
    )
    harness.chmod(0o755)

    completed = subprocess.run(
        ["/bin/bash", str(harness)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    for slot in range(1, acquired_count + 1):
        assert not (slot_state_base / f"slot-{slot}" / "operation.lock").exists()
    assert foreign_lock.is_dir()
    assert foreign_owner.read_text(encoding="utf-8") == "owner=codex:other-task\n"


def test_m4_deploy_refuses_expired_drifted_slot_consumer_without_cleanup(
    tmp_path: Path,
) -> None:
    primary_state = tmp_path / "primary-state.txt"
    primary_state.write_text(
        "acceptance_state=accepted\nsource_revision=current-master\n",
        encoding="utf-8",
    )
    slot_state_base = tmp_path / "slots"
    slot_state = slot_state_base / "slot-1" / "state.txt"
    slot_state.parent.mkdir(parents=True)
    slot_state.write_text(
        "\n".join(
            (
                "owner=codex:stale-ui",
                "expires_at_epoch=1",
                "primary_source_revision=old-master",
            )
        )
        + "\n",
        encoding="utf-8",
    )
    remote_source = tmp_path / "remote-source"
    remote_source.mkdir()
    (remote_source / "revision.txt").write_text("accepted\n", encoding="utf-8")
    candidate_source = tmp_path / "candidate-source"
    candidate_source.mkdir()
    (candidate_source / "revision.txt").write_text("candidate\n", encoding="utf-8")
    completed, docker_log = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=["primary-frontend"],
        consumers={
            "primary-frontend": (
                "/npcink-ai-cloud-m4-dev-frontend-1|"
                "npcink-ai-cloud-m4-dev|frontend|False|||||"
            ),
            "stale-slot": (
                "/npcink-ai-cloud-m4-ui-1-frontend-slot-1|"
                "npcink-ai-cloud-m4-ui-1|frontend-slot|False|frontend-slot|1|"
                "codex:stale-ui|2026-07-29T20:00:00Z|old-ui"
            ),
        },
        primary_state=primary_state,
        slot_state_base=slot_state_base,
        after_guard=f"rsync -a --delete {candidate_source}/ {remote_source}/",
    )

    assert completed.returncode == 75
    assert "project=npcink-ai-cloud-m4-ui-1" in completed.stderr
    assert "service=frontend-slot" in completed.stderr
    assert "owner=codex:stale-ui" in completed.stderr
    assert "slot=1" in completed.stderr
    assert "lease_status=expired" in completed.stderr
    assert "backend_lease_status=drifted" in completed.stderr
    assert "m4:frontend:status -- --slot 1" in completed.stderr
    assert (
        "m4:frontend:release -- --slot 1 --owner codex:stale-ui"
        in completed.stderr
    )
    docker_events = docker_log.read_text(encoding="utf-8")
    assert " stop " not in f" {docker_events} "
    assert " rm " not in f" {docker_events} "
    assert (remote_source / "revision.txt").read_text(encoding="utf-8") == "accepted\n"


def test_m4_deploy_allows_only_the_expected_primary_frontend_consumer(
    tmp_path: Path,
) -> None:
    completed, docker_log = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=["primary-frontend"],
        consumers={
            "primary-frontend": (
                "/npcink-ai-cloud-m4-dev-frontend-1|"
                "npcink-ai-cloud-m4-dev|frontend|False|||||"
            )
        },
    )

    assert completed.returncode == 0
    assert "external consumer" not in completed.stderr
    assert " stop " not in f" {docker_log.read_text(encoding='utf-8')} "
    assert " rm " not in f" {docker_log.read_text(encoding='utf-8')} "


def test_m4_deploy_compares_canonical_primary_container_ids(tmp_path: Path) -> None:
    primary_id = "a" * 64
    completed, _ = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=[primary_id],
        consumers={
            primary_id[:12]: (
                "/npcink-ai-cloud-m4-dev-frontend-1|"
                "npcink-ai-cloud-m4-dev|frontend|False|||||"
            )
        },
        canonical_ids={primary_id[:12]: primary_id},
    )

    assert completed.returncode == 0
    assert "status=primary_expected" in completed.stderr
    assert "status=external_blocking" not in completed.stderr


@pytest.mark.parametrize(
    ("failure_kind", "expected_diagnostic"),
    (
        ("list", "unable to enumerate the exact frontend dependency volume"),
        ("inspect", "unable to verify labels for frontend dependency volume"),
    ),
)
def test_m4_deploy_fails_closed_when_volume_state_cannot_be_proven(
    tmp_path: Path,
    failure_kind: str,
    expected_diagnostic: str,
) -> None:
    remote_sentinel = tmp_path / "remote-sentinel.txt"
    remote_sentinel.write_text("accepted\n", encoding="utf-8")
    completed, docker_log = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=["primary-frontend"],
        consumers={
            "primary-frontend": (
                "/npcink-ai-cloud-m4-dev-frontend-1|"
                "npcink-ai-cloud-m4-dev|frontend|False|||||"
            )
        },
        volume_ls_error=failure_kind == "list",
        volume_inspect_error=failure_kind == "inspect",
        after_guard=f"printf 'candidate\\n' > {remote_sentinel}",
    )

    assert completed.returncode == 75
    assert expected_diagnostic in completed.stderr
    assert remote_sentinel.read_text(encoding="utf-8") == "accepted\n"
    docker_events = docker_log.read_text(encoding="utf-8")
    assert " build " not in f" {docker_events} "
    assert " stop " not in f" {docker_events} "
    assert " rm " not in f" {docker_events} "


@pytest.mark.parametrize(
    ("volume_project_label", "volume_key_label"),
    (
        ("unexpected-project", "cloud-frontend-node-modules-dev"),
        ("npcink-ai-cloud-m4-dev", "unexpected-volume-key"),
    ),
)
def test_m4_deploy_rejects_wrong_volume_labels_before_live_sync(
    tmp_path: Path,
    volume_project_label: str,
    volume_key_label: str,
) -> None:
    remote_sentinel = tmp_path / "remote-sentinel.txt"
    remote_sentinel.write_text("accepted\n", encoding="utf-8")
    completed, docker_log = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=["primary-frontend"],
        consumers={
            "primary-frontend": (
                "/npcink-ai-cloud-m4-dev-frontend-1|"
                "npcink-ai-cloud-m4-dev|frontend|False|||||"
            )
        },
        volume_project_label=volume_project_label,
        volume_key_label=volume_key_label,
        after_guard=f"printf 'candidate\\n' > {remote_sentinel}",
    )

    assert completed.returncode == 75
    assert "unable to verify labels for frontend dependency volume" in completed.stderr
    assert remote_sentinel.read_text(encoding="utf-8") == "accepted\n"
    docker_events = docker_log.read_text(encoding="utf-8")
    assert " build " not in f" {docker_events} "
    assert " stop " not in f" {docker_events} "
    assert " rm " not in f" {docker_events} "


def test_m4_deploy_allows_recovery_when_dependency_volume_is_absent(
    tmp_path: Path,
) -> None:
    after_guard = tmp_path / "after-guard.txt"
    completed, docker_log = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=["must-not-be-queried"],
        consumers={},
        volume_exists=False,
        after_guard=f"printf 'continued\\n' > {after_guard}",
    )

    assert completed.returncode == 0
    assert after_guard.read_text(encoding="utf-8") == "continued\n"
    docker_events = docker_log.read_text(encoding="utf-8")
    assert "volume ls --quiet" in docker_events
    assert "volume inspect" not in docker_events
    assert "compose" not in docker_events


def test_m4_deploy_does_not_treat_a_partial_name_match_as_the_target_volume(
    tmp_path: Path,
) -> None:
    after_guard = tmp_path / "after-guard.txt"
    completed, docker_log = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=["must-not-be-queried"],
        consumers={},
        volume_exists=False,
        volume_names=[
            "npcink-ai-cloud-m4-dev_cloud-frontend-node-modules-dev-backup"
        ],
        after_guard=f"printf 'continued\\n' > {after_guard}",
    )

    assert completed.returncode == 0
    assert after_guard.read_text(encoding="utf-8") == "continued\n"
    docker_events = docker_log.read_text(encoding="utf-8")
    assert "volume ls --quiet" in docker_events
    assert "volume inspect" not in docker_events
    assert "compose" not in docker_events


def test_m4_deploy_blocks_label_spoofed_primary_consumer(tmp_path: Path) -> None:
    expected_labels = "npcink-ai-cloud-m4-dev|frontend|False|||||"
    completed, _ = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=["current-primary"],
        consumers={
            "current-primary": f"/current-primary|{expected_labels}",
            "stale-label-spoof": f"/stale-label-spoof|{expected_labels}",
        },
    )

    assert completed.returncode == 75
    assert "frontend_volume_consumer=stale-label-spoof" in completed.stderr
    assert "status=external_blocking" in completed.stderr


def test_m4_deploy_blocks_ambiguous_duplicate_compose_primary(tmp_path: Path) -> None:
    completed, _ = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=["primary-one", "primary-two"],
        consumers={},
    )

    assert completed.returncode == 75
    assert "multiple current primary frontend containers" in completed.stderr


def test_m4_deploy_allows_recovery_when_primary_frontend_is_absent(
    tmp_path: Path,
) -> None:
    completed, _ = _run_frontend_volume_guard(
        tmp_path,
        primary_ids=[],
        consumers={},
    )

    assert completed.returncode == 0
    assert completed.stderr == ""


@pytest.mark.skipif(
    not (ROOT / ".git").exists(),
    reason="source transfer dry-run requires Git worktree metadata",
)
def test_m4_source_transfer_defaults_to_private_relay_and_direct_is_explicit() -> None:
    relayed = subprocess.run(
        ["bash", str(SCRIPT), "sync", "--dry-run"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "source transfer mode: relay" in relayed.stdout
    assert "root@100.90.87.36" in relayed.stdout
    assert "100.90.87.36:18080" in relayed.stdout

    direct_env = {
        **os.environ,
        "NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE": "direct",
    }
    direct = subprocess.run(
        ["bash", str(SCRIPT), "sync", "--dry-run"],
        cwd=ROOT,
        env=direct_env,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "source transfer mode: direct" in direct.stdout
    assert "would upload source directly to M4" in direct.stdout


def test_m4_source_transfer_validation_fails_closed_without_git_metadata() -> None:
    invalid_env = {
        **os.environ,
        "NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE": "automatic",
    }
    invalid = subprocess.run(
        ["bash", str(SCRIPT), "sync", "--dry-run"],
        cwd=ROOT,
        env=invalid_env,
        text=True,
        capture_output=True,
        check=False,
    )
    assert invalid.returncode != 0
    assert "must be relay or direct" in invalid.stderr

    invalid_host_env = {
        **os.environ,
        "NPCINK_CLOUD_M4_RELAY_SSH_HOST": "root@relay invalid",
    }
    invalid_host = subprocess.run(
        ["bash", str(SCRIPT), "sync", "--dry-run"],
        cwd=ROOT,
        env=invalid_host_env,
        text=True,
        capture_output=True,
        check=False,
    )
    assert invalid_host.returncode != 0
    assert "SSH host contains unsupported characters" in invalid_host.stderr


def test_m4_tunnel_dry_run_is_local_only_and_non_mutating() -> None:
    completed = subprocess.run(
        ["bash", str(SCRIPT), "tunnel", "--dry-run"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )

    assert "local_url=http://127.0.0.1:18010" in completed.stdout
    assert "127.0.0.1:18010:127.0.0.1:8010" in completed.stdout
    assert "ExitOnForwardFailure=yes" in completed.stdout
    assert "ServerAliveInterval=15" in completed.stdout
    assert "ServerAliveCountMax=3" in completed.stdout
    assert "docker" not in completed.stdout
    assert "rsync" not in completed.stdout


def test_m4_auto_tunnel_prefers_lan_and_falls_back_to_tailscale(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_fake_lsof(fake_bin, port_is_occupied=False)
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text(
        """#!/bin/sh
printf '%s\n' "$*" >> "${FAKE_SSH_LOG}"
case "$*" in
  *192.168.10.200*health/live*) exit "${FAKE_LAN_STATUS:-0}" ;;
  *100.102.170.79*health/live*) exit "${FAKE_TAILSCALE_STATUS:-0}" ;;
esac
sleep 1
""",
        encoding="utf-8",
    )
    fake_ssh.chmod(0o755)
    fake_curl = fake_bin / "curl"
    fake_curl.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    fake_curl.chmod(0o755)

    for lan_status, expected_route, expected_host in (
        ("0", "lan", "muze@192.168.10.200"),
        ("1", "tailscale", "muze@100.102.170.79"),
    ):
        ssh_log = tmp_path / f"{expected_route}.log"
        runtime_env = {
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "FAKE_SSH_LOG": str(ssh_log),
            "FAKE_LAN_STATUS": lan_status,
        }
        completed = subprocess.run(
            ["bash", str(SCRIPT), "tunnel", "--auto"],
            cwd=ROOT,
            env=runtime_env,
            text=True,
            capture_output=True,
            check=True,
        )

        assert f"selected_route={expected_route}" in completed.stdout
        assert f"ssh_target={expected_host}" in completed.stdout
        assert expected_host in ssh_log.read_text(encoding="utf-8").splitlines()[-1]
        assert "127.0.0.1:18010:127.0.0.1:8010" in ssh_log.read_text(
            encoding="utf-8"
        ).splitlines()[-1]


def test_m4_auto_tunnel_fails_when_both_routes_are_unhealthy(tmp_path: Path) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
    fake_ssh.chmod(0o755)
    runtime_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
    }

    completed = subprocess.run(
        ["bash", str(SCRIPT), "tunnel", "--auto"],
        cwd=ROOT,
        env=runtime_env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode != 0
    assert "both LAN and Tailscale" in completed.stderr


def test_m4_tunnel_reports_ready_only_after_local_health_is_usable(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_fake_lsof(fake_bin, port_is_occupied=False)
    event_log = tmp_path / "events.log"
    health_attempts = tmp_path / "health-attempts"
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text(
        """#!/bin/sh
printf 'tunnel-started\n' >> "${FAKE_EVENT_LOG}"
sleep 3
""",
        encoding="utf-8",
    )
    fake_ssh.chmod(0o755)
    fake_curl = fake_bin / "curl"
    fake_curl.write_text(
        """#!/bin/sh
attempts=0
if [ -f "${FAKE_HEALTH_ATTEMPTS}" ]; then
  attempts="$(cat "${FAKE_HEALTH_ATTEMPTS}")"
fi
attempts=$((attempts + 1))
printf '%s\n' "${attempts}" > "${FAKE_HEALTH_ATTEMPTS}"
printf 'health-attempt-%s\n' "${attempts}" >> "${FAKE_EVENT_LOG}"
test "${attempts}" -ge 2
""",
        encoding="utf-8",
    )
    fake_curl.chmod(0o755)
    runtime_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "FAKE_EVENT_LOG": str(event_log),
        "FAKE_HEALTH_ATTEMPTS": str(health_attempts),
        "NPCINK_CLOUD_M4_TUNNEL_READY_TIMEOUT_SECONDS": "5",
    }

    completed = subprocess.run(
        ["bash", str(SCRIPT), "tunnel", "--local-port", "18042"],
        cwd=ROOT,
        env=runtime_env,
        text=True,
        capture_output=True,
        check=True,
        timeout=8,
    )

    assert "tunnel_ready=true" in completed.stdout
    assert "local_health_url=http://127.0.0.1:18042/health/live" in completed.stdout
    assert event_log.read_text(encoding="utf-8").splitlines()[:3] == [
        "tunnel-started",
        "health-attempt-1",
        "health-attempt-2",
    ]


def test_m4_tunnel_does_not_count_an_unowned_existing_health_listener(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    ssh_started = tmp_path / "ssh-started"
    _write_fake_lsof(fake_bin, port_is_occupied=True)
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text(
        '#!/bin/sh\nprintf "started\\n" > "${FAKE_SSH_STARTED}"\nsleep 5\n',
        encoding="utf-8",
    )
    fake_ssh.chmod(0o755)
    fake_curl = fake_bin / "curl"
    fake_curl.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    fake_curl.chmod(0o755)
    runtime_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "FAKE_SSH_STARTED": str(ssh_started),
        "NPCINK_CLOUD_M4_TUNNEL_READY_TIMEOUT_SECONDS": "2",
    }

    completed = subprocess.run(
        ["bash", str(SCRIPT), "tunnel", "--local-port", "18046"],
        cwd=ROOT,
        env=runtime_env,
        text=True,
        capture_output=True,
        check=False,
        timeout=5,
    )

    assert completed.returncode != 0
    assert "local tunnel port 18046 is already in use" in completed.stderr
    assert "tunnel_ready=true" not in completed.stdout
    assert not ssh_started.exists()


def test_m4_browser_preflight_marks_peer_relay_and_low_throughput_not_counted(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_fake_lsof(fake_bin, port_is_occupied=False)
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text(
        """#!/bin/sh
case "$*" in
  *192.168.10.200*health/live*) exit 1 ;;
  *100.102.170.79*health/live*) exit 0 ;;
esac
sleep 2
""",
        encoding="utf-8",
    )
    fake_ssh.chmod(0o755)
    fake_curl = fake_bin / "curl"
    fake_curl.write_text(
        """#!/bin/sh
case "$*" in
  *main-app.js*) printf '32768 262144 206'; exit 0 ;;
  *health/live*) exit 0 ;;
esac
exit 1
""",
        encoding="utf-8",
    )
    fake_curl.chmod(0o755)
    fake_tailscale = fake_bin / "tailscale"
    fake_tailscale.write_text(
        """#!/bin/sh
printf 'pong from preview via peer-relay(example) in 140ms\n'
printf 'direct connection not established\n'
""",
        encoding="utf-8",
    )
    fake_tailscale.chmod(0o755)
    runtime_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "NPCINK_CLOUD_M4_TUNNEL_READY_TIMEOUT_SECONDS": "5",
    }

    completed = subprocess.run(
        [
            "bash",
            str(SCRIPT),
            "tunnel",
            "--auto",
            "--browser-preflight",
            "--local-port",
            "18043",
        ],
        cwd=ROOT,
        env=runtime_env,
        text=True,
        capture_output=True,
        check=True,
        timeout=8,
    )

    assert "selected_route=tailscale" in completed.stdout
    assert "tunnel_ready=true" in completed.stdout
    assert "tailscale_path=peer-relay" in completed.stdout
    assert "browser_transport=degraded" in completed.stdout
    assert "browser_transport_reason=peer-relay,low-throughput" in completed.stdout
    assert "browser_evidence=not_counted" in completed.stdout
    assert "local production Playwright" in completed.stdout
    assert "existing-authenticated Cloudflare" in completed.stdout
    assert "docker" not in completed.stdout
    assert "rsync" not in completed.stdout


def test_m4_browser_preflight_keeps_direct_usable_transport_countable(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_fake_lsof(fake_bin, port_is_occupied=False)
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text(
        """#!/bin/sh
case "$*" in
  *192.168.10.200*health/live*) exit 1 ;;
  *100.102.170.79*health/live*) exit 0 ;;
esac
sleep 2
""",
        encoding="utf-8",
    )
    fake_ssh.chmod(0o755)
    fake_curl = fake_bin / "curl"
    fake_curl.write_text(
        """#!/bin/sh
case "$*" in
  *main-app.js*) printf '131072 262144 206'; exit 0 ;;
  *health/live*) exit 0 ;;
esac
exit 1
""",
        encoding="utf-8",
    )
    fake_curl.chmod(0o755)
    fake_tailscale = fake_bin / "tailscale"
    fake_tailscale.write_text(
        """#!/bin/sh
printf 'pong from preview via DERP(hkg) in 140ms\n'
printf 'pong from preview via 100.102.170.79:41641 in 45ms\n'
""",
        encoding="utf-8",
    )
    fake_tailscale.chmod(0o755)
    runtime_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "NPCINK_CLOUD_M4_TUNNEL_READY_TIMEOUT_SECONDS": "5",
    }

    completed = subprocess.run(
        [
            "bash",
            str(SCRIPT),
            "tunnel",
            "--browser-preflight",
            "--local-port",
            "18044",
        ],
        cwd=ROOT,
        env=runtime_env,
        text=True,
        capture_output=True,
        check=True,
        timeout=8,
    )

    assert "selected_route=configured" in completed.stdout
    assert "tailscale_path=direct" in completed.stdout
    assert "browser_transport=ready" in completed.stdout
    assert "browser_evidence=requires_actual_browser_assertions" in completed.stdout
    assert "browser_evidence=not_counted" not in completed.stdout


def test_m4_tunnel_fails_closed_and_stops_ssh_when_local_health_times_out(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _write_fake_lsof(fake_bin, port_is_occupied=False)
    event_log = tmp_path / "events.log"
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text(
        """#!/bin/sh
trap 'printf "tunnel-stopped\\n" >> "${FAKE_EVENT_LOG}"; exit 0' TERM
printf 'tunnel-started\n' >> "${FAKE_EVENT_LOG}"
while :; do :; done
""",
        encoding="utf-8",
    )
    fake_ssh.chmod(0o755)
    fake_curl = fake_bin / "curl"
    fake_curl.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
    fake_curl.chmod(0o755)
    runtime_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "FAKE_EVENT_LOG": str(event_log),
        "NPCINK_CLOUD_M4_TUNNEL_READY_TIMEOUT_SECONDS": "1",
    }

    completed = subprocess.run(
        ["bash", str(SCRIPT), "tunnel", "--local-port", "18045"],
        cwd=ROOT,
        env=runtime_env,
        text=True,
        capture_output=True,
        check=False,
        timeout=6,
    )

    assert completed.returncode != 0
    assert "did not expose local health within 1s" in completed.stderr
    assert "tunnel_ready=true" not in completed.stdout
    assert event_log.read_text(encoding="utf-8").splitlines() == [
        "tunnel-started",
        "tunnel-stopped",
    ]


def test_m4_test_scopes_are_explicit_and_dry_run_is_non_mutating(
    tmp_path: Path,
) -> None:
    focused = subprocess.run(
        [
            "bash",
            str(SCRIPT),
            "test",
            "--dry-run",
            "--focused",
            "tests/domain/test_commercial_service.py::test_operator_grant",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "test_scope=focused" in focused.stdout
    assert (
        "test_target=tests/domain/test_commercial_service.py::test_operator_grant"
        in focused.stdout
    )
    assert "ssh" not in focused.stdout
    assert "docker" not in focused.stdout

    for scope in ("contract", "domain", "full"):
        completed = subprocess.run(
            ["bash", str(SCRIPT), "test", "--dry-run", f"--{scope}"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        assert f"test_scope={scope}" in completed.stdout
        assert "ssh" not in completed.stdout
        assert "docker" not in completed.stdout

    rejected = subprocess.run(
        ["bash", str(SCRIPT), "test", "--dry-run", "--focused", "../outside.py"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert rejected.returncode != 0
    assert "must stay under tests/" in rejected.stderr

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text("#!/bin/sh\ncat >/dev/null\n", encoding="utf-8")
    fake_ssh.chmod(0o755)
    runtime_env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
    }
    no_target_full = subprocess.run(
        ["bash", str(SCRIPT), "test", "--full"],
        cwd=ROOT,
        env=runtime_env,
        text=True,
        capture_output=True,
        check=True,
    )
    assert "unbound variable" not in no_target_full.stderr


def test_m4_ollama_launch_agent_is_loopback_only_and_dry_run_is_non_mutating() -> None:
    source = OLLAMA_LAUNCH_AGENT.read_text(encoding="utf-8")

    assert "<string>top.mqzj.npcink-ollama-preview</string>" in source
    assert "<string>/usr/local/bin/ollama</string>" in source
    assert "<string>serve</string>" in source
    assert "<string>127.0.0.1:11434</string>" in source
    assert "0.0.0.0" not in source
    assert "<key>RunAtLoad</key>" in source
    assert "<key>KeepAlive</key>" in source

    completed = subprocess.run(
        ["bash", str(SCRIPT), "ollama-install", "--dry-run"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )

    assert "dry-run: install top.mqzj.npcink-ollama-preview" in completed.stdout
    assert "127.0.0.1:11434" in completed.stdout
    assert "docker" not in completed.stdout
    assert "rsync" not in completed.stdout


def test_m4_ollama_ownership_preflight_is_early_and_fail_closed() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")

    preflight = source[
        source.index("remote_ollama_preflight() {") :
        source.index("remote_ollama_install() {")
    ]
    promote = source[
        source.index("promote_accepted_master() {") :
        source.index("probe_tunnel_host() {")
    ]
    main = source[source.index("main() {") :]
    deploy_case = main[main.index("\t\tdeploy)") : main.index("\t\tpromote)")]

    assert "Ollama ownership preflight failed before source transfer" in preflight
    assert "m4:preview:ollama:status" in preflight
    assert "m4:preview:ollama:install" in preflight
    assert "kill " not in preflight
    assert "launchctl kickstart" not in preflight
    assert deploy_case.index("remote_ollama_preflight") < deploy_case.index(
        "upload_and_apply"
    )
    assert promote.index("remote_ollama_preflight") < promote.index(
        "upload_and_apply"
    )
    assert "before source transfer" in runbook
    assert "unknown listener process" in runbook
    assert "MUST be checked before source transfer" in standard
    assert "MUST NOT automatically stop" in standard


def test_m4_deploy_stops_before_packaging_when_ollama_preflight_fails(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_ssh = fake_bin / "ssh"
    fake_ssh.write_text("#!/bin/sh\ncat >/dev/null\nexit 65\n", encoding="utf-8")
    fake_ssh.chmod(0o755)

    completed = subprocess.run(
        ["bash", str(SCRIPT), "deploy"],
        cwd=ROOT,
        env={**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"},
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode == 65
    assert "packaging tracked files" not in completed.stdout
    assert "source revision:" not in completed.stdout


def test_m4_overlay_is_loopback_only_and_starts_the_complete_runtime() -> None:
    overlay = OVERLAY.read_text(encoding="utf-8")
    base = (ROOT / "docker-compose.dev.yml").read_text(encoding="utf-8")

    for binding in (
        "127.0.0.1:${NPCINK_CLOUD_M4_PORT:-8010}:8080",
        "127.0.0.1:${NPCINK_CLOUD_M4_POSTGRES_PORT:-15433}:5432",
        "127.0.0.1:${NPCINK_CLOUD_M4_REDIS_PORT:-16380}:6379",
    ):
        assert binding in overlay

    assert "0.0.0.0:" not in overlay
    assert "npcink-ai-cloud-runtime:m4-dev" in overlay
    assert "npcink-ai-cloud-frontend:m4-dev" in overlay
    assert "NEXT_PUBLIC_ENV: development" in overlay
    assert (
        "NPCINK_CLOUD_FRONTEND_REVISION: "
        "${NPCINK_CLOUD_FRONTEND_REVISION:-unknown}"
        in overlay
    )
    assert (
        "NEXT_PUBLIC_MINI_DEV_HOST_ALLOWLIST: "
        "${NPCINK_CLOUD_M4_MINI_DEV_HOST_ALLOWLIST:-cloud.mqzjmax.top,127.0.0.1,localhost}"
        in overlay
    )
    assert "NPCINK_CLOUD_SETUP_STATE_OVERRIDE: complete" in overlay
    assert (
        overlay.count(
            "NPCINK_CLOUD_SERVICE_SETTINGS_ENCRYPTION_KEY_ID: "
            "${NPCINK_CLOUD_SERVICE_SETTINGS_ENCRYPTION_KEY_ID:-m4-preview-service-v1}"
        )
        == 4
    )
    assert '"node"' in overlay
    assert '"node_modules/next/dist/bin/next"' in overlay
    for service in (
        "postgres",
        "redis",
        "api",
        "frontend",
        "proxy",
        "worker",
        "callback-worker",
        "ops-worker",
    ):
        assert f"  {service}:" in base
    assert base.count("restart: unless-stopped") == 8


def test_m4_log_redactor_masks_env_canaries_and_common_credentials(tmp_path: Path) -> None:
    env_file = tmp_path / ".env.local"
    env_canary = "env-canary-91b7d19e"
    database_canary = "db-canary-b7fe4c9a"
    env_file.write_text(
        f"NPCINK_CLOUD_API_KEY={env_canary}\nNPCINK_CLOUD_DATABASE_URL={database_canary}\n",
        encoding="utf-8",
    )
    raw = (
        f"api_key={env_canary}\n"
        f"database={database_canary}\n"
        "Authorization: Bearer auth-canary-ec78\n"
        "password=plain-canary-09ac\n"
        "required=false\n"
        "postgresql://user-canary:pass-canary@postgres:5432/db?token=query-canary\n"
    )

    completed = subprocess.run(
        [sys.executable, str(REDACTOR), "--env-file", str(env_file)],
        cwd=ROOT,
        input=raw,
        text=True,
        capture_output=True,
        check=True,
    )

    for secret in (
        env_canary,
        database_canary,
        "auth-canary-ec78",
        "plain-canary-09ac",
        "user-canary",
        "pass-canary",
        "query-canary",
    ):
        assert secret not in completed.stdout
    assert "[redacted]" in completed.stdout
    assert "required=false" in completed.stdout


def _load_package_proxy():
    spec = importlib.util.spec_from_file_location("m4_package_proxy", PACKAGE_PROXY)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_m4_package_proxy_is_fixed_destination_and_rewrites_registry_links() -> None:
    proxy = _load_package_proxy()
    pypi = proxy.resolve_route("/pypi/simple/alembic/?x=1")
    npm = proxy.resolve_route("/npm/pnpm")
    npm_binary = proxy.resolve_route("/npm/pnpm/-/pnpm-10.33.0.tgz")

    assert pypi is not None
    assert npm is not None
    assert npm_binary is not None
    assert pypi.upstream_url == "https://pypi.org/simple/alembic/?x=1"
    assert npm.upstream_url == "https://registry.npmjs.org/pnpm"
    assert npm_binary.kind == "npm_binary"
    assert proxy.resolve_route("/https://example.com/private") is None

    public_base = "http://host.docker.internal:18081"
    pypi_body = proxy.rewrite_payload(
        "pypi",
        b'<a href="https://files.pythonhosted.org/packages/a.whl">wheel</a>',
        public_base,
    )
    npm_body = proxy.rewrite_payload(
        "npm",
        b'{"tarball":"https://registry.npmjs.org/pnpm/-/pnpm.tgz"}',
        public_base,
    )
    assert b"http://host.docker.internal:18081/pypi-files/packages/a.whl" in pypi_body
    assert b"http://host.docker.internal:18081/npm/pnpm/-/pnpm.tgz" in npm_body


def test_m4_package_proxy_binds_loopback_and_publishes_readiness(tmp_path: Path) -> None:
    ready_file = tmp_path / "proxy.port"
    process = subprocess.Popen(
        [
            sys.executable,
            str(PACKAGE_PROXY),
            "--bind",
            "127.0.0.1",
            "--port",
            "0",
            "--ready-file",
            str(ready_file),
        ],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        for _attempt in range(100):
            if ready_file.exists() and ready_file.read_text(encoding="utf-8").strip():
                break
            assert process.poll() is None
            time.sleep(0.02)
        port = int(ready_file.read_text(encoding="utf-8").strip())
        with urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as response:
            assert response.status == 200
            assert response.read() == b"ok\n"
    finally:
        process.terminate()
        process.wait(timeout=5)


def test_m4_package_proxy_buffers_and_retries_upstream_downloads() -> None:
    proxy_source = PACKAGE_PROXY.read_text(encoding="utf-8")
    preview_source = SCRIPT.read_text(encoding="utf-8")
    assert "tempfile.SpooledTemporaryFile" in proxy_source
    assert "for attempt in range(1, 4)" in proxy_source
    assert "PackageCache" in proxy_source
    assert "X-Npcink-M4-Cache" in proxy_source
    assert "STREAM_CHUNK_BYTES" in proxy_source
    assert "downstream_disconnects" in proxy_source
    assert 'package_proxy_port="18081"' in preview_source
    assert '--port "${package_proxy_port}"' in preview_source
    assert '--cache-dir "${package_proxy_cache_dir}"' in preview_source
    assert 'package_proxy_cache_max_bytes="2147483648"' in preview_source
    assert "npm_config_fetch_timeout=300000" in preview_source
    assert "npm_config_fetch_retries=4" in preview_source
    assert "npm_config_network_concurrency=8" in preview_source
    assert "id=npcink-ai-cloud-m4-pnpm-store" in preview_source
    assert "-e 's#--timeout 60#--timeout 300#'" in preview_source


class _FakePackageResponse:
    def __init__(
        self,
        payload: bytes,
        on_first_read=None,
        *,
        declared_length: int | None = None,
    ) -> None:
        self.status = 200
        self.headers = {
            "Content-Type": "application/octet-stream",
            "Content-Length": str(
                len(payload) if declared_length is None else declared_length
            ),
        }
        self._chunks = [payload[:3], payload[3:], b""]
        self._on_first_read = on_first_read

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback) -> None:
        return None

    def getcode(self) -> int:
        return self.status

    def read(self, _size: int) -> bytes:
        if self._on_first_read is not None:
            callback = self._on_first_read
            self._on_first_read = None
            callback()
        return self._chunks.pop(0)


class _FakePackageOpener:
    def __init__(self, response_factory) -> None:
        self.response_factory = response_factory
        self.calls = 0

    def open(self, _request, timeout: int):
        assert timeout == 120
        self.calls += 1
        return self.response_factory()


def _new_proxy_handler(proxy, path: str, writer, cache):
    handler = proxy.PackageProxyHandler.__new__(proxy.PackageProxyHandler)
    handler.path = path
    handler.command = "GET"
    handler.requestline = f"GET {path} HTTP/1.1"
    handler.request_version = "HTTP/1.1"
    handler.close_connection = False
    handler.wfile = writer
    handler.cache = cache
    handler.metrics = proxy.PackageProxyMetrics()
    return handler


def test_m4_package_proxy_streams_binary_before_upstream_completion_and_caches(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proxy = _load_package_proxy()
    cache = proxy.PackageCache(
        tmp_path / "cache",
        max_bytes=1024 * 1024,
        max_age_seconds=3600,
    )
    first_writer = io.BytesIO()

    def assert_headers_arrived() -> None:
        assert b"HTTP/1.1 200 OK" in first_writer.getvalue()
        assert b"\r\n\r\n" in first_writer.getvalue()

    opener = _FakePackageOpener(
        lambda: _FakePackageResponse(b"abcdef", assert_headers_arrived)
    )
    monkeypatch.setattr(proxy, "DIRECT_OPENER", opener)

    path = "/npm/example/-/example-1.0.0.tgz"
    first = _new_proxy_handler(proxy, path, first_writer, cache)
    first._serve(send_body=True)
    assert opener.calls == 1
    assert first_writer.getvalue().endswith(b"abcdef")
    assert b"X-Npcink-M4-Cache: miss" in first_writer.getvalue()
    assert not list((tmp_path / "cache").rglob("*.partial"))

    monkeypatch.setattr(
        proxy,
        "DIRECT_OPENER",
        _FakePackageOpener(
            lambda: pytest.fail("cache hit must not open the upstream registry")
        ),
    )
    second_writer = io.BytesIO()
    second = _new_proxy_handler(proxy, path, second_writer, cache)
    second._serve(send_body=True)
    assert b"X-Npcink-M4-Cache: hit" in second_writer.getvalue()
    assert second_writer.getvalue().endswith(b"abcdef")


def test_m4_package_proxy_finishes_atomic_cache_fill_after_client_disconnect(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proxy = _load_package_proxy()
    cache = proxy.PackageCache(
        tmp_path / "cache",
        max_bytes=1024 * 1024,
        max_age_seconds=3600,
    )

    class DisconnectAfterHeaders(io.BytesIO):
        def write(self, payload: bytes) -> int:
            if payload.startswith(b"HTTP/1.1"):
                return super().write(payload)
            raise BrokenPipeError

    path = "/npm/example/-/example-1.0.0.tgz"
    route = proxy.resolve_route(path)
    assert route is not None
    opener = _FakePackageOpener(lambda: _FakePackageResponse(b"abcdef"))
    monkeypatch.setattr(proxy, "DIRECT_OPENER", opener)
    handler = _new_proxy_handler(proxy, path, DisconnectAfterHeaders(), cache)

    handler._serve(send_body=True)

    assert handler.metrics.downstream_disconnects == 1
    cached = cache.lookup(route.upstream_url)
    assert cached is not None
    assert cached.path.read_bytes() == b"abcdef"
    assert not list((tmp_path / "cache").rglob("*.partial"))


def test_m4_package_proxy_rejects_corrupt_or_symlinked_cache_entries(
    tmp_path: Path,
) -> None:
    proxy = _load_package_proxy()
    cache = proxy.PackageCache(
        tmp_path / "cache",
        max_bytes=1024 * 1024,
        max_age_seconds=3600,
    )
    upstream_url = "https://registry.npmjs.org/example/-/example-1.0.0.tgz"
    _key, partial_path, partial = cache.new_partial(upstream_url)
    partial.write(b"abcdef")
    partial.close()
    cache.commit(
        upstream_url,
        partial_path,
        content_type="application/octet-stream",
        content_length=6,
    )
    cached = cache.lookup(upstream_url)
    assert cached is not None
    cached.path.write_bytes(b"bad")

    assert cache.lookup(upstream_url) is None
    assert not cached.path.exists()

    symlink_root = tmp_path / "symlink-cache"
    symlink_root.symlink_to(tmp_path / "cache", target_is_directory=True)
    with pytest.raises(ValueError, match="must not be a symlink"):
        proxy.PackageCache(
            symlink_root,
            max_bytes=1024 * 1024,
            max_age_seconds=3600,
        )


def test_m4_package_proxy_discards_truncated_upstream_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proxy = _load_package_proxy()
    cache = proxy.PackageCache(
        tmp_path / "cache",
        max_bytes=1024 * 1024,
        max_age_seconds=3600,
    )
    path = "/npm/example/-/example-1.0.0.tgz"
    route = proxy.resolve_route(path)
    assert route is not None
    opener = _FakePackageOpener(
        lambda: _FakePackageResponse(b"abcdef", declared_length=7)
    )
    monkeypatch.setattr(proxy, "DIRECT_OPENER", opener)
    handler = _new_proxy_handler(proxy, path, io.BytesIO(), cache)

    handler._serve(send_body=True)

    assert handler.close_connection is True
    assert cache.lookup(route.upstream_url) is None
    assert not list((tmp_path / "cache").rglob("*.partial"))


def test_m4_package_proxy_prunes_partial_and_oldest_cache_entries(
    tmp_path: Path,
) -> None:
    proxy = _load_package_proxy()
    cache_root = tmp_path / "cache"
    cache = proxy.PackageCache(
        cache_root,
        max_bytes=6,
        max_age_seconds=3600,
    )
    first_url = "https://registry.npmjs.org/first/-/first-1.0.0.tgz"
    second_url = "https://registry.npmjs.org/second/-/second-1.0.0.tgz"

    _key, first_partial_path, first_partial = cache.new_partial(first_url)
    first_partial.write(b"1111")
    first_partial.close()
    cache.commit(
        first_url,
        first_partial_path,
        content_type="application/octet-stream",
        content_length=4,
    )
    first = cache.lookup(first_url)
    assert first is not None
    old_time = time.time() - 60
    os.utime(first.path, (old_time, old_time))

    _key, second_partial_path, second_partial = cache.new_partial(second_url)
    second_partial.write(b"2222")
    second_partial.close()
    cache.commit(
        second_url,
        second_partial_path,
        content_type="application/octet-stream",
        content_length=4,
    )

    assert cache.lookup(first_url) is None
    second = cache.lookup(second_url)
    assert second is not None
    assert second.path.read_bytes() == b"2222"

    _key, abandoned_path, abandoned = cache.new_partial(
        "https://registry.npmjs.org/abandoned/-/abandoned-1.0.0.tgz"
    )
    abandoned.write(b"partial")
    abandoned.close()
    assert abandoned_path.exists()

    proxy.PackageCache(
        cache_root,
        max_bytes=6,
        max_age_seconds=3600,
    )
    assert not abandoned_path.exists()


def test_m4_runbook_preserves_source_cloudflare_and_recovery_boundaries() -> None:
    runbook = RUNBOOK.read_text(encoding="utf-8")

    assert "source and Git truth" in runbook
    assert "No day-to-day Docker installation" in runbook
    assert "does not authorize a production deploy" in runbook
    assert "Cloudflare DNS, Access, or Tunnel change" in runbook
    assert "127.0.0.1:8010" in runbook
    assert "127.0.0.1:15433" in runbook
    assert "127.0.0.1:16380" in runbook
    assert "docker system prune" in runbook
    assert "m4:preview:recover" in runbook
    assert "m4:preview:tunnel" in runbook
    assert "five working days" in runbook
    assert "Docker Desktop 4.83.0" in runbook
    assert "m4:preview:stop" in runbook
    assert "last known-good Git revision" in runbook
    assert "portal-demo@example.com" in runbook
    assert "https://cloud.mqzjmax.top/portal/dev-entry" in runbook
    assert "shared development identity" in runbook
    assert "Candidate and Accepted States" in runbook
    assert "pnpm run m4:preview:promote -- --pr" in runbook
    assert "acceptance_state=accepted" in runbook
    assert "failed Docker query is not treated as an absent volume" in runbook
    assert "deliberately stops the application services" in runbook
    assert "fully extracted incoming tree" in runbook
    assert "same-directory incoming file" in runbook
    assert "never an rsync partial" in runbook
    assert "previous running services" in runbook
    assert "receives no M4 SSH credential" in runbook
    assert "m4:preview:test -- --focused" in runbook
    assert "GitHub required" in runbook
    assert "checks are the merge authority" in runbook
    assert "same revision" in runbook
    assert "tunnel_ready=true" in runbook
    assert "NPCINK_CLOUD_M4_TUNNEL_READY_TIMEOUT_SECONDS" in runbook
    assert "pnpm run m4:preview:auto -- --browser-preflight" in runbook
    assert "browser_transport=degraded" in runbook
    assert "browser_evidence=not_counted" in runbook
    assert "transport classification, not a product failure" in runbook
    assert "local production Playwright" in runbook
    assert "existing-authenticated Cloudflare browser" in runbook
    assert "do not silently treat either as an automatic substitute" in runbook
    assert "source bundle intentionally omits `.git`" in runbook
    assert "Private Source Relay Contract" in runbook
    assert "root@100.90.87.36" in runbook
    assert "NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct" in runbook
    assert "does not become source or Git truth" in runbook
    assert "AI checkpoint rule" in runbook
    assert "coherent task checkpoint" in runbook
    assert "does not authorize an unreported" in runbook
    assert "~/.cache/npcink-ai-cloud-m4-dev/package-proxy" in runbook
    assert "at most 2 GiB" in runbook
    assert "unused for 14 days" in runbook
    assert "disposable build optimization" in runbook


def test_m4_package_proxy_decision_is_linked_measured_and_bounded() -> None:
    decision = PACKAGE_PROXY_ADR.read_text(encoding="utf-8")
    validation = PACKAGE_PROXY_VALIDATION.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    decision_name = "027-m4-package-proxy-streaming-cache.md"
    validation_name = "m4-package-proxy-streaming-cache-validation-2026-07-25.md"

    for document in (runbook, standard, readme):
        assert decision_name in document
    for document in (runbook, readme):
        assert validation_name in document
    assert "whole-body buffering" in decision
    assert "2 GiB" in decision
    assert "14 days" in decision
    assert "not source or Git truth" in decision
    assert "remove only" in decision
    assert "42,303,110" in validation
    assert "12.07 seconds" in validation
    assert "M4 candidate" in validation
    assert "package proxy cache documented in ADR-027" in agents


def test_m4_ai_development_standard_is_actionable_and_linked() -> None:
    standard = AI_STANDARD.read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    standard_path = "docs/m4-preview-ai-development-standard-v1.md"

    assert standard_path in agents
    assert standard_path in readme
    assert "m4-preview-ai-development-standard-v1.md" in runbook

    for required_text in (
        "Local-only",
        "Cloud source",
        "Build/runtime",
        "M4 MUST NOT become source or Git truth",
        "WordPress remains the local control plane",
        "pnpm run m4:preview:sync",
        "pnpm run m4:preview:deploy",
        "pnpm run m4:preview:promote -- --pr",
        "pnpm run m4:preview:test",
        "m4:preview:test -- --focused",
        "GitHub required checks",
        "same full contract/domain gate",
        "focused bug-fix feedback loop",
        "http://127.0.0.1:18010",
        "https://cloud.mqzjmax.top",
        "acceptance_state=accepted",
        "source_branch=master",
        "source_dirty=false",
        "under two minutes",
        "under ten minutes per",
        "report candidate validation as accepted completion",
        "Default task-checkpoint dispatch",
        "MUST NOT wait for a second user message",
        "per-save watcher",
        "MUST NOT become the fallback Cloud Docker runtime",
    ):
        assert required_text in standard


def test_m4_validation_authority_decision_is_linked_and_bounded() -> None:
    decision = VALIDATION_ADR.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    decision_path = "decisions/024-risk-tiered-development-validation-authority.md"

    assert decision_path in standard
    assert "024-risk-tiered-development-validation-authority.md" in readme
    assert "M4 Preview" in decision
    assert "GitHub required checks are the repository merge authority" in decision
    assert "must not be repeated for one revision" in decision
    assert "does not authorize production" in decision


def test_m4_checkpoint_dispatch_decision_is_linked_and_bounded() -> None:
    decision = CHECKPOINT_ADR.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    decision_name = "025-source-only-authoring-and-ai-m4-checkpoint-dispatch.md"

    assert decision_name in standard
    assert decision_name in runbook
    assert decision_name in readme
    assert "coherent task checkpoint" in agents
    assert "without waiting for the user to ask again" in agents
    assert "M4 is the routine Cloud Docker environment" in decision
    assert "without waiting for a second deployment request" in decision
    assert "does not silently fall back to local Docker" in decision
    assert "does not authorize\nproduction deployment" in decision
    assert "per-save watchers" in decision
    assert "GitHub-hosted M4 credentials" in decision


def test_m4_private_source_relay_decision_and_validation_are_linked() -> None:
    decision = SOURCE_RELAY_ADR.read_text(encoding="utf-8")
    validation = SOURCE_RELAY_VALIDATION.read_text(encoding="utf-8")
    standard = AI_STANDARD.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    decision_name = "026-private-source-relay-transfer.md"

    assert decision_name in standard
    assert decision_name in runbook
    assert decision_name in readme
    assert "Tailscale-only source relay" in agents
    assert "does not become source or Git truth" in decision
    assert "explicit direct fallback" in decision
    assert "4,823,040" in validation
    assert "18 seconds" in validation
    assert "SHA-256" in validation
