from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FACADE_PATH = ROOT / "app/adapters/repositories/commercial_repository.py"
LIFECYCLE_REPOSITORY_PATH = (
    ROOT / "app/adapters/repositories/commercial_subscription_lifecycle_repository.py"
)
AUDIT_MIXIN_PATH = ROOT / "app/domain/commercial/mixins/_audit_mixin.py"
SUPPORT_MIXIN_PATH = ROOT / "app/domain/commercial/mixins/_support_mixin.py"
ADMIN_MIXIN_PATH = ROOT / "app/domain/commercial/mixins/_admin_mixin.py"
ACCOUNT_MIXIN_PATH = ROOT / "app/domain/commercial/mixins/_account_mixin.py"

ALLOWED_FACADE_BASES = {
    "CommercialAccessRepository",
    "CommercialCreditRepository",
    "CommercialDecisionRepository",
    "CommercialIdentityRepository",
    "CommercialRuntimeKnowledgeQueries",
    "CommercialSiteApiKeyRepository",
    "CommercialSubscriptionLifecycleRepository",
    "CommercialSupportRepository",
}

LIFECYCLE_REPOSITORY_BASES = {
    "CommercialAccountSiteRepository",
    "CommercialBillingRepository",
    "CommercialPaymentRepository",
    "CommercialPlanRepository",
    "CommercialServiceAuditRepository",
    "CommercialSubscriptionOrderRepository",
    "CommercialSubscriptionRepository",
    "CommercialTrialEntitlementRepository",
    "CommercialUsageRepository",
}

ALLOWED_PRODUCTION_IMPORTERS = {
    "app/api/auth.py",
    "app/api/portal_session.py",
    "app/domain/agent_feedback/service.py",
    "app/domain/commercial/mixins/_account_mixin.py",
    "app/domain/commercial/mixins/_admin_mixin.py",
    "app/domain/commercial/mixins/_audit_mixin.py",
    "app/domain/commercial/mixins/_billing_mixin.py",
    "app/domain/commercial/mixins/_payment_mixin.py",
    "app/domain/commercial/mixins/_portal_mixin.py",
    "app/domain/commercial/mixins/_runtime_mixin.py",
    "app/domain/commercial/mixins/_site_mixin.py",
    "app/domain/commercial/mixins/_subscription_commerce_mixin.py",
    "app/domain/commercial/mixins/_support_mixin.py",
    "app/domain/site_knowledge/metrics.py",
    "app/workers/alert_provider_degradation.py",
    "app/workers/latency_probe_summary.py",
    "app/workers/router_diagnostics_summary.py",
    "app/workers/router_performance_snapshot.py",
}

MAX_PRODUCTION_CONSTRUCTIONS = 126
MAX_PRODUCTION_REFERENCES = 185
MAX_PRODUCTION_ANNOTATIONS = 59


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _imports_facade(tree: ast.Module) -> bool:
    imported = False
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == (
            "app.adapters.repositories.commercial_repository"
        ):
            for name in node.names:
                if name.name == "CommercialRepository":
                    assert name.asname is None, (
                        "CommercialRepository aliases evade retirement counts"
                    )
                    imported = True
        if isinstance(node, ast.Import):
            imported = imported or any(
                name.name == "app.adapters.repositories.commercial_repository"
                for name in node.names
            )
    return imported


def test_commercial_repository_facade_cannot_regain_business_responsibilities() -> None:
    tree = _tree(FACADE_PATH)
    facade = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "CommercialRepository"
    )
    own_methods = {
        node.name
        for node in facade.body
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    }
    assert own_methods == {"__init__"}
    assert {ast.unparse(base) for base in facade.bases} == ALLOWED_FACADE_BASES


def test_subscription_lifecycle_repository_has_bounded_transaction_owners() -> None:
    tree = _tree(LIFECYCLE_REPOSITORY_PATH)
    repository = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef)
        and node.name == "CommercialSubscriptionLifecycleRepository"
    )
    own_methods = {
        node.name
        for node in repository.body
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    }
    assert own_methods == {"__init__"}
    assert {ast.unparse(base) for base in repository.bases} == LIFECYCLE_REPOSITORY_BASES


