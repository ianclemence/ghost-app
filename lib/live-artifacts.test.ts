import { afterEach, describe, expect, test } from "bun:test";

const ghostApi = await import("./ghostApi");

const CFG = { piHost: "ghost.local", piPort: "8766", deviceID: "d1" } as Parameters<
  typeof ghostApi.fetchLiveSurfaces
>[0];
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return calls;
}

function okResponse(body: unknown = {}) {
  return { ok: true, json: async () => body } as Response;
}

describe("live surface clients", () => {
  test("takeover posts and maps backend truth", async () => {
    const calls = stubFetch(() =>
      okResponse({ ok: true, surface: { id: "s1", state: "user_control", control: "user" } }),
    );
    const r = await ghostApi.requestSurfaceTakeover(CFG, "browser", "s1");
    expect(r.ok).toBe(true);
    expect(r.surface?.state).toBe("user_control");
    expect(calls[0].url.includes("/v1/live/surfaces/browser/s1/takeover")).toBe(true);
    expect(calls[0].init?.method).toBe("POST");
  });

  test("conflict never becomes local control", async () => {
    stubFetch(() => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { message: "another device is already controlling" } }),
    }) as Response);
    const r = await ghostApi.requestSurfaceTakeover(CFG, "browser", "s1");
    expect(r.ok).toBe(false);
    expect(r.surface).toBeUndefined();
    expect(r.error).toContain("another device");
  });

  test("observation maps screenshots without leaking paths", async () => {
    stubFetch(() =>
      okResponse({
        ok: true,
        observation: { title: "Pricing", url: "https://x.com", text: "hi" },
        image_base64: "AAA",
        mime_type: "image/png",
      }),
    );
    const r = await ghostApi.fetchSurfaceObservation(CFG, "computer", "local");
    expect(r?.observation.title).toBe("Pricing");
    expect(r?.imageBase64).toBe("AAA");
    expect(JSON.stringify(r).includes("/tmp/")).toBe(false);
  });

  test("missing surfaces resolve to null, never throw", async () => {
    stubFetch(() => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
    expect(await ghostApi.fetchLiveSurface(CFG, "browser", "nope")).toBeNull();
    expect(await ghostApi.fetchSurfaceObservation(CFG, "browser", "nope")).toBeNull();
  });
});

describe("artifact clients", () => {
  test("list scopes by conversation and tolerates failure", async () => {
    let seenUrl = "";
    globalThis.fetch = (async (url: string) => {
      seenUrl = url;
      return okResponse({ ok: true, artifacts: [{ id: "a1" }] });
    }) as unknown as typeof fetch;
    const items = await ghostApi.fetchArtifacts(CFG, "mobile:default");
    expect(seenUrl.includes("conversation_id=mobile%3Adefault")).toBe(true);
    expect(items.map((a) => a.id)).toEqual(["a1"]);
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await ghostApi.fetchArtifacts(CFG, "mobile:default")).toEqual([]);
  });

  test("detail 404 resolves to null", async () => {
    stubFetch(() => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
    expect(await ghostApi.fetchArtifact(CFG, "nope")).toBeNull();
  });
});
