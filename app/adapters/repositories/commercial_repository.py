from __future__ import annotations

from sqlalchemy.orm import Session

from app.adapters.repositories.commercial_access_repository import CommercialAccessRepository
from app.adapters.repositories.commercial_account_site_repository import (
    CommercialAccountSiteRepository,
)
from app.adapters.repositories.commercial_billing_repository import CommercialBillingRepository
from app.adapters.repositories.commercial_credit_repository import CommercialCreditRepository
from app.adapters.repositories.commercial_decision_repository import (
    CommercialDecisionRepository,
)
from app.adapters.repositories.commercial_identity_repository import CommercialIdentityRepository
from app.adapters.repositories.commercial_payment_repository import CommercialPaymentRepository
from app.adapters.repositories.commercial_plan_repository import CommercialPlanRepository
from app.adapters.repositories.commercial_runtime_knowledge_queries import (
    CommercialRuntimeKnowledgeQueries,
)
from app.adapters.repositories.commercial_service_audit_repository import (
    CommercialServiceAuditRepository,
)
from app.adapters.repositories.commercial_site_api_key_repository import (
    CommercialSiteApiKeyRepository,
)
from app.adapters.repositories.commercial_subscription_order_repository import (
    CommercialSubscriptionOrderRepository,
)
from app.adapters.repositories.commercial_subscription_repository import (
    CommercialSubscriptionRepository,
)
from app.adapters.repositories.commercial_support_repository import (
    CommercialSupportRepository,
)
from app.adapters.repositories.commercial_trial_entitlement_repository import (
    CommercialTrialEntitlementRepository,
)
from app.adapters.repositories.commercial_usage_repository import CommercialUsageRepository


class CommercialRepository(
    CommercialAccountSiteRepository,
    CommercialSiteApiKeyRepository,
    CommercialTrialEntitlementRepository,
    CommercialRuntimeKnowledgeQueries,
    CommercialCreditRepository,
    CommercialUsageRepository,
    CommercialBillingRepository,
    CommercialServiceAuditRepository,
    CommercialDecisionRepository,
    CommercialIdentityRepository,
    CommercialAccessRepository,
    CommercialPaymentRepository,
    CommercialPlanRepository,
    CommercialSubscriptionRepository,
    CommercialSubscriptionOrderRepository,
    CommercialSupportRepository,
):
    def __init__(self, session: Session) -> None:
        self.session = session