def test_commercial_repository_production_dependency_can_only_shrink() -> None:
    importers: set[str] = set()
    constructions = 0
    references = 0
    annotations = 0

    for path in sorted((ROOT / "app").rglob("*.py")):
        if path == FACADE_PATH:
            continue
        tree = _tree(path)
        relative_path = path.relative_to(ROOT).as_posix()
        if _imports_facade(tree):
            importers.add(relative_path)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id == "CommercialRepository":
                references += 1
            if isinstance(node, ast.Attribute) and node.attr == "CommercialRepository":
                references += 1
            if isinstance(node, ast.Call):
                called_name = ast.unparse(node.func)
                if called_name == "CommercialRepository" or called_name.endswith(
                    ".CommercialRepository"
                ):
                    constructions += 1
            if isinstance(node, ast.arg) and node.annotation is not None:
                annotations += "CommercialRepository" in ast.unparse(node.annotation)

    assert importers <= ALLOWED_PRODUCTION_IMPORTERS
    assert constructions <= MAX_PRODUCTION_CONSTRUCTIONS
    assert references <= MAX_PRODUCTION_REFERENCES
    assert annotations <= MAX_PRODUCTION_ANNOTATIONS


def test_audit_mixin_uses_explicit_audit_and_decision_repositories() -> None:
    tree = _tree(AUDIT_MIXIN_PATH)
    assert not _imports_facade(tree)

    imported_names = {
        name.name
        for node in tree.body
        if isinstance(node, ast.ImportFrom)
        for name in node.names
    }
    assert {
        "CommercialDecisionRepository",
        "CommercialServiceAuditRepository",
    } <= imported_names

    constructions = [
        ast.unparse(node.func)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and ast.unparse(node.func)
        in {
            "CommercialDecisionRepository",
            "CommercialServiceAuditRepository",
        }
    ]
    assert constructions.count("CommercialDecisionRepository") == 2
    assert constructions.count("CommercialServiceAuditRepository") == 3
    assert not any(
        isinstance(node, ast.Name) and node.id == "CommercialRepository"
        for node in ast.walk(tree)
    )


def test_support_mixin_uses_explicit_support_access_and_audit_repositories() -> None:
    tree = _tree(SUPPORT_MIXIN_PATH)
    assert not _imports_facade(tree)

    expected_repositories = {
        "CommercialAccessRepository",
        "CommercialServiceAuditRepository",
        "CommercialSupportRepository",
    }
    imported_names = {
        name.name
        for node in tree.body
        if isinstance(node, ast.ImportFrom)
        for name in node.names
    }
    assert expected_repositories <= imported_names

    constructions = [
        ast.unparse(node.func)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and ast.unparse(node.func) in expected_repositories
    ]
    assert constructions.count("CommercialSupportRepository") == 13
    assert constructions.count("CommercialAccessRepository") == 6
    assert constructions.count("CommercialServiceAuditRepository") == 7
    assert not any(
        isinstance(node, ast.Name) and node.id == "CommercialRepository"
        for node in ast.walk(tree)
    )


def test_admin_identity_flows_use_explicit_domain_repositories() -> None:
    tree = _tree(ADMIN_MIXIN_PATH)
    selected_methods = {
        "upsert_platform_admin_grant",
        "resolve_platform_admin_grant",
        "delete_platform_admin_grant",
        "list_admin_portal_users",
        "get_admin_portal_user_audit",
        "disable_admin_portal_user",
        "batch_disable_admin_portal_users",
        "list_admin_platform_admin_grants",
        "_build_admin_identity_projections",
    }
    methods = {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
        and node.name in selected_methods
    }
    assert methods.keys() == selected_methods
    assert not any(
        isinstance(node, ast.Name) and node.id == "CommercialRepository"
        for method in methods.values()
        for node in ast.walk(method)
    )

    expected_constructions = {
        "CommercialAccessRepository": 7,
        "CommercialAccountSiteRepository": 1,
        "CommercialIdentityRepository": 8,
        "CommercialServiceAuditRepository": 5,
        "CommercialSubscriptionRepository": 1,
    }
    constructions = [
        ast.unparse(node.func)
        for method in methods.values()
        for node in ast.walk(method)
        if isinstance(node, ast.Call) and ast.unparse(node.func) in expected_constructions
    ]
    assert {
        repository: constructions.count(repository)
        for repository in expected_constructions
    } == expected_constructions


