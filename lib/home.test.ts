import { describe, expect, test } from "bun:test";
import { deriveHomeSummary } from "./home";
import type { Thing } from "./ghostApi";

function thing(over: Partial<Thing>): Thing {
  return {
    id: "t1",
    title: "Weekly brief",
    what: "prepare my brief",
    kind: "routine",
    state: "active",
    schedule: "Every Monday at 9:00 AM",
    run_count: 0,
    source: "routine",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("deriveHomeSummary", () => {
  test("empty feed says nothing rather than inventing content", () => {
    expect(deriveHomeSummary([])).toEqual({ headline: null, needsYou: false });
  });

  test("waiting beats active — the owner sees the thing that needs them", () => {
    const got = deriveHomeSummary([
      thing({ id: "a", title: "Daily sync", state: "active" }),
      thing({ id: "b", title: "Send invoice", state: "waiting" }),
    ]);
    expect(got.needsYou).toBe(true);
    expect(got.headline).toContain("Send invoice");
  });

  test("single active thing reads naturally", () => {
    const got = deriveHomeSummary([thing({ title: "Weekly brief", kind: "routine" })]);
    expect(got.headline).toBe("I keep doing \u201cWeekly brief\u201d.");
    expect(got.needsYou).toBe(false);
  });

  test("multiple active things summarize the count", () => {
    const got = deriveHomeSummary([
      thing({ id: "a", title: "Brief", kind: "automation" }),
      thing({ id: "b", title: "Sync" }),
      thing({ id: "c", title: "Remind", kind: "reminder" }),
    ]);
    expect(got.headline).toBe("I handle \u201cBrief\u201d and 2 more.");
  });

  test("only finished things yields no headline", () => {
    const got = deriveHomeSummary([thing({ state: "done" }), thing({ id: "x", state: "cancelled" })]);
    expect(got).toEqual({ headline: null, needsYou: false });
  });

  test("unknown kind still produces a sentence", () => {
    const got = deriveHomeSummary([thing({ kind: "mystery" as never })]);
    expect(got.headline).toContain("Weekly brief");
  });
});
