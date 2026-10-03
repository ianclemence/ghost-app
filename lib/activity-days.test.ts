import { describe, expect, test } from "bun:test";
import { activityTone, groupActivityByDay } from "./activity";
import type { ActivityChip } from "./ghostApi";

const chip = (id: string, timestamp: string, state = "done"): ActivityChip =>
  ({ id, event_id: id, seq: 1, title: id, kind: "tool", state, timestamp }) as ActivityChip;

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("groupActivityByDay", () => {
  test("groups by day, newest day and newest item first", () => {
    const days = groupActivityByDay(
      [chip("a", "2026-10-01T08:00:00Z"), chip("b", "2026-10-02T09:00:00Z"), chip("c", "2026-10-02T11:00:00Z")],
      day,
    );
    expect(days.map((d) => d.label)).toEqual(["2026-10-02", "2026-10-01"]);
    expect(days[0].items.map((i) => i.id)).toEqual(["c", "b"]);
  });

  test("an item with no readable time goes under Earlier, last", () => {
    const days = groupActivityByDay([chip("x", "not a time"), chip("y", "2026-10-02T09:00:00Z")], day);
    expect(days[days.length - 1].label).toBe("Earlier");
  });

  test("nothing in, nothing out", () => {
    expect(groupActivityByDay([], day)).toEqual([]);
  });
});

describe("activityTone", () => {
  test("reads outcomes as lights", () => {
    expect(activityTone("failed")).toBe("bad");
    expect(activityTone("Waiting")).toBe("attention");
    expect(activityTone("changed")).toBe("attention");
    expect(activityTone("verified")).toBe("ok");
    expect(activityTone("unchanged")).toBe("quiet");
    expect(activityTone(undefined)).toBe("quiet");
  });
});

import { collapseRepeats, isTechnical } from "./activity";

describe("collapseRepeats", () => {
  test("six identical failures in a row become one entry with a count", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ ...chip(`f${i}`, `2026-10-02T09:0${i}:00Z`, "failed"), title: "Couldn't search your memory" }));
    const out = collapseRepeats(items);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(6);
    expect(out[0].items).toHaveLength(6);
  });

  test("only neighbours merge, and a different outcome breaks the run", () => {
    const a = { ...chip("1", "2026-10-02T09:05:00Z", "failed"), title: "Search" };
    const b = { ...chip("2", "2026-10-02T09:04:00Z", "done"), title: "Search" };
    const c = { ...chip("3", "2026-10-02T09:03:00Z", "failed"), title: "Search" };
    expect(collapseRepeats([a, b, c]).map((e) => e.count)).toEqual([1, 1, 1]);
  });

  test("one title, different steps: each step keeps its own line", () => {
    const step = (id: string, at: string, summary?: string) => ({ ...chip(id, at, "success"), title: "Used the browser", summary });
    const out = collapseRepeats([
      step("1", "2026-10-02T21:47:01Z", "Opened timeanddate.com"),
      step("2", "2026-10-02T21:39:54Z", "Clicked on the page"),
      step("3", "2026-10-02T21:39:51Z"),
      step("4", "2026-10-02T21:39:51Z", "Typed into the page"),
    ]);
    expect(out.map((e) => [e.item.summary, e.count])).toEqual([
      ["Opened timeanddate.com", 1],
      ["Clicked on the page", 1],
      ["Typed into the page", 1],
    ]);
  });

  test("nothing in, nothing out", () => {
    expect(collapseRepeats([])).toEqual([]);
  });
});

describe("isTechnical", () => {
  test("the messages that filled the panel are technical", () => {
    for (const t of [
      "session_search summarize query failed: SQL logic error: no such column: 18 (1)",
      'session_search scroll scan failed: sql: Scan error on column index 0, name "id": converting driver.Value type string',
      "around_message_id is required for scroll mode",
      "dated memory notes hold every context's journal mixed together: use memory_recall to search them instead of reading files directly",
      "0ff76cfe-1155-4346-b67a-4f5482f313d1 not found",
    ]) {
      expect(isTechnical(t)).toBe(true);
    }
  });

  test("a plain sentence for an owner is not", () => {
    for (const t of ["TP 1352 is on time", "Every Monday at 8:00", "Sunny, 24 degrees", "No change", ""]) {
      expect(isTechnical(t)).toBe(false);
    }
    expect(isTechnical(undefined)).toBe(false);
  });
});
