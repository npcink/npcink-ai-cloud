import type { TotpStart, TotpStatus } from './portal-totp-client';

export type TotpView =
  | { kind: 'loading_status' | 'unavailable' | 'reauthenticate' | 'outcome_unknown' }
  | { kind: 'ready'; status: TotpStatus }
  | { kind: 'starting' }
  | { kind: 'proof' | 'confirming'; start: TotpStart }
  | { kind: 'codes_visible'; codes: string[] };

/** A generation is retired before clearing UI; late responses cannot restore it. */
export function isCurrentTotpOperation(operation: number, current: number, epoch: number, currentEpoch: number): boolean {
  return operation === current && epoch === currentEpoch;
}
export function clearTotpView(kind: 'loading_status' | 'unavailable' | 'reauthenticate' | 'outcome_unknown'): TotpView {
  return { kind };
}
export function dismissTotpCodes(view: TotpView): TotpView {
  return view.kind === 'codes_visible' ? { kind: 'ready', status: { enabled: true, recovery_codes_remaining: 8 } } : view;
}
