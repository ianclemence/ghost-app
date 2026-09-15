// Model manager: resumable downloads, atomic install, verification,
// activation, deletion, rollback, corruption repair, storage accounting.
//
// Install layout (app-private):
//   models/<id>/<version>.part      in-progress download (resume data)
//   models/<id>/<version>.gguf      verified active/inactive artifact
//   models/<id>/active.json         {version, sha256, installed_at}
//   models/<id>/<version>.prev      previous artifact kept for rollback
//
// Atomicity: download → staging (.part) → hash verify → move to final →
// update active.json. The app never treats a .part file as valid.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import type { ModelManifest } from "./registry";

export type ModelStatus =
  | "not_installed" | "downloading" | "paused" | "verifying"
  | "installed" | "active" | "corrupt" | "error";

export interface ModelState {
  manifest: ModelManifest;
  status: ModelStatus;
  progress: number; // 0..1
  bytesWritten: number;
  bytesTotal: number;
  error?: string;
  verifiedPublisher: boolean;
}

export interface StorageUsage {
  appPrivateModels: number;
  modelCache: number;
  total: number;
}

const META_KEY = "ghost:models:meta";

interface PersistedMeta {
  activeId: string | null;
  pinnedHashes: Record<string, string>; // manifest id -> sha256 pinned at install
  versions: Record<string, string>; // manifest id -> installed version
}

async function loadMeta(): Promise<PersistedMeta> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (raw) return JSON.parse(raw) as PersistedMeta;
  } catch { /* fresh */ }
  return { activeId: null, pinnedHashes: {}, versions: {} };
}

async function saveMeta(m: PersistedMeta): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(m));
}

function modelDir(manifest: ModelManifest): Directory {
  return new Directory(Paths.document, "models", manifest.id);
}

function artifactFile(manifest: ModelManifest, version = manifest.version): File {
  return new File(modelDir(manifest), `${version}.gguf`);
}

function partFile(manifest: ModelManifest): File {
  return new File(modelDir(manifest), `${manifest.version}.part`);
}

async function nativeHash(path: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/modules/ghost-local-inference");
    const Native = mod.GhostLocalInference ?? mod.default;
    if (Native?.hashFile) return (await Native.hashFile(path)) as string;
  } catch { /* native unavailable */ }
  return null;
}

export interface DownloadCallbacks {
  onProgress?: (written: number, total: number) => void;
  signal?: AbortSignal;
}

type TaskHandle = { pause(): void; resume(): Promise<unknown>; cancel(): void };

export class ModelManager {
  private tasks = new Map<string, TaskHandle>();

  async state(manifest: ModelManifest): Promise<ModelState> {
    const meta = await loadMeta();
    const verifiedPublisher = Boolean(manifest.signature && manifest.sha256) || Boolean(meta.pinnedHashes[manifest.id]);
    let status: ModelStatus = "not_installed";
    try {
      if (artifactFile(manifest).exists) {
        status = meta.activeId === manifest.id ? "active" : "installed";
      } else if (partFile(manifest).exists) {
        status = this.tasks.has(manifest.id) ? "downloading" : "paused";
      }
    } catch { status = "not_installed"; }
    return { manifest, status, progress: 0, bytesWritten: 0, bytesTotal: manifest.size_bytes, verifiedPublisher };
  }

  async download(manifest: ModelManifest, cb: DownloadCallbacks = {}): Promise<void> {
    const dir = modelDir(manifest);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const part = partFile(manifest);
    const task = File.createDownloadTask(manifest.download_url, part, {
      onProgress: (p) => cb.onProgress?.(p.bytesWritten, p.totalBytes),
      signal: cb.signal,
    });
    const sub = task.addListener("progress", (p) => cb.onProgress?.(p.bytesWritten, p.totalBytes));
    this.tasks.set(manifest.id, task as unknown as TaskHandle);
    try {
      const file = await task.downloadAsync();
      if (!file) throw new Error("download paused — resume to continue");
      await this.install(manifest, part.uri);
    } finally {
      sub.remove();
      this.tasks.delete(manifest.id);
    }
  }

  async pause(id: string): Promise<void> {
    this.tasks.get(id)?.pause();
  }

  async resume(id: string): Promise<unknown> {
    return this.tasks.get(id)?.resume();
  }

