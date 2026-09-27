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

// A finished turn, deliberately body-less so sendMessage takes its fallback
// reader: the [DONE] marker is what tells it the turn completed and the
// reply is in.
function chatTurn() {
  return { ok: true, body: undefined, text: async () => "data: [DONE]\n" } as unknown as Response;
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

// An approval that clears a card without running anything is not an approval.
// These pin how the phone answers: as a turn, in the session the ask was
// raised in, through the runtime's own governed resume path — and that a card
// which outlived its request can never drop a grant phrase into ordinary chat.
describe("resolveApproval", () => {
  const pendingList = (requests: unknown[]) => (url: string) =>
    String(url).includes("/v1/permissions/requests")
      ? okResponse({ ok: true, requests })
      : chatTurn();
  const ASK = { id: "req-1", request_id: "turn-9", session_key: "main" };
  const chatBody = (calls: { url: string; init?: RequestInit }[]) => {
    const chat = calls.find((c) => String(c.url).includes("/v1/chat"));
    expect(chat).toBeTruthy();
    return JSON.parse(String(chat!.init?.body));
  };

  test("answers as a turn, and never touches the dead resolve endpoint", async () => {
    const calls = stubFetch(pendingList([ASK]));
    const r = await ghostApi.resolveApproval(CFG, "req-1", "allow_once");
    expect(r).toEqual({ ok: true });
    expect(calls.some((c) => String(c.url).includes("/v1/permissions/resolve"))).toBe(false);
    expect(chatBody(calls).content).toBe("allow once");
    expect(chatBody(calls).session_key).toBe("main");
  });

  test("answers in the session the ask was raised in", async () => {
    const calls = stubFetch(pendingList([{ ...ASK, session_key: "automation:abc" }]));
    const r = await ghostApi.resolveApproval(CFG, "req-1", "deny");
    expect(r).toEqual({ ok: true });
    expect(chatBody(calls).content).toBe("deny");
    expect(chatBody(calls).session_key).toBe("automation:abc");
  });

  test("finds the ask by either id the cards hold", async () => {
    const calls = stubFetch(pendingList([ASK]));
    const r = await ghostApi.resolveApproval(CFG, "turn-9", "allow_always");
    expect(r).toEqual({ ok: true });
    expect(chatBody(calls).content).toBe("always allow");
  });

  test("a card that outlived its request never reaches the chat", async () => {
    const calls = stubFetch(pendingList([]));
    const r = await ghostApi.resolveApproval(CFG, "req-1", "allow_once");
    expect(r).toEqual({ ok: false, error: "That approval is no longer answerable." });
    expect(calls.some((c) => String(c.url).includes("/v1/chat"))).toBe(false);
  });

  test("a turn that fails is reported, not swallowed", async () => {
    stubFetch((url) =>
      String(url).includes("/v1/permissions/requests")
        ? okResponse({ ok: true, requests: [ASK] })
        : ({ ok: false, status: 503, text: async () => "unavailable", json: async () => ({}) } as unknown as Response),
    );
    const r = await ghostApi.resolveApproval(CFG, "req-1", "deny");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  test("unknown actions never reach the network", async () => {
    const calls = stubFetch(() => okResponse({}));
    const r = await ghostApi.resolveApproval(CFG, "req-1", "maybe" as never);
    expect(r.ok).toBe(false);
    expect(calls.length).toBe(0);
  });
});
