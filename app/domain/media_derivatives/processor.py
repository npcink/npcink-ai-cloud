from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from io import BytesIO
from typing import Any, cast

from PIL import Image, ImageChops, ImageCms, ImageColor, ImageDraw, ImageFont, ImageStat

from app.domain.media_derivatives.contracts import (
    MAX_DELIVERABLE_ARTIFACT_BYTES,
    MAX_IMAGE_DIMENSION,
    MAX_PIXEL_COUNT,
    MIME_TYPE_BY_FORMAT,
    PILLOW_FORMAT_BY_TARGET,
)
from app.domain.media_derivatives.errors import (
    MediaDerivativeAnimatedSourceUnavailableError,
    MediaDerivativeFormatUnavailableError,
    MediaDerivativeOutputTooLargeError,
    MediaDerivativeProcessingFailedError,
    MediaDerivativeSourceDecodeFailedError,
    MediaDerivativeSourceTooLargeError,
)

DEFAULT_ORIGINAL_FORMAT = "png"
RESAMPLE_LANCZOS = Image.Resampling.LANCZOS
AUTO_SAFE_PROFILE = "auto_safe.v1"
AUTO_SAFE_QUALITY_CANDIDATES = (88, 82)
AUTO_SAFE_QUALITY_THRESHOLD = 0.985
AUTO_SAFE_MINIMUM_SAVINGS_BASIS_POINTS = 1500


@dataclass(slots=True)
class MediaDerivativeResult:
    output_bytes: bytes
    width: int
    height: int
    filesize_bytes: int
    checksum: str
    mime_type: str
    format: str
    source_width: int = 0
    source_height: int = 0
    processing_warnings: list[str] = field(default_factory=list)
    transform_facts: dict[str, Any] = field(default_factory=dict)


def _check_format_available(target_format: str) -> None:
    pillow_format = PILLOW_FORMAT_BY_TARGET.get(target_format)
    if pillow_format is None:
        return
    try:
        Image.init()
        if pillow_format not in Image.SAVE:
            raise MediaDerivativeFormatUnavailableError(target_format)
    except MediaDerivativeFormatUnavailableError:
        raise
    except Exception:
        raise MediaDerivativeFormatUnavailableError(target_format) from None


def _open_static_image(image_bytes: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(image_bytes)) as probe:
            if (
                probe.width < 1
                or probe.height < 1
                or probe.width > MAX_IMAGE_DIMENSION
                or probe.height > MAX_IMAGE_DIMENSION
                or probe.width * probe.height > MAX_PIXEL_COUNT
            ):
                raise MediaDerivativeSourceTooLargeError()
            if int(getattr(probe, "n_frames", 1)) > 1:
                raise MediaDerivativeAnimatedSourceUnavailableError()
            probe.verify()
    except (
        MediaDerivativeAnimatedSourceUnavailableError,
        MediaDerivativeSourceTooLargeError,
    ):
        raise
    except Image.DecompressionBombError:
        raise MediaDerivativeSourceTooLargeError() from None
    except Exception:
        raise MediaDerivativeSourceDecodeFailedError() from None

    img = Image.open(BytesIO(image_bytes))
    if (
        img.width < 1
        or img.height < 1
        or img.width > MAX_IMAGE_DIMENSION
        or img.height > MAX_IMAGE_DIMENSION
        or img.width * img.height > MAX_PIXEL_COUNT
    ):
        img.close()
        raise MediaDerivativeSourceTooLargeError()
    if hasattr(img, "n_frames") and getattr(img, "n_frames", 1) > 1:
        img.close()
        raise MediaDerivativeAnimatedSourceUnavailableError()
    img.load()
    return img


def _has_alpha(image: Image.Image) -> bool:
    return image.mode in {"RGBA", "LA"} or "transparency" in image.info


def _decoded_facts(image_bytes: bytes) -> dict[str, Any]:
    image = _open_static_image(image_bytes)
    try:
        return {
            "checksum": f"sha256:{hashlib.sha256(image_bytes).hexdigest()}",
            "format": str(image.format or "").lower(),
            "mime_type": MIME_TYPE_BY_FORMAT.get(str(image.format or "").lower(), ""),
            "width": int(image.width),
            "height": int(image.height),
            "filesize_bytes": len(image_bytes),
            "frame_count": int(getattr(image, "n_frames", 1)),
            "has_alpha": _has_alpha(image),
            "decodable": True,
        }
    finally:
        image.close()


