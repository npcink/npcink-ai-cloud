export const OBSERVATION_WINDOWS = [24, 72, 168, 336, 720] as const;
export type ObservationWindow = typeof OBSERVATION_WINDOWS[number];

export function normalizeObservationWindow(value: string | null, fallback: ObservationWindow = 168): ObservationWindow {
  const hours = Number(value);
  return OBSERVATION_WINDOWS.includes(hours as ObservationWindow) ? hours as ObservationWindow : fallback;
}
