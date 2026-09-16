// Model registry: downloadable capabilities, not bundled code.
// Manifests are fetched from the Pod (/v1/models/catalog) so Ghost can change
// recommendations without shipping a new binary.
export interface ModelManifest {
  id: string;
  version: string;
  manifest_version: number;
  role: string;
  capabilities: string[];
  runtime: string;
  format: string;
  quantization?: string;
  size_bytes: number;
  size_estimated?: boolean;
  sha256: string;
  signature?: string;
  signer?: string;
  platforms: string[];
  architectures: string[];
  min_os?: string;
  minimum_ram_mb?: number;
  recommended_ram_mb?: number;
  download_url: string;
  deprecated?: boolean;
  replacement_id?: string;
}

export const MANIFEST_VERSION = 1;

// Travel-cache policy: Mini only. Balanced (1.7B) doubled QA/storage/support
// for marginal quality that still loses to the Pod. Registry stays generic so
// future models can be re-added deliberately; the catalog layer filters to
// this allowlist. Legacy Balanced artifacts on disk are orphaned (removable,
// never auto-downloaded).
export const SUPPORTED_PHONE_MODEL_IDS: readonly string[] = ["ghost-mini-1"];

export function isSupportedPhoneModel(id: string): boolean {
  return (SUPPORTED_PHONE_MODEL_IDS as readonly string[]).includes(id);
}

export function validateManifest(m: ModelManifest): string | null {
  if (m.manifest_version !== MANIFEST_VERSION) return `unsupported manifest_version ${m.manifest_version}`;
  if (!m.id || !m.version || !m.runtime || !m.format) return "id, version, runtime, format required";
  if (!(m.size_bytes > 0)) return "size_bytes must be positive";
  if (!m.download_url) return "download_url required";
  if (!m.download_url.startsWith("https://")) return "download_url must be https";
  if (m.sha256 && m.sha256.length !== 64) return "sha256 must be empty or 64 hex chars";
  if (!m.platforms || m.platforms.length === 0) return "platforms required";
  return null;
}

export function isVerifiedPublisher(m: ModelManifest): boolean {
  return Boolean(m.signature && m.sha256);
}

export interface Catalog {
  manifest_version: number;
  models: ModelManifest[];
}

export async function fetchCatalog(podBaseUrl: string, headers: Record<string, string>): Promise<Catalog> {
  const res = await fetch(`${podBaseUrl}/v1/models/catalog`, { headers });
  if (!res.ok) throw new Error(`catalog fetch failed (${res.status})`);
  const json = (await res.json()) as Catalog;
  const problems: string[] = [];
  for (const m of json.models ?? []) {
    const err = validateManifest(m);
    if (err) problems.push(`${m.id}: ${err}`);
  }
  if (problems.length > 0) throw new Error(`invalid manifests: ${problems.join("; ")}`);
  return { manifest_version: json.manifest_version, models: json.models ?? [] };
}
