"""Bounded, exact-model Admin diagnostics; never mutate routing or capability evidence."""

from __future__ import annotations

import base64
import binascii
import warnings
from io import BytesIO
from typing import Any, Literal
from uuid import uuid4

from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select

from app.adapters.providers.base import ProviderExecutionError, ProviderExecutionRequest
from app.adapters.providers.registry import (
    EXECUTION_PROVIDER_SOURCE_ROLES,
    build_provider_adapter_from_connection,
)
from app.core.config import Settings
from app.core.db import get_session
from app.core.models import CatalogInstance, CatalogModel, ProviderConnection, RunRecord
from app.domain.provider_connections.model_allowlist import (
    _effective_connection_model_ids,
    build_provider_model_allowlist,
    connection_model_ids,
)
from app.domain.provider_connections.model_test_cost import model_test_cost
from app.domain.provider_connections.service import ProviderConnectionAdminError
from app.domain.runtime.provider_budget import ProviderBudgetService

MODEL_TEST_MAX_OUTPUT_TOKENS = 2048


class ModelTestInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    model_id: str = Field(min_length=1, max_length=191)
    capability: Literal["text", "vision"] = "text"
    prompt: str = Field(min_length=1, max_length=4000)
    image_data_url: str | None = Field(default=None, max_length=700_000)

    @model_validator(mode="after")
    def validate_image_mode(self) -> ModelTestInput:
        if self.capability == "text" and self.image_data_url is not None:
            raise ValueError("Images are only accepted for vision tests")
        return self


