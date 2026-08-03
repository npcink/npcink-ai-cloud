from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FACADE_PATH = ROOT / "app/adapters/repositories/commercial_repository.py"

ALLOWED_FACADE_BASES = {
    "CommercialAccessRepository",
    "CommercialAccountSiteRepository",
    "CommercialBillingRepository",
    "CommercialCreditRepository",
    "CommercialDecisionRepository",
    "CommercialIdentityRepository",
    "CommercialPaymentRepository",
    "CommercialPlanRepository",
    "CommercialRuntimeKnowledgeQueries",
    "CommercialServiceAuditRepository",
    "CommercialSiteApiKeyRepository",
    "CommercialSubscriptionOrderRepository",
    "CommercialSubscriptionRepository",
    "CommercialSupportRepository",
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
