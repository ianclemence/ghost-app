// Device-capability model: what this phone can realistically run.
// Compatibility is decided by the runtime/model combination, never by a
// naive RAM threshold. Mirrors pkg/devcap verdicts.
import * as Device from "expo-device";

export interface DeviceInfo {
  platform: "android" | "ios" | string;
  osVersion: string;
  arch: string;
  totalRamMb: number;
  freeDiskMb: number;
  accelerator: string;
  runtime: string;
  runtimeVersion?: string;
  thermalState?: string;
  lowMemory?: boolean;
}

export type Verdict = "compatible" | "compatible_not_recommended" | "incompatible" | "temporarily_unavailable";

export interface ModelNeed {
  modelId: string;
  runtime: string;
  platforms: string[];
  archs: string[];
  minRamMb: number;
  recRamMb: number;
  sizeMb: number;
  minOs?: string;
}

export async function inspectDevice(): Promise<DeviceInfo> {
  const platform = (Device.osName ?? "android").toLowerCase().includes("ios") ? "ios" : "android";
  let freeDiskMb = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const legacy = require("expo-file-system/legacy") as { getFreeDiskStorageAsync?: () => Promise<number> };
    if (legacy.getFreeDiskStorageAsync) {
      freeDiskMb = Math.floor((await legacy.getFreeDiskStorageAsync()) / (1024 * 1024));
    }
  } catch { /* storage estimate best-effort */ }
  return {
    platform,
    osVersion: String(Device.osVersion ?? ""),
    arch: "arm64", // all supported phones are arm64; refined by native module where observable
    totalRamMb: Math.floor((Device.totalMemory ?? 0) / (1024 * 1024)),
    freeDiskMb,
    accelerator: platform === "ios" ? "metal" : "nnapi",
    runtime: "mobile-local",
  };
}

export function evaluate(device: DeviceInfo, need: ModelNeed): { verdict: Verdict; reason?: string } {
  const has = (list: string[], v: string) => list.some((s) => s.toLowerCase() === v.toLowerCase());
  if (!has(need.platforms, device.platform)) return { verdict: "incompatible", reason: "platform not supported by model artifact" };
  if (need.archs.length > 0 && !has(need.archs, device.arch)) return { verdict: "incompatible", reason: "architecture not supported" };
  if (need.runtime && device.runtime && need.runtime.toLowerCase() !== device.runtime.toLowerCase()) {
    return { verdict: "incompatible", reason: "runtime mismatch" };
  }
  if (device.totalRamMb > 0 && need.minRamMb > 0 && device.totalRamMb < need.minRamMb) {
    return { verdict: "incompatible", reason: "insufficient RAM" };
  }
  if (device.freeDiskMb > 0 && need.sizeMb > 0 && device.freeDiskMb < need.sizeMb + 512) {
    return { verdict: "incompatible", reason: "insufficient storage" };
  }
  if (device.lowMemory) return { verdict: "temporarily_unavailable", reason: "device under memory pressure" };
  if (device.thermalState === "serious" || device.thermalState === "critical") {
    return { verdict: "temporarily_unavailable", reason: "thermal throttling" };
  }
  if (device.totalRamMb > 0 && need.recRamMb > 0 && device.totalRamMb < need.recRamMb) {
    return { verdict: "compatible_not_recommended", reason: "below recommended RAM; expect slow inference" };
  }
  return { verdict: "compatible" };
}

export function manifestNeed(m: {
  id: string; runtime: string; platforms: string[]; architectures: string[];
  minimum_ram_mb?: number; recommended_ram_mb?: number; size_bytes: number; min_os?: string;
}): ModelNeed {
  return {
    modelId: m.id, runtime: m.runtime, platforms: m.platforms, archs: m.architectures,
    minRamMb: m.minimum_ram_mb ?? 0, recRamMb: m.recommended_ram_mb ?? 0,
    sizeMb: Math.ceil(m.size_bytes / (1024 * 1024)), minOs: m.min_os,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}
