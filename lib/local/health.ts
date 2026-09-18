/**
 * Boot-time health for phone-local Ghost.
 *
 * `modelManager.activeModelId()` is only a cheap disk check: it says a model
 * was *marked* active, not that the artifact is still usable. A crashed
 * install can leave a zero-length artifact, and storage can lose the file.
 * Treating that as "ready" routes the user into the app only to fail at the
 * first send — the opposite of the honest-limits principle.
 *
 * This verifies the active artifact before the app trusts it: repair what is
 * repairable, and report honestly when it is not. It reads the catalog from
 * cache/seed only, so it never needs the network.
 */
import { loadCatalog } from "./catalog";
import { modelManager } from "./modelManager";

export async function activeModelHealthy(): Promise<boolean> {
  const id = await modelManager.activeModelId();
  if (!id) return false;
  try {
    const catalog = await loadCatalog(null);
    // repair() removes zero-length artifacts left by crashed installs. If the
    // active model was one of them, it is not usable.
    const repaired = await modelManager.repair(catalog);
    if (repaired.includes(id)) return false;
    const manifest = catalog.find((m) => m.id === id);
    if (!manifest) return false;
    const state = await modelManager.state(manifest);
    return state.status === "active";
  } catch {
    // Any failure to verify is treated as not-ready: honest, never optimistic.
    return false;
  }
}
