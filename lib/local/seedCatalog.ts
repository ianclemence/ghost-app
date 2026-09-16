// Bundled fallback catalog. The Pod's /v1/models/catalog is authoritative
// when reachable; this is the floor that lets a first-run user set up Ghost
// on the phone with no server at all. Mirrors the backend seed catalog
// (cmd/ghost/local_ghost_api.go mobileCatalog) — keep the two in step.
//
// Travel-cache policy: Mini only. ghost-balanced-1 was retired: it doubled
// QA/storage/support for marginal quality that still loses to the Pod.
// Clients filter stale Balanced entries; on-disk Balanced artifacts are
// orphaned and removable via cleanupLegacyModels(), never auto-downloaded.
import type { ModelManifest } from "./registry";

export const SEED_CATALOG: ModelManifest[] = [
  {
    id: "ghost-mini-1",
    version: "1.0.0",
    manifest_version: 1,
    role: "language",
    capabilities: ["chat"],
    runtime: "mobile-local",
    format: "gguf",
    quantization: "Q4_K_M",
    size_bytes: 650 * 1024 * 1024,
    size_estimated: true,
    sha256: "",
    platforms: ["android", "ios"],
    architectures: ["arm64"],
    minimum_ram_mb: 4000,
    recommended_ram_mb: 6000,
    download_url: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf",
  },
];