def _normalize_embedded_profile(image: Image.Image) -> tuple[Image.Image, bool, bool]:
    profile = image.info.get("icc_profile")
    if not profile:
        return image, False, False
    try:
        source_profile = ImageCms.ImageCmsProfile(BytesIO(profile))
        srgb_profile = ImageCms.createProfile("sRGB")
        if _has_alpha(image):
            alpha = image.convert("RGBA").getchannel("A")
            converted_rgb = ImageCms.profileToProfile(
                image.convert("RGB"), source_profile, srgb_profile, outputMode="RGB"
            )
            if converted_rgb is None:
                raise ValueError("ICC profile conversion returned no image")
            converted = converted_rgb.convert("RGBA")
            converted.putalpha(alpha)
        else:
            converted_candidate = ImageCms.profileToProfile(
                image.convert("RGB"), source_profile, srgb_profile, outputMode="RGB"
            )
            if converted_candidate is None:
                raise ValueError("ICC profile conversion returned no image")
            converted = converted_candidate
        converted.format = image.format
        image.close()
        return converted, True, False
    except Exception:
        return image, False, True


def _ssim_score(reference: Image.Image, candidate_bytes: bytes) -> float:
    candidate = _open_static_image(candidate_bytes)
    try:
        reference_gray = reference.convert("L")
        candidate_gray = candidate.convert("L")
        if candidate_gray.size != reference_gray.size:
            return 0.0
        count = max(1, reference_gray.width * reference_gray.height)
        reference_mean = float(ImageStat.Stat(reference_gray).mean[0])
        candidate_mean = float(ImageStat.Stat(candidate_gray).mean[0])
        reference_variance = float(ImageStat.Stat(reference_gray).var[0])
        candidate_variance = float(ImageStat.Stat(candidate_gray).var[0])
        covariance_total = 0.0
        for reference_value, candidate_value in zip(
            reference_gray.get_flattened_data(),
            candidate_gray.get_flattened_data(),
            strict=True,
        ):
            covariance_total += (
                cast(int, reference_value) - reference_mean
            ) * (cast(int, candidate_value) - candidate_mean)
        covariance = covariance_total / count
        c1 = (0.01 * 255) ** 2
        c2 = (0.03 * 255) ** 2
        numerator = (2 * reference_mean * candidate_mean + c1) * (2 * covariance + c2)
        denominator = (
            (reference_mean**2 + candidate_mean**2 + c1)
            * (reference_variance + candidate_variance + c2)
        )
        return max(0.0, min(1.0, numerator / denominator if denominator else 1.0))
    finally:
        candidate.close()


def _pixels_match(reference: Image.Image, candidate_bytes: bytes) -> bool:
    candidate = _open_static_image(candidate_bytes)
    try:
        if candidate.size != reference.size:
            return False
        return ImageChops.difference(
            candidate.convert("RGBA"), reference.convert("RGBA")
        ).getbbox() is None
    finally:
        candidate.close()


