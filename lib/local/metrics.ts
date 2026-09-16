// Travel-cache eval counters. CTO gate before expanding local scope:
// false-tool-call rate, sync conflict rate, download completion, dev-build
// friction, battery/thermal complaints. If Mini tool precision < ~95%,
// local tools stay off (they are: only deterministic remember ships).
// Persisted in AsyncStorage; surfaces in Ghost Pod screen / diagnostics.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type LocalMetricName =
  | "phone_turns"
  | "pod_turns"
  | "remember_captures"
  | "remember_sync_confirmed"
  | "download_started"
  | "download_completed"
  | "download_failed"
  | "legacy_cleaned";

const KEY = "ghost:local:metrics:v1";

export type LocalMetrics = Record<LocalMetricName, number>;

const ZERO: LocalMetrics = {
  phone_turns: 0,
  pod_turns: 0,
  remember_captures: 0,
  remember_sync_confirmed: 0,
  download_started: 0,
  download_completed: 0,
  download_failed: 0,
  legacy_cleaned: 0,
};

export async function getLocalMetrics(): Promise<LocalMetrics> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...ZERO };
    const parsed = JSON.parse(raw) as Partial<LocalMetrics>;
    return { ...ZERO, ...parsed };
  } catch {
    return { ...ZERO };
  }
}

export async function recordLocalMetric(name: LocalMetricName, by = 1): Promise<LocalMetrics> {
  const cur = await getLocalMetrics();
  cur[name] += by;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cur));
  } catch { /* metrics never break turns */ }
  return cur;
}

export function downloadCompletionRate(m: LocalMetrics): number | null {
  if (m.download_started <= 0) return null;
  return m.download_completed / m.download_started;
}