def test_admin_dashboard_flows_use_explicit_domain_repositories() -> None:
    tree = _tree(ADMIN_MIXIN_PATH)
    selected_methods = {
        "get_admin_overview",
        "get_commercial_shadow_pricing_summary",
        "list_admin_accounts",
        "get_admin_coverage_work_queue",
        "apply_admin_account_credit_adjustment",
        "get_admin_account_credit_ledger",
    }
    methods = {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
        and node.name in selected_methods
    }
    assert methods.keys() == selected_methods
    assert not any(
        isinstance(node, ast.Name) and node.id == "CommercialRepository"
        for method in methods.values()
        for node in ast.walk(method)
    )

    expected_repositories = {
        "CommercialAccountSiteRepository",
        "CommercialBillingRepository",
        "CommercialCreditRepository",
        "CommercialDecisionRepository",
        "CommercialIdentityRepository",
        "CommercialServiceAuditRepository",
        "CommercialSiteApiKeyRepository",
        "CommercialSubscriptionRepository",
        "CommercialUsageRepository",
    }
    imported_names = {
        name.name
        for node in tree.body
        if isinstance(node, ast.ImportFrom)
        for name in node.names
    }
    assert expected_repositories <= imported_names


def test_admin_cross_domain_flows_use_explicit_transaction_and_query_owners() -> None:
    tree = _tree(ADMIN_MIXIN_PATH)
    assert not _imports_facade(tree)

    selected_methods = {
        "get_admin_account",
        "get_admin_account_quota_summary",
    }
    methods = {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
        and node.name in selected_methods
    }
    assert methods.keys() == selected_methods
    assert not any(
        isinstance(node, ast.Name) and node.id == "CommercialRepository"
        for method in methods.values()
        for node in ast.walk(method)
    )

    expected_repositories = {
        "CommercialAccessRepository",
        "CommercialAccountSiteRepository",
        "CommercialCreditRepository",
        "CommercialDecisionRepository",
        "CommercialIdentityRepository",
        "CommercialPlanRepository",
        "CommercialRuntimeKnowledgeQueries",
        "CommercialSiteApiKeyRepository",
        "CommercialSubscriptionLifecycleRepository",
        "CommercialSubscriptionRepository",
        "CommercialUsageRepository",
    }
    imported_names = {
        name.name
        for node in tree.body
        if isinstance(node, ast.ImportFrom)
        for name in node.names
    }
    assert expected_repositories <= imported_names


def test_account_mixin_uses_explicit_domain_and_lifecycle_repositories() -> None:
    tree = _tree(ACCOUNT_MIXIN_PATH)
    assert not _imports_facade(tree)

    selected_methods = {
        "upsert_account",
        "set_account_status",
        "upsert_account_subscription",
        "suspend_account_subscription",
        "cancel_account_subscription",
        "_upsert_account_subscription_in_session",
        "_assert_account_site_capacity",
    }
    methods = {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
        and node.name in selected_methods
    }
    assert methods.keys() == selected_methods
    assert not any(
        isinstance(node, ast.Name) and node.id == "CommercialRepository"
        for method in methods.values()
        for node in ast.walk(method)
    )

    expected_constructions = {
        "CommercialAccessRepository": 1,
        "CommercialAccountSiteRepository": 2,
        "CommercialIdentityRepository": 1,
        "CommercialServiceAuditRepository": 4,
        "CommercialSubscriptionLifecycleRepository": 2,
        "CommercialSubscriptionRepository": 2,
    }
    constructions = [
        ast.unparse(node.func)
        for method in methods.values()
        for node in ast.walk(method)
        if isinstance(node, ast.Call)
        and ast.unparse(node.func) in expected_constructions
    ]
    assert {
        repository: constructions.count(repository)
        for repository in expected_constructions
    } == expected_constructions
