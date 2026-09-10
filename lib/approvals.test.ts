import { afterEach, describe, expect, test } from "bun:test";

const ghostApi = await import("./ghostApi");

const CFG = { piHost: "ghost.local", piPort: "8766" } as Parameters<typeof ghostApi.resolveApproval>[0];

const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

function okResponse(body: unknown = {}) {
  return { ok: true, json: async () => body } as Response;
}

function failResponse(body: unknown = {}) {
  return { ok: false, status: 400, json: async () => body } as Response;
}

describe("isValidGrant", () => {
  test("accepts only backend-known grants", () => {
    expect(ghostApi.isValidGrant("allow_once")).toBe(true);
    expect(ghostApi.isValidGrant("allow_always")).toBe(true);
    expect(ghostApi.isValidGrant("deny")).toBe(true);
    expect(ghostApi.isValidGrant("allow")).toBe(false);
    expect(ghostApi.isValidGrant("")).toBe(false);
    expect(ghostApi.isValidGrant("ALLOW_ONCE")).toBe(false);
  });
});

describe("resolveApproval", () => {
  test("posts the backend resolve shape", async () => {
    const calls = stubFetch(() => okResponse({ ok: true, request: {} }));
    const r = await ghostApi.resolveApproval(CFG, "req-1", "allow_once");
    expect(r).toEqual({ ok: true });
    expect(calls.length).toBe(1);
    expect(calls[0].url.includes("/v1/permissions/resolve")).toBe(true);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ id: "req-1", grant: "allow_once" });
  });

  test("backend failure remains a failure", async () => {
    stubFetch(() => failResponse({ error: { message: "that approval is no longer answerable" } }));
    const r = await ghostApi.resolveApproval(CFG, "req-1", "deny");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("that approval is no longer answerable");
  });

  test("unknown actions never reach the network", async () => {
    const calls = stubFetch(() => okResponse({}));
    const r = await ghostApi.resolveApproval(CFG, "req-1", "maybe" as never);
    expect(r.ok).toBe(false);
    expect(calls.length).toBe(0);
  });
});
