import { describe, expect, test } from "bun:test";
import { tripRange, tripSteps } from "./trips";

describe("a trip on the phone", () => {
  test("dates in a few words", () => {
    expect(tripRange({ start: "2026-10-16", end: "2026-10-20" })).toBe("16 to 20 Oct");
    expect(tripRange({ start: "2026-10-28", end: "2026-11-03" })).toBe("28 Oct to 3 Nov");
    expect(tripRange({ start: "2026-10-16", end: "2026-10-16" })).toBe("16 Oct");
  });
  test("legs become steps lit by the clock", () => {
    const legs = [
      { kind: "flight", title: "To Lamu", ref: "JM101", from: "NBO", to: "LAU", start: "2026-10-16T09:40", end: "2026-10-16T11:05", leave_by: "2026-10-16T06:55" },
      { kind: "hotel", title: "Peponi", start: "2026-10-16T14:00", end: "2026-10-20T10:00" },
      { kind: "flight", title: "Home", ref: "JM102", start: "2026-10-20T12:00" },
    ];
    const before = tripSteps({ legs }, new Date(2026, 9, 15, 20, 0));
    expect(before.map((s) => s.state)).toEqual(["next", null, null]);
    expect(before[0].detail).toBe("JM101 · NBO → LAU · leave by 06:55");
    expect(before[0].time).toBe("Fri 09:40");
    expect(before[1].detail).toBe("until Tue 10:00");
    const during = tripSteps({ legs }, new Date(2026, 9, 17, 9, 0));
    expect(during.map((s) => s.state)).toEqual(["done", "now", null]);
    expect(during[0].detail).toBe("JM101 · NBO → LAU");
  });
});
