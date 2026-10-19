"""Bounded release pauses, not an ability registry or operator feature console."""

from app.domain.audio_generation.contracts import (
    AUDIO_GENERATION_ABILITIES,
    AUDIO_GENERATION_CONTRACT,
    AUDIO_GENERATION_EXECUTION_KIND,
    AUDIO_GENERATION_PROFILE_ID,
)
from app.domain.cloud_batch_runtime.contracts import (
    CLOUD_BATCH_RUNTIME_ABILITIES,
    CLOUD_BATCH_RUNTIME_EXECUTION_KIND,
    CLOUD_BATCH_RUNTIME_PROFILE_ID,
    CLOUD_BATCH_RUNTIME_REQUEST_CONTRACT,
)
from app.domain.media_batch_plans.contracts import (
    MEDIA_BATCH_PLAN_ABILITIES,
    MEDIA_BATCH_PLAN_EXECUTION_KIND,
    MEDIA_BATCH_PLAN_PROFILE_ID,
    MEDIA_BATCH_PLAN_REQUEST_CONTRACT,
)
from app.domain.media_governance.contracts import (
    MEDIA_GOVERNANCE_AUDIT_ABILITIES,
    MEDIA_GOVERNANCE_AUDIT_EXECUTION_KIND,
    MEDIA_GOVERNANCE_AUDIT_PROFILE_ID,
    MEDIA_GOVERNANCE_AUDIT_REQUEST_CONTRACT,
)
from app.domain.runtime.errors import RuntimeErrorBase
from app.domain.site_ops_analysis.contracts import (
    SITE_OPS_ANALYSIS_ABILITIES,
    SITE_OPS_ANALYSIS_EXECUTION_KIND,
    SITE_OPS_ANALYSIS_PROFILE_ID,
    SITE_OPS_ANALYSIS_REQUEST_CONTRACT,
)

PAUSED_RUNTIME_FEATURES = frozenset({"cloud_inspection", "audio_generation", "advanced_media"})

_FEATURE_MARKERS = {
    "advanced_media": frozenset(
        {
            *MEDIA_BATCH_PLAN_ABILITIES,
            MEDIA_BATCH_PLAN_EXECUTION_KIND,
            MEDIA_BATCH_PLAN_PROFILE_ID,
            MEDIA_BATCH_PLAN_REQUEST_CONTRACT,
            *MEDIA_GOVERNANCE_AUDIT_ABILITIES,
            MEDIA_GOVERNANCE_AUDIT_EXECUTION_KIND,
            MEDIA_GOVERNANCE_AUDIT_PROFILE_ID,
            MEDIA_GOVERNANCE_AUDIT_REQUEST_CONTRACT,
            "media_derivative",
        }
    ),
    "audio_generation": frozenset(
        {
            *AUDIO_GENERATION_ABILITIES,
            AUDIO_GENERATION_CONTRACT,
            AUDIO_GENERATION_EXECUTION_KIND,
            AUDIO_GENERATION_PROFILE_ID,
        }
    ),
    "cloud_inspection": frozenset(
        {
            *CLOUD_BATCH_RUNTIME_ABILITIES,
            CLOUD_BATCH_RUNTIME_EXECUTION_KIND,
            CLOUD_BATCH_RUNTIME_PROFILE_ID,
            CLOUD_BATCH_RUNTIME_REQUEST_CONTRACT,
            *SITE_OPS_ANALYSIS_ABILITIES,
            SITE_OPS_ANALYSIS_EXECUTION_KIND,
            SITE_OPS_ANALYSIS_PROFILE_ID,
            SITE_OPS_ANALYSIS_REQUEST_CONTRACT,
        }
    ),
}


def paused_runtime_feature(
    *,
    ability_name: str,
    execution_kind: str = "",
    contract_version: str = "",
    profile_id: str = "",
) -> str | None:
    markers = {
        value.strip().lower()
        for value in (
            ability_name,
            execution_kind,
            contract_version,
            profile_id,
        )
    }
    for feature in sorted(PAUSED_RUNTIME_FEATURES):
        if markers & _FEATURE_MARKERS[feature]:
            return feature
    return None


def require_runtime_available(
    *,
    ability_name: str,
    execution_kind: str = "",
    contract_version: str = "",
    profile_id: str = "",
) -> None:
    feature = paused_runtime_feature(
        ability_name=ability_name,
        execution_kind=execution_kind,
        contract_version=contract_version,
        profile_id=profile_id,
    )
    if feature:
        raise RuntimeErrorBase(409, "runtime.feature_paused", f"{feature} is temporarily paused")
