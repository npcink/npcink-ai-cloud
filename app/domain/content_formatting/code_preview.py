from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from threading import BoundedSemaphore
from typing import Any

from app.domain.runtime.errors import RuntimeExecutionContractError
from app.domain.runtime.models import RuntimeRequest

ABILITY = "npcink-toolbox/format-code-block"
REQUEST_CONTRACT = "code_format_request.v1"
PROFILE = "content-format.managed"
EXECUTION_KIND = "content_format"
MAX_CODE_BYTES = 16_384
MAX_CANDIDATE_BYTES = 65_536
LANGUAGES = {"javascript", "css", "json"}
RUNNER = Path(__file__).resolve().parent / "code_formatter" / "format.mjs"
_SLOTS = BoundedSemaphore(2)


def validate_code_preview(request: RuntimeRequest, environment: str) -> tuple[str, str, str]:
    if (
        request.ability_name != ABILITY
        or request.contract_version != REQUEST_CONTRACT
        or request.profile_id != PROFILE
        or request.execution_kind != EXECUTION_KIND
        or request.ability_family != "text"
        or request.channel != "editor"
        or request.data_classification != "pii"
        or request.execution_pattern != "inline"
        or request.storage_mode != "no_store"
        or request.skill_id
        or request.workflow_id
        or request.canonical_run_id
        or request.callback_url
        or request.task_backend
        or request.retry_max
        or request.retention_ttl
        or request.timeout_seconds != 10
    ):
        raise RuntimeExecutionContractError(
            "code_format.invalid_contract", "Invalid code preview contract"
        )
    payload = request.input_payload
    code = payload.get("code")
    language = payload.get("language")
    if (
        set(payload) != {"code", "language", "source_sha256"}
        or not isinstance(language, str)
        or language not in LANGUAGES
        or not isinstance(code, str)
        or not code.strip()
        or "\0" in code
    ):
        raise RuntimeExecutionContractError(
            "code_format.invalid_input", "Invalid code preview input"
        )
    try:
        encoded = code.encode("utf-8")
    except UnicodeEncodeError as error:
        raise RuntimeExecutionContractError(
            "code_format.invalid_input", "Invalid code encoding"
        ) from error
    if (
        len(encoded) > MAX_CODE_BYTES
        or hashlib.sha256(encoded).hexdigest() != payload["source_sha256"]
    ):
        raise RuntimeExecutionContractError(
            "code_format.invalid_input", "Invalid code size or digest"
        )
    node = shutil.which("node")
    if (
        environment.strip().lower() not in {"development", "test"}
        or os.environ.get("NPCINK_CODE_FORMAT_PILOT") != "1"
        or not node
        or not (RUNNER.parent / "node_modules/prettier/package.json").is_file()
    ):
        raise RuntimeExecutionContractError(
            "code_format.unavailable", "Code preview is unavailable"
        )
    return code, language, str(Path(node).resolve())


def format_code_preview(code: str, language: str, node: str) -> dict[str, Any]:
    if not _SLOTS.acquire(blocking=False):
        raise RuntimeExecutionContractError("code_format.busy", "Code preview is busy")
    try:
        outcome = subprocess.run(
            [node, "--max-old-space-size=96", str(RUNNER), language],
            input=code.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            env={},
            timeout=5,
            check=True,
        )
        output = json.loads(outcome.stdout)
        if output is not None and (
            not isinstance(output, str)
            or not output.strip()
            or "\0" in output
            or len(output.encode("utf-8")) > MAX_CANDIDATE_BYTES
        ):
            output = None
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        raise RuntimeExecutionContractError(
            "code_format.unavailable", "Code preview is unavailable"
        ) from error
    finally:
        _SLOTS.release()
    status = "SKIPPED" if output is None else ("UNCHANGED" if output == code else "CHANGED")
    candidate = code if output is None else output
    return {
        "contract_version": "code_format_candidate.v1",
        "language": language,
        "source_sha256": hashlib.sha256(code.encode("utf-8")).hexdigest(),
        "candidate_sha256": hashlib.sha256(candidate.encode("utf-8")).hexdigest(),
        "candidate": candidate,
        "status": status,
        "direct_wordpress_write": False,
    }
