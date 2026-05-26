from __future__ import annotations

from typing import Any

from app.domain.task_packs.models import (
    BatchPlanItem,
    BatchTaskPlanSummary,
    ProductAttributeSuggestion,
    ProductDescriptionDraft,
    ProductLocalizationSuggestion,
    ProductSchemaSuggestion,
    ProductTitleSuggestion,
    WooCommerceGrowthAnalysisResult,
    WooCommerceProductInput,
)


class WooCommerceGrowthPackService:
    """Generate suggestions and drafts for WooCommerce product growth.

    This service never writes to WooCommerce directly. All outputs are
    suggestions, drafts, or reports that require local approval before
    any product mutation.
    """

    def analyze_product(
        self,
        product_input: WooCommerceProductInput,
    ) -> WooCommerceGrowthAnalysisResult:
        """Analyze a single product and return growth suggestions."""
        title_suggestion = self._suggest_titles(product_input)
        description_drafts = self._draft_descriptions(product_input)
        attribute_suggestion = self._suggest_attributes(product_input)
        localization_suggestions = self._suggest_localizations(product_input)
        schema_suggestion = self._suggest_schema(product_input)

        return WooCommerceGrowthAnalysisResult(
            product_id=product_input.product_id,
            title_suggestion=title_suggestion,
            description_drafts=description_drafts,
            attribute_suggestion=attribute_suggestion,
            localization_suggestions=localization_suggestions,
            schema_suggestion=schema_suggestion,
            requires_local_approval=True,
        )

    def generate_batch_plan(
        self,
        items: list[WooCommerceProductInput],
    ) -> BatchTaskPlanSummary:
        """Generate a batch task plan summary for multiple products."""
        plan_items: list[BatchPlanItem] = []
        task_type_set: set[str] = set()

        for item in items:
            suggested_tasks: list[str] = []
            if item.title:
                suggested_tasks.append("title_optimization")
                task_type_set.add("title_optimization")
            if item.short_description or item.long_description:
                suggested_tasks.append("description_enhancement")
                task_type_set.add("description_enhancement")
            if item.attributes:
                suggested_tasks.append("attribute_completion")
                task_type_set.add("attribute_completion")
            if item.target_locales:
                suggested_tasks.append("localization")
                task_type_set.add("localization")
            suggested_tasks.append("seo_schema_enhancement")
            task_type_set.add("seo_schema_enhancement")

            plan_items.append(
                BatchPlanItem(
                    product_reference=item.product_id or item.title or "unknown",
                    suggested_tasks=suggested_tasks,
                )
            )

        return BatchTaskPlanSummary(
            items=plan_items,
            total_products=len(items),
            task_types=sorted(task_type_set),
            requires_local_approval=True,
        )

    def _suggest_titles(
        self,
        product_input: WooCommerceProductInput,
    ) -> ProductTitleSuggestion | None:
        if not product_input.title:
            return None

        original = product_input.title
        suggestions: list[str] = []

        # Simple heuristic-based suggestions for the minimal implementation.
        if len(original) < 30:
            suggestions.append(f"{original} — Premium Quality Selection")
        if "sale" not in original.lower():
            suggestions.append(f"{original} (Limited Offer)")
        suggestions.append(original)

        return ProductTitleSuggestion(
            original=original,
            suggestions=suggestions,
            reasoning="Titles are suggestions only; local approval required before update.",
        )

    def _draft_descriptions(
        self,
        product_input: WooCommerceProductInput,
    ) -> list[ProductDescriptionDraft]:
        drafts: list[ProductDescriptionDraft] = []

        if product_input.short_description:
            drafts.append(
                ProductDescriptionDraft(
                    draft_type="short",
                    original=product_input.short_description,
                    draft=(
                        f"{product_input.short_description}"
                        " Discover why customers love this product."
                    ),
                    reasoning="Draft short description for local review and approval.",
                )
            )

        if product_input.long_description:
            drafts.append(
                ProductDescriptionDraft(
                    draft_type="long",
                    original=product_input.long_description,
                    draft=(
                        f"{product_input.long_description}\n\n"
                        "Key Benefits:\n"
                        "- High quality\n"
                        "- Great value\n"
                        "- Fast delivery"
                    ),
                    reasoning="Draft long description for local review and approval.",
                )
            )

        return drafts

    def _suggest_attributes(
        self,
        product_input: WooCommerceProductInput,
    ) -> ProductAttributeSuggestion | None:
        existing = dict(product_input.attributes)
        suggested: dict[str, Any] = {}

        if "brand" not in existing:
            suggested["brand"] = "Suggested brand value (to be filled locally)"
        if "material" not in existing:
            suggested["material"] = "Suggested material value (to be filled locally)"
        if "color" not in existing:
            suggested["color"] = "Suggested color value (to be filled locally)"

        if not suggested:
            return None

        return ProductAttributeSuggestion(
            existing=existing,
            suggested_additions=suggested,
            reasoning="Attribute suggestions are drafts; local approval required before writing.",
        )

    def _suggest_localizations(
        self,
        product_input: WooCommerceProductInput,
    ) -> list[ProductLocalizationSuggestion]:
        suggestions: list[ProductLocalizationSuggestion] = []

        for locale in product_input.target_locales:
            short = product_input.short_description or "Localized short description placeholder"
            long = product_input.long_description or "Localized long description placeholder"
            suggestions.append(
                ProductLocalizationSuggestion(
                    locale=locale,
                    localized_title=(
                        f"[{locale}] {product_input.title or 'Localized title placeholder'}"
                    ),
                    localized_short_description=f"[{locale}] {short}",
                    localized_long_description=f"[{locale}] {long}",
                    reasoning="Localization drafts require local review before publication.",
                )
            )

        return suggestions

    def _suggest_schema(
        self,
        product_input: WooCommerceProductInput,
    ) -> ProductSchemaSuggestion | None:
        recommended_fields: dict[str, Any] = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product_input.title or "Product name placeholder",
            "description": product_input.short_description or product_input.long_description or "",
            "offers": {
                "@type": "Offer",
                "availability": "https://schema.org/InStock",
            },
        }

        if product_input.categories:
            recommended_fields["category"] = product_input.categories[0]

        return ProductSchemaSuggestion(
            schema_type="Product",
            recommended_fields=recommended_fields,
            reasoning="SEO/GEO-ready Product Schema suggestion; local approval required.",
        )
