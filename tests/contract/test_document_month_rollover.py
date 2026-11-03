import runpy
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("month", [(2026, 10), (2026, 11)])
def test_retained_documents_survive_october_november_rollover(month: tuple[int, int]) -> None:
    check = runpy.run_path(str(ROOT / "scripts/check_doc_reachability.py"))
    assert check["root_dated_violations"](month) == []


def test_unreviewed_previous_month_document_still_fails(tmp_path: Path, monkeypatch) -> None:
    check = runpy.run_path(str(ROOT / "scripts/check_doc_reachability.py"))
    checker = check["root_dated_violations"]
    entry = tmp_path / "README.md"
    entry.write_text("## Dated Active-document Review\n\n- [Kept](kept-2026-10-01.md)\n")
    kept = tmp_path / "kept-2026-10-01.md"
    kept.write_text("Retained active authority")
    missing = tmp_path / "unreviewed-2026-10-31.md"
    missing.write_text("Needs a retention decision")
    monkeypatch.setitem(checker.__globals__, "DOCS", tmp_path)
    monkeypatch.setitem(checker.__globals__, "ENTRY", entry)
    assert checker((2026, 10)) == []
    assert checker((2026, 11)) == [missing]
