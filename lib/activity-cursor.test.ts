import { afterEach, describe, expect, test } from "bun:test";

const ghostApi = await import("./ghostApi");
const { activityQuery, maxActivitySeq, mergeActivityChips } = await import("./activity");

const CFG = { piHost: "ghost.local", piPort: "8766" } as Parameters<typeof ghostApi.fetchActivity>[0];
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function chip(seq: number, id: string) {
  return { id, event_id: `e${seq}`, seq, title: `t${seq}`, kind: "k", state: "success", timestamp: "" };
}

describe("maxActivitySeq", () => {
  test("tracks the high-water mark", () => {
    expect(maxActivitySeq([])).toBe(0);
    expect(maxActivitySeq([chip(3, "a"), chip(9, "b"), chip(5, "c")])).toBe(9);
  });
});

describe("mergeActivityChips", () => {
  test("suppresses duplicates and keeps newest first", () => {
    const prev = [chip(5, "a"), chip(4, "b")];
    const fresh = [chip(6, "c"), chip(5, "a")];
    const merged = mergeActivityChips(prev, fresh);
    expect(merged.map((c) => c.seq)).toEqual([6, 5, 4]);
  });

  test("cursor never moves backward on empty pages", () => {
    const prev = [chip(5, "a")];
    expect(mergeActivityChips(prev, [])).toEqual(prev);
    expect(Math.max(5, maxActivitySeq([]))).toBe(5);
  });
});

describe("activityQuery", () => {
  test("omits since_seq until a cursor exists", () => {
    expect(activityQuery(50)).toBe("limit=50");
    expect(activityQuery(50, 0)).toBe("limit=50");
    expect(activityQuery(50, 42)).toBe("limit=50&since_seq=42");
    expect(activityQuery(50, 42, "mobile%3Adefault")).toContain("conversation_id=mobile");
  });
});

describe("fetchActivity", () => {
  test("sends the cursor to the backend", async () => {
    let seenUrl = "";
    globalThis.fetch = (async (url: string) => {
      seenUrl = url;
      return { ok: true, json: async () => ({ activity: [] }) } as Response;
    }) as typeof fetch;
    await ghostApi.fetchActivity(CFG, { limit: 50, sinceSeq: 42 });
    expect(seenUrl.includes("/v1/activity?")).toBe(true);
    expect(seenUrl.includes("since_seq=42")).toBe(true);
  });
});
