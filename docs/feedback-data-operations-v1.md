# Feedback Data Operations v1

## Purpose

The feedback status command gives operators one aggregate, read-only view of
the Cloud-side feedback funnel. It reports deployment identity, connected and
active site counts, event and site coverage, last ingestion times, and
sample-readiness stages without exposing site identities, user content,
credentials, prompts, or generated text.

It consumes an explicit, metadata-only projection of the WordPress-local
monitoring setting. The projection is versioned as
`wordpress_monitoring_state.v1`; Cloud does not own or change the setting.
Sites without a fresh projection remain `unknown` and are reported with the
gap code `monitoring_state_projection_incomplete`.

## Design decisions

- Use an operator command instead of another API or Admin page. Existing Admin
  surfaces already provide detailed event views; the missing capability is a
  deployable aggregate that can be checked before deciding whether more UI is
  justified.
- Return counts, ratios, stages, and timestamps only. Site IDs, account IDs,
  prompts, generated text, and WordPress content are intentionally excluded.
- Keep monitoring state unknown instead of treating an active key, a Cloud run,
  or an ordinary observability event as permission. WordPress remains the
  owner of that state.
- Keep feedback event counts and editor-assist quality session counts as
  separate sample units. Adding them together would overstate evidence.

## Run

On a deployed host:

```bash
cd /opt/npcink-ai-cloud/current
bash deploy/remote-feedback-status.sh --window-hours 168
```

For a 30-day view, use `--window-hours 720`. The command runs inside the API
container, reads the configured database, and prints JSON to standard output.
It performs no database writes.

For local diagnostics with an explicitly configured database:

```bash
python -m app.dev.feedback_status --window-hours 168
```

## Interpret

- `connected_total`: active sites with at least one usable Cloud API key.
- `active_runtime_window`: distinct sites that started a Cloud run in the
  selected window.
- `monitoring_state_reported_window`: distinct connected sites with a fresh,
  valid WordPress-local monitoring state projection.
- `monitoring_enabled_window` / `monitoring_disabled_window`: the latest
  projected state for those sites in the selected window.
- `monitoring_state_unknown_total`: connected sites without a fresh projection.
- `plugin_observability_window`: distinct sites that sent any plugin
  observability event, excluding monitoring-state heartbeat events.
- `plugin_observability_on_enabled_window`: monitoring-enabled sites that also
  sent at least one ordinary plugin observability event.
- `agent_feedback_window`: distinct sites that sent governed agent feedback.
- `editor_assist_quality_window`: distinct sites that sent metadata-only
  editor-assist quality events under `editor_assist_quality.v1`.
- `coverage.plugin_observability_over_monitoring_enabled` uses the explicit
  monitoring-enabled population as its denominator. Active-runtime ratios
  remain available for comparison; `null` means the denominator is zero.
- `sample_readiness`: `insufficient` below 5 samples, `validation` from 5,
  `observation` from 50, and `decision` from 200. Agent feedback events and
  editor-assist quality sessions remain separate sample units.

These stages indicate sample volume only. They are not statistical
significance, release acceptance, or permission to mutate prompts, models,
routers, presets, WordPress content, or approval state.

## Product boundary

Cloud owns the runtime evidence and this read-only aggregate. WordPress remains
the local control plane and the source of truth for the monitoring setting,
review, preflight, approval, insertion, and final writes. The projection
contains only its contract version and boolean state; it does not transfer
control-plane ownership to Cloud.