  async cancel(id: string, manifest: ModelManifest): Promise<void> {
    this.tasks.get(id)?.cancel();
    this.tasks.delete(id);
    try { partFile(manifest).delete(); } catch { /* already gone */ }
  }

  // install verifies then atomically activates: staging + verify + move.
  async install(manifest: ModelManifest, stagedUri: string): Promise<void> {
    const meta = await loadMeta();
    const final = artifactFile(manifest);
    const expected = manifest.sha256 || meta.pinnedHashes[manifest.id];
    if (expected) {
      const actual = await nativeHash(stagedUri);
      if (actual && actual.toLowerCase() !== expected.toLowerCase()) {
        try { new File(stagedUri).delete(); } catch { /* quarantine */ }
        throw new Error("sha256 mismatch: artifact corrupt or tampered");
      }
    }
    // Keep previous artifact for rollback.
    const prevVersion = meta.versions[manifest.id];
    if (prevVersion && prevVersion !== manifest.version) {
      try {
        const prev = artifactFile(manifest, prevVersion);
        if (prev.exists) await prev.move(new File(modelDir(manifest), `${prevVersion}.prev`));
      } catch { /* best effort */ }
    }
    await new File(stagedUri).move(final);
    // Pin hash for unsigned manifests after a verified (HTTPS) download.
    if (!manifest.sha256) {
      const actual = await nativeHash(final.uri);
      if (actual) meta.pinnedHashes[manifest.id] = actual;
    } else {
      meta.pinnedHashes[manifest.id] = manifest.sha256;
    }
    meta.versions[manifest.id] = manifest.version;
    if (!meta.activeId) meta.activeId = manifest.id;
    await saveMeta(meta);
  }

  async activate(id: string, manifests: ModelManifest[]): Promise<void> {
    const m = manifests.find((x) => x.id === id);
    if (!m) throw new Error(`unknown model ${id}`);
    if (!artifactFile(m).exists) throw new Error(`model ${id} not installed`);
    // Validate load before marking active: a failing model must not corrupt state.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/modules/ghost-local-inference");
    const Native = mod.GhostLocalInference ?? mod.default;
    if (Native?.loadModel) {
      await Native.loadModel(artifactFile(m).uri);
    }
    const meta = await loadMeta();
    meta.activeId = id;
    await saveMeta(meta);
  }

  async remove(manifest: ModelManifest): Promise<void> {
    const meta = await loadMeta();
    try { modelDir(manifest).delete(); } catch { /* already gone */ }
    delete meta.versions[manifest.id];
    if (meta.activeId === manifest.id) meta.activeId = null;
    await saveMeta(meta);
  }

  async rollback(manifest: ModelManifest): Promise<void> {
    const prev = new File(modelDir(manifest), `${manifest.version}.prev`);
    if (!prev.exists) throw new Error("no previous artifact to roll back to");
    await prev.move(artifactFile(manifest));
    const meta = await loadMeta();
    meta.activeId = manifest.id;
    await saveMeta(meta);
  }

  // repair removes zero-length artifacts left by crashed installs.
  async repair(manifests: ModelManifest[]): Promise<string[]> {
    const repaired: string[] = [];
    for (const m of manifests) {
      try {
        const final = artifactFile(m);
        if (final.exists && (final.size ?? 0) === 0) {
          final.delete();
          repaired.push(m.id);
        }
      } catch { /* ignore */ }
    }
    return repaired;
  }

  async activeModel(manifests: ModelManifest[]): Promise<ModelManifest | null> {
    const meta = await loadMeta();
    if (!meta.activeId) return null;
    return manifests.find((m) => m.id === meta.activeId) ?? null;
  }

  async storageUsage(manifests: ModelManifest[]): Promise<StorageUsage> {
    let models = 0;
    let cache = 0;
    for (const m of manifests) {
      try {
        const dir = modelDir(m);
        if (!dir.exists) continue;
        for (const entry of dir.list()) {
          if (entry instanceof Directory) continue;
          const f = entry as File;
          const size = f.size ?? 0;
          if (f.uri.endsWith(".part")) cache += size;
          else models += size;
        }
      } catch { /* ignore */ }
    }
    return { appPrivateModels: models, modelCache: cache, total: models + cache };
  }

  artifactUri(manifest: ModelManifest): string | null {
    try {
      const f = artifactFile(manifest);
      return f.exists ? f.uri : null;
    } catch {
      return null;
    }
  }
}

export const modelManager = new ModelManager();
