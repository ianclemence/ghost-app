import { describe, expect, test } from "bun:test";
import { cell, change, isDashboardArtifact, shares, tileNumber } from "./dashboards";

describe("dashboards", () => {
  test("knows a dashboard", () => {
    expect(isDashboardArtifact({ kind: "file", state: "available", path: "dashboards/shop.json" })).toBe(true);
    expect(isDashboardArtifact({ kind: "file", state: "available", path: "motion/shop-v1.json" })).toBe(false);
  });
  test("numbers read plainly", () => {
    expect(tileNumber(1240500, "KES")).toBe("KES 1,240,500");
    expect(tileNumber(1240500, "KES", true)).toBe("KES 1.2M");
    expect(tileNumber(12.345, "%")).toBe("12.3%");
    expect(tileNumber(48, "orders")).toBe("48 orders");
    expect(cell(null)).toBe("—");
  });
  test("a change on before", () => {
    expect(change({ value: 3200, previous: 1200 })).toEqual({ text: "+167% on before", up: true });
    expect(change({ value: 90, previous: 100 })).toEqual({ text: "−10% on before", up: false });
    expect(change({ value: 1 })).toBeNull();
  });
  test("shares fold their tail", () => {
    const s = shares(["a", "b", "c", "d", "e", "f", "g"].map((l, i) => ({ label: l, value: 10 - i })));
    expect(s.length).toBe(6);
    expect(s[5].label).toBe("Other");
    expect(Math.round(s.reduce((n, x) => n + x.share, 0) * 1000) / 1000).toBe(1);
  });
});
