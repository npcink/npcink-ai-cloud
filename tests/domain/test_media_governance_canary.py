from __future__ import annotations

import io

import pytest
from PIL import Image
from pydantic import ValidationError

from app.domain.media_derivatives.contracts import MediaJobRequest
from app.domain.media_derivatives.processor import MediaDerivativeResult, process_media_derivative
from app.domain.media_governance.service import build_media_governance_canary_result


def _governance() -> dict[str, object]:
    return {
        "contract_version": "media_governance_canary.v1",
        "candidate_id": "mgc_0123456789abcdef01234567",
        "snapshot_id": "scan_20260831",
        "source_sha256": f"sha256:{'a' * 64}",
        "evidence_revision": "refs_20260831",
        "minimum_savings_basis_points": 1500,
        "require_dimensions_unchanged": True,
        "skip_if_not_beneficial": True,
        "retain_originals": True,
    }


def _job_payload() -> dict[str, object]:
    return {
        "request_contract_version": "media_job_request.v1",
        "operation": "image.transform.v1",
        "source_artifact_id": "art_0123456789abcdef0123456789abcdef",
        "params": {
            "target_format": "webp",
            "max_width": 16,
            "resize_mode": "preserve",
            "quality": 82,
            "source_media_type": "image",
        },
        "batch_context": {
            "batch_id": "media-governance-canary",
            "item_index": 1,
            "item_count": 10,
            "chunk_size": 10,
        },
        "governance": _governance(),
        "result_ttl_minutes": 30,
    }


def _derivative(*, output_bytes: int, width: int = 800, height: int = 600) -> MediaDerivativeResult:
    return MediaDerivativeResult(
        output_bytes=b"x" * output_bytes,
        width=width,
        height=height,
        filesize_bytes=output_bytes,
        checksum=f"sha256:{'b' * 64}",
        mime_type="image/webp",
        format="webp",
        source_width=800,
        source_height=600,
    )


def _source(*, filesize_bytes: int = 1_000_000) -> dict[str, object]:
    return {
        "artifact_id": "art_0123456789abcdef0123456789abcdef",
        "format": "png",
        "mime_type": "image/png",
        "width": 800,
        "height": 600,
        "filesize_bytes": filesize_bytes,
        "checksum": f"sha256:{'a' * 64}",
    }


def test_canary_contract_requires_preserve_webp_and_at_most_ten_items() -> None:
    MediaJobRequest.model_validate(_job_payload())

    for mutate in ("resize", "format", "count", "watermark"):
        payload = _job_payload()
        params = payload["params"]
        batch = payload["batch_context"]
        assert isinstance(params, dict)
        assert isinstance(batch, dict)
        if mutate == "resize":
            params["resize_mode"] = "fit"
        elif mutate == "format":
            params["target_format"] = "jpeg"
        elif mutate == "count":
            batch["item_count"] = 11
        else:
            params["watermark"] = {"type": "text", "text": "preview"}
        with pytest.raises(ValidationError):
            MediaJobRequest.model_validate(payload)


def test_preserve_resize_mode_keeps_source_dimensions() -> None:
    image = Image.new("RGB", (320, 120), color="red")
    stream = io.BytesIO()
    image.save(stream, format="PNG")

    result = process_media_derivative(
        source_bytes=stream.getvalue(),
        source_media_type="image",
        target_format="webp",
        max_width=16,
        quality=82,
        resize_mode="preserve",
    )

    assert (result.source_width, result.source_height) == (320, 120)
    assert (result.width, result.height) == (320, 120)


@pytest.mark.parametrize(
    ("source_bytes", "output_bytes", "width", "expected_reason"),
    [
        (1_000_000, 900_000, 800, "minimum_savings_not_met"),
        (1_000_000, 1_050_000, 800, "output_not_smaller"),
        (1_000_000, 700_000, 799, "dimensions_changed"),
        (500_000, 300_000, 800, "below_minimum_source_bytes"),
    ],
)
def test_canary_skips_unqualified_output_without_derivative(
    source_bytes: int,
    output_bytes: int,
    width: int,
    expected_reason: str,
) -> None:
    result = build_media_governance_canary_result(
        governance=_governance(),
        source=_source(filesize_bytes=source_bytes),
        derivative_result=_derivative(output_bytes=output_bytes, width=width),
        derivative_artifact=None,
    )

    assert result["status"] == "skipped"
    assert result["derivative"] is None
    assert result["write_posture"] == "no_artifact"
    assert expected_reason in result["validation"]["reasons"]


def test_canary_skips_source_format_outside_audited_jpg_png_scope() -> None:
    source = _source()
    source["format"] = "webp"
    result = build_media_governance_canary_result(
        governance=_governance(),
        source=source,
        derivative_result=_derivative(output_bytes=700_000),
        derivative_artifact=None,
    )

    assert result["status"] == "skipped"
    assert "source_format_not_supported" in result["validation"]["reasons"]


def test_canary_qualified_result_wraps_existing_derivative_contract() -> None:
    derivative = {
        "contract_version": "media_derivative_result.v1",
        "artifact_type": "media_derivative_artifact",
        "artifact": {"artifact_id": "art_qualified"},
    }
    result = build_media_governance_canary_result(
        governance=_governance(),
        source=_source(),
        derivative_result=_derivative(output_bytes=700_000),
        derivative_artifact=derivative,
    )

    assert result["contract_version"] == "media_governance_canary_result.v1"
    assert result["status"] == "ready"
    assert result["validation"]["qualified"] is True
    assert result["derivative"] is derivative
    assert result["preview_only"] is True
    assert result["direct_wordpress_write"] is False
