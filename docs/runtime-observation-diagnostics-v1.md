# Runtime Observation and Diagnostic Closure v1

Status: active operator contract for the existing read-only Admin surfaces.

## Roles

- `/admin/usage-statistics` shows Cloud run volume, sites, runtime profiles,
  outcomes and durations. `group=functions` remains the compatible URL key,
  but its rows group `profile_id`, not title/summary/rewrite tasks.
- Plugin history counts retained plugin events. One run may produce multiple
  events. Cloud KPI values are hidden in that view; runtime-type and review
  filters do not apply to plugin history.
- `/admin/troubleshooting` classifies runtime failures, provider-call errors,
  missing call evidence and missing metering evidence. Task success, call
  completeness, metering completeness and editor adoption are separate facts.
- The existing editorial quality view owns task-level adoption evidence.
  Engineering samples and M4 observations do not prove non-author user value.

## Investigation

1. Choose a site/runtime type and period in runtime observation.
2. Open diagnostics and select an issue. Explicit URL focus stays selected
   even if the returned snapshot no longer contains that issue.
3. For missing calls, **Inspect missing-call runs** opens only settled AI
   runs with no matching `ProviderCallRecord`. Recorded calls are in a
   separate comparison view, never silently mixed into the affected list.
4. Open a run's detail and correlate by Cloud `run_id`. Inspect status and
   error code before moving to plugin, Site Knowledge or provider evidence.
   Failed/canceled runs without calls require investigation: they may have
   stopped before dispatch, or the call record may be missing. Neither cause
   is inferred from absence alone.
5. After a fix, **Review runs from now** sets a fixed URL `since` from the
   current snapshot. Refresh after natural traffic. Inspect outcome, provider
   evidence and metering separately. Do not manufacture paid calls for proof.
6. No new runs, processing-only runs, partial reads or capped evidence cannot
   confirm recovery. Historical issues remain visible in the full period.

This adds no acknowledgement store, automatic repair, routing change,
WordPress write, notification or new analytics service.

## Read API semantics

The existing internal/Admin runtime-telemetry and `/runs` reads accept an
optional ISO datetime `since`. Its effective value is intersected with
`recent_minutes` and the current time; naive values mean UTC. Counts, trends
and run records use runs started in that scope. Navigation to sources without
this filter retains their supported period, not an implicit equivalent scope.

For `issue_code=hosted_model.provider_call_gap`, `/runs` defaults to
`evidence_scope=affected`; `context` returns runs with recorded calls for
comparison. Both retain site, capability, period and bounded-result rules.

Call completeness uses settled AI runs, excluding `queued` and `running`;
these are reported as `provider_evidence_pending_runs`. Non-AI media uploads
and Site Knowledge status reads remain excluded from AI evidence requirements.
The same operation classification applies to summary, groups, trends and run
filters; other Site Knowledge operations remain subject to evidence checks.
Metering dispatch rules remain unchanged. Call existence checks span
all associations for the bounded run cohort, independently of the 10,000-row
call-detail cap. Group `provider_call_gap_runs` is an exact count, never
derived from rounded percentages. `evidence_limits` discloses capped sources.

Run counts and family ownership come from run records, not associated feedback
events. Alert totals are computed before display-group limits; group truncation
is separately reported as `capability_groups_truncated`. Run-list issue filters
apply directly to the API query, independent of the alert's display groups.
Selected route fields describe the logical service/route, not actual provider
execution. Downloads retain effective window, requested scope and evidence limits.

Run records add `provider_evidence_state`: `recorded`, `pending`,
`failed_without_call`, `canceled_without_call`, `missing` or `not_required`.
No prompt, result payload, secret or arbitrary error message is exposed.
Usage statistics add nullable `succeeded_avg_latency_ms` and
`failed_avg_latency_ms`; only complete timing samples contribute.

Source checks, mocked browser tests, M4 candidates, accepted M4, production
and human acceptance remain separate evidence states.
