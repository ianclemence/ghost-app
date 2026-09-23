import { afterEach, describe, expect, test } from "bun:test";

const ghostApi = await import("./ghostApi");

const CFG = { piHost: "ghost.local", piPort: "8766" } as Parameters<typeof ghostApi.fetchIdeas>[0];
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchIdeas", () => {
  test("returns pending ideas with sources", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        ideas: [
          {
            id: "idea-1",
            title: "Pause Water?",
            body: "It failed twice.",
            sources: [{ kind: "routine", ref: "run-9", excerpt: "status=error" }],
            status: "pending",
            created_at: "2026-09-23T00:00:00Z",
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const ideas = await ghostApi.fetchIdeas(CFG);
    expect(ideas).toHaveLength(1);
    expect(ideas[0].sources).toHaveLength(1);
  });

  test("tolerates a malformed body", async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await ghostApi.fetchIdeas(CFG)).toEqual([]);
  });

  test("throws on HTTP failure so the UI can show an honest error", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(ghostApi.fetchIdeas(CFG)).rejects.toThrow("HTTP 503");
  });
});

describe("decideIdea", () => {
  test("posts to the accept endpoint", async () => {
    let seenUrl = "";
    globalThis.fetch = (async (url: string) => {
      seenUrl = url;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    await ghostApi.decideIdea(CFG, "idea-1", "accept");
    expect(seenUrl).toContain("/v1/ideas/idea-1/accept");
  });

  test("posts to the dismiss endpoint", async () => {
    let seenUrl = "";
    globalThis.fetch = (async (url: string) => {
      seenUrl = url;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    await ghostApi.decideIdea(CFG, "idea-1", "dismiss");
    expect(seenUrl).toContain("/v1/ideas/idea-1/dismiss");
  });
});
