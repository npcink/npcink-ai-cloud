from __future__ import annotations

import hashlib
import io

import pytest
from PIL import Image

from app.domain.media_derivatives import processor
from app.domain.media_derivatives.errors import MediaDerivativeOutputTooLargeError


def _png_bytes() -> bytes:
    image = Image.new("RGB", (2, 2), color="red")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _large_image_bytes(*, mode: str = "RGB", icc_profile: bytes | None = None) -> bytes:
    color = (24, 96, 160, 128) if mode == "RGBA" else (24, 96, 160)
    image = Image.new(mode, (320, 240), color=color)
    output = io.BytesIO()
    image.save(output, format="PNG", icc_profile=icc_profile)
    return output.getvalue()


def test_derivative_output_over_delivery_envelope_fails_before_publication(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(processor, "MAX_DELIVERABLE_ARTIFACT_BYTES", 8)
    monkeypatch.setattr(
        processor,
        "_save_image",
        lambda *args, **kwargs: (b"x" * 9, "image/png", "png"),
    )

    with pytest.raises(MediaDerivativeOutputTooLargeError) as raised:
        processor.process_media_derivative(
            source_bytes=_png_bytes(),
            source_media_type="image",
            target_format="png",
            max_width=2,
            quality=80,
        )

    assert raised.value.status_code == 413
    assert raised.value.error_code == "media_derivative.output_too_large"


def test_derivative_records_decoded_source_and_output_facts() -> None:
    source = _png_bytes()

    result = processor.process_media_derivative(
        source_bytes=source,
        source_media_type="image",
        target_format="png",
        max_width=2,
        quality=80,
    )

    facts = result.transform_facts
    assert facts["source_checksum"] == f"sha256:{hashlib.sha256(source).hexdigest()}"
    assert facts["output_checksum"] == result.checksum
    assert facts["source_format"] == "png"
    assert facts["output_format"] == "png"
    assert facts["source_mime_type"] == "image/png"
    assert facts["output_mime_type"] == "image/png"
    assert (facts["source_width"], facts["source_height"]) == (2, 2)
    assert (facts["output_width"], facts["output_height"]) == (2, 2)
    assert facts["source_filesize_bytes"] == len(source)
    assert facts["output_filesize_bytes"] == len(result.output_bytes)
    assert facts["source_frame_count"] == 1
    assert facts["output_frame_count"] == 1
    assert facts["decodable"] is True
    assert facts["encoding_mode"] == "lossless"
    assert facts["crop_applied"] is False
    assert facts["watermark_applied"] is False
    assert facts["resize_applied"] is False


def test_derivative_records_semantic_transform_risk_facts() -> None:
    image = Image.new("RGBA", (8, 4), color=(255, 0, 0, 128))
    output = io.BytesIO()
    image.save(output, format="PNG")

    result = processor.process_media_derivative(
        source_bytes=output.getvalue(),
        source_media_type="image",
        target_format="jpeg",
        max_width=2,
        quality=80,
        crop_options={"type": "aspect_ratio", "ratio_width": 1, "ratio_height": 1},
        watermark_options={"type": "text", "text": "Review"},
    )

    facts = result.transform_facts
    assert facts["source_has_alpha"] is True
    assert facts["output_has_alpha"] is False
    assert facts["alpha_preserved"] is False
    assert facts["crop_applied"] is True
    assert facts["watermark_applied"] is True
    assert facts["resize_applied"] is True
    assert facts["encoding_mode"] == "lossy"


def test_auto_safe_opaque_chooses_smallest_qualified_candidate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        processor,
        "_ssim_score",
        lambda _reference, candidate: 0.99 if len(candidate) > 0 else 0.0,
    )

    result = processor.process_media_derivative(
        source_bytes=_large_image_bytes(),
        source_media_type="image",
        target_format="webp",
        max_width=1920,
        quality=82,
        resize_mode="preserve",
        optimization_mode="auto_safe",
        optimization_profile="auto_safe.v1",
    )

    facts = result.transform_facts
    assert facts["optimization_profile"] == "auto_safe.v1"
    assert facts["source_class"] == "opaque"
    assert facts["effective_quality"] in (82, 88)
    assert facts["quality_metric"] == "ssim"
    assert facts["quality_score"] >= 0.985
    assert facts["quality_threshold"] == 0.985
    assert facts["qualified"] is True
    assert facts["decision_reasons"] == ["qualified"]


def test_auto_safe_transparent_requires_lossless_pixel_equality() -> None:
    result = processor.process_media_derivative(
        source_bytes=_large_image_bytes(mode="RGBA"),
        source_media_type="image",
        target_format="webp",
        max_width=1920,
        quality=82,
        resize_mode="preserve",
        optimization_mode="auto_safe",
        optimization_profile="auto_safe.v1",
    )

    facts = result.transform_facts
    assert facts["source_class"] == "transparent"
    assert facts["effective_quality"] is None
    assert facts["quality_metric"] == "pixel_equality"
    assert facts["quality_score"] == 1.0
    assert facts["encoding_mode"] == "lossless"
    assert facts["qualified"] is True


def test_auto_safe_rejects_quality_and_savings_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(processor, "_ssim_score", lambda _reference, _candidate: 0.9)

    result = processor.process_media_derivative(
        source_bytes=_png_bytes(),
        source_media_type="image",
        target_format="webp",
        max_width=1920,
        quality=82,
        resize_mode="preserve",
        optimization_mode="auto_safe",
        optimization_profile="auto_safe.v1",
    )

    facts = result.transform_facts
    assert facts["qualified"] is False
    assert "quality_threshold_not_met" in facts["decision_reasons"]
    assert "minimum_savings_not_met" in facts["decision_reasons"]


def test_auto_safe_resizes_only_when_requested() -> None:
    source = Image.new("RGB", (2000, 1000), color="navy")
    output = io.BytesIO()
    source.save(output, format="PNG")

    result = processor.process_media_derivative(
        source_bytes=output.getvalue(),
        source_media_type="image",
        target_format="webp",
        max_width=1920,
        quality=82,
        resize_mode="fit",
        optimization_mode="auto_safe",
        optimization_profile="auto_safe.v1",
    )

    assert (result.width, result.height) == (1920, 960)
    assert result.transform_facts["resize_applied"] is True


def test_auto_safe_marks_invalid_embedded_profile_unqualified() -> None:
    result = processor.process_media_derivative(
        source_bytes=_large_image_bytes(icc_profile=b"not-an-icc-profile"),
        source_media_type="image",
        target_format="webp",
        max_width=1920,
        quality=82,
        resize_mode="preserve",
        optimization_mode="auto_safe",
        optimization_profile="auto_safe.v1",
    )

    assert result.transform_facts["qualified"] is False
    assert "color_profile_normalization_failed" in result.transform_facts["decision_reasons"]
