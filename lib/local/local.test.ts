import { describe, expect, mock, test } from "bun:test";

mock.module("expo-device", () => ({
  osName: "Android",
  osVersion: "15",
  totalMemory: 8 * 1024 * 1024 * 1024,
}));

mock.module("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    throw new Error("sqlite unavailable in unit tests");
  },
}));

const { evaluate, manifestNeed } = await import("./devcap");
const { plan } = await import("./planner");
const { validateManifest } = await import("./registry");
const { validateOp } = await import("./memsync");

describe("devcap verdicts", () => {
  const device = { platform: "android", osVersion: "15", arch: "arm64", totalRamMb: 8192, freeDiskMb: 14000, accelerator: "nnapi", runtime: "mobile-local" };
  const need = manifestNeed({ id: "ghost-mini-1", runtime: "mobile-local", platforms: ["android"], architectures: ["arm64"], minimum_ram_mb: 4000, recommended_ram_mb: 6000, size_bytes: 650 * 1024 * 1024 });
  test("compatible device", () => {
    expect(evaluate(device, need).verdict).toBe("compatible");
  });
  test("below recommended RAM", () => {
    expect(evaluate({ ...device, totalRamMb: 5000 }, need).verdict).toBe("compatible_not_recommended");
  });
  test("below minimum RAM incompatible", () => {
    expect(evaluate({ ...device, totalRamMb: 2048 }, need).verdict).toBe("incompatible");
  });
  test("thermal throttling is temporary", () => {
    expect(evaluate({ ...device, thermalState: "critical" }, need).verdict).toBe("temporarily_unavailable");
  });
  test("wrong platform incompatible", () => {
    expect(evaluate({ ...device, platform: "ios" }, need).verdict).toBe("incompatible");
  });
});

describe("planner", () => {
  test("local-only never selects cloud", () => {
    const d = plan({ effort: "deep", privacy: "local_only", avail: { phone: true, pod: true, cloud: true, phoneModel: true, podModel: true, cloudModel: true } });
    expect(d.target).not.toBe("cloud");
  });
  test("quick prefers phone", () => {
    const d = plan({ effort: "quick", privacy: "balanced", avail: { phone: true, pod: true, cloud: false, phoneModel: true, podModel: true, cloudModel: false } });
    expect(d.target).toBe("phone");
  });
  test("hardware routes to pod", () => {
    const d = plan({ effort: "normal", privacy: "balanced", avail: { phone: true, pod: true, cloud: false, phoneModel: true, podModel: true, cloudModel: false, needsHardware: true } });
    expect(d.target).toBe("pod");
  });
});

describe("registry validation", () => {
  const m = { id: "ghost-mini-1", version: "1.0.0", manifest_version: 1, role: "language", capabilities: ["chat"], runtime: "mobile-local", format: "gguf", size_bytes: 100, sha256: "", platforms: ["android"], architectures: ["arm64"], download_url: "https://models.example.com/x.gguf" };
  test("unsigned manifest validates (pinned on install)", () => {
    expect(validateManifest(m)).toBeNull();
  });
  test("http download rejected", () => {
    expect(validateManifest({ ...m, download_url: "http://x" })).not.toBeNull();
  });
});

describe("sync op validation", () => {
  test("rejects identity-less ops", () => {
    expect(validateOp({ op_id: "", origin_device: "a", entity_id: "e", entity_kind: "fact", entity_version: 1, scope: "shared_durable", type: "upsert", origin_clock: 1 })).not.toBeNull();
  });
  test("accepts well-formed ops", () => {
    expect(validateOp({ op_id: "a", origin_device: "a", entity_id: "e", entity_kind: "fact", entity_version: 1, scope: "shared_durable", type: "upsert", origin_clock: 1 })).toBeNull();
  });
});
