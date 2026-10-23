from app.core.error_taxonomy import get_error_taxonomy
from app.domain.runtime.models import (
    RUNTIME_DIAGNOSTIC_RUNNING_STALE_AFTER_SECONDS,
    RUNTIME_INLINE_RUN_LEASE_SECONDS,
    RUNTIME_STALE_RUNNING_AUTO_FAIL_AFTER_SECONDS,
    RUNTIME_STALE_RUNNING_AUTO_FAIL_ERROR_CODE,
)


def test_auto_fail_grace_is_longer_than_diagnostics_and_admission_lease() -> None:
    assert RUNTIME_STALE_RUNNING_AUTO_FAIL_AFTER_SECONDS == 1800
    assert (
        RUNTIME_STALE_RUNNING_AUTO_FAIL_AFTER_SECONDS
        > RUNTIME_DIAGNOSTIC_RUNNING_STALE_AFTER_SECONDS
    )
    assert RUNTIME_STALE_RUNNING_AUTO_FAIL_AFTER_SECONDS > RUNTIME_INLINE_RUN_LEASE_SECONDS


def test_auto_fail_error_code_is_non_retryable_and_not_fallback_eligible() -> None:
    entry = get_error_taxonomy(RUNTIME_STALE_RUNNING_AUTO_FAIL_ERROR_CODE)
    assert entry.error_stage == "runtime"
    assert entry.retryable is False
    assert entry.fallback_eligible is False
