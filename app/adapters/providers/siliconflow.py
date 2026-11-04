from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

import httpx

from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionRequest
from app.adapters.providers.openai import OpenAIProviderAdapter


class SiliconFlowProviderAdapter(OpenAIProviderAdapter):
    provider_id = "siliconflow"
    display_name = "SiliconFlow"
    adapter_type = "siliconflow"

    def __init__(
        self,
        *,
        base_url: str = "https://api.siliconflow.cn/v1",
        api_key: str,
        timeout_seconds: float = 30.0,
        app_name: str = "npcink-ai-cloud",
        image_output_hosts: Iterable[str] = (),
        image_response_format: str | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        super().__init__(
            base_url=base_url,
            api_key=api_key,
            organization=None,
            timeout_seconds=timeout_seconds,
            sample_catalog_profile="",
            app_name=app_name,
            allow_sample_catalog=False,
            allow_sample_execution=False,
            provider_label=self.display_name,
            model_namespace_prefix=self.provider_id,
            image_output_hosts=image_output_hosts,
            image_response_format=image_response_format,
            transport=transport,
        )

    def _build_http_request(self, request: ProviderExecutionRequest) -> tuple[str, dict[str, Any]]:
        path, payload = super()._build_http_request(request)
        if request.endpoint_variant != "image_generations" or (
            payload.get("model") != "Tongyi-MAI/Z-Image-Turbo"
        ):
            return path, payload
        options = self._resolve_request_options(request.input_payload)
        count = options.get("n", 1)
        if isinstance(count, bool) or not isinstance(count, int) or count != 1:
            raise ProviderExecutionError(
                "provider.unsupported_operation", "Z-Image-Turbo supports one image per request"
            )
        # Native Z-Image accepts image_size, not the platform's ratio/resolution
        # hints. Its documented response is images[].url; do not force an OpenAI
        # response_format or forward generic parameters it does not advertise.
        image_payload: dict[str, Any] = {
            "model": payload["model"],
            "prompt": payload["prompt"],
            "image_size": self._z_image_size(options, payload),
        }
        for key in ("seed", "negative_prompt"):
            if key in payload:
                image_payload[key] = payload[key]
            elif key in options:
                image_payload[key] = options[key]
        return path, image_payload

    @staticmethod
    def _z_image_size(options: dict[str, Any], payload: dict[str, Any]) -> str:
        size = payload.get("image_size") or options.get("size")
        if size is not None:
            match = re.fullmatch(r"([0-9]+)x([0-9]+)", str(size))
            if match and all(
                256 <= int(value) <= 2048 and int(value) % 8 == 0 for value in match.groups()
            ):
                return str(size)
            raise ProviderExecutionError(
                "provider.unsupported_operation", "Z-Image-Turbo image size is not supported"
            )
        ratio = str(options.get("aspect_ratio") or "1:1")
        match = re.fullmatch(r"([1-9][0-9]?):([1-9][0-9]?)", ratio)
        resolution = str(options.get("resolution") or "low")
        edge = {"low": 512, "medium": 1024, "high": 1536}.get(resolution)
        if match is None or edge is None:
            raise ProviderExecutionError(
                "provider.unsupported_operation", "Z-Image-Turbo image dimensions are not supported"
            )
        width_ratio, height_ratio = (int(value) for value in match.groups())
        longest = max(width_ratio, height_ratio)
        width = max(64, round(edge * width_ratio / longest / 8) * 8)
        height = max(64, round(edge * height_ratio / longest / 8) * 8)
        return f"{width}x{height}"
