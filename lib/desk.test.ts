import { afterEach, describe, expect, mock, test } from "bun:test";

const asyncBacking = new Map<string, string>();
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => asyncBacking.get(k) ?? null,
    setItem: async (k: string, v: string) => { asyncBacking.set(k, v); },
    removeItem: async (k: string) => { asyncBacking.delete(k); },
    clear: async () => { asyncBacking.clear(); },
  },
}));

const ghostApi = await import("./ghostApi");
const CFG = { piHost: "ghost.local", piPort: "8766" } as Parameters<typeof ghostApi.fetchDesk>[0];
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("fetchDesk", () => {
  test("returns the normalized projection", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        items: [
          { id: "art:1", kind: "artifact", title: "Trip", summary: "itinerary", source: "artifact",
            created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", render: ["preview"], protected: false },
        ],
      }),
    })) as unknown as typeof fetch;
    const items = await ghostApi.fetchDesk(CFG);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("artifact");
  });

  test("tolerates a malformed body", async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await ghostApi.fetchDesk(CFG)).toEqual([]);
  });

  test("throws on HTTP failure so the UI can be honest", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(ghostApi.fetchDesk(CFG)).rejects.toThrow("HTTP 503");
  });
});

describe("desk labels", () => {
  test("kinds read in owner language", () => {
    expect(ghostApi.deskKindLabel("artifact")).toBe("Made for you");
    expect(ghostApi.deskKindLabel("document")).toBe("File");
    expect(ghostApi.deskKindLabel("tool")).toBe("Tool");
    expect(ghostApi.deskKindLabel("surface")).toBe("Live session");
  });

  test("sizes are human", () => {
    expect(ghostApi.formatDeskSize(0)).toBe("");
    expect(ghostApi.formatDeskSize(512)).toBe("512 B");
    expect(ghostApi.formatDeskSize(2048)).toBe("2 KB");
    expect(ghostApi.formatDeskSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
