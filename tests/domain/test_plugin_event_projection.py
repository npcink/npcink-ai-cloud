from __future__ import annotations

from datetime import UTC, datetime

from app.domain.observability.plugin_event_projection import (
    _attention_key,
    _format_datetime,
    _hour_floor,
    _is_safe_scalar,
    _parse_datetime,
    _success_rate,
)


def test_datetime_projection_normalizes_utc_and_invalid_values() -> None:
    value = datetime(2026, 9, 9, 12, 34, tzinfo=UTC)
    assert _parse_datetime('2026-09-09T20:34:00+08:00') == value
    assert _format_datetime(value) == '2026-09-09T12:34:00Z'
    assert _parse_datetime('invalid') is None
    assert _hour_floor(value.replace(minute=34)) == value.replace(minute=0)


def test_scalar_and_rate_helpers_keep_telemetry_contract() -> None:
    assert _is_safe_scalar(None)
    assert _is_safe_scalar('ok')
    assert _is_safe_scalar(3)
    assert not _is_safe_scalar({'raw': 'payload'})
    assert _success_rate(10, 2) == 0.8
    assert _success_rate(0, 0) == 0.0


def test_attention_key_is_stable_and_scope_sensitive() -> None:
    first = _attention_key(code='error', site_id='site-a', plugin_slug='addon')
    same = _attention_key(code='error', site_id='site-a', plugin_slug='addon')
    other_site = _attention_key(code='error', site_id='site-b', plugin_slug='addon')
    assert first == same
    assert first != other_site
