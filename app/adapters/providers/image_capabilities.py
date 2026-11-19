"""Bounded image endpoint declarations; metadata never grants verification."""

from typing import Any

IMAGE_ENDPOINTS = {
    "image_generation": "image_generations",
    "image_editing": "image_edits",
}


def image_capability_declarations(
    payload: dict[str, Any],
    override: dict[str, Any],
    *,
    image_feature: bool,
) -> dict[str, dict[str, Any]]:
    """Saved booleans win; provider metadata only supplies initial values."""
    metadata = payload.get("metadata")
    metadata = metadata if isinstance(metadata, dict) else {}
    endpoints = payload.get("supported_endpoints", metadata.get("supported_endpoints"))
    explicit = (
        isinstance(endpoints, list)
        and bool(endpoints)
        and all(isinstance(item, str) for item in endpoints)
    )
    choices = override.get("image_capabilities")
    choices = choices if isinstance(choices, dict) else {}
    legacy = override.get("endpoint_variants")
    if (
        not isinstance(legacy, list)
        and override.get("endpoint_variant") in IMAGE_ENDPOINTS.values()
    ):
        legacy = [override["endpoint_variant"]]
    if "image_capabilities" in override:
        legacy = None
    result = {}
    for capability, variant in IMAGE_ENDPOINTS.items():
        if capability in choices:
            supported = choices[capability] is True
        elif isinstance(legacy, list):
            supported = variant in legacy
        elif explicit and isinstance(endpoints, list):
            supported = (
                f"/v1/images/{'edits' if variant == 'image_edits' else 'generations'}" in endpoints
            )
        else:
            # Preserve existing generation discovery; names never imply editing.
            supported = image_feature and variant == "image_generations"
        result[capability] = {"supported": supported}
    return result
