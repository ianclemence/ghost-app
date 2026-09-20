import { afterEach, describe, expect, test } from "bun:test";

const ghostApi = await import("./ghostApi");
const { cancelStatusLine, nextCancelState } = await import("./cancel");

const CFG = { piHost: "ghost.local", piPort: "8766" } as Parameters<typeof ghostApi.sendSteering>[0];
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("nextCancelState", () => {
  test("request moves idle to requesting", () => {
    expect(nextCancelState("idle", "request")).toBe("requesting");
  });

  test("a sent request becomes requested, never stopped", () => {
    expect(nextCancelState("requesting", "sent")).toBe("requested");
    const phases = ["idle", "requesting", "requested", "unavailable"] as const;
    for (const p of phases) {
      for (const e of ["request", "sent", "failed", "settled"] as const) {
        expect(nextCancelState(p, e)).not.toBe("stopped");
        expect(nextCancelState(p, e)).not.toBe("cancelled");
      }
    }
  });

  test("a failed request surfaces honestly without claiming success", () => {
    expect(nextCancelState("requesting", "failed")).toBe("unavailable");
  });

  test("terminal backend state always settles the phase", () => {
    expect(nextCancelState("requested", "settled")).toBe("idle");
    expect(nextCancelState("unavailable", "settled")).toBe("idle");
    expect(nextCancelState("requesting", "settled")).toBe("idle");
  });

  test("duplicate requests do not restart the machine", () => {
    expect(nextCancelState("requesting", "request")).toBe("requesting");
    expect(nextCancelState("requested", "request")).toBe("requested");
  });
});

describe("cancelStatusLine", () => {
  test("never renders a stopped state", () => {
    for (const p of ["idle", "requesting", "requested", "unavailable"] as const) {
      const line = cancelStatusLine(p);
      if (line) {
        expect(line.toLowerCase().includes("stopped")).toBe(false);
        expect(line.toLowerCase().includes("cancelled")).toBe(false);
      }
    }
    expect(cancelStatusLine("idle")).toBeNull();
    expect(cancelStatusLine("requested")).toBe("Cancelling…");
  });
});

describe("sendSteering abort", () => {
  test("posts the runtime abort shape", async () => {
    let seenUrl = "";
    let seenBody = "";
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seenUrl = url;
      seenBody = String(init?.body ?? "");
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch;
    const ok = await ghostApi.sendSteering(CFG, { sessionKey: "main", action: "abort" });
    expect(ok).toBe(true);
    expect(seenUrl.includes("/v1/steering")).toBe(true);
    expect(JSON.parse(seenBody)).toEqual({ session_key: "main", content: "", action: "abort" });
  });

  test("unreachable runtime reports failure, not cancellation", async () => {
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    const ok = await ghostApi.sendSteering(CFG, { sessionKey: "main", action: "abort" });
    expect(ok).toBe(false);
  });
});