def test_image_data_url(value: str | None) -> str:
    """Decode and sanitize a bounded upload. Never fetch operator-supplied URLs."""
    if value is None:
        image = Image.new("RGB", (256, 256), (255, 0, 0))
    else:
        try:
            header, encoded = value.split(",", 1)
            if header not in {
                "data:image/png;base64",
                "data:image/jpeg;base64",
                "data:image/webp;base64",
            }:
                raise ValueError("unsupported image")
            raw = base64.b64decode(encoded, validate=True)
            if len(raw) > 512 * 1024:
                raise ValueError("image too large")
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(raw)) as uploaded:
                    if uploaded.width * uploaded.height > 4_000_000:
                        raise ValueError("image dimensions too large")
                    uploaded.load()
                    image = uploaded.convert("RGB")
        except (
            ValueError,
            binascii.Error,
            OSError,
            UnidentifiedImageError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ) as error:
            raise ProviderConnectionAdminError(
                "model_test.invalid_image",
                "Use a PNG, JPEG or WebP up to 512 KB / 4 MP.",
                status_code=422,
            ) from error
    image.thumbnail((1024, 1024))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def execute_model_test(
    settings: Settings,
    connection_id: str,
    payload: ModelTestInput,
    test_id: str,
) -> dict[str, Any]:
    image_url = (
        test_image_data_url(payload.image_data_url) if payload.capability == "vision" else None
    )
    allowlist = build_provider_model_allowlist(settings.database_url, settings=settings)
    with get_session(settings.database_url) as session:
        connection = session.get(ProviderConnection, connection_id)
        if connection is None:
            raise ProviderConnectionAdminError(
                "provider_connection.not_found",
                "Supplier not found.",
                status_code=404,
            )
        config = connection.config_json or {}
        provider_id = str(config.get("provider_id") or connection_id)
        allowed = set(
            _effective_connection_model_ids(
                provider_id=provider_id,
                config=config,
                model_ids=connection_model_ids(config, connection.metadata_json or {}),
            )
        ) & allowlist.allowed_model_ids_by_provider.get(provider_id, set())
        # The browser may use an upstream ID for display. Resolve only within this
        # connection's saved allowlist, never choose a different model or provider.
        prefix = str(config.get("model_namespace_prefix", provider_id)).strip("/")
        model_id = payload.model_id
        if model_id not in allowed and prefix:
            model_id = f"{prefix}/{model_id}"
        if (
            not connection.enabled
            or connection.source_role not in EXECUTION_PROVIDER_SOURCE_ROLES
            or model_id not in allowed
        ):
            raise ProviderConnectionAdminError(
                "model_test.model_not_enabled",
                "Save and enable this model first.",
                status_code=409,
            )
        model = session.get(CatalogModel, model_id)
        instance = session.scalar(
            select(CatalogInstance)
            .where(
                CatalogInstance.provider_id == provider_id,
                CatalogInstance.model_id == model_id,
            )
            .order_by(CatalogInstance.is_default.desc(), CatalogInstance.instance_id)
        )
        if (
            model is None
            or model.provider_id != provider_id
            or model.status != "available"
            or model.is_deprecated
            or model.feature not in {"text", "vision"}
            or instance is None
        ):
            raise ProviderConnectionAdminError(
                "model_test.catalog_unconfirmed",
                "Fetch the account catalog before testing.",
                status_code=409,
            )
        adapter = build_provider_adapter_from_connection(settings, connection)
        if adapter is None:
            raise ProviderConnectionAdminError(
                "model_test.provider_unavailable",
                "Supplier is unavailable.",
                status_code=409,
            )
        responses = instance.endpoint_variant == "responses"
        content: Any = payload.prompt
        if image_url:
            content = (
                [
                    {"type": "input_text", "text": payload.prompt},
                    {"type": "input_image", "image_url": image_url},
                ]
                if responses
                else [
                    {"type": "text", "text": payload.prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ]
            )
        request = ProviderExecutionRequest(
            run_id=test_id,
            site_id="admin-model-test",
            ability_name="admin.model-test",
            profile_id="admin.model-test",
            execution_kind=payload.capability,
            model_id=model_id,
            instance_id=instance.instance_id,
            endpoint_variant=instance.endpoint_variant,
            trace_id=uuid4().hex,
            input_payload={
                "input" if responses else "messages": [{"role": "user", "content": content}],
                "params": {"max_tokens": MODEL_TEST_MAX_OUTPUT_TOKENS},
            },
            policy={
                "allow_fallback": False,
                "admin_model_test": True,
                "max_output_tokens": MODEL_TEST_MAX_OUTPUT_TOKENS,
            },
            timeout_ms=60_000,
            context_window=model.context_window,
            price_input=model.price_input,
            price_output=model.price_output,
        )
        budget = ProviderBudgetService()
        run = RunRecord(
            run_id=test_id,
            site_id="admin-model-test",
            ability_name="admin.model-test",
            profile_id="admin.model-test",
            execution_kind=payload.capability,
            policy_json=request.policy,
        )
        claim = budget.claim_before_dispatch(
            session=session,
            run=run,
            provider_id=provider_id,
            model_id=model_id,
            request=request,
        )
        # Keep the dispatched catalog snapshot; commit must not cause a model
        # refresh between the durable reservation and Provider I/O.
        instance_id = instance.instance_id
        session.expunge(model)
        session.commit()
        try:
            result = adapter.execute(request)
        except Exception:
            if claim:
                budget.reconcile(session=session, claim_ids=claim.claim_ids, actual_cost_usd=None)
                session.commit()
            raise
        if claim:
            budget.reconcile(
                session=session, claim_ids=claim.claim_ids, actual_cost_usd=result.budget_cost_usd()
            )
            session.commit()
        output = str(result.output.get("output_text") or result.output.get("text") or "").strip()
        if not output and result.finish_reason != "length":
            raise ProviderExecutionError("model_test.empty_output", "No text was returned.")
        upstream_model_id = model_id.removeprefix(f"{prefix}/") if prefix else model_id
        reported_model = result.output.get("reported_model_id")
        reported_model = reported_model.strip()[:191] if isinstance(reported_model, str) else None
        return {
            "test_id": test_id,
            "provider_id": provider_id,
            "model_id": model_id,
            "instance_id": instance_id,
            "requested_model_id": model_id,
            "reported_model_id": reported_model or None,
            "capability": payload.capability,
            "output_text": output[:32_000],
            "latency_ms": result.latency_ms,
            "tokens_in": result.tokens_in,
            "tokens_out": result.tokens_out,
            "reasoning_tokens": result.reasoning_tokens,
            "max_output_tokens": MODEL_TEST_MAX_OUTPUT_TOKENS,
            "finish_reason": result.finish_reason,
            "fallback_count": 0,
            "cost": model_test_cost(settings.database_url, model, upstream_model_id, result),
        }
