import { afterEach, describe, expect, test } from "bun:test";

const ghostApi = await import("./ghostApi");

const CFG = { piHost: "ghost.local", piPort: "8766" } as Parameters<typeof ghostApi.fetchRoutines>[0];
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchRoutines", () => {
  test("returns the normalized feed", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        routines: [
          {
            id: "routine-1",
            title: "Weekly brief",
            what: "Prepare my weekly brief",
            kind: "routine",
            state: "active",
            schedule: "Weekdays at 9:00 AM",
            run_count: 2,
            source: "routine",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const feed = await ghostApi.fetchRoutines(CFG);
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe("routine");
    expect(feed[0].schedule).toBe("Weekdays at 9:00 AM");
  });

  test("tolerates a malformed body", async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await ghostApi.fetchRoutines(CFG)).toEqual([]);
  });

  test("throws on HTTP failure so the UI can show an honest error", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(ghostApi.fetchRoutines(CFG)).rejects.toThrow("HTTP 503");
  });
});

describe("controlRoutineItem", () => {
  test("routes routine-sourced items to the routine endpoint", async () => {
    let seenUrl = "";
    globalThis.fetch = (async (url: string) => {
      seenUrl = url;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    await ghostApi.controlRoutineItem(CFG, { id: "routine-1", source: "routine" }, "pause");
    expect(seenUrl).toContain("/v1/routines/routine-1/pause");
  });

  test("routes non-routine items to the scheduler endpoint", async () => {
    let seenUrl = "";
    globalThis.fetch = (async (url: string) => {
      seenUrl = url;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    await ghostApi.controlRoutineItem(CFG, { id: "rem-1", source: "user" }, "cancel");
    expect(seenUrl).toContain("/v1/scheduled/rem-1/cancel");
  });

  test("throws on failure", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    await expect(ghostApi.controlRoutineItem(CFG, { id: "x", source: "user" }, "resume")).rejects.toThrow("HTTP 404");
  });
});

describe("labels", () => {
  test("kind labels stay in owner language", () => {
    expect(ghostApi.kindLabel("reminder")).toBe("Reminder");
    expect(ghostApi.kindLabel("routine")).toBe("Recurring");
    expect(ghostApi.kindLabel("automation")).toBe("Scheduled");
    expect(ghostApi.kindLabel("task")).toBe("Task");
  });

  test("state labels never expose internal state words", () => {
    expect(ghostApi.stateLabel("waiting")).toBe("Waiting for you");
    expect(ghostApi.stateLabel("failed")).toBe("Needs attention");
  });
});
