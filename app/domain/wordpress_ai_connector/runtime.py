from __future__ import annotations

import base64
import json
import re
import unicodedata
from collections import Counter
from collections.abc import Callable
from typing import Any, cast
from urllib.parse import unquote

from sqlalchemy.orm import Session

from app.adapters.providers.base import (
    ProviderAdapter,
    ProviderExecutionError,
    ProviderExecutionRequest,
    ProviderExecutionResult,
)
from app.core.config import Settings
from app.domain.media_artifacts.input_loading import LoadedArtifactInput
from app.domain.runtime.errors import RuntimeExecutionContractError
from app.domain.site_knowledge.contracts import (
    SITE_KNOWLEDGE_CONTRACTS,
    SITE_KNOWLEDGE_SEARCH_ABILITY,
)
from app.domain.site_knowledge.repository import SiteKnowledgeRepository
from app.domain.site_knowledge.service import SiteKnowledgeService
from app.domain.wordpress_ai_connector.contracts import (
    WORDPRESS_OPERATION_CONTRACT,
    WP_AI_CONNECTOR_MAX_SOURCE_TEXT_CHARS,
    WP_AI_CONNECTOR_SOURCE_TEXT_TASKS,
    contains_inline_media_transport,
    resolve_site_knowledge_reference_mode,
)
from app.domain.wordpress_ai_connector.generation_context import (
    GENERATION_CONTEXT_CONTRACT,
    build_generation_context_pack,
    generation_context_policy,
    render_generation_context,
    select_generation_context_post_ids,
)
from app.domain.wordpress_ai_connector.routing_profiles import (
    resolve_wordpress_ai_connector_profile_spec,
)

EmbeddingUsageCallback = Callable[
    [str, ProviderExecutionRequest, ProviderExecutionResult | None, ProviderExecutionError | None],
    None,
]

_TRANSFORMATION_GENERIC_PATTERNS = (
    re.compile(
        r"\b(?:this|the)\s+(?:condensed|shortened|revised|rewritten|updated|improved)"
        r"\s+(?:paragraph|content|text)\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:has been|was|is now)(?:\s+\w+){0,2}\s+"
        r"(?:revised|rewritten|updated|improved|optimized)\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:to produce|suitable for)\s+(?:a|an|the)\s+"
        r"(?:(?:clear|concise|short|revised|rewritten|updated)\s+)?"
        r"(?:version|article|paragraph|text|result)\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:requires|needs)\s+(?:condensation|shortening|rewriting|optimization)\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"\bwe\s+suggest\s+(?:removing|replacing|rewriting|shortening|condensing)\b",
        flags=re.IGNORECASE,
    ),
    re.compile(r"\bto\s+make\s+it\s+read\s+(?:well|better)\b", flags=re.IGNORECASE),
    re.compile(
        r"\b(?:use|suggest)\s+(?:a|an|the)\s+"
        r"(?:(?:clear|concise|short|revised|rewritten|updated)\s+)?"
        r"(?:replacement|rewrite|version|alternative)\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:offers?|provides?)\s+(?:a|an|the)\s+"
        r"(?:(?:clear|concise|short|useful|and)\s+){0,5}"
        r"(?:statement|summary|overview)\s+(?:for|to)\s+readers\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"(?:该|此)?(?:段落|内容|文本).*(?:已|已经|完成|更新|优化|改写|修订)",
        flags=re.IGNORECASE | re.DOTALL,
    ),
)
_TRANSFORMATION_LATIN_TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'-]*")
_TRANSFORMATION_CJK_RUN_RE = re.compile(r"[\u3400-\u9fff]+")
_TRANSFORMATION_STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "be",
        "for",
        "has",
        "in",
        "is",
        "it",
        "of",
        "on",
        "the",
        "this",
        "to",
        "was",
    }
)


