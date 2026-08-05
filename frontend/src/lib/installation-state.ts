import { getApiBaseUrl } from '@/lib/env';
import {
  isInstallationState,
  parseSetupStateEnvelope,
  type InstallationState,
} from '@/lib/setup';

const SETUP_STATE_TIMEOUT_MS = 5000;

export type InstallationGateResult =
  | { ok: true; installationState: InstallationState }
  | { ok: false };

// Completion is irreversible by contract. Cache only that terminal state so
// steady-state frontend requests do not add a setup-state network round trip.
let completedInstallationObserved = false;

function resolveDevelopmentInstallationStateOverride(): InstallationState | null {
  const runtimeEnvironment = String(process.env.NEXT_PUBLIC_ENV || '').trim().toLowerCase();
  if (runtimeEnvironment !== 'development' && runtimeEnvironment !== 'test') {
    return null;
  }
  const value = String(process.env.NPCINK_CLOUD_SETUP_STATE_OVERRIDE || '').trim();
  return isInstallationState(value) ? value : null;
}

export async function readInstallationState(): Promise<InstallationGateResult> {
  if (completedInstallationObserved) {
    return { ok: true, installationState: 'complete' };
  }
  const override = resolveDevelopmentInstallationStateOverride();
  if (override) {
    completedInstallationObserved = override === 'complete';
    return { ok: true, installationState: override };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SETUP_STATE_TIMEOUT_MS);
  try {
    const response = await fetch(`${getApiBaseUrl().replace(/\/$/, '')}/setup/v1/state`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      return completedInstallationObserved
        ? { ok: true, installationState: 'complete' }
        : { ok: false };
    }
    const state = parseSetupStateEnvelope(await response.json());
    if (state?.installation_state === 'complete') {
      completedInstallationObserved = true;
    }
    if (completedInstallationObserved) {
      return { ok: true, installationState: 'complete' };
    }
    return state
      ? { ok: true, installationState: state.installation_state }
      : { ok: false };
  } catch {
    return completedInstallationObserved
      ? { ok: true, installationState: 'complete' }
      : { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}
