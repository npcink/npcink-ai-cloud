from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WooCommerceProductInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: str | None = None
    title: str = ""
    short_description: str = ""
    long_description: str = ""
    attributes: dict[str, Any] = Field(default_factory=dict)
    categories: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    target_locales: list[str] = Field(default_factory=list)


class ProductTitleSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    original: str = ""
    suggestions: list[str] = Field(default_factory=list)
    reasoning: str = ""


class ProductDescriptionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_type: str = ""  # "short" or "long"
    original: str = ""
    draft: str = ""
    reasoning: str = ""


class ProductAttributeSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    existing: dict[str, Any] = Field(default_factory=dict)
    suggested_additions: dict[str, Any] = Field(default_factory=dict)
    reasoning: str = ""


class ProductLocalizationSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    locale: str = ""
    localized_title: str = ""
    localized_short_description: str = ""
    localized_long_description: str = ""
    reasoning: str = ""


class ProductSchemaSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_type: str = "Product"  # e.g. Product, Offer, AggregateOffer
    recommended_fields: dict[str, Any] = Field(default_factory=dict)
    reasoning: str = ""


class WooCommerceGrowthAnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: str | None = None
    title_suggestion: ProductTitleSuggestion | None = None
    description_drafts: list[ProductDescriptionDraft] = Field(default_factory=list)
    attribute_suggestion: ProductAttributeSuggestion | None = None
    localization_suggestions: list[ProductLocalizationSuggestion] = Field(default_factory=list)
    schema_suggestion: ProductSchemaSuggestion | None = None
    requires_local_approval: bool = True


class BatchPlanItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_reference: str = ""
    suggested_tasks: list[str] = Field(default_factory=list)


class BatchTaskPlanSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[BatchPlanItem] = Field(default_factory=list)
    total_products: int = 0
    task_types: list[str] = Field(default_factory=list)
    requires_local_approval: bool = True
