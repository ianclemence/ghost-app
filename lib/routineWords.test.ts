import { describe, expect, test } from "bun:test";
import { isLive, routineDetail } from "./routineWords";

describe("routine words", () => {
  test("the instruction is shown only when it adds something", () => {
    expect(routineDetail("Call Jas", "Call Jas")).toBeNull();
    expect(routineDetail("Stretch.", "stretch.")).toBeNull();
    expect(routineDetail("Chelsea vs Bournemouth is tomorrow — Saturday 10 October, 15:00 UK / 21:00 Ban…", "Chelsea vs Bournemouth is tomorrow — Saturday 10 October, 15:00 UK / 21:00 Bangkok.")).toBeNull();
    expect(routineDetail("Weekly brief", "Give me a short brief of my week and the weather")).toBe("Give me a short brief of my week and the weather");
    expect(routineDetail("x", undefined)).toBeNull();
  });
  test("what is still running", () => {
    expect(isLive({ state: "paused" })).toBe(true);
    expect(isLive({ state: "done" })).toBe(false);
    expect(isLive({ state: "cancelled" })).toBe(false);
  });
});
