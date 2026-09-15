// Bundled fallback catalog. The Pod's /v1/models/catalog is authoritative
// when reachable; this is the floor that lets a first-run user set up Ghost
// on the phone with no server at all. Mirrors the backend seed catalog
// (cmd/ghost/local_ghost_api.go mobileCatalog) — keep the two in step.
import type { ModelManifest } from "./registry";

export const SEED_CATALOG: ModelManifest[] = [
  {
    id: "ghost-mini-1",
    version: "1.0.0",
    manifest_version: 1,
    role: "language",
    capabilities: ["chat", "tool_calling", "structured_output"],
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
  {
    id: "ghost-balanced-1",
    version: "1.0.0",
    manifest_version: 1,
    role: "language",
    capabilities: ["chat", "tool_calling", "structured_output"],
    runtime: "mobile-local",
    format: "gguf",
    quantization: "Q4_K_M",
    size_bytes: 1250 * 1024 * 1024,
    size_estimated: true,
    sha256: "",
    platforms: ["android", "ios"],
    architectures: ["arm64"],
    minimum_ram_mb: 6000,
    recommended_ram_mb: 8000,
    download_url: "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf",
  },
];
