// Catalog resolution: Pod catalog when reachable (authoritative and fresh),
// else the last known good cache, else the bundled seed. Centralised so the
// local setup screen and the turn planner agree on what is installable.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchCatalog, type ModelManifest } from "./registry";
import { SEED_CATALOG } from "./seedCatalog";

const CACHE_KEY = "ghost:models:catalog";

export interface PodEndpoint {
  baseUrl: string;
  headers: Record<string, string>;
}

export async function loadCatalog(pod: PodEndpoint | null): Promise<ModelManifest[]> {
  if (pod) {
    try {
      const cat = await fetchCatalog(pod.baseUrl, pod.headers);
      if (cat.models.length > 0) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cat.models));
        return cat.models;
      }
    } catch {
      // Pod unreachable or catalog invalid — fall through to cache/seed.
    }
  }
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as ModelManifest[];
      if (Array.isArray(cached) && cached.length > 0) return cached;
    }
  } catch {
    // Corrupt cache is not fatal; the seed below is always available.
  }
  return SEED_CATALOG;
}
