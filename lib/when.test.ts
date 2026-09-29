import { describe, expect, test } from "bun:test";
import { whenAgo, whenAhead } from "./when";

const NOW = new Date(2026, 8, 29, 12, 0).getTime();
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("when", () => {
  test("ahead", () => {
    expect(whenAhead(at(20 * 60_000), NOW)).toBe("in 20 min");
    expect(whenAhead(at(3 * 3_600_000), NOW)).toBe("in 3 h");
    expect(whenAhead(at(30_000), NOW)).toBe("now");
    expect(whenAhead(at(26 * 3_600_000), NOW)).toMatch(/^tomorrow /);
    expect(whenAhead("garbage", NOW)).toBeNull();
  });
  test("ago", () => {
    expect(whenAgo(at(-10_000), NOW)).toBe("just now");
    expect(whenAgo(at(-39 * 60_000), NOW)).toBe("39 min ago");
    expect(whenAgo(at(-3 * 3_600_000), NOW)).toBe("3 h ago");
    expect(whenAgo(at(-20 * 3_600_000), NOW)).toMatch(/^yesterday /);
  });
});
