from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.adapters.providers.base import ProviderExecutionError
from app.api.auth import authorize_internal_request, get_cloud_services
from app.api.envelope import build_envelope
from app.domain.commercial.service import CommercialService, ServiceAuditContext
from app.domain.provider_connections.model_tests import ModelTestInput, execute_model_test
from app.domain.provider_connections.service import ProviderConnectionAdminError

router = APIRouter(prefix="/admin/provider-connections")


@router.post("/{connection_id}/model-tests")
async def test_admin_model(
    request: Request,
    connection_id: str,
    payload: ModelTestInput,
) -> JSONResponse:
    auth = await authorize_internal_request(request, require_idempotency=True)
    if auth is not None:
        return auth
    settings = get_cloud_services(request).settings
    test_id = f"model_test_{uuid4().hex}"
    data = {"test_id": test_id}
    error_code = ""
    status_code = 200
    try:
        data = await run_in_threadpool(
            execute_model_test, settings, connection_id, payload, test_id
        )
    except ProviderConnectionAdminError as error:
        error_code, status_code = error.error_code, error.status_code
    except ProviderExecutionError as error:
        error_code, status_code = error.error_code, 502
    except Exception:
        # Provider exception prose can contain credentials or user input.
        error_code, status_code = "model_test.failed", 502
    try:
        CommercialService(settings.database_url, settings=settings).record_service_audit_event(
            audit_context=ServiceAuditContext(
                trace_id=test_id,
                idempotency_key=request.headers.get("Idempotency-Key", ""),
                method=request.method,
                path=request.url.path,
                actor_kind=str(getattr(request.state, "internal_actor_kind", "internal_token")),
                actor_ref=str(getattr(request.state, "internal_actor_ref", "internal")),
            ),
            event_kind="provider_connection.model_test",
            outcome="error" if error_code else "success",
            scope_kind="provider_connection",
            scope_id=connection_id,
            payload_json={
                key: value
                for key, value in {
                    "requested_model_id": payload.model_id,
                    "capability": payload.capability,
                    **data,
                    "error_code": error_code,
                    "content_exposed": False,
                }.items()
                if key != "output_text"
            },
        )
    except Exception:
        pass  # Diagnostics remain usable if the separate audit sink is unavailable.
    return JSONResponse(
        status_code=status_code,
        content=build_envelope(
            status="error" if error_code else "ok",
            error_code=error_code,
            message="Model test failed." if error_code else "Model test response received.",
            data=data,
            revision="m6",
        ),
    )
