from __future__ import annotations

from datetime import UTC, datetime

from app.adapters.repositories.stats_repository import StatsRepository
from app.core.config import Settings
from app.core.db import get_session
from app.core.models import CatalogInstance, HealthSnapshot
from app.core.services import ReadyReport
from app.domain.runtime.service import RuntimeService
from app.workers.heartbeat import build_worker_heartbeat_summary, expected_worker_ids
from app.workers.ops_cadence import build_cadence_summary

STRICT_CADENCE_TASK_IDS = (
    "retention_cleanup",
    "plugin_observability_cleanup",
    "usage_rollup",
    "router_diagnostics_summary",
    "latency_probe_summary",
    "alert_provider_degradation",
    "provider_health_scan",
)


class ObservabilityService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def build_summary(
        self,
        *,
        ready_report: ReadyReport,
        recent_minutes: int = 60,
        backlog_limit: int = 10,
        now: datetime | None = None,
    ) -> dict[str, object]:
        current_time = (now or datetime.now(UTC)).astimezone(UTC)
        runtime_service = RuntimeService(self.settings.database_url, settings=self.settings)
        cadence = build_cadence_summary(self.settings, now=current_time)
        workers = build_worker_heartbeat_summary(self.settings, now=current_time)
        providers = self._build_provider_health_summary(current_time)
        runtime = runtime_service.get_runtime_diagnostics_summary(
            recent_minutes=recent_minutes,
        )
        backlog = runtime_service.get_runtime_backlog_diagnostics(
            scope_kind="site_id",
            limit=backlog_limit,
        )
        return {
            "generated_at": current_time.isoformat().replace("+00:00", "Z"),
            "ready": {
                "status": "ok" if ready_report.ok else "error",
                "checks": ready_report.checks,
                "details": ready_report.details,
            },
            "tracing": {
                "service_name": self.settings.otel_service_name,
                "otlp_endpoint": str(self.settings.otel_exporter_otlp_endpoint or ""),
                "otlp_configured": bool(
                    str(self.settings.otel_exporter_otlp_endpoint or "").strip()
                ),
                "trace_query_url": str(self.settings.otel_trace_query_url or ""),
                "trace_query_configured": bool(
                    str(self.settings.otel_trace_query_url or "").strip()
                ),
            },
            "workers": workers,
            "cadence": cadence,
            "providers": providers,
            "runtime": {
                "summary": runtime,
                "backlog": backlog,
            },
        }

    def build_operational_readiness(
        self,
        *,
        ready_report: ReadyReport,
        now: datetime | None = None,
    ) -> dict[str, object]:
        current_time = (now or datetime.now(UTC)).astimezone(UTC)
        summary = self.build_summary(
            ready_report=ready_report,
            recent_minutes=60,
            backlog_limit=10,
            now=current_time,
        )
        workers = self._dict_value(summary.get("workers"))
        worker_items = self._dict_list(workers.get("items"))
        worker_freshness = {
            str(item.get("worker_id") or ""): str(item.get("freshness") or "")
            for item in worker_items
            if isinstance(item, dict)
        }
        cadence = self._dict_value(summary.get("cadence"))
        cadence_items = self._dict_list(cadence.get("items"))
        cadence_freshness = {
            str(item.get("task_id") or ""): str(item.get("freshness") or "")
            for item in cadence_items
            if isinstance(item, dict)
        }
        providers = self._dict_value(summary.get("providers"))
        provider_operational_scope = self._dict_value(providers.get("operational_scope"))
        if not provider_operational_scope:
            provider_operational_scope = providers
        provider_status_counts = self._dict_value(
            provider_operational_scope.get("status_counts")
        )
        provider_instances_total = self._int_value(
            provider_operational_scope.get("instances_total")
        )
        degraded_instances = self._int_value(provider_status_counts.get("degraded"))
        unhealthy_instances = self._int_value(provider_status_counts.get("unhealthy"))
        unknown_instances = self._int_value(provider_status_counts.get("unknown"))
        providers_operational = (
            provider_instances_total > 0
            and degraded_instances == 0
            and unhealthy_instances == 0
            and unknown_instances == 0
        )

        required_worker_ids = expected_worker_ids(self.settings)
        worker_checks = {
            f"worker.{worker_id}.fresh": worker_freshness.get(worker_id) == "fresh"
            for worker_id in required_worker_ids
        }
        cadence_checks = {
            f"cadence.{task_id}.fresh": cadence_freshness.get(task_id) == "fresh"
            for task_id in STRICT_CADENCE_TASK_IDS
        }
        checks = {
            "dependencies.ready": ready_report.ok,
            "providers.fresh": (
                str(provider_operational_scope.get("freshness") or "") == "fresh"
            ),
            "providers.operational": providers_operational,
            **worker_checks,
            **cadence_checks,
        }
        details = {
            "dependencies.ready": "database and redis dependency checks passed"
            if ready_report.ok
            else "database or redis dependency checks failed",
            "providers.fresh": (
                "provider health freshness="
                f"{str(provider_operational_scope.get('freshness') or 'missing')}"
            ),
            "providers.operational": (
                f"provider instances={provider_instances_total}; "
                f"degraded={degraded_instances}; unhealthy={unhealthy_instances}; "
                f"unknown={unknown_instances}"
            ),
        }
        for worker_id in required_worker_ids:
            details[f"worker.{worker_id}.fresh"] = (
                f"worker freshness={worker_freshness.get(worker_id, 'missing')}"
            )
        for task_id in STRICT_CADENCE_TASK_IDS:
            details[f"cadence.{task_id}.fresh"] = (
                f"cadence freshness={cadence_freshness.get(task_id, 'missing')}"
            )
        return {
            "generated_at": current_time.isoformat().replace("+00:00", "Z"),
            "ok": all(checks.values()),
            "checks": checks,
            "details": details,
            "required_workers": list(required_worker_ids),
            "required_cadence_tasks": list(STRICT_CADENCE_TASK_IDS),
            "summary": summary,
        }

    def _build_provider_health_summary(
        self,
        current_time: datetime,
    ) -> dict[str, object]:
        with get_session(self.settings.database_url) as session:
            repository = StatsRepository(session)
            instances = repository.list_instances()
            routing_bindings = repository.list_routing_bindings()
            health_snapshots = repository.list_latest_health_snapshots(
                [str(instance.instance_id) for instance in instances]
            )

        latest_by_instance: dict[str, HealthSnapshot] = {}
        for snapshot in health_snapshots:
            snapshot_instance_id = str(snapshot.instance_id or "")
            if not snapshot_instance_id:
                continue
            current = latest_by_instance.get(snapshot_instance_id)
            if current is None or snapshot.measured_at > current.measured_at:
                latest_by_instance[snapshot_instance_id] = snapshot

        summary = self._summarize_provider_health(
            instances=instances,
            expected_instance_ids=[str(instance.instance_id) for instance in instances],
            latest_by_instance=latest_by_instance,
            current_time=current_time,
        )
        routed_instance_ids: list[str] = []
        seen_instance_ids: set[str] = set()
        for binding in routing_bindings:
            candidate_instance_ids = binding.candidate_instance_ids
            if not isinstance(candidate_instance_ids, list):
                continue
            for candidate_instance_id in candidate_instance_ids:
                instance_id = str(candidate_instance_id or "").strip()
                if not instance_id or instance_id in seen_instance_ids:
                    continue
                seen_instance_ids.add(instance_id)
                routed_instance_ids.append(instance_id)
        instances_by_id = {str(instance.instance_id): instance for instance in instances}
        routed_instances = [
            instances_by_id[instance_id]
            for instance_id in routed_instance_ids
            if instance_id in instances_by_id
        ]
        summary["operational_scope"] = self._summarize_provider_health(
            instances=routed_instances,
            expected_instance_ids=routed_instance_ids,
            latest_by_instance=latest_by_instance,
            current_time=current_time,
        )
        return summary

    def _summarize_provider_health(
        self,
        *,
        instances: list[CatalogInstance],
        expected_instance_ids: list[str],
        latest_by_instance: dict[str, HealthSnapshot],
        current_time: datetime,
    ) -> dict[str, object]:
        status_counts = {
            "healthy": 0,
            "degraded": 0,
            "unhealthy": 0,
            "unknown": 0,
        }
        degraded_provider_ids: set[str] = set()
        last_measured_at: datetime | None = None
        for instance in instances:
            instance_id = str(instance.instance_id or "")
            latest_snapshot = latest_by_instance.get(instance_id)
            status: str = str(getattr(latest_snapshot, "status", "unknown") or "unknown")
            if status not in status_counts:
                status = "unknown"
            status_counts[status] += 1
            if status in {"degraded", "unhealthy"}:
                degraded_provider_ids.add(str(instance.provider_id))
            measured_at = self._normalize_datetime(getattr(latest_snapshot, "measured_at", None))
            if measured_at is not None and (
                last_measured_at is None or measured_at > last_measured_at
            ):
                last_measured_at = measured_at

        unresolved_instance_count = max(0, len(expected_instance_ids) - len(instances))

        last_measured_at = self._normalize_datetime(last_measured_at)
        age_seconds = (
            max(0, int((current_time - last_measured_at).total_seconds()))
            if last_measured_at is not None
            else -1
        )
        interval_seconds = max(60, int(self.settings.provider_health_scan_interval_seconds))
        if last_measured_at is None:
            freshness = "missing"
        elif age_seconds > interval_seconds * 2:
            freshness = "stale"
        elif age_seconds > interval_seconds:
            freshness = "attention"
        else:
            freshness = "fresh"
        return {
            "interval_seconds": interval_seconds,
            "freshness": freshness,
            "last_measured_at": (
                last_measured_at.astimezone(UTC).isoformat().replace("+00:00", "Z")
                if last_measured_at is not None
                else ""
            ),
            "age_seconds": age_seconds,
            "providers_total": len({instance.provider_id for instance in instances}),
            "instances_total": len(instances),
            "configured_instance_ids_total": len(expected_instance_ids),
            "resolved_instances_total": len(instances),
            "unresolved_instance_ids_total": unresolved_instance_count,
            "status_counts": status_counts,
            "degraded_provider_ids": sorted(degraded_provider_ids),
        }

    def _normalize_datetime(self, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _dict_value(self, value: object) -> dict[str, object]:
        if not isinstance(value, dict):
            return {}
        return {str(key): item for key, item in value.items()}

    def _dict_list(self, value: object) -> list[dict[str, object]]:
        if not isinstance(value, list):
            return []
        return [self._dict_value(item) for item in value if isinstance(item, dict)]

    def _int_value(self, value: object) -> int:
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
                return 0
        return 0
