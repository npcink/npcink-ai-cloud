from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.customer_journey.contracts import (
    ALLOWED_BROWSER_FAMILIES,
    ALLOWED_ERROR_CATEGORIES,
    ALLOWED_JOURNEYS,
    ALLOWED_STEPS,
    ALLOWED_SURFACES,
    ALLOWED_VIEWPORT_CLASSES,
)


class CustomerJourneyEventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=8, max_length=96, pattern=r"^[A-Za-z0-9._:-]+$")
    cohort_id: str = Field(default="", max_length=64, pattern=r"^[A-Za-z0-9._:-]*$")
    anonymous_session_id: str = Field(
        min_length=16,
        max_length=128,
        pattern=r"^[A-Za-z0-9._:-]+$",
    )
    surface: str = Field(min_length=1, max_length=32)
    journey: str = Field(min_length=1, max_length=64)
    step: str = Field(min_length=1, max_length=32)
    error_category: str = Field(default="", max_length=32)
    error_code: str = Field(default="", max_length=96, pattern=r"^[a-z0-9._:-]*$")
    duration_ms: int | None = Field(default=None, ge=0, le=86_400_000)
    run_id: str = Field(default="", max_length=191, pattern=r"^[A-Za-z0-9._:-]*$")
    browser_family: str = Field(default="", max_length=32)
    viewport_class: str = Field(default="", max_length=16)
    occurred_at: datetime

    @field_validator("surface")
    @classmethod
    def validate_surface(cls, value: str) -> str:
        if value not in ALLOWED_SURFACES:
            raise ValueError("surface is not supported")
        return value

    @field_validator("journey")
    @classmethod
    def validate_journey(cls, value: str) -> str:
        if value not in ALLOWED_JOURNEYS:
            raise ValueError("journey is not supported")
        return value

    @field_validator("step")
    @classmethod
    def validate_step(cls, value: str) -> str:
        if value not in ALLOWED_STEPS:
            raise ValueError("step is not supported")
        return value

    @field_validator("error_category")
    @classmethod
    def validate_error_category(cls, value: str) -> str:
        if value not in ALLOWED_ERROR_CATEGORIES:
            raise ValueError("error_category is not supported")
        return value

    @field_validator("browser_family")
    @classmethod
    def validate_browser_family(cls, value: str) -> str:
        if value not in ALLOWED_BROWSER_FAMILIES:
            raise ValueError("browser_family is not supported")
        return value

    @field_validator("viewport_class")
    @classmethod
    def validate_viewport_class(cls, value: str) -> str:
        if value not in ALLOWED_VIEWPORT_CLASSES:
            raise ValueError("viewport_class is not supported")
        return value


class CustomerJourneyBatchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["customer_journey_event.v1"]
    events: list[CustomerJourneyEventPayload] = Field(min_length=1, max_length=100)
