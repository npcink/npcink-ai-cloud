export const OBSERVATION_WINDOWS = [336, 720, 2160] as const;
export type ObservationWindow = typeof OBSERVATION_WINDOWS[number];

export function normalizeObservationWindow(value: string | null, fallback: ObservationWindow = 336): ObservationWindow {
  const hours = Number(value);
  return OBSERVATION_WINDOWS.includes(hours as ObservationWindow) ? hours as ObservationWindow : fallback;
}
