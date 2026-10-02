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
