import { afterEach, describe, expect, test } from "bun:test";

const ghostApi = await import("./ghostApi");

const CFG = { piHost: "ghost.local", piPort: "8766" } as Parameters<typeof ghostApi.fetchModelState>[0];
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchModelState", () => {
  test("maps presets with the availability gate", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        active: "ollama:qwen3:8b",
        provider: "ollama",
        presets: [
          { name: "Local", provider: "ollama", model: "qwen3:8b", available: true },
          { name: "Thinking", provider: "anthropic", model: "claude-opus-4-6", available: false, unavailable_reason: "no API key for provider anthropic" },
        ],
      }),
    })) as unknown as typeof fetch;
    const state = await ghostApi.fetchModelState(CFG);
    expect(state.active).toBe("ollama:qwen3:8b");
    expect(state.presets).toHaveLength(2);
    expect(state.presets[1].available).toBe(false);
    expect(state.presets[1].unavailable_reason).toContain("anthropic");
  });

  test("tolerates missing preset lists", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const state = await ghostApi.fetchModelState(CFG);
    expect(state.active).toBe("");
    expect(state.presets).toEqual([]);
  });

  test("throws on HTTP failure", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(ghostApi.fetchModelState(CFG)).rejects.toThrow("HTTP 503");
  });
});

describe("switchModel", () => {
  test("posts the model spec and returns the new active model", async () => {
    let seenUrl = "";
    let seenBody = "";
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seenUrl = url;
      seenBody = String(init?.body ?? "");
      return { ok: true, json: async () => ({ ok: true, active: "anthropic:claude-opus-4-6" }) } as Response;
    }) as unknown as typeof fetch;
    const active = await ghostApi.switchModel(CFG, "Thinking");
    expect(seenUrl.endsWith("/v1/model")).toBe(true);
    expect(JSON.parse(seenBody)).toEqual({ model: "Thinking" });
    expect(active).toBe("anthropic:claude-opus-4-6");
  });

  test("throws on switch failure", async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 400,
      text: async () => "unknown preset",
    })) as unknown as typeof fetch;
    await expect(ghostApi.switchModel(CFG, "Nope")).rejects.toThrow("unknown preset");
  });
});

describe("fetchProviders", () => {
  test("maps the provider directory", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        provider: "ollama",
        model: "qwen3:8b",
        providers: {
          ollama: { configured: true, models: ["qwen3:8b"], local: true },
          openai: { configured: false, models: ["gpt-5"], local: false },
        },
      }),
    })) as unknown as typeof fetch;
    const state = await ghostApi.fetchProviders(CFG);
    expect(state.provider).toBe("ollama");
    expect(state.providers.ollama.configured).toBe(true);
    expect(state.providers.ollama.local).toBe(true);
    expect(state.providers.openai.models).toEqual(["gpt-5"]);
  });
});

describe("testProviderConnection", () => {
  test("posts provider plus candidate key", async () => {
    let seenBody = "";
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seenBody = String(init?.body ?? "");
      return { ok: true, json: async () => ({ ok: true, message: "Connected successfully" }) } as Response;
    }) as unknown as typeof fetch;
    const res = await ghostApi.testProviderConnection(CFG, "openai", "sk-test");
    expect(JSON.parse(seenBody)).toEqual({ provider: "openai", api_key: "sk-test" });
    expect(res).toEqual({ ok: true, message: "Connected successfully" });
  });

  test("omits a blank key so the saved key is used", async () => {
    let seenBody = "";
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seenBody = String(init?.body ?? "");
      return { ok: true, json: async () => ({ ok: false, message: "Connection failed" }) } as Response;
    }) as unknown as typeof fetch;
    const res = await ghostApi.testProviderConnection(CFG, "openai", "  ");
    expect(JSON.parse(seenBody)).toEqual({ provider: "openai" });
    expect(res.ok).toBe(false);
  });
});

describe("intelligence config", () => {
  test("fetch maps routing and masked credentials", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        provider: "openai",
        model: "gpt-5",
        ollama_url: "http://localhost:11434",
        routing: { prefer_local: true, allow_cloud: true, cloud_when_local_fails: true },
        providers: { openai: { has_key: true, key_masked: "••••1234", api_base: "" } },
      }),
    })) as unknown as typeof fetch;
    const config = await ghostApi.fetchIntelligenceConfig(CFG);
    expect(config.routing.prefer_local).toBe(true);
    expect(config.providers.openai.has_key).toBe(true);
    expect(config.providers.openai.key_masked).toBe("••••1234");
  });

  test("save posts the patch", async () => {
    let seenBody = "";
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seenBody = String(init?.body ?? "");
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }) as unknown as typeof fetch;
    await ghostApi.saveIntelligenceConfig(CFG, {
      api_keys: { openai: "sk-new" },
      routing: { prefer_local: false, allow_cloud: true, cloud_when_local_fails: true },
    });
    expect(JSON.parse(seenBody)).toEqual({
      api_keys: { openai: "sk-new" },
      routing: { prefer_local: false, allow_cloud: true, cloud_when_local_fails: true },
    });
  });
});

describe("ollama", () => {
  test("fetch lists installed models and pull posts the name", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seen.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/v1/ollama/models")) {
        return { ok: true, json: async () => ({ ok: true, models: ["qwen3:8b"] }) } as Response;
      }
      return { ok: true, json: async () => ({ ok: true, message: "Download started" }) } as Response;
    }) as unknown as typeof fetch;
    await expect(ghostApi.fetchOllamaModels(CFG)).resolves.toEqual(["qwen3:8b"]);
    await ghostApi.pullOllamaModel(CFG, "qwen3:8b");
    expect(seen.some((s) => s.startsWith("POST") && s.endsWith("/v1/ollama/pull"))).toBe(true);
  });
});
