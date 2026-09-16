import { describe, expect, mock, test } from "bun:test";

const asyncBacking = new Map<string, string>();

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => asyncBacking.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      asyncBacking.set(k, v);
    },
    removeItem: async (k: string) => {
      asyncBacking.delete(k);
    },
  },
}));

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

// pipeline/transport/modelManager pull native modules (expo-constants,
// expo-file-system → react-native) at import time; unit tests run under bun
// without react-native, so stub them. The integration test below drives
// runLocalPipeline with a stubbed transport — native inference never runs.
mock.module("expo-constants", () => ({
  default: {},
}));
mock.module("expo-file-system", () => ({
  Directory: class {
    exists = false;
    constructor(..._args: unknown[]) {}
    create() {}
    delete() {}
    list(): unknown[] { return []; }
  },
  File: class {
    exists = false;
    size = 0;
    uri = "";
    constructor(..._args: unknown[]) {}
    static createDownloadTask() {
      throw new Error("downloads unavailable in unit tests");
    }
    create() {}
    delete() {}
    async text() { return ""; }
    write() {}
    async move() {}
  },
  Paths: { document: "" },
}));

const { evaluate, manifestNeed } = await import("./devcap");
const { plan } = await import("./planner");
const { validateManifest } = await import("./registry");
const { validateOp } = await import("./memsync");
const { SEED_CATALOG } = await import("./seedCatalog");
const { loadCatalog } = await import("./catalog");

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

describe("bundled seed catalog (travel cache: Mini only)", () => {
  test("every seed manifest is valid", () => {
    expect(SEED_CATALOG.length).toBeGreaterThan(0);
    for (const m of SEED_CATALOG) {
      expect(validateManifest(m)).toBeNull();
    }
  });

  test("seed is Mini-only (Balanced retired)", async () => {
    const { SUPPORTED_PHONE_MODEL_IDS } = await import("./registry");
    expect(SEED_CATALOG.map((m) => m.id)).toEqual([...SUPPORTED_PHONE_MODEL_IDS]);
  });

  test("loadCatalog falls back to the seed with no Pod and no cache", async () => {
    asyncBacking.clear();
    const models = await loadCatalog(null);
    expect(models.map((m) => m.id)).toEqual(SEED_CATALOG.map((m) => m.id));
  });

  test("loadCatalog filters stale Balanced entries", async () => {
    asyncBacking.clear();
    const models = await loadCatalog(null, { includeLegacy: false });
    expect(models.some((m) => m.id === "ghost-balanced-1")).toBe(false);
    const full = await loadCatalog(null, { includeLegacy: true });
    expect(full.map((m) => m.id)).toEqual(models.map((m) => m.id));
  });

  test("legacy cache key is migrated away", async () => {
    asyncBacking.clear();
    asyncBacking.set(
      "ghost:models:catalog",
      JSON.stringify([{ ...SEED_CATALOG[0], id: "ghost-balanced-1" }]),
    );
    const models = await loadCatalog(null);
    expect(models.some((m) => m.id === "ghost-balanced-1")).toBe(false);
    asyncBacking.clear();
  });
});

describe("travel-cache collector", () => {
  test("remember intent is deterministic (no model JSON parsing)", async () => {
    const { extractRememberText, PHONE_LOCAL_TOOLS } = await import("./toolsLocal");
    expect(PHONE_LOCAL_TOOLS.map((t) => t.name)).toEqual(["local_memory.write"]);
    expect(extractRememberText("remember my bike is red")).toContain("my bike is red");
    expect(extractRememberText("  Please remember: allergies = peanuts  ")).toContain("peanuts");
    expect(extractRememberText("what is the weather?")).toBeNull();
    expect(extractRememberText("remember")).toBeNull();
  });

  test("routing labels are honest about phone vs Pod", async () => {
    const { routingLabel } = await import("./pipeline");
    expect(routingLabel("phone", false)).toContain("will sync when Pod is back");
    expect(routingLabel("phone", true)).toContain("will sync");
    expect(routingLabel("pod", true)).toContain("home Pod");
  });

  test("metrics record without breaking", async () => {
    const { getLocalMetrics, recordLocalMetric } = await import("./metrics");
    const before = await getLocalMetrics();
    await recordLocalMetric("phone_turns");
    const after = await getLocalMetrics();
    expect(after.phone_turns).toBe(before.phone_turns + 1);
  });

  test("phone runtime advertises chat only (no tool hallucination surface)", async () => {
    const { MobileLocalRuntime } = await import("./localRuntime");
    const rt = new MobileLocalRuntime();
    expect(await rt.capabilities()).toEqual(["chat"]);
    // Non-chat requirements are refused deterministically (before any health
    // check, so this holds even without a native runtime in unit tests).
    const tool = await rt.satisfies("ghost-mini-1", { capabilities: ["tool_calling"] });
    expect(tool.ok).toBe(false);
    expect(tool.reason ?? "").toContain("chat only");
    const vision = await rt.satisfies("ghost-mini-1", { capabilities: ["vision"] });
    expect(vision.ok).toBe(false);
  });

  test("collector recall is deterministic and offline-safe", async () => {
    const { queueRememberFact, recentRememberedFacts } = await import("./toolsLocal");
    await queueRememberFact("my bike is red");
    const facts = await recentRememberedFacts(5);
    expect(facts.some((f) => f.includes("my bike is red"))).toBe(true);
  });

  test("local thread cache round-trips", async () => {
    const { saveLocalThread, loadLocalThread } = await import("./threadCache");
    await saveLocalThread([{ id: "u1", role: "user", content: "hello offline", timestamp: 1 }]);
    const back = await loadLocalThread();
    expect(back.some((m) => m.content === "hello offline")).toBe(true);
  });
});

