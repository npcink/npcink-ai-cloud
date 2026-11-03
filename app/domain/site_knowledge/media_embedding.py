from __future__ import annotations

import base64
from io import BytesIO
from urllib.parse import urlsplit

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.domain.image_generation.provider_fetch import (
    ProviderImageFetchError,
    fetch_provider_image_url,
)
from app.domain.media_artifacts.input_loading import ArtifactInputError, load_artifact_input
from app.domain.media_artifacts.store import build_artifact_store
from app.domain.site_knowledge.backends import SiteKnowledgeBackendError

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000


def load_media_embedding_image(
    document: dict[str, object], *, session: Session, settings: Settings, site_id: str
) -> str:
    """Read a site-owned artifact or bounded public HTTPS image, never a LAN URL.

    Only the derived thumbnail crosses the model boundary. Bytes/base64 are not
    stored in the knowledge projection or returned in its search results.
    """
    artifact_id = str(document.get("source_artifact_id") or "")
    try:
        if artifact_id:
            loaded = load_artifact_input(
                session, build_artifact_store(settings), site_id=site_id,
                artifact_id=artifact_id, max_bytes=MAX_IMAGE_BYTES,
            )
            data = loaded.content_bytes
        else:
            url = str(document.get("url") or "")
            fetched = fetch_provider_image_url(
                url, allowed_hosts=(urlsplit(url).hostname or "",),
                max_bytes=MAX_IMAGE_BYTES, timeout_seconds=15,
            )
            try:
                data = fetched.stream.read(MAX_IMAGE_BYTES + 1)
            finally:
                fetched.close()
        if not data or len(data) > MAX_IMAGE_BYTES:
            raise ValueError("image byte limit")
        with Image.open(BytesIO(data)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("unsupported image")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("image pixel limit")
            with ImageOps.exif_transpose(image) as oriented:
                oriented.thumbnail((768, 768))
                output = BytesIO()
                with oriented.convert("RGB") as rgb:
                    rgb.save(output, format="JPEG", quality=85)
        return base64.b64encode(output.getvalue()).decode("ascii")
    except (
        ArtifactInputError, ProviderImageFetchError, UnidentifiedImageError,
        Image.DecompressionBombError, OSError, ValueError,
    ) as error:
        raise SiteKnowledgeBackendError(
            "site_knowledge.image_embedding_source_unavailable",
            "Image embedding requires an available site-owned artifact or public HTTPS image",
        ) from error
