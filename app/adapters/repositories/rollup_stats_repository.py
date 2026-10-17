from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.repositories.stats_repository import StatsRepository
from app.core.models import (
    CatalogInstance,
    ProviderCallRecord,
    RoutingBinding,
    RoutingProfile,
    RunRecord,
)


class RollupStatsRepository(StatsRepository):
    """One site's two windows, discarded before reading the next site.

    Only generate_rollups supplies this reader. Interactive statistics retain
    their ordinary repository, filters, and freshness. SQL aggregates and
    payload builders are shared with that path rather than reimplemented.
    """

    def __init__(
        self,
        session: Session,
        *,
        site_id: str | None,
        windows: dict[str, dict[str, datetime]],
        instances: list[CatalogInstance],
        profiles: list[RoutingProfile],
        bindings: list[RoutingBinding],
        sites_total: int,
    ) -> None:
        super().__init__(session)
        self.site_id = site_id
        self.instances = instances
        self.instances_by_id = {item.instance_id: item for item in instances}
        self.profiles_by_id = {item.profile_id: item for item in profiles}
        self.bindings_by_id = {item.profile_id: item for item in bindings}
        self.sites_total = sites_total
        self.window_keys = {(w["start_at"], w["end_at"]) for w in windows.values()}
        self.rolling_window = windows["rolling_24h"]
        rolling = self.rolling_window
        self.provider_calls = super().list_provider_calls(
            site_id, start_at=rolling["start_at"], end_at=rolling["end_at"]
        )
        self.calls_by_instance: defaultdict[str, list[ProviderCallRecord]] = defaultdict(list)
        for call in self.provider_calls:
            self.calls_by_instance[call.instance_id].append(call)
        self.run_metrics: dict[tuple[datetime, datetime, str | None], dict[str, object]] = {}
        self.provider_metrics: dict[tuple[datetime, datetime, str | None], dict[str, object]] = {}
        self.summary_provider_metrics: dict[tuple[datetime, datetime], dict[str, object]] = {}
        self.run_latencies: defaultdict[tuple[datetime, datetime, str | None], list[int]] = (
            defaultdict(list)
        )
        self.provider_latencies: defaultdict[tuple[datetime, datetime, str], list[int]] = (
            defaultdict(list)
        )
        for window in windows.values():
            self._load_window(**window)

    def _load_window(self, *, start_at: datetime, end_at: datetime) -> None:
        window = {"start_at": start_at, "end_at": end_at}
        self.run_metrics[start_at, end_at, None] = super().aggregate_runs_window(
            site_id=self.site_id, start_at=start_at, end_at=end_at
        )
        # Summary alone requires BOTH the run start and call creation in range.
        self.summary_provider_metrics[start_at, end_at] = super().aggregate_provider_calls_window(
            site_id=self.site_id, constrain_run_started=True, start_at=start_at, end_at=end_at
        )
        run_statement = self._run_metrics_statement().add_columns(RunRecord.profile_id)
        if self.site_id:
            run_statement = run_statement.where(RunRecord.site_id == self.site_id)
        run_statement = self._apply_run_window_filters(run_statement, **window).group_by(
            RunRecord.profile_id
        )
        for row in self.session.execute(run_statement):
            self.run_metrics[start_at, end_at, row[-1]] = self._run_metrics_from_row(row)

        call_statement = self._provider_call_metrics_statement().add_columns(
            ProviderCallRecord.instance_id
        )
        if self.site_id:
            call_statement = call_statement.join(
                RunRecord, RunRecord.run_id == ProviderCallRecord.run_id
            ).where(RunRecord.site_id == self.site_id)
        call_statement = self._apply_provider_call_window_filters(
            call_statement, **window
        ).group_by(ProviderCallRecord.instance_id)
        for row in self.session.execute(call_statement):
            self.provider_metrics[start_at, end_at, row[-1]] = self._provider_call_metrics_from_row(
                row
            )

        latency = self._run_latency_ms_expression()
        if latency is not None:
            statement = select(RunRecord.profile_id, latency).where(
                RunRecord.started_at.is_not(None), RunRecord.finished_at.is_not(None)
            )
            if self.site_id:
                statement = statement.where(RunRecord.site_id == self.site_id)
            statement = self._apply_run_window_filters(statement, **window).order_by(
                RunRecord.started_at.asc(), RunRecord.run_id.asc()
            )
            # Stream scalar columns, never RunRecord inputs/results or all sites' history.
            for profile_id, value in self.session.execute(
                statement.execution_options(yield_per=1000)
            ):
                self.run_latencies[start_at, end_at, None].append(int(value or 0))
                if profile_id:
                    self.run_latencies[start_at, end_at, profile_id].append(int(value or 0))
        lower = start_at.replace(tzinfo=UTC) if start_at.tzinfo is None else start_at
        upper = end_at.replace(tzinfo=UTC) if end_at.tzinfo is None else end_at
        for call in self.provider_calls:
            at = call.created_at
            if at.tzinfo is None:
                at = at.replace(tzinfo=UTC)
            if lower <= at <= upper and call.latency_ms is not None:
                self.provider_latencies[start_at, end_at, call.instance_id].append(call.latency_ms)

    def get_instance(self, instance_id: str) -> CatalogInstance | None:
        return self.instances_by_id.get(instance_id)

    def get_profile(self, profile_id: str) -> RoutingProfile | None:
        return self.profiles_by_id.get(profile_id)

    def get_routing_binding(self, profile_id: str) -> RoutingBinding | None:
        return self.bindings_by_id.get(profile_id)

    def list_instances(self) -> list[CatalogInstance]:
        return self.instances

    def list_instances_by_ids(self, instance_ids: list[str]) -> list[CatalogInstance]:
        return [self.instances_by_id[key] for key in instance_ids if key in self.instances_by_id]

    def count_sites(self) -> int:
        return self.sites_total

    def count_profiles(self) -> int:
        return len(self.profiles_by_id)

    def list_provider_calls(
        self, site_id: str | None = None, **filters: Any
    ) -> list[ProviderCallRecord]:
        self._check_calls(site_id, filters)
        return self.provider_calls

    def list_provider_calls_for_instance(
        self, instance_id: str, site_id: str | None = None, **filters: Any
    ) -> list[ProviderCallRecord]:
        self._check_calls(site_id, filters)
        return self.calls_by_instance.get(instance_id, [])

    def list_provider_calls_for_instances(
        self, instance_ids: list[str], site_id: str | None = None, **filters: Any
    ) -> list[ProviderCallRecord]:
        self._check_calls(site_id, filters)
        selected = set(instance_ids)
        return [call for call in self.provider_calls if call.instance_id in selected]

    def aggregate_runs_window(self, **filters: Any) -> dict[str, object]:
        self._check_scope(filters.get("site_id"), filters)
        return self.run_metrics.get(
            self._key(filters, "profile_id"),
            {
                "runs_total": 0,
                "success_total": 0,
                "fallback_total": 0,
                "last_seen_at": None,
                "active_sites_total": 0,
                "avg_latency_ms": 0,
            },
        )

    def aggregate_provider_calls_window(self, **filters: Any) -> dict[str, object]:
        self._check_scope(filters.get("site_id"), filters)
        key = self._key(filters, "instance_id")
        if filters.get("constrain_run_started"):
            if key[2] is not None:
                raise ValueError("rollup summary metrics cannot filter an instance")
            return self.summary_provider_metrics[key[:2]]
        return self.provider_metrics.get(key, self._empty_provider_call_metrics())

    def list_run_latency_values_window(self, **filters: Any) -> list[int]:
        self._check_scope(filters.get("site_id"), filters)
        return self.run_latencies[self._key(filters, "profile_id")]

    def list_provider_call_latency_values_window(self, **filters: Any) -> list[int]:
        self._check_scope(filters.get("site_id"), filters)
        start_at, end_at, instance_id = self._key(filters, "instance_id")
        if instance_id is None:
            raise ValueError("rollup provider latency requires an instance")
        return self.provider_latencies[start_at, end_at, instance_id]

    def _check_scope(self, site_id: str | None, filters: dict[str, Any]) -> None:
        if (site_id or None) != (self.site_id or None) or filters.get("site_ids") is not None:
            raise ValueError("rollup statistics reader cannot cross site scopes")
        allowed = {
            "site_id",
            "site_ids",
            "start_at",
            "end_at",
            "instance_id",
            "profile_id",
            "constrain_run_started",
        }
        if (
            set(filters) - allowed
            or (filters.get("start_at"), filters.get("end_at")) not in self.window_keys
        ):
            raise ValueError("unsupported rollup statistics filter or window")

    def _check_calls(self, site_id: str | None, filters: dict[str, Any]) -> None:
        self._check_scope(site_id, filters)
        if any(filters.get(key) != value for key, value in self.rolling_window.items()):
            raise ValueError("rollup health calls require the rolling window")

    def _key(
        self, filters: dict[str, Any], dimension: str
    ) -> tuple[datetime, datetime, str | None]:
        return filters["start_at"], filters["end_at"], filters.get(dimension) or None