class WordPressOperationRuntime:
    """Executes WordPress-specific provider preparation and result normalization."""

    def __init__(
        self,
        *,
        settings: Settings,
        providers: dict[str, ProviderAdapter],
    ) -> None:
        self.settings = settings
        self.providers = providers

    def source_artifact_id(self, input_payload: dict[str, Any]) -> str:
        operation_contract = self._dict_or_empty(input_payload.get("operation_contract"))
        if str(operation_contract.get("task") or "").strip() != "alt_text_suggest":
            return ""
        scene_request = self._dict_or_empty(operation_contract.get("request"))
        return str(scene_request.get("source_artifact_id") or "").strip()

    def build_provider_input(
        self,
        input_payload: dict[str, Any],
        *,
        source_artifact: LoadedArtifactInput | None = None,
    ) -> dict[str, Any]:
        operation_contract = self._dict_or_empty(input_payload.get("operation_contract"))
        scene_request = operation_contract.get("request")
        scene_request = scene_request if isinstance(scene_request, dict) else {}
        task = str(operation_contract.get("task") or "").strip()
        if task == "alt_text_suggest":
            if source_artifact is None:
                raise ValueError("alt text provider input requires loaded source artifact")
            return self._build_alt_text_provider_input(
                scene_request=scene_request,
                source_artifact=source_artifact,
            )

        scene_text = str(
            scene_request.get(
                "source_text" if task in WP_AI_CONNECTOR_SOURCE_TEXT_TASKS else "prompt"
            )
            or ""
        ).strip()
        raw_system_instruction = scene_request.get("system_instruction")
        if task in WP_AI_CONNECTOR_SOURCE_TEXT_TASKS:
            system_instruction = (
                raw_system_instruction.strip() if isinstance(raw_system_instruction, str) else ""
            )
        else:
            system_instruction = str(raw_system_instruction or "").strip()
        task_contract = self._dict_or_empty(scene_request.get("task_contract"))
        task_family = str(task_contract.get("task_family") or "").strip()
        title_output_schema = self._title_output_schema(task=task, task_contract=task_contract)
        raw_constraints = task_contract.get("constraints")
        constraint_items = raw_constraints if isinstance(raw_constraints, list) else []
        constraints = {
            str(item).strip()
            for item in constraint_items
            if isinstance(item, str) and str(item).strip()
        }

        task_instruction = {
            "alt_text_suggest": "Generate concise image alt text. Return only the alt text.",
            "comment_moderation": (
                "Classify the comment moderation outcome. Return strict JSON only. No markdown."
            ),
            "comment_reply_suggest": "Draft a concise comment reply. Return only the reply text.",
            "content_translation": (
                "Translate the supplied content into the requested target language. "
                "Preserve HTML and block markup. When Gutenberg block comments are present, "
                "copy every block delimiter and every HTML tag exactly and translate only "
                "visible human text inside the existing structure. Keep the same number and "
                "order of blocks, links, attributes, and code markers. Return only the "
                "translated content. Do not wrap the answer in <content> tags or any other "
                "container."
            ),
            "content_classification": (
                'Classify the content. Return strict JSON only: {"suggestions":'
                '[{"term":"...","confidence":0.8,"is_new":false}]}. No markdown.'
            ),
            "content_rewrite": (
                "Rewrite only the supplied content according to the request. Return exactly "
                "one rewritten version (one revised version) and nothing else. Preserve the "
                "original meaning, facts, "
                "names, numbers, links, and structure. Keep the result close to the source "
                "length; do not expand a short paragraph into an explanation, add background, "
                "product names, workflow claims, or administrative context."
            ),
            "content_summary": "Summarize the content. Return only the summary.",
            "editorial_notes": (
                "Review the supplied block and return strict JSON matching the Ability "
                "schema. Do not return Markdown or explanations. When review_types are "
                "provided and the block contains a clear readability, grammar, SEO, or "
                "accessibility issue, return a concrete suggestion. Use the requested "
                "review type and include review_type, text, and priority in each "
                "suggestion. If an objective issue is present, an empty suggestions array "
                "is invalid; return at least one actionable suggestion. An empty suggestions "
                "array is valid only when there is no material, objective issue."
            ),
            "editorial_updates": (
                "Rewrite the supplied content according to the editorial notes. Return only "
                "the final revised content, with no preface, explanation, reasoning, labels, "
                "or mention of the notes. Preserve the original facts and language. If a "
                "note is vague, make the smallest clear grammatical improvement possible; "
                "never say that the task is impossible and never describe your process. Keep "
                "the result close to the source length; do not expand a short paragraph into "
                "an explanation, add background, product names, workflow claims, or "
                "administrative context. Return the revised paragraph itself and retain its "
                "substantive words; do not replace the paragraph with a completion statement "
                "such as 'updated', 'optimized', or 'ready for readers'."
            ),
            "excerpt_generation": (
                "Generate a concise excerpt from the supplied content. Use only facts, "
                "names, products, organizations, and claims that appear in the source. "
                "Preserve the source's concrete topic and key nouns verbatim when possible. "
                "Do not introduce concepts, relationships, audiences, benefits, or business "
                "context that the source does not contain. If the source is short, extract or "
                "lightly compress its own wording instead of expanding it. Return only the "
                "excerpt itself."
            ),
            "image_prompt_generation": (
                "Generate one concise image prompt. Return only the prompt text."
            ),
            "meta_description": (
                "Generate one SEO meta description, 120 to 155 characters, from the "
                "supplied content and title. Use only facts, names, products, "
                "organizations, and claims present in that source. Preserve the source's "
                "key nouns verbatim when possible. Do not introduce concepts, relationships, "
                "audiences, benefits, or generic business promises absent from the source. "
                "If the source is short, stay close to its wording rather than expanding it. "
                "Return only the description itself."
            ),
            "title_generation": (
                "Generate exactly one concise title faithful to the main topic. For Chinese, "
                "normally use no more than 36 characters; for other languages, normally use "
                "no more than 12 words. Return only the title text."
            ),
            "slug_generation": (
                "Generate concise SEO-friendly slug suggestions and return strict JSON "
                "matching the Ability schema. Use lowercase ASCII letters and digits "
                "separated by hyphens only. Never return Unicode characters, percent "
                "encoded bytes, percent signs, underscores, spaces, or a full URL."
            ),
        }.get(task)
        if task_instruction is None:
            task_instruction = {
                "generation": "Generate the requested value from the scene input.",
                "classification": (
                    "Classify the scene input according to the requested output schema."
                ),
                "transformation": "Transform the scene input as requested.",
                "analysis": "Analyze the scene input and return the requested result.",
            }.get(task_family, "Return only the requested suggestion. Do not explain.")

        if task == "title_generation" and title_output_schema:
            task_instruction = (
                "Generate exactly one concise title faithful to the main topic. For Chinese, "
                "normally use no more than 36 characters; for other languages, normally use "
                "no more than 12 words. Return one strict JSON object with exactly one string "
                "field named `title`. Do not return bare title text."
            )

        fragments = [task_instruction]
        if task != "slug_generation":
            fragments.append(
                "Use the same language as the scene input unless a WordPress ability "
                "instruction explicitly asks for another language."
            )
        else:
            fragments.append(
                "Slugs are an ASCII transport value: use lowercase ASCII letters and "
                "digits separated by hyphens only. Never return Unicode characters, "
                "percent-encoded bytes, percent signs, underscores, spaces, or a full URL."
            )
            fragments.append(
                "For named entities and product terms, use their established Latin spelling "
                "when one is known (for example WordPress, WeChat, Baidu, and mini-program). "
                "Do not invent pinyin by splitting Chinese characters into arbitrary syllables."
            )
        target_language = str(scene_request.get("target_language") or "").strip()
        if task == "content_translation" and target_language:
            fragments.append(
                f"WordPress target language: {target_language}. Translate into this language "
                "even when the scene input uses another language."
            )
        if title_output_schema:
            fragments.append(
                "Output contract: return one strict JSON object matching the title Ability "
                "schema. Do not include Markdown, explanations, multiple options, or any "
                "field other than `title`."
            )
        else:
            fragments.append(
                "Output contract: return only the final value for this one task. Do not "
                "include introductions, headings, Markdown, bullet lists, numbered lists, "
                "multiple options, labels, explanations, or offers to continue. Never add a "
                "name, number, claim, or event that is absent from the scene input."
            )
        if "json_object" in constraints:
            fragments.append(
                "Return one strict JSON object matching the Ability output schema. No markdown."
            )
            output_schema = self._provider_json_output_schema(
                task=task,
                output_schema=self._dict_or_empty(task_contract.get("output_schema")),
            )
            if output_schema:
                fragments.append(
                    "Ability output schema: "
                    + json.dumps(output_schema, ensure_ascii=False, separators=(",", ":"))
                )
        if "single_value" in constraints and not title_output_schema:
            fragments.append("Return exactly one value, not a list of alternatives.")
        if "source_grounded" in constraints:
            fragments.append("Keep every factual claim grounded in the current scene input.")
        if "no_new_numbers" in constraints:
            fragments.append(
                "Do not introduce a number that is absent from the current scene input."
            )
        if "existing_terms_only" in constraints:
            fragments.append("Choose only from the supplied existing taxonomy candidates.")
        if task == "content_classification" and self._has_available_terms(scene_text):
            fragments.append(
                "The scene input includes <available-terms>. Choose only exact term names "
                "from that list and set is_new=false for every suggestion."
            )
        if system_instruction:
            fragments.append(system_instruction)
        if task != "slug_generation" and self._is_predominantly_cjk(scene_text):
            fragments.append(
                "The scene is predominantly Simplified Chinese. Write every human-readable "
                "part of the result in Simplified Chinese, including suggestions and "
                "explanations. Preserve proper nouns, code, URLs, and quoted technical terms "
                "when needed; do not translate those mechanically."
            )
        if scene_text:
            fragments.append(f"Scene input:\n{scene_text}")
        fragments.append("Do not mention this instruction. Do not explain your answer.")

        provider_input: dict[str, Any] = {
            "input": "\n\n".join(fragments),
            "text": scene_text,
            "metadata": {
                "source_surface": "wordpress_ai_connector",
                "task": task,
                "ability_name": str(task_contract.get("ability_name") or ""),
                "task_family": task_family,
                "task_constraints": sorted(constraints),
                "suggestion_only": True,
            },
        }
        if task == "content_classification":
            # Keep the local Ability's classification controls available as
            # non-authoritative runtime metadata. The candidate terms remain
            # in the official prompt; Cloud uses these fields only to preserve
            # strategy semantics and to make the run diagnosable.
            taxonomy = str(scene_request.get("taxonomy") or "").strip()
            strategy = str(scene_request.get("strategy") or "").strip()
            max_suggestions = self._coerce_int(scene_request.get("max_suggestions"), default=0)
            if taxonomy:
                provider_input["metadata"]["taxonomy"] = taxonomy[:64]
            if strategy:
                provider_input["metadata"]["taxonomy_strategy"] = strategy[:32]
            if max_suggestions > 0:
                provider_input["metadata"]["taxonomy_max_suggestions"] = min(max_suggestions, 10)
        if any(
            key in task_contract for key in ("ability_id", "contract_source", "verification_state")
        ):
            if task_contract.get("ability_id"):
                provider_input["metadata"]["ability_id"] = str(task_contract["ability_id"])
            if task_contract.get("contract_source"):
                provider_input["metadata"]["contract_source"] = str(
                    task_contract["contract_source"]
                )
            if task_contract.get("contract_version"):
                provider_input["metadata"]["contract_version"] = str(
                    task_contract["contract_version"]
                )
        schema_hash = str(task_contract.get("schema_hash") or "").strip()
        if schema_hash:
            provider_input["metadata"]["ability_schema_hash"] = schema_hash
        if task_contract.get("verification_state"):
            provider_input["metadata"]["contract_status"] = str(task_contract["verification_state"])
        if task == "content_translation":
            target_language = str(scene_request.get("target_language") or "").strip().lower()
            if target_language:
                provider_input["metadata"]["target_language"] = target_language
        if title_output_schema:
            provider_input["metadata"]["ability_output_schema"] = title_output_schema
            provider_input["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "wordpress_title_generation_output",
                    "schema": self._provider_title_output_schema(title_output_schema),
                    "strict": True,
                },
            }
        elif "json_object" in constraints:
            output_schema = self._provider_json_output_schema(
                task=task,
                output_schema=self._dict_or_empty(task_contract.get("output_schema")),
            )
            provider_input["metadata"]["ability_output_schema"] = output_schema
            provider_input["response_format"] = (
                {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "wordpress_ability_output",
                        "schema": output_schema,
                        # Ability schemas may contain optional or open object fields.
                        # Preserve that contract instead of inheriting strict defaults.
                        "strict": False,
                    },
                }
                if output_schema
                else {"type": "json_object"}
            )

        default_max_tokens = {
            # Small reasoning-capable vision models may spend a short prefix
            # on internal reasoning even when thinking is disabled. Keep
            # enough output budget for the final alt text to be emitted.
            "alt_text_suggest": 512,
            "comment_moderation": 120,
            "comment_reply_suggest": 180,
            "content_classification": 220,
            "content_rewrite": 512,
            "content_summary": 160,
            "editorial_updates": 256,
            "excerpt_generation": 140,
            "meta_description": 80,
            "title_generation": 48,
        }.get(
            task,
            {
                "generation": 160,
                "classification": 220,
                "transformation": 512,
                "analysis": 220,
            }.get(task_family, 160),
        )

        max_tokens = self._coerce_int(scene_request.get("max_tokens"), default=0)
        if max_tokens <= 0:
            max_tokens = default_max_tokens
        if max_tokens > 0:
            provider_input["max_tokens"] = max_tokens
            provider_input["max_output_tokens"] = max_tokens

        temperature = scene_request.get("temperature")
        if isinstance(temperature, (int, float)):
            provider_input["temperature"] = float(temperature)
        elif task in {
            "content_translation",
            "content_classification",
            "editorial_notes",
            "slug_generation",
        }:
            # Structure-sensitive connector tasks should be reproducible by
            # default. Callers can still provide an explicit temperature when
            # the local Ability contract allows it.
            provider_input["temperature"] = 0.0

        return provider_input

    def apply_site_knowledge_reference(
        self,
        *,
        site_id: str,
        run_id: str,
        session: Session,
        input_payload: dict[str, Any],
        provider_input: dict[str, Any],
        embedding_usage_callback: EmbeddingUsageCallback,
    ) -> dict[str, Any]:
        operation_contract = self._dict_or_empty(input_payload.get("operation_contract"))
        scene_request = self._dict_or_empty(operation_contract.get("request"))
        reference = self._dict_or_empty(scene_request.get("site_knowledge_reference"))
        task = str(operation_contract.get("task") or "").strip()
        task_contract = self._dict_or_empty(scene_request.get("task_contract"))
        expected_mode = resolve_site_knowledge_reference_mode(
            task=task,
            task_contract=task_contract,
        )
        mode = str(reference.get("mode") or "")
        if not expected_mode or mode != expected_mode or reference.get("enabled") is not True:
            return self._generation_context_status(
                provider_input,
                mode=expected_mode or "none",
                status="not_requested",
                reason="reference_disabled_or_unsupported",
            )

        policy = generation_context_policy(
            task=task,
            mode=mode,
            task_family=str(task_contract.get("task_family") or ""),
            context_requirements=task_contract.get("context_requirements"),
        )
        if policy is None:
            return self._generation_context_status(
                provider_input,
                mode=mode,
                status="unavailable",
                reason="task_policy_unavailable",
            )

        scene_text = str(
            scene_request.get(
                "source_text" if task in WP_AI_CONNECTOR_SOURCE_TEXT_TASKS else "prompt"
            )
            or ""
        ).strip()
        if not scene_text:
            return self._generation_context_status(
                provider_input,
                mode=mode,
                status="unavailable",
                reason="scene_input_empty",
            )

        try:
            result = SiteKnowledgeService(
                session,
                settings=self.settings,
                providers=self.providers,
                embedding_usage_callback=embedding_usage_callback,
            ).execute(
                site_id=site_id,
                ability_name=SITE_KNOWLEDGE_SEARCH_ABILITY,
                contract_version=SITE_KNOWLEDGE_CONTRACTS[SITE_KNOWLEDGE_SEARCH_ABILITY],
                input_payload={
                    "contract_version": SITE_KNOWLEDGE_CONTRACTS[SITE_KNOWLEDGE_SEARCH_ABILITY],
                    "query": scene_text,
                    "intent": "writing_context",
                    "max_results": min(20, policy.max_source_posts * 2),
                    "filters": {
                        "post_types": ["post", "page"],
                        "status": ["publish"],
                        "source_types": ["post", "page"],
                    },
                    "evidence_policy": {
                        "min_score": policy.min_score,
                        "required_sources": 1,
                        "no_hit_policy": "fallback_to_general",
                    },
                    "write_posture": "suggestion_only",
                },
                run_id=run_id,
            )
        except Exception:
            # Optional references must never break the primary editor task.
            return self._generation_context_status(
                provider_input,
                mode=mode,
                status="unavailable",
                reason="retrieval_failed",
            )

        evidence_gate = self._dict_or_empty(result.get("evidence_gate"))
        if str(evidence_gate.get("status") or "") != "passed":
            return self._generation_context_status(
                provider_input,
                mode=mode,
                status="unavailable",
                reason="insufficient_evidence",
            )
        raw_results = result.get("results")
        results: list[object] = []
        if isinstance(raw_results, list):
            results = cast(list[object], raw_results)
        try:
            post_ids = select_generation_context_post_ids(
                policy=policy,
                prompt=scene_text,
                results=results,
            )
            reference_metadata = SiteKnowledgeRepository(session).reference_metadata_for_post_ids(
                site_id=site_id, post_ids=post_ids
            )
            pack = build_generation_context_pack(
                policy=policy,
                post_ids=post_ids,
                results=results,
                reference_metadata=reference_metadata,
            )
            reference_block = render_generation_context(pack) if pack is not None else ""
        except Exception:
            return self._generation_context_status(
                provider_input,
                mode=mode,
                status="unavailable",
                reason="context_assembly_failed",
            )
        if pack is None or not reference_block:
            return self._generation_context_status(
                provider_input,
                mode=mode,
                status="unavailable",
                reason="no_usable_references",
            )
        next_input = dict(provider_input)
        base_input = str(provider_input.get("input") or "")
        scene_marker = "\n\nScene input:\n"
        if scene_marker in base_input:
            next_input["input"] = base_input.replace(
                scene_marker,
                f"\n\n{reference_block}{scene_marker}",
                1,
            )
        else:
            next_input["input"] = f"{reference_block}\n\n{base_input}"
        next_input = self._generation_context_status(
            next_input,
            mode=mode,
            status="applied",
            reason="references_applied",
            reference_count=int(pack["reference_count"]),
            context_chars=int(pack["context_chars"]),
        )
        metadata = dict(self._dict_or_empty(next_input.get("metadata")))
        metadata["site_knowledge_reference"] = "applied"
        metadata["site_knowledge_reference_mode"] = mode
        metadata["site_knowledge_reference_count"] = int(pack["reference_count"])
        next_input["metadata"] = metadata
        return next_input

    def normalize_provider_output(
        self,
        output: dict[str, Any],
        *,
        input_payload: dict[str, Any],
    ) -> dict[str, Any]:
        metadata = input_payload.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}
        task = str(metadata.get("task") or "").strip()
        constraints = {
            str(item).strip()
            for item in metadata.get("task_constraints", [])
            if isinstance(item, str) and str(item).strip()
        }
        output_text = self._extract_provider_output_text(output)
        if task == "alt_text_suggest":
            return self._normalize_alt_text_provider_output(
                output_text=output_text,
            )
        ability_output_schema = self._dict_or_empty(metadata.get("ability_output_schema"))
        title_output_schema = self._title_output_schema(
            task=task,
            task_contract={"output_schema": ability_output_schema},
        )
        if task == "title_generation" and title_output_schema:
            output_text = self._extract_title_schema_output(
                output_text=output_text,
                output_schema=title_output_schema,
            )
            if not output_text:
                return {}
        elif (
            "json_object" in constraints
            and ability_output_schema
            and task not in {"content_classification"}
        ):
            output_text = self._normalize_json_schema_output(
                output_text,
                output_schema=ability_output_schema,
            )
            if not output_text:
                return {}
        if not output_text:
            return output

        normalized_text = ""
        strips_reasoning_noise = task in {
            "title_generation",
            "excerpt_generation",
            "meta_description",
            "content_summary",
        } and self._has_reasoning_noise(output_text)
        if task == "meta_description":
            normalized_text = self._normalize_meta_description(
                output_text,
                source_text=str(input_payload.get("text") or ""),
            )
        elif task == "content_classification":
            normalized_text = self._normalize_classification_output(
                output_text,
                source_text=str(input_payload.get("text") or ""),
                strategy=str(metadata.get("taxonomy_strategy") or ""),
            )
        elif task == "slug_generation":
            normalized_text = self._normalize_slug_output(output_text)
        elif task in (
            "title_generation",
            "excerpt_generation",
            "content_summary",
            "content_rewrite",
        ):
            normalized_text = self._normalize_plain_text_output(
                output_text,
                limit={
                    "content_rewrite": WP_AI_CONNECTOR_MAX_SOURCE_TEXT_CHARS,
                    "title_generation": 80,
                    "excerpt_generation": 180,
                    "content_summary": 220,
                }[task],
                strip_explanation=task in {"title_generation", "content_rewrite"},
                source_text=str(input_payload.get("text") or ""),
                task=task,
            )
        elif task == "editorial_updates" or "single_value" in constraints:
            normalized_text = self._normalize_plain_text_output(
                output_text,
                limit=(
                    WP_AI_CONNECTOR_MAX_SOURCE_TEXT_CHARS
                    if task in {"content_translation", "editorial_updates"}
                    else 320
                ),
                strip_explanation=task not in {"content_translation"},
                source_text=str(input_payload.get("text") or ""),
                task=task,
            )

        if not normalized_text and not strips_reasoning_noise:
            return output
        if self._transformation_quality_reason(
            source_text=str(input_payload.get("text") or ""),
            output_text=normalized_text,
            task=task,
        ):
            return {}

        normalized = dict(output)
        normalized["output_text"] = normalized_text
        normalized["messages"] = [{"role": "assistant", "content": normalized_text}]
        # Responses diagnostics and typed output items are adapter evidence,
        # not part of the WordPress suggestion contract. Tool execution keeps
        # its own normalized call projection before this connector boundary.
        normalized.pop("output", None)
        normalized.pop("response_status", None)
        return normalized

    @staticmethod
    def _editorial_update_keeps_source_content(*, source_text: str, output_text: str) -> bool:
        """Reject completion statements that replace the requested paragraph."""
        return WordPressOperationRuntime._transformation_output_keeps_source_content(
            source_text=source_text,
            output_text=output_text,
            task="editorial_updates",
        )

    @staticmethod
    def _rewrite_keeps_source_content(*, source_text: str, output_text: str) -> bool:
        """Reject generic rewrite summaries that are not rewritten source content."""
        return WordPressOperationRuntime._transformation_output_keeps_source_content(
            source_text=source_text,
            output_text=output_text,
            task="content_rewrite",
        )

    @staticmethod
    def _transformation_quality_reason(
        *, source_text: str, output_text: str, task: str
    ) -> str | None:
        if task == "content_rewrite" and not (
            WordPressOperationRuntime._rewrite_keeps_source_content(
                source_text=source_text,
                output_text=output_text,
            )
        ):
            return "output_not_grounded"
        if task == "editorial_updates" and not (
            WordPressOperationRuntime._editorial_update_keeps_source_content(
                source_text=source_text,
                output_text=output_text,
            )
        ):
            return "output_not_grounded"
        return None

    @staticmethod
    def _transformation_output_keeps_source_content(
        *, source_text: str, output_text: str, task: str
    ) -> bool:
        """Keep bounded transformations while rejecting unsupported completion prose."""
        source_plain = re.sub(r"<[^>]+>", " ", source_text).strip()
        output_plain = re.sub(r"<[^>]+>", " ", output_text).strip()
        if task == "editorial_updates" and len(output_plain) > max(512, len(source_plain) * 8):
            return False
        if not source_plain or not output_plain:
            return False

        looks_generic = any(
            pattern.search(output_plain) for pattern in _TRANSFORMATION_GENERIC_PATTERNS
        )
        if not looks_generic:
            return True

        source_tokens = WordPressOperationRuntime._transformation_tokens(source_plain)
        output_tokens = WordPressOperationRuntime._transformation_tokens(output_plain)
        overlap = len(source_tokens & output_tokens)
        # A generic completion is safe only when it still carries at least two
        # substantive source terms. This catches provider boilerplate without
        # rejecting a bounded paraphrase that retains the subject and action.
        return overlap >= 2

    @staticmethod
    def _transformation_tokens(text: str) -> set[str]:
        tokens = {
            token.lower()
            for token in _TRANSFORMATION_LATIN_TOKEN_RE.findall(text)
            if token.lower() not in _TRANSFORMATION_STOP_WORDS and len(token) > 1
        }
        for match in _TRANSFORMATION_CJK_RUN_RE.finditer(text):
            run = match.group(0)
            if len(run) < 2:
                continue
            tokens.update((run,))
            tokens.update(run[index : index + 2] for index in range(len(run) - 1))
        return tokens

    def _normalize_alt_text_provider_output(
        self,
        *,
        output_text: str,
    ) -> dict[str, Any]:
        if not output_text or contains_inline_media_transport(output_text):
            return {}
        normalized_text = self._normalize_plain_text_output(
            output_text,
            limit=240,
            strip_explanation=True,
            task="alt_text_suggest",
        )
        if not normalized_text or contains_inline_media_transport(normalized_text):
            return {}
        return {"output_text": normalized_text}

    @staticmethod
    def _provider_json_output_schema(
        *, task: str, output_schema: dict[str, object]
    ) -> dict[str, object]:
        """Add provider-only fields required by an Ability's execution parser."""
        if task != "editorial_notes" or not output_schema:
            return output_schema
        schema = json.loads(json.dumps(output_schema, ensure_ascii=False))
        properties = schema.get("properties")
        suggestions = properties.get("suggestions") if isinstance(properties, dict) else None
        item_schema = suggestions.get("items") if isinstance(suggestions, dict) else None
        if not isinstance(item_schema, dict):
            return schema
        item_schema.setdefault("type", "object")
        item_properties = item_schema.setdefault("properties", {})
        if not isinstance(item_properties, dict):
            item_properties = {}
            item_schema["properties"] = item_properties
        item_properties.setdefault("priority", {"type": "integer", "minimum": 1, "maximum": 5})
        required = item_schema.setdefault("required", ["review_type", "text", "priority"])
        if isinstance(required, list) and "priority" not in required:
            required.append("priority")
        return schema

    @staticmethod
    def _title_output_schema(*, task: str, task_contract: dict[str, object]) -> dict[str, object]:
        """Return the current title Ability schema only when it is safe to enforce."""
        if task != "title_generation":
            return {}
        output_schema = task_contract.get("output_schema")
        if not isinstance(output_schema, dict) or output_schema.get("type") != "object":
            return {}
        properties = output_schema.get("properties")
        title = properties.get("title") if isinstance(properties, dict) else None
        if not isinstance(title, dict) or title.get("type") != "string":
            return {}
        return output_schema

    @staticmethod
    def _provider_title_output_schema(
        output_schema: dict[str, object],
    ) -> dict[str, object]:
        """Build a strict Provider copy without replacing Ability-owned schema truth."""
        properties = output_schema.get("properties")
        title = properties.get("title") if isinstance(properties, dict) else {}
        return {
            "type": "object",
            "properties": {"title": title},
            "required": ["title"],
            "additionalProperties": False,
        }

    @staticmethod
    def _extract_title_schema_output(*, output_text: str, output_schema: dict[str, object]) -> str:
        """Extract a title field and fail closed when the declared schema is absent."""
        if output_schema.get("type") != "object":
            return ""
        properties = output_schema.get("properties")
        title_schema = properties.get("title") if isinstance(properties, dict) else None
        if not isinstance(title_schema, dict) or title_schema.get("type") != "string":
            return ""
        try:
            value = json.loads(output_text)
        except json.JSONDecodeError:
            return ""
        if not isinstance(value, dict):
            return ""
        title = value.get("title")
        return title.strip() if isinstance(title, str) else ""

    def is_empty_text_output(
        self,
        *,
        input_payload: dict[str, Any],
        provider_output: dict[str, Any],
    ) -> bool:
        metadata = input_payload.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}
        task = str(metadata.get("task") or "").strip()
        constraints = {
            str(item).strip()
            for item in metadata.get("task_constraints", [])
            if isinstance(item, str) and str(item).strip()
        }
        output_schema = self._dict_or_empty(metadata.get("ability_output_schema"))
        if "json_object" in constraints and output_schema:
            normalized = self._normalize_json_schema_output(
                self._extract_provider_output_text(provider_output),
                output_schema=output_schema,
            )
            if not normalized:
                return True
            return False
        if (
            task
            not in {
                "alt_text_suggest",
                "comment_reply_suggest",
                "content_rewrite",
                "content_summary",
                "content_translation",
                "excerpt_generation",
                "meta_description",
                "title_generation",
            }
            and "single_value" not in constraints
        ):
            return False
        response_status = str(provider_output.get("response_status") or "").strip().lower()
        if response_status in {"incomplete", "failed", "cancelled"}:
            return True
        output_text = self._extract_provider_output_text(provider_output)
        if output_text == "":
            return True
        if task == "content_translation":
            if self._translation_quality_reason(
                source_text=str(input_payload.get("text") or ""),
                output_text=output_text,
                target_language=str(metadata.get("target_language") or ""),
            ):
                return True
        if self._looks_like_provider_reasoning(output_text):
            return True
        if task != "title_generation":
            return False
        if self._has_unbalanced_title_quote(output_text):
            return True
        usage = provider_output.get("usage")
        usage = usage if isinstance(usage, dict) else {}
        completion_details = usage.get("completion_tokens_details")
        completion_details = completion_details if isinstance(completion_details, dict) else {}
        reasoning_tokens = self._coerce_int(
            completion_details.get("reasoning_tokens"),
            default=0,
        )
        visible_unit_count = len(
            re.findall(
                r"[A-Za-z0-9]+|[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]",
                output_text,
            )
        )
        return reasoning_tokens > 0 and visible_unit_count <= 3

    def output_quality_reason(
        self,
        *,
        input_payload: dict[str, Any],
        provider_output: dict[str, Any],
    ) -> str:
        """Return a content-free reason for a rejected Connector result."""
        response_status = str(provider_output.get("response_status") or "").strip().lower()
        if response_status in {"incomplete", "failed", "cancelled"}:
            return f"responses_{response_status}"
        output_text = self._extract_provider_output_text(provider_output)
        if not output_text:
            return "empty_output_text"
        if self._looks_like_provider_reasoning(output_text):
            return "provider_reasoning_leak"
        metadata = input_payload.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}
        task = str(metadata.get("task") or "").strip()
        source_text = str(input_payload.get("text") or "")
        transformation_reason = self._transformation_quality_reason(
            source_text=source_text,
            output_text=output_text,
            task=task,
        )
        if transformation_reason:
            return transformation_reason
        constraints = {
            str(item).strip()
            for item in metadata.get("task_constraints", [])
            if isinstance(item, str) and str(item).strip()
        }
        output_schema = self._dict_or_empty(metadata.get("ability_output_schema"))
        if task == "content_translation":
            translation_reason = self._translation_quality_reason(
                source_text=str(input_payload.get("text") or ""),
                output_text=output_text,
                target_language=str(metadata.get("target_language") or ""),
            )
            if translation_reason:
                return translation_reason
        if "json_object" in constraints and output_schema:
            normalized = self._normalize_json_schema_output(
                self._extract_provider_output_text(provider_output),
                output_schema=output_schema,
            )
            if not normalized:
                return "ability_output_schema_invalid"
        if task == "title_generation" and self._dict_or_empty(
            metadata.get("ability_output_schema")
        ):
            try:
                parsed = json.loads(output_text)
            except json.JSONDecodeError:
                return "title_schema_invalid_json"
            if not isinstance(parsed, dict) or not isinstance(parsed.get("title"), str):
                return "title_schema_missing_title"
            if not parsed["title"].strip():
                return "title_schema_empty_title"
        return "normalized_text_empty"

    @classmethod
    def _translation_quality_reason(
        cls,
        *,
        source_text: str,
        output_text: str,
        target_language: str,
    ) -> str:
        """Reject translation output that is structurally unsafe or contaminated."""
        if cls._contains_translation_refusal(output_text):
            return "translation_refusal_leak"

        source_markers = cls._translation_structure_markers(source_text)
        output_markers = cls._translation_structure_markers(output_text)
        if source_markers != output_markers:
            return "translation_structure_drift"

        normalized_target = target_language.strip().lower().replace("_", "-")
        if normalized_target not in {"zh-cn", "zh-tw", "zh-hans", "zh-hant"}:
            source_cjk = cls._translation_visible_cjk_count(source_text)
            output_cjk = cls._translation_visible_cjk_count(output_text)
            if source_cjk == 0 and output_cjk >= 1:
                return "target_language_mismatch"
            # A few CJK characters can be valid proper nouns. A fifth of a
            # substantial source is a strong signal that the model left source
            # paragraphs untranslated, so fail closed before WordPress stores it.
            if source_cjk >= 80 and output_cjk >= max(20, int(source_cjk * 0.20)):
                return "translation_untranslated_source"

        if len(source_text) >= 200 and len(output_text) > int(len(source_text) * 2.2):
            return "translation_length_inflation"
        return ""

    @staticmethod
    def _contains_translation_refusal(output_text: str) -> bool:
        return bool(
            re.search(
                r"(?is)(?:"
                r"i\s+(?:cannot|can't|can\s+not)\s+(?:complete|fulfill|help|comply)|"
                r"per\s+my\s+instructions|"
                r"i\s+must\s+refuse|"
                r"as\s+an\s+ai\b|"
                r"我(?:不能|无法|不可以)(?:完成|遵循|提供)|"
                r"根据我的指令"
                r")",
                output_text,
            )
        )

    @staticmethod
    def _translation_structure_markers(value: str) -> dict[str, object]:
        tags = Counter(
            match.group(1).lower()
            for match in re.finditer(r"</?([A-Za-z][\w:-]*)\b[^>]*>", value)
            if match.group(1).lower() not in {"content", "block-content"}
        )
        block_comments = Counter(re.findall(r"<!--\s*/?wp:[^>]+-->", value, flags=re.I))
        links = Counter(
            re.sub(r"[),.;:，。；：]+$", "", match)
            for match in re.findall(r"https?://[^\s\"'<>]+", value)
        )
        return {
            "tags": dict(tags),
            "block_comments": dict(block_comments),
            "links": dict(links),
            "code_fences": value.count("```") + value.count("~~~"),
        }

    @staticmethod
    def _translation_visible_cjk_count(value: str) -> int:
        visible = re.sub(r"(?is)<[^>]+>|https?://[^\s\"'<>]+|```.*?```", " ", value)
        return len(re.findall(r"[\u3400-\u9fff]", visible))

    @staticmethod
    def _normalize_json_schema_output(
        output_text: str,
        *,
        output_schema: dict[str, object],
    ) -> str:
        """Accept only JSON that matches the Ability-owned root schema."""
        candidates = [output_text.strip()]
        fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", output_text, flags=re.S | re.I)
        if fenced:
            candidates.insert(0, fenced.group(1).strip())
        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if WordPressOperationRuntime._json_value_matches_schema(parsed, output_schema):
                return json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))
        return ""

    @staticmethod
    def _json_value_matches_schema(value: object, schema: dict[str, object]) -> bool:
        schema_type = str(schema.get("type") or "")
        if schema_type == "object":
            if not isinstance(value, dict):
                return False
            required = schema.get("required")
            if isinstance(required, list) and any(
                isinstance(name, str) and name not in value for name in required
            ):
                return False
            properties = schema.get("properties")
            if isinstance(properties, dict):
                for key, child_schema in properties.items():
                    if key in value and isinstance(child_schema, dict):
                        if not WordPressOperationRuntime._json_value_matches_schema(
                            value[key], child_schema
                        ):
                            return False
            if schema.get("additionalProperties") is False and isinstance(properties, dict):
                if any(key not in properties for key in value):
                    return False
            return True
        if schema_type == "array":
            if not isinstance(value, list):
                return False
            minimum = schema.get("minItems")
            maximum = schema.get("maxItems")
            if isinstance(minimum, int) and len(value) < minimum:
                return False
            if isinstance(maximum, int) and len(value) > maximum:
                return False
            item_schema = schema.get("items")
            return not isinstance(item_schema, dict) or all(
                WordPressOperationRuntime._json_value_matches_schema(item, item_schema)
                for item in value
            )
        if schema_type == "string":
            if not isinstance(value, str):
                return False
            minimum = schema.get("minLength")
            maximum = schema.get("maxLength")
            if isinstance(minimum, int) and len(value) < minimum:
                return False
            if isinstance(maximum, int) and len(value) > maximum:
                return False
            enum = schema.get("enum")
            return not isinstance(enum, list) or value in enum
        if schema_type == "integer":
            return isinstance(value, int) and not isinstance(value, bool)
        if schema_type == "number":
            return isinstance(value, (int, float)) and not isinstance(value, bool)
        if schema_type == "boolean":
            return isinstance(value, bool)
        enum = schema.get("enum")
        if isinstance(enum, list) and value not in enum:
            return False
        return True

    def apply_managed_policy(
        self,
        merged_policy: dict[str, object],
        *,
        default_policy: dict[str, object],
        profile_id: str,
    ) -> dict[str, object]:
        if default_policy.get("managed_surface") != "hosted_runtime_profiles":
            return merged_policy
        if (
            default_policy.get("platform_kind") != "wordpress"
            or default_policy.get("connector_id") != "wordpress_ai_connector"
            or default_policy.get("operation_contract_version") != WORDPRESS_OPERATION_CONTRACT
        ):
            raise RuntimeExecutionContractError(
                "runtime_profiles.managed_contract_invalid",
                (
                    "hosted runtime profile requires platform_kind=wordpress, "
                    "connector_id=wordpress_ai_connector, and "
                    f"operation_contract_version={WORDPRESS_OPERATION_CONTRACT}"
                ),
            )

        policy = dict(merged_policy)
        spec = resolve_wordpress_ai_connector_profile_spec(profile_id)
        timeout_ms = max(1, self._coerce_int(default_policy.get("timeout_ms"), default=30_000))
        timeout_seconds = max(1, int((timeout_ms + 999) / 1000))
        max_retries = max(0, self._coerce_int(default_policy.get("max_retries"), default=0))
        task_group = str(default_policy.get("task_group") or (spec.group_id if spec else ""))
        routing_intent = str(
            default_policy.get("routing_intent") or (spec.routing_intent if spec else "")
        )
        platform_kind = "wordpress"
        connector_id = "wordpress_ai_connector"
        operation_contract_version = WORDPRESS_OPERATION_CONTRACT
        policy["timeout_ms"] = timeout_ms
        policy["timeout_seconds"] = timeout_seconds
        policy["max_retries"] = max_retries
        policy["retry_max"] = max_retries
        policy["allow_fallback"] = bool(default_policy.get("allow_fallback", True))
        policy["managed_surface"] = "hosted_runtime_profiles"
        policy["platform_kind"] = platform_kind
        policy["connector_id"] = connector_id
        policy["operation_contract_version"] = operation_contract_version
        if task_group:
            policy["task_group"] = task_group
        if routing_intent:
            policy["routing_intent"] = routing_intent

        execution_contract = policy.get("execution_contract")
        if isinstance(execution_contract, dict):
            execution_contract = dict(execution_contract)
            execution_contract["timeout_seconds"] = timeout_seconds
            execution_contract["retry_max"] = max_retries
            execution_contract["managed_surface"] = "hosted_runtime_profiles"
            execution_contract["platform_kind"] = platform_kind
            execution_contract["connector_id"] = connector_id
            execution_contract["operation_contract_version"] = operation_contract_version
            if task_group:
                execution_contract["task_group"] = task_group
            if routing_intent:
                execution_contract["routing_intent"] = routing_intent
            policy["execution_contract"] = execution_contract
        return policy

    def _generation_context_status(
        self,
        provider_input: dict[str, Any],
        *,
        mode: str,
        status: str,
        reason: str,
        reference_count: int = 0,
        context_chars: int = 0,
    ) -> dict[str, Any]:
        next_input = dict(provider_input)
        metadata = dict(self._dict_or_empty(provider_input.get("metadata")))
        metadata.update(
            {
                "generation_context_contract": GENERATION_CONTEXT_CONTRACT,
                "generation_context_status": status,
                "generation_context_mode": mode,
                "generation_context_reason": reason,
                "generation_context_reference_count": max(0, reference_count),
                "generation_context_chars": max(0, context_chars),
            }
        )
        next_input["metadata"] = metadata
        return next_input

    def _build_alt_text_provider_input(
        self,
        *,
        scene_request: dict[str, Any],
        source_artifact: LoadedArtifactInput,
    ) -> dict[str, Any]:
        prompt = cast(str, scene_request["prompt"])
        encoded_image = base64.b64encode(source_artifact.content_bytes).decode("ascii")
        provider_image_url = f"data:{source_artifact.content_type};base64,{encoded_image}"
        # Only send user-relevant media context to the model. Internal task and
        # write-posture markers are runtime policy, not generation context; in
        # small vision models they consume reasoning budget and can suppress
        # the visible answer entirely.
        instruction = "Write one concise accessible alt-text sentence. Return only the sentence."
        # The image is the source of truth. Keep the provider prompt to the
        # user's request; filenames and titles remain available in the local
        # contract and are not needed to describe the pixels.
        context_text = "User request: " + prompt
        responses_content = [
            {"type": "input_text", "text": instruction},
            {"type": "input_text", "text": context_text},
            {"type": "input_image", "image_url": provider_image_url},
        ]
        chat_content = [
            {"type": "text", "text": instruction},
            {"type": "text", "text": context_text},
            {"type": "image_url", "image_url": {"url": provider_image_url}},
        ]

        requested_max_tokens = cast(int, scene_request.get("max_tokens", 96))
        # Keep enough room for a small vision model to finish its visible
        # sentence after any bounded internal prefix. The image itself is
        # already resized by Addon, so this remains inside the preview budget.
        # Small vision models may spend part of the response budget on hidden
        # visual reasoning before emitting the final alt text. Keep enough
        # headroom for both phases while the connector still projects only
        # the final text to WordPress.
        max_tokens = max(requested_max_tokens, 1536)
        return {
            "input": [{"role": "user", "content": responses_content}],
            "messages": [{"role": "user", "content": chat_content}],
            "text": prompt,
            "max_tokens": max_tokens,
            "max_output_tokens": max_tokens,
            "temperature": 0.0,
            "metadata": {
                "source_surface": "wordpress_ai_connector",
                "task": "alt_text_suggest",
                "suggestion_only": True,
            },
        }

    def _normalize_meta_description(
        self,
        output_text: str,
        *,
        source_text: str = "",
    ) -> str:
        text = self._strip_markdown(self._strip_reasoning_noise(output_text))
        text = re.split(r"\s+#{1,6}\s+", text, maxsplit=1)[0].strip()
        if ":" in text[:64] and len(text.split(":", 1)[1].strip()) >= 40:
            text = text.split(":", 1)[1].strip()
        if self._is_latin_heavy(text) or self._is_boilerplate_output(text):
            cjk_fallback = self._extract_cjk_text(source_text, limit=155)
            if cjk_fallback:
                return cjk_fallback
        if len(text) < 40:
            cjk_fallback = self._extract_cjk_text(source_text, limit=155)
            if cjk_fallback:
                return cjk_fallback
        return self._truncate_text(text, limit=155)

    def _normalize_plain_text_output(
        self,
        output_text: str,
        *,
        limit: int,
        strip_explanation: bool = False,
        source_text: str = "",
        task: str = "",
    ) -> str:
        raw_text = self._strip_reasoning_noise(output_text)
        if task in {"content_translation", "editorial_updates"}:
            # Models sometimes echo the connector's <content> transport marker.
            # Treat an empty wrapper as empty output and unwrap a non-empty
            # wrapper before the normal text/HTML preservation path.
            wrapped = re.fullmatch(
                r"\s*<content\b[^>]*>(.*?)</content>\s*",
                raw_text,
                flags=re.I | re.S,
            )
            if wrapped is not None:
                raw_text = wrapped.group(1).strip()
                if not raw_text:
                    return ""
        # Translation is a structure-preserving operation. Do not run it
        # through the Markdown cleanup used by short suggestions: that would
        # remove underscores, collapse code formatting, and alter HTML-facing
        # content before the structure gate can assess it.
        text = (
            raw_text
            if task == "content_translation"
            else self._extract_task_candidate(
                raw_text,
                task=task,
                limit=limit,
            )
        )
        if not text:
            text = self._strip_markdown(raw_text)
        if strip_explanation:
            text = re.split(
                r"\s+(?:说明|解释|理由|Explanation|Reasoning)\s*[:：]|"
                r"\s+(?:This title|This headline|The title)\b",
                text,
                maxsplit=1,
            )[0].strip()
        if task in {"excerpt_generation", "content_summary"} and (
            self._is_boilerplate_output(text) or self._looks_like_title_bundle(raw_text)
        ):
            if task == "excerpt_generation":
                source_excerpt = self._extract_source_excerpt(source_text, limit=limit)
                if source_excerpt:
                    return source_excerpt
            cjk_fallback = self._extract_cjk_text(source_text, limit=limit)
            if cjk_fallback:
                return cjk_fallback
        return self._trim_incomplete_tail(self._truncate_text(text, limit=limit))

    def _normalize_classification_output(
        self,
        output_text: str,
        *,
        source_text: str = "",
        strategy: str = "",
    ) -> str:
        available_terms = self._extract_available_terms(source_text)
        parsed = self._parse_classification_json(output_text)
        if parsed is None:
            # With an official candidate pool, malformed model output cannot be
            # safely converted into a new taxonomy term. Recover only exact
            # mentions of supplied candidates; this handles providers that
            # return a short list or sentence despite the JSON contract.
            parsed = {
                "suggestions": (
                    self._extract_available_term_mentions(output_text, available_terms)
                    if available_terms
                    else []
                    if strategy == "existing_only"
                    else [
                        {"term": term, "confidence": 0.6, "is_new": True}
                        for term in self._extract_classification_terms(
                            output_text,
                            source_text=source_text,
                        )
                    ]
                )
            }
        if available_terms:
            # WordPress supplies the candidate pool and owns the meaning of an
            # empty result. Keep only model suggestions that can be mapped to a
            # supplied term; never infer a taxonomy term from arbitrary content.
            matched = self._match_existing_taxonomy_terms(
                parsed.get("suggestions"),
                available_terms,
            )
            if not matched:
                # A provider may have returned a human-readable list even when
                # it ignored the JSON response format. Mapping only exact
                # candidate mentions preserves existing_only semantics without
                # fabricating or writing a term.
                matched = self._extract_available_term_mentions(output_text, available_terms)
            parsed["suggestions"] = matched
        elif strategy == "existing_only":
            # An empty candidate pool means there is no safe existing term to
            # return. Do not turn source words into new taxonomy suggestions.
            parsed["suggestions"] = []
        return json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))

    @classmethod
    def _extract_available_term_mentions(
        cls,
        output_text: str,
        available_terms: list[str],
    ) -> list[dict[str, Any]]:
        """Recover exact candidate mentions from a non-JSON provider reply."""
        output = str(output_text or "").strip()
        if not output or not available_terms:
            return []
        output_folded = output.casefold()
        output_key = cls._taxonomy_term_key(output)
        recovered: list[dict[str, Any]] = []
        seen: set[str] = set()
        for raw_term in available_terms:
            term = str(raw_term or "").strip()
            key = cls._taxonomy_term_key(term)
            if not term or not key or key in seen:
                continue
            if key.isascii() and re.search(
                r"(?<![a-z0-9])" + re.escape(key) + r"(?![a-z0-9])", output_folded
            ):
                found = True
            else:
                found = key in output_key
            if not found:
                continue
            recovered.append({"term": term, "confidence": 0.6, "is_new": False})
            seen = seen | {key}
        return recovered

    def _normalize_slug_output(self, output_text: str) -> str:
        parsed = self._parse_json_object(output_text)
        raw_slugs = parsed.get("slugs") if isinstance(parsed, dict) else None
        slugs: list[str] = []
        if isinstance(raw_slugs, list):
            for raw_slug in raw_slugs:
                if not isinstance(raw_slug, str):
                    continue
                slug = self._normalize_ascii_slug(raw_slug)
                if slug and slug not in slugs:
                    slugs.append(slug)
                if len(slugs) >= 10:
                    break
        if not slugs:
            # An empty result is safer than fabricating a slug from transport
            # metadata or a title whose language may not be transliterable. Keep
            # the official JSON shape so the raw provider value cannot leak
            # back through the generic output fallback.
            return json.dumps({"slugs": []}, ensure_ascii=False, separators=(",", ":"))
        return json.dumps({"slugs": slugs}, ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def _parse_json_object(output_text: str) -> dict[str, Any] | None:
        candidates = [output_text.strip()]
        fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", output_text, flags=re.S | re.I)
        if fenced:
            candidates.insert(0, fenced.group(1).strip())
        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
        return None

    @staticmethod
    def _normalize_ascii_slug(raw_slug: str) -> str:
        value = raw_slug.strip()
        for _ in range(3):
            decoded = unquote(value)
            if decoded == value:
                break
            value = decoded
        value = unicodedata.normalize("NFKC", value).lower()
        # Percent-decoded CJK and other Unicode must be rejected as a whole.
        # Dropping those bytes would silently turn a meaningful slug into an
        # unrelated partial value such as ``thebiz``. The provider must return
        # an intentional ASCII transliteration instead.
        if not value.isascii():
            return ""
        value = value.replace("_", "-")
        value = re.sub(r"[^a-z0-9]+", "-", value)
        return value.strip("-")[:80].strip("-")

    @staticmethod
    def _extract_available_terms(source_text: str) -> list[str]:
        match = re.search(
            r"<available-terms>\s*(.*?)\s*</available-terms>",
            source_text,
            flags=re.I | re.S,
        )
        if match is None:
            return []
        return [item.strip() for item in re.split(r"[,，]", match.group(1)) if item.strip()]

    @classmethod
    def _match_existing_taxonomy_terms(
        cls,
        suggestions: Any,
        available_terms: list[str],
    ) -> list[dict[str, Any]]:
        canonical_by_key = {cls._taxonomy_term_key(term): term for term in available_terms}
        matched: list[dict[str, Any]] = []
        if not isinstance(suggestions, list):
            return matched
        for suggestion in suggestions:
            if not isinstance(suggestion, dict):
                continue
            term = str(suggestion.get("term") or "").strip()
            canonical = canonical_by_key.get(cls._taxonomy_term_key(term))
            if not canonical:
                continue
            normalized = dict(suggestion)
            normalized["term"] = canonical
            normalized["is_new"] = False
            matched.append(normalized)
        return matched

    @staticmethod
    def _taxonomy_term_key(term: str) -> str:
        normalized = unicodedata.normalize("NFKC", term).casefold()
        return re.sub(r"[^\w\u3400-\u9fff]+", "", normalized)

    def _has_available_terms(self, source_text: str) -> bool:
        match = re.search(
            r"<available-terms>\s*(.*?)\s*</available-terms>",
            source_text,
            flags=re.I | re.S,
        )
        if match is None:
            return False
        return any(item.strip() for item in re.split(r"[,，]", match.group(1)))

    def _parse_classification_json(self, output_text: str) -> dict[str, Any] | None:
        candidates = [output_text.strip()]
        fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", output_text, flags=re.S)
        if fenced:
            candidates.insert(0, fenced.group(1).strip())

        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict) and isinstance(parsed.get("suggestions"), list):
                return {
                    "suggestions": self._sanitize_classification_suggestions(
                        parsed.get("suggestions")
                    )
                }
        return None

    def _sanitize_classification_suggestions(self, suggestions: Any) -> list[dict[str, Any]]:
        sanitized: list[dict[str, Any]] = []
        if not isinstance(suggestions, list):
            return sanitized
        for suggestion in suggestions:
            if not isinstance(suggestion, dict):
                continue
            term = str(suggestion.get("term") or "").strip()
            if not term:
                continue
            confidence = suggestion.get("confidence")
            confidence = float(confidence) if isinstance(confidence, (int, float)) else 0.6
            confidence = max(0.0, min(1.0, confidence))
            sanitized.append(
                {
                    "term": self._truncate_text(term, limit=48),
                    "confidence": confidence,
                    "is_new": bool(suggestion.get("is_new", True)),
                }
            )
            if len(sanitized) >= 5:
                break
        return sanitized

    def _extract_classification_terms(
        self,
        output_text: str,
        *,
        source_text: str = "",
    ) -> list[str]:
        terms: list[str] = []
        for text in (source_text, output_text):
            for match in re.finditer(
                r"\b(?:Npcink|WordPress|Cloud|Addon|API|AI|SEO)"
                r"(?:\s+(?:Npcink|WordPress|Cloud|Addon|API|AI|SEO)){0,3}\b",
                text,
            ):
                term = self._truncate_text(match.group(0), limit=48)
                if 2 <= len(term) <= 48 and term not in terms:
                    terms.append(term)
                if len(terms) >= 3:
                    return terms

        for phrase in (
            "云端运行时",
            "内容分类",
            "建议式输出",
            "通用聊天入口",
            "标题生成",
            "SEO 描述",
        ):
            if phrase in source_text and phrase not in terms:
                terms.append(phrase)
            if len(terms) >= 3:
                return terms

        text = output_text.strip()
        text = re.sub(r"^```(?:json|text|markdown)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
        text = re.sub(r"[*_`]+", "", text)
        parts = re.split(r"[\n,，;；、|]+", text)
        for part in parts:
            term = re.sub(r"^\s*[-*\d.)、]+", "", part).strip()
            term = re.sub(r"^(term|tag|category|标签|分类)\s*[:：]\s*", "", term, flags=re.I)
            term = self._truncate_text(term, limit=48)
            if 2 <= len(term) <= 48 and term not in terms:
                terms.append(term)
            if len(terms) >= 3:
                break
        return terms

    def _extract_task_candidate(self, output_text: str, *, task: str, limit: int) -> str:
        if task == "content_rewrite":
            if self._is_boilerplate_output(output_text):
                bold_candidate = self._extract_bold_candidate(output_text)
                if bold_candidate:
                    return self._truncate_text(bold_candidate, limit=limit)
            alternative_candidate = self._extract_rewrite_alternative_candidate(output_text)
            if alternative_candidate:
                return self._truncate_text(alternative_candidate, limit=limit)
            text = self._strip_markdown(output_text)
            text = re.sub(
                r"^(?:rewrite|rewritten|rephrased|改写(?:结果|版本)?|"
                r"建议改写(?:为|成))\s*[:：]\s*",
                "",
                text,
                flags=re.I,
            )
            if text and not self._is_boilerplate_output(text):
                return self._truncate_text(text, limit=limit)
        if task == "title_generation":
            heading_candidate = self._extract_title_heading(output_text)
            if heading_candidate:
                return self._truncate_text(heading_candidate, limit=limit)
            list_candidate = self._extract_first_list_item(output_text)
            if list_candidate:
                return self._truncate_text(list_candidate, limit=limit)
            text = self._strip_markdown(output_text)
            text = re.split(
                r"\s+(?:摘要|summary)\s*[:：]|\s+---\s+",
                text,
                maxsplit=1,
                flags=re.I,
            )[0].strip()
            if not self._is_boilerplate_output(text):
                return self._truncate_text(text, limit=limit)
        return ""

    def _extract_title_heading(self, output_text: str) -> str:
        for line in output_text.splitlines():
            match = re.match(r"\s*#{1,6}\s+(.+?)\s*$", line)
            if match is None:
                continue
            candidate = self._strip_markdown(match.group(1))
            if self._is_boilerplate_output(candidate):
                continue
            if 4 <= len(candidate) <= 120:
                return candidate
        return ""

    def _extract_bold_candidate(self, output_text: str) -> str:
        for match in re.finditer(
            r"(?m)^\s*\*\*(.{4,260}?)\*\*\s*$",
            output_text,
        ):
            candidate = self._strip_markdown(match.group(1))
            if re.search(r"(?:版|version|option)\s*[:：]?$", candidate, flags=re.I):
                continue
            if len(candidate) >= 8:
                return candidate
        return ""

    def _extract_rewrite_alternative_candidate(self, output_text: str) -> str:
        """Extract one candidate only from a complete, high-confidence bundle."""
        text = self._strip_markdown(output_text)
        match = re.fullmatch(
            r"(?P<first>.+?[.!?])\s+OR\s+"
            r"(?P<second>.+?[.!?])\s+"
            r"Both(?:\s+rephrasings)?\s+preserve\s+(?:the\s+)?"
            r"(?:core|original|intended)\s+meaning\b.+",
            text,
            flags=re.I | re.S,
        )
        if match is None:
            return ""
        candidate = match.group("first").strip()
        if len(candidate) < 8 or self._is_boilerplate_output(candidate):
            return ""
        return candidate

    def _extract_first_list_item(self, output_text: str) -> str:
        for line in output_text.splitlines():
            match = re.match(r"\s*(?:[-*]|\d+[.)、])\s*(.+?)\s*$", line)
            if match is None:
                continue
            candidate = self._strip_markdown(match.group(1))
            candidate = re.sub(r"^[\"'“”‘’《》]+|[\"'“”‘’《》]+$", "", candidate).strip()
            if 4 <= len(candidate) <= 120:
                return candidate
        match = re.search(
            r"(?:^|\s)\d+[.)、]\s*(.+?)(?=\s+\d+[.)、]\s+|$)",
            output_text,
        )
        if match is not None:
            candidate = self._strip_markdown(match.group(1))
            candidate = re.sub(r"^[\"'“”‘’《》]+|[\"'“”‘’《》]+$", "", candidate).strip()
            if 4 <= len(candidate) <= 120:
                return candidate
        return ""

    @staticmethod
    def _extract_provider_output_text(output: dict[str, Any]) -> str:
        for key in ("output_text", "text", "content"):
            value = output.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        choices = output.get("choices")
        if isinstance(choices, list) and choices:
            choice = choices[0]
            if isinstance(choice, dict):
                text = choice.get("text")
                if isinstance(text, str) and text.strip():
                    return text.strip()
                message = choice.get("message")
                if isinstance(message, dict):
                    content = message.get("content")
                    if isinstance(content, str) and content.strip():
                        return content.strip()
        return ""

    @staticmethod
    def _has_unbalanced_title_quote(output_text: str) -> bool:
        text = output_text.strip()
        if not text:
            return False
        quote_pairs = {
            '"': '"',
            "'": "'",
            "“": "”",
            "‘": "’",
            "「": "」",
            "『": "』",
            "《": "》",
        }
        closing = quote_pairs.get(text[0])
        return bool(closing and not text.endswith(closing))

    @staticmethod
    def _strip_markdown(output_text: str) -> str:
        text = output_text.strip()
        text = re.sub(r"^```(?:json|text|markdown)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
        text = re.sub(r"(?m)^\s*#{1,6}\s*", "", text)
        text = re.sub(r"[*_`]+", "", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    @staticmethod
    def _is_boilerplate_output(text: str) -> bool:
        lowered = text.lower()
        return any(
            phrase in lowered
            for phrase in (
                "以下是基于",
                "下面是",
                "以下是",
                "如果你愿意",
                "我还可以",
                "here are",
                "based on your",
                "i can also",
                "title suggestions",
                "标题建议",
                "多个版本",
                "unknown source",
                "no specific content",
                "no specific facts",
                "merely a description",
            )
        )

    @classmethod
    def _extract_source_excerpt(cls, source_text: str, *, limit: int) -> str:
        """Return a bounded source sentence for an unusable excerpt response."""
        plain = re.sub(r"(?is)<[^>]+>", " ", source_text)
        plain = re.sub(r"\s+", " ", plain).strip()
        if not plain:
            return ""
        sentence = re.split(r"(?<=[.!?。！？])\s+", plain, maxsplit=1)[0].strip()
        return cls._trim_incomplete_tail(cls._truncate_text(sentence or plain, limit=limit))

    @staticmethod
    def _looks_like_title_bundle(text: str) -> bool:
        return bool(
            re.search(r"(?:标题建议|title suggestions)", text, flags=re.I)
            or re.search(r"(?m)^\s*\d+[.)、]\s*.{4,80}$", text)
            and len(re.findall(r"(?m)^\s*\d+[.)、]\s+", text)) >= 2
            or re.match(r"^\s*《[^》]{4,80}》\s*(?:#{1,6}\s*)?", text)
        )

    @staticmethod
    def _strip_reasoning_noise(output_text: str) -> str:
        text = output_text.strip()
        text = re.sub(r"(?is)<think\b[^>]*>.*?</think>", " ", text)
        text = re.sub(r"(?is)^\s*<think\b[^>]*>.*?(?:\r?\n\s*\r?\n|$)", "", text)
        text = re.sub(
            r"(?is)^\s*(?:reasoning|explanation|analysis)\s*[:：].*?"
            r"(?:\r?\n\s*\r?\n|$)",
            "",
            text,
        )
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    @staticmethod
    def _has_reasoning_noise(output_text: str) -> bool:
        return bool(
            re.search(
                r"(?is)<think\b|^\s*(?:reasoning|explanation|analysis)\s*[:：]",
                output_text,
            )
        )

    @staticmethod
    def _looks_like_provider_reasoning(output_text: str) -> bool:
        """Reject gateway messages that expose response-planning instructions."""
        return bool(
            re.match(
                r"(?is)^\s*(?:"
                r"we need (?:to )?(?:answer|return|respond)|"
                r"need (?:to )?(?:answer|return|respond)|"
                r"the user wants (?:a |an )?(?:title|summary|rewrite|answer)|"
                r"the task\s*[:：]|"
                r"content (?:is|of)\b|"
                r"language of\b|"
                r"must (?:answer|return|output)|"
                r"return (?:only|exactly)|"
                r"same language|language (?:is|:)|"
                r"do not mention (?:this )?(?:instruction|request)"
                r")\b",
                output_text,
            )
        )

    @staticmethod
    def _is_latin_heavy(text: str) -> bool:
        cjk_count = len(re.findall(r"[\u4e00-\u9fff]", text))
        latin_count = len(re.findall(r"[A-Za-z]", text))
        return latin_count > max(24, cjk_count * 2)

    @staticmethod
    def _is_predominantly_cjk(text: str) -> bool:
        cjk_count = len(re.findall(r"[\u4e00-\u9fff]", text))
        latin_count = len(re.findall(r"[A-Za-z]", text))
        return cjk_count >= 4 and latin_count <= max(24, cjk_count * 2)

    def _extract_cjk_text(self, source_text: str, *, limit: int) -> str:
        fragments = re.findall(
            r"[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9，。！？、：；（）《》“”\"'\s-]{16,}",
            source_text,
        )
        if not fragments:
            return ""
        text = max((fragment.strip() for fragment in fragments), key=len)
        text = re.sub(r"\s+", " ", text).strip()
        return self._truncate_text(text, limit=limit)

    @staticmethod
    def _trim_incomplete_tail(text: str) -> str:
        return re.sub(r"\s+\d+[.)、]?$", "", text).strip()

    @staticmethod
    def _truncate_text(text: str, *, limit: int) -> str:
        text = text.strip()
        if len(text) <= limit:
            return text
        candidate = text[:limit].rstrip()
        punctuation_index = max(
            candidate.rfind("。"),
            candidate.rfind("！"),
            candidate.rfind("？"),
            candidate.rfind("."),
            candidate.rfind("!"),
            candidate.rfind("?"),
        )
        if punctuation_index >= 80:
            return candidate[: punctuation_index + 1].strip()
        return candidate[: max(0, limit - 3)].rstrip("，,；;：:、 ") + "..."

    @staticmethod
    def _coerce_int(value: object | None, *, default: int) -> int:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            try:
                return int(value)
            except ValueError:
                return default
        return default

    @staticmethod
    def _dict_or_empty(value: object | None) -> dict[str, object]:
        return value if isinstance(value, dict) else {}
