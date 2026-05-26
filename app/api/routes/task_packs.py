from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.api.auth import authorize_public_request
from app.api.envelope import build_envelope
from app.domain.task_packs.models import WooCommerceProductInput
from app.domain.task_packs.service import WooCommerceGrowthPackService

router = APIRouter(prefix="/v1/task-packs", tags=["task-packs"])


class AnalyzeProductPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product: WooCommerceProductInput


class BatchPlanPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[WooCommerceProductInput] = Field(..., min_length=1, max_length=100)


def _get_service() -> WooCommerceGrowthPackService:
    return WooCommerceGrowthPackService()


@router.post("/woocommerce-growth/analyze")
async def analyze_product(
    request: Request,
    payload: AnalyzeProductPayload,
) -> Any:
    auth = await authorize_public_request(
        request,
        require_idempotency=True,
        required_scope="task_pack:write",
    )
    if isinstance(auth, JSONResponse):
        return auth

    service = _get_service()
    result = service.analyze_product(payload.product)

    return build_envelope(
        status="ok",
        message="Product growth analysis generated; requires local approval.",
        data=result.model_dump(mode="json"),
    )


@router.post("/woocommerce-growth/batch-plan")
async def batch_plan(
    request: Request,
    payload: BatchPlanPayload,
) -> Any:
    auth = await authorize_public_request(
        request,
        require_idempotency=True,
        required_scope="task_pack:write",
    )
    if isinstance(auth, JSONResponse):
        return auth

    service = _get_service()
    summary = service.generate_batch_plan(payload.items)

    return build_envelope(
        status="ok",
        message="Batch task plan summary generated; requires local approval.",
        data=summary.model_dump(mode="json"),
    )
