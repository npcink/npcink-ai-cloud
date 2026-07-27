import { useId } from 'react';

type AdminCredentialFieldProps = {
  mode: 'create' | 'edit';
  revealed: boolean;
  value: string;
  label: string;
  unchangedLabel: string;
  replaceLabel: string;
  cancelReplacementLabel: string;
  keepCurrentPlaceholder: string;
  onChange: (value: string) => void;
  onReveal: () => void;
  onCancelReplacement: () => void;
  density?: 'default' | 'compact';
  hideLabel?: boolean;
};

export function AdminCredentialField({
  mode,
  revealed,
  value,
  label,
  unchangedLabel,
  replaceLabel,
  cancelReplacementLabel,
  keepCurrentPlaceholder,
  onChange,
  onReveal,
  onCancelReplacement,
  density = 'default',
  hideLabel = false,
}: AdminCredentialFieldProps) {
  const generatedId = useId();
  const inputId = `admin-credential-${generatedId.replace(/:/g, '')}`;
  const showInput = mode === 'create' || revealed;

  if (!showInput) {
    return (
      <div
        data-ui="admin-credential-field"
        data-density={density}
        className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"
      >
        <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
        <div className={density === 'compact'
          ? 'flex min-h-9 items-center justify-between gap-3'
          : 'flex h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-900/60'}
        >
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
            {unchangedLabel}
          </span>
          <button
            type="button"
            className="shrink-0 text-xs font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
            onClick={onReveal}
          >
            {replaceLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-ui="admin-credential-field"
      data-density={density}
      className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"
    >
      <span className={`items-center justify-between gap-2 ${hideLabel && mode !== 'edit' ? 'sr-only' : 'flex'}`}>
        <label htmlFor={inputId} className={hideLabel ? 'sr-only' : undefined}>{label}</label>
        {mode === 'edit' ? (
          <button
            type="button"
            className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
            onClick={onCancelReplacement}
          >
            {cancelReplacementLabel}
          </button>
        ) : null}
      </span>
      <input
        id={inputId}
        aria-label={hideLabel ? label : undefined}
        className={`${density === 'compact' ? 'h-9' : 'h-11'} rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white`}
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={mode === 'edit' ? keepCurrentPlaceholder : undefined}
        autoComplete="new-password"
      />
    </div>
  );
}
