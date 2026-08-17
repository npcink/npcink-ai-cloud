export type OperatorSeverity = 'watch' | 'warn' | 'action-needed';

export type RuntimeSummarySignalInput = {
  queuedRuns: number;
  runningRuns: number;
  callbackFailed: number;
  callbackPending: number;
  guardEvents: number;
};

export type OperatorRuntimeSignal = {
  key: 'queued' | 'running' | 'callback' | 'guard';
  label: string;
  scope: string;
  value: number;
  severity: OperatorSeverity;
  reason: string;
  issueClass: string;
};

export type OperatorWatchItem = {
  title: string;
  scope: string;
  severity: OperatorSeverity;
  reason: string;
  value: string;
};

export type OperatorWatchItemProjection = {
  code: string;
  scope: string;
  severity: 'watch' | 'warn' | 'action_needed';
  value: number | string | null;
  detailCode: string;
  detailArgs: Record<string, unknown>;
};

type BuildRuntimeSignalLabels = {
  queuedRuns: string;
  runningRuns: string;
  callbackFailed: string;
  guardEvents: string;
};

type BuildRuntimeSignalCopy = {
  queuedElevated: string;
  queuedWatch: string;
  queuedNominal: string;
  runningElevated: string;
  runningWatch: string;
  runningNominal: string;
  callbackFailed: string;
  callbackPending: string;
  callbackNominal: string;
  guardHot: string;
  guardWatch: string;
  guardNominal: string;
};

type BuildWatchItemInputs = {
  items: OperatorWatchItemProjection[];
  formatValue: (value: number) => string;
  localize: (item: OperatorWatchItemProjection) => { title: string; reason: string };
};

/**
 * Frontend-only runtime metric presentation.
 *
 * These route-local thresholds describe the four evidence tiles only. They do
 * not select the Admin overview conclusion, watch-item order, or next action;
 * those decisions come from the backend operator projection.
 */
export function buildAdminRuntimeSignals(
  runtimeSummary: RuntimeSummarySignalInput,
  labels: BuildRuntimeSignalLabels,
  copy: BuildRuntimeSignalCopy
): OperatorRuntimeSignal[] {
  return [
    {
      key: 'queued',
      label: labels.queuedRuns,
      scope: 'runtime.queue',
      value: runtimeSummary.queuedRuns,
      severity: runtimeSummary.queuedRuns >= 20 ? 'warn' : 'watch',
      reason:
        runtimeSummary.queuedRuns >= 20
          ? copy.queuedElevated
          : runtimeSummary.queuedRuns > 0
            ? copy.queuedWatch
            : copy.queuedNominal,
      issueClass:
        runtimeSummary.queuedRuns >= 20
          ? 'queue_backlog'
          : runtimeSummary.queuedRuns > 0
            ? 'queue_watch'
            : 'nominal',
    },
    {
      key: 'running',
      label: labels.runningRuns,
      scope: 'runtime.worker',
      value: runtimeSummary.runningRuns,
      severity: runtimeSummary.runningRuns >= 12 ? 'warn' : 'watch',
      reason:
        runtimeSummary.runningRuns >= 12
          ? copy.runningElevated
          : runtimeSummary.runningRuns > 0
            ? copy.runningWatch
            : copy.runningNominal,
      issueClass:
        runtimeSummary.runningRuns >= 12
          ? 'worker_pressure'
          : runtimeSummary.runningRuns > 0
            ? 'worker_watch'
            : 'nominal',
    },
    {
      key: 'callback',
      label: labels.callbackFailed,
      scope: 'runtime.callback',
      value: runtimeSummary.callbackFailed,
      severity:
        runtimeSummary.callbackFailed > 0
          ? 'action-needed'
          : runtimeSummary.callbackPending > 0
            ? 'warn'
            : 'watch',
      reason:
        runtimeSummary.callbackFailed > 0
          ? copy.callbackFailed
          : runtimeSummary.callbackPending > 0
            ? copy.callbackPending
            : copy.callbackNominal,
      issueClass:
        runtimeSummary.callbackFailed > 0
          ? 'callback_failed'
          : runtimeSummary.callbackPending > 0
            ? 'callback_pending'
            : 'nominal',
    },
    {
      key: 'guard',
      label: labels.guardEvents,
      scope: 'request.guard',
      value: runtimeSummary.guardEvents,
      severity:
        runtimeSummary.guardEvents >= 25
          ? 'action-needed'
          : runtimeSummary.guardEvents > 0
            ? 'warn'
            : 'watch',
      reason:
        runtimeSummary.guardEvents >= 25
          ? copy.guardHot
          : runtimeSummary.guardEvents > 0
            ? copy.guardWatch
            : copy.guardNominal,
      issueClass:
        runtimeSummary.guardEvents >= 25
          ? 'guard_hot'
          : runtimeSummary.guardEvents > 0
            ? 'guard_watch'
            : 'nominal',
    },
  ];
}

export function buildAdminOperatorWatchItems(
  inputs: BuildWatchItemInputs
): OperatorWatchItem[] {
  return inputs.items.map((item) => {
    const localized = inputs.localize(item);
    return {
      title: localized.title,
      scope: item.scope,
      severity: item.severity === 'action_needed' ? 'action-needed' : item.severity,
      reason: localized.reason,
      value:
        typeof item.value === 'number'
          ? inputs.formatValue(item.value)
          : item.value === null
            ? '?'
            : String(item.value),
    };
  });
}

export function operatorSeverityClasses(severity: OperatorSeverity): string {
  switch (severity) {
    case 'action-needed':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200';
    case 'warn':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200';
  }
}