def _resolve_watermark_position(
    *,
    base_width: int,
    base_height: int,
    watermark_width: int,
    watermark_height: int,
    position: str,
    margin_px: int,
) -> tuple[int, int]:
    margin = max(0, margin_px)
    if position == "top_left":
        return margin, margin
    if position == "top_right":
        return max(0, base_width - watermark_width - margin), margin
    if position == "bottom_left":
        return margin, max(0, base_height - watermark_height - margin)
    if position == "center":
        return (
            max(0, (base_width - watermark_width) // 2),
            max(0, (base_height - watermark_height) // 2),
        )
    return (
        max(0, base_width - watermark_width - margin),
        max(0, base_height - watermark_height - margin),
    )


def _apply_image_watermark(
    image: Image.Image,
    *,
    watermark_bytes: bytes,
    watermark_options: dict[str, Any],
) -> Image.Image:
    watermark = _open_static_image(watermark_bytes)
    try:
        base = image.convert("RGBA")
        mark = watermark.convert("RGBA")
        scale_percent = max(1, int(watermark_options.get("scale_percent") or 18))
        target_width = max(1, int(base.width * (scale_percent / 100)))
        if mark.width != target_width:
            ratio = target_width / max(1, mark.width)
            target_height = max(1, int(mark.height * ratio))
            mark = mark.resize((target_width, target_height), RESAMPLE_LANCZOS)

        opacity = max(0.0, min(1.0, float(watermark_options.get("opacity", 0.75))))
        if opacity < 1.0:
            alpha = mark.getchannel("A")
            alpha = alpha.point(lambda value: int(value * opacity))
            mark.putalpha(alpha)

        position = str(watermark_options.get("position") or "bottom_right")
        margin_px = max(0, int(watermark_options.get("margin_px") or 0))
        paste_at = _resolve_watermark_position(
            base_width=base.width,
            base_height=base.height,
            watermark_width=mark.width,
            watermark_height=mark.height,
            position=position,
            margin_px=margin_px,
        )
        base.alpha_composite(mark, dest=paste_at)
        return base
    finally:
        watermark.close()


def _parse_watermark_color(value: Any, default: str) -> tuple[int, int, int, int]:
    color = str(value or default).strip()
    if color.lower() == "transparent":
        return (0, 0, 0, 0)
    rgba_match = re.fullmatch(
        r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)",
        color,
    )
    if rgba_match:
        red = max(0, min(255, int(rgba_match.group(1))))
        green = max(0, min(255, int(rgba_match.group(2))))
        blue = max(0, min(255, int(rgba_match.group(3))))
        alpha = 1.0 if rgba_match.group(4) is None else float(rgba_match.group(4))
        return (red, green, blue, int(max(0.0, min(1.0, alpha)) * 255))
    try:
        parsed = ImageColor.getcolor(color, "RGBA")
        if isinstance(parsed, int):
            return (parsed, parsed, parsed, 255)
        red, green, blue, alpha = tuple(parsed)[:4]
        return (int(red), int(green), int(blue), int(alpha))
    except Exception:
        return _parse_watermark_color(default, "#000000")


def _load_text_watermark_font(font_size: int) -> Any:
    bounded_size = max(8, min(256, int(font_size or 48)))
    for font_name in (
        "DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(font_name, bounded_size)
        except Exception:
            continue
    return ImageFont.load_default()


def _apply_text_watermark(
    image: Image.Image,
    *,
    watermark_options: dict[str, Any],
) -> Image.Image:
    base = image.convert("RGBA")
    text = str(watermark_options.get("text") or "AI").strip()[:64] or "AI"
    font_size = max(8, min(256, int(watermark_options.get("font_size") or 48)))
    font = _load_text_watermark_font(font_size)
    padding = max(4, int(font_size * 0.3))

    measuring_image = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    measuring_draw = ImageDraw.Draw(measuring_image)
    bbox = measuring_draw.textbbox((0, 0), text, font=font)
    text_width = int(max(1, bbox[2] - bbox[0]))
    text_height = int(max(1, bbox[3] - bbox[1]))

    mark = Image.new(
        "RGBA",
        (text_width + padding * 2, text_height + padding * 2),
        (0, 0, 0, 0),
    )
    draw = ImageDraw.Draw(mark)
    background = _parse_watermark_color(
        watermark_options.get("background"),
        "rgba(0,0,0,0.35)",
    )
    if background[3] > 0:
        draw.rounded_rectangle(
            (0, 0, mark.width, mark.height),
            radius=max(2, padding // 2),
            fill=background,
        )

    color = _parse_watermark_color(watermark_options.get("color"), "#FFFFFF")
    draw.text((padding - bbox[0], padding - bbox[1]), text, font=font, fill=color)

    opacity = max(0.0, min(1.0, float(watermark_options.get("opacity", 0.75))))
    if opacity < 1.0:
        alpha = mark.getchannel("A")
        alpha = alpha.point(lambda value: int(value * opacity))
        mark.putalpha(alpha)

    position = str(watermark_options.get("position") or "bottom_right")
    margin_px = max(0, int(watermark_options.get("margin_px") or 0))
    paste_at = _resolve_watermark_position(
        base_width=base.width,
        base_height=base.height,
        watermark_width=mark.width,
        watermark_height=mark.height,
        position=position,
        margin_px=margin_px,
    )
    base.alpha_composite(mark, dest=paste_at)
    return base


def _parse_crop_aspect_ratio(value: Any) -> tuple[int, int]:
    ratio = str(value or "16:9").strip()
    match = re.fullmatch(r"([1-9][0-9]{0,2}):([1-9][0-9]{0,2})", ratio)
    if not match:
        return (16, 9)
    ratio_width = max(1, min(100, int(match.group(1))))
    ratio_height = max(1, min(100, int(match.group(2))))
    return ratio_width, ratio_height


def _axis_crop_offset(position: str, *, available: int, crop_size: int, axis: str) -> int:
    overflow = max(0, available - crop_size)
    if overflow <= 0:
        return 0
    if axis == "x":
        if position in {"top_left", "left", "bottom_left"}:
            return 0
        if position in {"top_right", "right", "bottom_right"}:
            return overflow
    if axis == "y":
        if position in {"top_left", "top", "top_right"}:
            return 0
        if position in {"bottom_left", "bottom", "bottom_right"}:
            return overflow
    return overflow // 2


def _apply_aspect_ratio_crop(
    image: Image.Image,
    *,
    crop_options: dict[str, Any],
    warnings: list[str],
) -> Image.Image:
    ratio_width, ratio_height = _parse_crop_aspect_ratio(crop_options.get("aspect_ratio"))
    target_ratio = ratio_width / ratio_height
    current_ratio = image.width / max(1, image.height)
    if abs(current_ratio - target_ratio) < 0.0001:
        return image

    crop_width = image.width
    crop_height = image.height
    if current_ratio > target_ratio:
        crop_width = max(1, min(image.width, int(round(image.height * target_ratio))))
    else:
        crop_height = max(1, min(image.height, int(round(image.width / target_ratio))))

    position = str(crop_options.get("position") or "center")
    left = _axis_crop_offset(position, available=image.width, crop_size=crop_width, axis="x")
    top = _axis_crop_offset(position, available=image.height, crop_size=crop_height, axis="y")
    cropped = image.crop((left, top, left + crop_width, top + crop_height))
    cropped.format = image.format
    warnings.append(f"source_cropped_to_aspect_ratio_{ratio_width}_{ratio_height}")
    return cropped


def _save_image(
    image: Image.Image,
    *,
    target_format: str,
    quality: int,
    warnings: list[str],
    watermark_applied: bool,
    lossless: bool = False,
) -> tuple[bytes, str, str]:
    if target_format == "original":
        source_format = str(image.format or "").lower()
        resolved_format = (
            source_format if source_format in MIME_TYPE_BY_FORMAT else DEFAULT_ORIGINAL_FORMAT
        )
        pillow_format = PILLOW_FORMAT_BY_TARGET[resolved_format]
        if not source_format or source_format not in MIME_TYPE_BY_FORMAT:
            warnings.append("original_format_fallback_png")
    else:
        resolved_format = target_format
        pillow_format = PILLOW_FORMAT_BY_TARGET[target_format]

    mime_type = MIME_TYPE_BY_FORMAT[resolved_format]
    # Never let Pillow's source-info fallback copy private ICC or EXIF/GPS
    # metadata into any derivative, including original-format and PNG outputs.
    save_kwargs: dict[str, Any] = {"exif": b"", "icc_profile": None}
    output_image = image

    if resolved_format == "jpeg":
        if watermark_applied and output_image.mode in ("RGBA", "LA", "P"):
            warnings.append("watermark_alpha_flattened_for_jpeg")
        elif output_image.mode in ("RGBA", "LA", "P"):
            warnings.append("source_alpha_flattened_for_jpeg")
        if output_image.mode != "RGB":
            output_image = output_image.convert("RGB")
        save_kwargs["quality"] = quality
        save_kwargs["optimize"] = True
    elif resolved_format == "webp":
        if output_image.mode not in ("RGB", "RGBA"):
            warnings.append("source_color_mode_converted_for_webp")
            output_image = output_image.convert("RGB")
        save_kwargs["lossless"] = lossless
        if not lossless:
            save_kwargs["quality"] = quality
    elif resolved_format == "avif":
        if output_image.mode not in ("RGB", "RGBA"):
            warnings.append("source_color_mode_converted_for_avif")
            output_image = output_image.convert("RGB")
        save_kwargs["quality"] = quality
    elif resolved_format == "png":
        save_kwargs["optimize"] = True
        if output_image.mode not in ("RGB", "RGBA"):
            output_image = output_image.convert("RGB")

    output_image.info.clear()
    buf = BytesIO()
    output_image.save(buf, format=pillow_format, **save_kwargs)
    return buf.getvalue(), mime_type, resolved_format


def process_media_derivative(
    *,
    source_bytes: bytes,
    source_media_type: str,
    target_format: str,
    max_width: int,
    quality: int,
    resize_mode: str = "fit",
    watermark_bytes: bytes | None = None,
    watermark_options: dict[str, Any] | None = None,
    crop_options: dict[str, Any] | None = None,
    optimization_mode: str = "manual",
    optimization_profile: str = "",
) -> MediaDerivativeResult:
    if target_format != "original":
        _check_format_available(target_format)

    img: Image.Image | None = None
    try:
        source_facts = _decoded_facts(source_bytes)
        img = _open_static_image(source_bytes)
        source_width = img.width
        source_height = img.height

        try:
            from PIL import ExifTags

            img_exif = img.getexif()
            if img_exif:
                orientation = img_exif.get(ExifTags.Base.Orientation, None)
                source_format = img.format
                if orientation == 3:
                    img = img.rotate(180, expand=True)
                elif orientation == 6:
                    img = img.rotate(270, expand=True)
                elif orientation == 8:
                    img = img.rotate(90, expand=True)
                img.format = source_format
        except Exception:
            pass

        warnings: list[str] = []
        color_profile_normalized = False
        color_profile_normalization_failed = False
        if optimization_mode == "auto_safe":
            img, color_profile_normalized, color_profile_normalization_failed = (
                _normalize_embedded_profile(img)
            )
        watermark_applied = False
        crop_requested = bool(crop_options and crop_options.get("type") == "aspect_ratio")

        watermark_type = str((watermark_options or {}).get("type") or "image")
        text_watermark_requested = watermark_type == "text" and bool(
            str((watermark_options or {}).get("text") or "AI").strip()
        )

        if crop_requested:
            img = _apply_aspect_ratio_crop(
                img,
                crop_options=crop_options or {},
                warnings=warnings,
            )

        if resize_mode != "preserve" and img.width > max_width:
            source_format = img.format
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), RESAMPLE_LANCZOS)
            img.format = source_format

        if watermark_bytes:
            img = _apply_image_watermark(
                img,
                watermark_bytes=watermark_bytes,
                watermark_options=watermark_options or {},
            )
            watermark_applied = True
        elif text_watermark_requested:
            img = _apply_text_watermark(
                img,
                watermark_options=watermark_options or {},
            )
            watermark_applied = True

        effective_quality: int | None = quality
        quality_metric = "not_evaluated"
        quality_score: float | None = None
        decision_reasons: list[str] = []
        qualified = True
        source_class = "transparent" if _has_alpha(img) else "opaque"
        if optimization_mode == "auto_safe":
            if optimization_profile != AUTO_SAFE_PROFILE:
                raise MediaDerivativeProcessingFailedError("unsupported auto-safe profile")
            if target_format != "webp" or crop_requested or watermark_applied:
                raise MediaDerivativeProcessingFailedError(
                    "auto-safe transforms require plain WebP output"
                )
            if source_class == "transparent":
                effective_quality = None
                quality_metric = "pixel_equality"
                output_bytes, mime_type, fmt = _save_image(
                    img,
                    target_format="webp",
                    quality=100,
                    warnings=warnings,
                    watermark_applied=False,
                    lossless=True,
                )
                quality_score = 1.0 if _pixels_match(img, output_bytes) else 0.0
                qualified = quality_score == 1.0
                if not qualified:
                    decision_reasons.append("transparent_pixels_changed")
            else:
                quality_metric = "ssim"
                candidates: list[tuple[int, bytes, float]] = []
                for candidate_quality in AUTO_SAFE_QUALITY_CANDIDATES:
                    candidate_bytes, candidate_mime, candidate_format = _save_image(
                        img,
                        target_format="webp",
                        quality=candidate_quality,
                        warnings=warnings,
                        watermark_applied=False,
                    )
                    candidate_score = _ssim_score(img, candidate_bytes)
                    if candidate_score >= AUTO_SAFE_QUALITY_THRESHOLD:
                        candidates.append((candidate_quality, candidate_bytes, candidate_score))
                if candidates:
                    effective_quality, output_bytes, quality_score = min(
                        candidates, key=lambda candidate: len(candidate[1])
                    )
                    mime_type, fmt = candidate_mime, candidate_format
                else:
                    effective_quality = AUTO_SAFE_QUALITY_CANDIDATES[0]
                    output_bytes, mime_type, fmt = _save_image(
                        img,
                        target_format="webp",
                        quality=effective_quality,
                        warnings=warnings,
                        watermark_applied=False,
                    )
                    quality_score = _ssim_score(img, output_bytes)
                    qualified = False
                    decision_reasons.append("quality_threshold_not_met")
        else:
            output_bytes, mime_type, fmt = _save_image(
                img,
                target_format=target_format,
                quality=quality,
                warnings=warnings,
                watermark_applied=watermark_applied,
            )
        if len(output_bytes) > MAX_DELIVERABLE_ARTIFACT_BYTES:
            raise MediaDerivativeOutputTooLargeError()
        result_width = img.width
        result_height = img.height

        checksum = hashlib.sha256(output_bytes).hexdigest()
        output_facts = _decoded_facts(output_bytes)
        savings_basis_points = max(
            0,
            int(
                (source_facts["filesize_bytes"] - output_facts["filesize_bytes"])
                * 10000
                / max(1, source_facts["filesize_bytes"])
            ),
        )
        if (
            optimization_mode == "auto_safe"
            and savings_basis_points < AUTO_SAFE_MINIMUM_SAVINGS_BASIS_POINTS
        ):
            qualified = False
            decision_reasons.append("minimum_savings_not_met")
        if len(output_bytes) >= len(source_bytes):
            qualified = False if optimization_mode == "auto_safe" else qualified
            if optimization_mode == "auto_safe":
                decision_reasons.append("output_not_smaller")
        if optimization_mode == "auto_safe" and color_profile_normalization_failed:
            qualified = False
            decision_reasons.append("color_profile_normalization_failed")
        if qualified:
            decision_reasons.append("qualified")
        transform_facts = {
            "source_checksum": source_facts["checksum"],
            "output_checksum": f"sha256:{checksum}",
            "source_format": source_facts["format"],
            "output_format": output_facts["format"],
            "source_mime_type": source_facts["mime_type"],
            "output_mime_type": output_facts["mime_type"],
            "source_width": source_facts["width"],
            "source_height": source_facts["height"],
            "output_width": output_facts["width"],
            "output_height": output_facts["height"],
            "source_filesize_bytes": source_facts["filesize_bytes"],
            "output_filesize_bytes": output_facts["filesize_bytes"],
            "source_frame_count": source_facts["frame_count"],
            "output_frame_count": output_facts["frame_count"],
            "source_has_alpha": source_facts["has_alpha"],
            "output_has_alpha": output_facts["has_alpha"],
            "alpha_preserved": source_facts["has_alpha"] == output_facts["has_alpha"],
            "decodable": bool(output_facts["decodable"]),
            "crop_applied": bool(
                warnings
                and any(item.startswith("source_cropped_") for item in warnings)
            ),
            "watermark_applied": watermark_applied,
            "resize_applied": output_facts["width"] != source_facts["width"]
            or output_facts["height"] != source_facts["height"],
            "encoding_mode": "lossless"
            if fmt == "png"
            or (optimization_mode == "auto_safe" and source_class == "transparent")
            else ("lossy" if fmt in {"jpeg", "webp", "avif"} else "unknown"),
            "savings_basis_points": savings_basis_points,
            "optimization_profile": optimization_profile
            if optimization_mode == "auto_safe"
            else "manual",
            "source_class": source_class,
            "effective_quality": effective_quality,
            "quality_metric": quality_metric,
            "quality_score": quality_score,
            "quality_threshold": AUTO_SAFE_QUALITY_THRESHOLD
            if optimization_mode == "auto_safe"
            else None,
            "color_profile_normalized": color_profile_normalized,
            "qualified": qualified,
            "decision_reasons": list(dict.fromkeys(decision_reasons)),
        }
        return MediaDerivativeResult(
            output_bytes=output_bytes,
            width=result_width,
            height=result_height,
            filesize_bytes=len(output_bytes),
            checksum=f"sha256:{checksum}",
            mime_type=mime_type,
            format=fmt,
            source_width=source_width,
            source_height=source_height,
            processing_warnings=warnings,
            transform_facts=transform_facts,
        )
    except (
        MediaDerivativeSourceDecodeFailedError,
        MediaDerivativeFormatUnavailableError,
        MediaDerivativeOutputTooLargeError,
        MediaDerivativeSourceTooLargeError,
        MediaDerivativeAnimatedSourceUnavailableError,
    ):
        raise
    except Exception as exc:
        raise MediaDerivativeProcessingFailedError(str(exc)) from exc
    finally:
        if img is not None:
            img.close()