describe("remember→recall→sync integration (stubbed transport)", () => {
  test("remember turn collects, next turn recalls, no model tool calls", async () => {
    const { runLocalPipeline } = await import("./pipeline");
    const { recentRememberedFacts } = await import("./toolsLocal");
    const { SEED_CATALOG: manifests } = await import("./seedCatalog");
    // Phone-local Mini is active (planner selects phone when Pod is absent).
    asyncBacking.set(
      "ghost:models:meta",
      JSON.stringify({ activeId: "ghost-mini-1", pinnedHashes: {}, versions: { "ghost-mini-1": "1.0.0" } }),
    );

    // Stubbed transport: offline Pod, local inference answers canned text.
    // Captures the exact messages the pipeline feeds the model.
    const seen: { messages: { role: string; content: string }[] }[] = [];
    const transport = {
      podAvailable: false,
      async streamLocal(_manifests: unknown, req: { messages: { role: string; content: string }[] }, h: { onEvent: (e: { kind: string; text?: string }) => void }) {
        seen.push({ messages: req.messages });
        h.onEvent({ kind: "assistant_message", text: "Noted." });
      },
      async streamPod() {
        throw new Error("pod must not be called while offline");
      },
    };

    const base = {
      history: [],
      privacy: "balanced" as const,
      podPreferred: false,
      manifests,
      transport: transport as never,
      podModelKnown: false,
      cloudAllowed: false,
    };

    // Turn 1: deterministic collect (no model JSON involved).
    const turn1: { kind: string; tool?: string; text?: string; data?: unknown }[] = [];
    await runLocalPipeline(
      { ...base, message: "remember integration scooter is blue" },
      { onEvent: (e) => turn1.push(e) },
    );
    expect(turn1.some((e) => e.kind === "tool_status" && e.tool === "local_memory.write")).toBe(true);
    const done1 = turn1.filter((e) => e.kind === "done").pop();
    expect((done1?.data as { target?: string } | undefined)?.target).toBe("phone");

    // Sync attempt is best-effort offline (SQLite unavailable in unit tests);
    // the fact must still be recallable from the session cache.
    const facts = await recentRememberedFacts(5);
    expect(facts.some((f) => f.includes("integration scooter is blue"))).toBe(true);

    // Turn 2: recall injects the notebook as a system note (no tool call).
    seen.length = 0;
    const turn2: { kind: string; text?: string }[] = [];
    await runLocalPipeline(
      { ...base, message: "what did I save about the scooter?" },
      { onEvent: (e) => turn2.push(e) },
    );
    expect(seen.length).toBe(1);
    const sys = seen[0].messages.find((m) => m.role === "system");
    expect(sys?.content).toContain("integration scooter is blue");
    // No model-invoked tool execution on the answer path either.
    expect(turn2.some((e) => e.kind === "tool_status")).toBe(false);
    asyncBacking.delete("ghost:models:meta");
  });

  test("restart recovery: thread cache requeues ops lost to kill-before-sync", async () => {
    const { requeueFromThread, recentRememberedFacts, resetMemoryCacheForTests } = await import("./toolsLocal");
    const { saveLocalThread } = await import("./threadCache");
    // Persist a thread containing a remember the session cache never saw.
    await saveLocalThread([
      { id: "u9", role: "user", content: "remember restart-probe gamma", timestamp: 9 },
      { id: "a9", role: "assistant", content: "Noted.", timestamp: 10 },
    ]);
    resetMemoryCacheForTests(); // simulate process restart: session memory gone
    expect(await recentRememberedFacts(20)).not.toContain("restart-probe gamma");
    const requeued = await requeueFromThread();
    expect(requeued).toBe(1);
    expect((await recentRememberedFacts(20)).some((f) => f.includes("restart-probe gamma"))).toBe(true);
    // Idempotent: a second pass requeues nothing.
    expect(await requeueFromThread()).toBe(0);
  });
});
