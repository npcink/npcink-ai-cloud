from __future__ import annotations

from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_access_repository import CommercialAccessRepository
from app.adapters.repositories.commercial_credit_repository import CommercialCreditRepository
from app.adapters.repositories.commercial_decision_repository import (
    CommercialDecisionRepository,
)
from app.adapters.repositories.commercial_identity_repository import CommercialIdentityRepository
from app.adapters.repositories.commercial_runtime_knowledge_queries import (
    CommercialRuntimeKnowledgeQueries,
)
from app.adapters.repositories.commercial_site_api_key_repository import (
    CommercialSiteApiKeyRepository,
)
from app.adapters.repositories.commercial_subscription_lifecycle_repository import (
    CommercialSubscriptionLifecycleRepository,
)
from app.adapters.repositories.commercial_support_repository import (
    CommercialSupportRepository,
)


class CommercialRepository(
    CommercialSubscriptionLifecycleRepository,
    CommercialSiteApiKeyRepository,
    CommercialRuntimeKnowledgeQueries,
    CommercialCreditRepository,
    CommercialDecisionRepository,
    CommercialIdentityRepository,
    CommercialAccessRepository,
    CommercialSupportRepository,
):
    def __init__(self, session: Session) -> None:
        self.session = session
