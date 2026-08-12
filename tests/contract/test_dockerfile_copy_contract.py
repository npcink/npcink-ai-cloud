from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check-dockerfile-copy-contract.py"


def _module():
    spec = importlib.util.spec_from_file_location("dockerfile_copy_contract", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_production_dockerfiles_have_only_existing_local_copy_sources() -> None:
    result = _module().check(ROOT, ("Dockerfile", "frontend/Dockerfile"))
    assert result["status"] == "passed"
    assert len(result["local_copy_sources"]) >= 20


def test_missing_copy_source_fails_before_build(tmp_path: Path) -> None:
    module = _module()
    (tmp_path / "Dockerfile").write_text("FROM scratch\nCOPY missing.txt /app/missing.txt\n")
    with pytest.raises(module.CopyContractError, match="missing local COPY source"):
        module.check(tmp_path, ("Dockerfile",))


@pytest.mark.parametrize("option", ("--chown=app:app", "--chmod=0755", "--link"))
def test_copy_options_do_not_bypass_missing_source_check(
    tmp_path: Path, option: str
) -> None:
    module = _module()
    (tmp_path / "Dockerfile").write_text(
        f"FROM scratch\nCOPY {option} missing.txt /app/missing.txt\n"
    )
    with pytest.raises(module.CopyContractError, match="missing local COPY source"):
        module.check(tmp_path, ("Dockerfile",))


def test_copy_from_stage_is_not_a_local_context_requirement(tmp_path: Path) -> None:
    module = _module()
    (tmp_path / "Dockerfile").write_text(
        "FROM scratch AS builder\nCOPY --from=builder /opt/venv /opt/venv\n"
    )
    result = module.check(tmp_path, ("Dockerfile",))
    assert result["local_copy_sources"] == []


def test_context_escape_fails_closed(tmp_path: Path) -> None:
    module = _module()
    (tmp_path / "Dockerfile").write_text("FROM scratch\nCOPY ../outside /app/outside\n")
    with pytest.raises(module.CopyContractError, match="escapes build context"):
        module.check(tmp_path, ("Dockerfile",))
