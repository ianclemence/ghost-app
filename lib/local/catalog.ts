// Catalog resolution: Pod catalog when reachable (authoritative and fresh),
// else the last known good cache, else the bundled seed. Centralised so the
// local setup screen and the turn planner agree on what is installable.
//
// Travel-cache policy: only SUPPORTED_PHONE_MODEL_IDS are offered. Stale
// Balanced entries from older Pods/caches are filtered out (never
// auto-downloaded). Pass { includeLegacy: true } only for the management
// screen's "remove legacy downloads" path.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchCatalog, isSupportedPhoneModel, type ModelManifest } from "./registry";
import { SEED_CATALOG } from "./seedCatalog";

// Bumped when Balanced was retired so stale caches with ghost-balanced-1 drop.
const CACHE_KEY = "ghost:models:catalog:v2";

export interface PodEndpoint {
  baseUrl: string;
  headers: Record<string, string>;
}

export async function loadCatalog(pod: PodEndpoint | null, opts?: { includeLegacy?: boolean }): Promise<ModelManifest[]> {
  const includeLegacy = opts?.includeLegacy ?? false;
  const filter = (models: ModelManifest[]) =>
    includeLegacy ? models : models.filter((m) => isSupportedPhoneModel(m.id));
  if (pod) {
    try {
      const cat = await fetchCatalog(pod.baseUrl, pod.headers);
      const kept = filter(cat.models);
      if (kept.length > 0) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(kept));
        return kept;
      }
      // Pod reachable but nothing supported: fall through to cache/seed
      // rather than stranding the user with an empty list.
    } catch {
      // Pod unreachable or catalog invalid — fall through to cache/seed.
    }
  }
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as ModelManifest[];
      if (Array.isArray(cached) && cached.length > 0) {
        const kept = filter(cached);
        if (kept.length > 0) return kept;
      }
    }
  } catch {
    // Corrupt cache is not fatal; the seed below is always available.
  }
  // Legacy cache key migration: ignore v1 entries (may contain Balanced).
  try {
    await AsyncStorage.removeItem("ghost:models:catalog");
  } catch { /* best effort */ }
  return filter(SEED_CATALOG);
}
