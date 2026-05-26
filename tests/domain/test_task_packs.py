from __future__ import annotations

from app.domain.task_packs.models import (
    WooCommerceGrowthAnalysisResult,
    WooCommerceProductInput,
)
from app.domain.task_packs.service import WooCommerceGrowthPackService


def test_analyze_product_returns_title_suggestions() -> None:
    service = WooCommerceGrowthPackService()
    product_input = WooCommerceProductInput(
        product_id="prod_001",
        title="Wireless Mouse",
        short_description="A great wireless mouse.",
        long_description="This wireless mouse offers precision and comfort.",
        attributes={"color": "black"},
        categories=["Electronics"],
        tags=["wireless", "mouse"],
        target_locales=["zh-CN", "ja-JP"],
    )

    result = service.analyze_product(product_input)

    assert result.product_id == "prod_001"
    assert result.title_suggestion is not None
    assert result.title_suggestion.original == "Wireless Mouse"
    assert len(result.title_suggestion.suggestions) > 0
    assert "requires_local_approval" in result.model_dump()
    assert result.requires_local_approval is True


def test_analyze_product_returns_description_drafts() -> None:
    service = WooCommerceGrowthPackService()
    product_input = WooCommerceProductInput(
        product_id="prod_002",
        title="Mechanical Keyboard",
        short_description="Tactile mechanical keyboard.",
        long_description="Full-size mechanical keyboard with RGB backlight.",
    )

    result = service.analyze_product(product_input)

    assert len(result.description_drafts) == 2
    draft_types = {d.draft_type for d in result.description_drafts}
    assert "short" in draft_types
    assert "long" in draft_types
    for draft in result.description_drafts:
        assert draft.draft
        assert "draft" in draft.reasoning.lower() or "approval" in draft.reasoning.lower()


def test_analyze_product_returns_attribute_suggestions() -> None:
    service = WooCommerceGrowthPackService()
    product_input = WooCommerceProductInput(
        product_id="prod_003",
        title="Leather Wallet",
        attributes={"color": "brown"},
    )

    result = service.analyze_product(product_input)

    assert result.attribute_suggestion is not None
    assert "brand" in result.attribute_suggestion.suggested_additions
    assert result.attribute_suggestion.existing == {"color": "brown"}
    assert "local approval" in result.attribute_suggestion.reasoning.lower()


def test_analyze_product_returns_localization_suggestions() -> None:
    service = WooCommerceGrowthPackService()
    product_input = WooCommerceProductInput(
        product_id="prod_004",
        title="Running Shoes",
        target_locales=["de-DE", "fr-FR"],
    )

    result = service.analyze_product(product_input)

    assert len(result.localization_suggestions) == 2
    locales = {s.locale for s in result.localization_suggestions}
    assert "de-DE" in locales
    assert "fr-FR" in locales
    for loc in result.localization_suggestions:
        assert loc.localized_title
        assert "review" in loc.reasoning.lower() or "approval" in loc.reasoning.lower()


def test_analyze_product_returns_schema_suggestion() -> None:
    service = WooCommerceGrowthPackService()
    product_input = WooCommerceProductInput(
        product_id="prod_005",
        title="Coffee Mug",
        short_description="Ceramic coffee mug.",
        categories=["Kitchen"],
    )

    result = service.analyze_product(product_input)

    assert result.schema_suggestion is not None
    assert result.schema_suggestion.schema_type == "Product"
    assert "@context" in result.schema_suggestion.recommended_fields
    assert "local approval" in result.schema_suggestion.reasoning.lower()


def test_analyze_product_never_claims_write_to_woocommerce() -> None:
    service = WooCommerceGrowthPackService()
    product_input = WooCommerceProductInput(
        product_id="prod_006",
        title="Bluetooth Speaker",
    )

    result = service.analyze_product(product_input)
    result_dict = result.model_dump()
    result_str = str(result_dict)

    assert "已写入 WooCommerce" not in result_str
    assert "written to WooCommerce" not in result_str.lower()
    assert result.requires_local_approval is True


def test_generate_batch_plan_returns_summary() -> None:
    service = WooCommerceGrowthPackService()
    items = [
        WooCommerceProductInput(product_id="prod_001", title="Item A"),
        WooCommerceProductInput(product_id="prod_002", title="Item B"),
    ]

    summary = service.generate_batch_plan(items)

    assert summary.total_products == 2
    assert len(summary.items) == 2
    assert "title_optimization" in summary.task_types
    assert "seo_schema_enhancement" in summary.task_types
    assert summary.requires_local_approval is True


def test_generate_batch_plan_respects_empty_list() -> None:
    service = WooCommerceGrowthPackService()
    summary = service.generate_batch_plan([])

    assert summary.total_products == 0
    assert summary.items == []
    assert summary.requires_local_approval is True


def test_batch_plan_never_claims_write_to_woocommerce() -> None:
    service = WooCommerceGrowthPackService()
    items = [WooCommerceProductInput(product_id="prod_007", title="Gadget")]

    summary = service.generate_batch_plan(items)
    summary_dict = summary.model_dump()
    summary_str = str(summary_dict)

    assert "已写入 WooCommerce" not in summary_str
    assert "written to WooCommerce" not in summary_str.lower()
    assert summary.requires_local_approval is True


def test_analyze_product_with_minimal_input_returns_result() -> None:
    service = WooCommerceGrowthPackService()
    product_input = WooCommerceProductInput()

    result = service.analyze_product(product_input)

    assert isinstance(result, WooCommerceGrowthAnalysisResult)
    assert result.title_suggestion is None
    assert result.description_drafts == []
    # Even with no attributes, common missing attributes are suggested.
    assert result.attribute_suggestion is not None
    assert result.localization_suggestions == []
    assert result.schema_suggestion is not None
    assert result.requires_local_approval is True
