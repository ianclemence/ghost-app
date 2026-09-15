// Pod cooperation client: protocol version, capability advertisement,
// model catalog, device evaluation, memory-sync push/pull, local doctor.
// Reuses ghostApi baseURL/authHeaders so pairing/auth behavior is unchanged.
import { authHeaders, baseURL, type GhostConfig } from "./ghostApi";
import type { Catalog } from "./local/registry";
import { pullOps, pushOps, pendingOps, getCursor } from "./local/memsync";

export interface PodProtocol {
  proto_version: number;
  min_supported: number;
  execution_targets: string[];
  privacy_modes: string[];
}

export async function fetchPodProtocol(cfg: GhostConfig): Promise<PodProtocol> {
  const res = await fetch(`${baseURL(cfg)}/v1/protocol`, { headers: authHeaders(cfg) });
  if (!res.ok) throw new Error(`protocol fetch failed (${res.status})`);
  return (await res.json()) as PodProtocol;
}

export interface PodCapabilities {
  device_id: string;
  proto_version: number;
  tools: { name: string; executors: string[]; sensitive?: boolean }[];
  pod_hardware_only: string[];
  execution_targets: string[];
}

export async function fetchPodCapabilities(cfg: GhostConfig): Promise<PodCapabilities> {
  const res = await fetch(`${baseURL(cfg)}/v1/capabilities`, { headers: authHeaders(cfg) });
  if (!res.ok) throw new Error(`capabilities fetch failed (${res.status})`);
  return (await res.json()) as PodCapabilities;
}

export async function fetchModelCatalog(cfg: GhostConfig): Promise<Catalog> {
  const { fetchCatalog } = await import("./local/registry");
  return fetchCatalog(baseURL(cfg), authHeaders(cfg));
}

export interface DeviceVerdict {
  model_id: string;
  verdict: string;
  reason?: string;
}

export async function evaluateDevice(cfg: GhostConfig, device: Record<string, unknown>): Promise<DeviceVerdict[]> {
  const res = await fetch(`${baseURL(cfg)}/v1/devices/capabilities`, {
    method: "POST",
    headers: { ...authHeaders(cfg), "Content-Type": "application/json" },
    body: JSON.stringify({ device }),
  });
  if (!res.ok) throw new Error(`device evaluation failed (${res.status})`);
  const json = (await res.json()) as { results: DeviceVerdict[] };
  return json.results ?? [];
}

// syncNow pushes local shared ops then pulls Pod ops. Returns counts.
export async function syncNow(cfg: GhostConfig): Promise<{ pushed: number; pulled: number }> {
  const base = baseURL(cfg);
  const headers = authHeaders(cfg);
  const cursor = await getCursor();
  const pending = await pendingOps(cursor);
  const pushed = await pushOps(base, headers, pending).catch(() => 0);
  const pulled = await pullOps(base, headers).catch(() => 0);
  return { pushed, pulled };
}

export interface LocalDoctorCheck {
  name: string;
  status: string;
  message?: string;
}

export async function fetchLocalDoctor(cfg: GhostConfig): Promise<LocalDoctorCheck[]> {
  const res = await fetch(`${baseURL(cfg)}/v1/doctor/local`, { headers: authHeaders(cfg) });
  if (!res.ok) throw new Error(`local doctor failed (${res.status})`);
  const json = (await res.json()) as { checks: LocalDoctorCheck[] };
  return json.checks ?? [];
}
