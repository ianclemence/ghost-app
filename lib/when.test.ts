import { describe, expect, test } from "bun:test";
import { nextLine, whenAgo, whenAhead } from "./when";

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

describe("nextLine", () => {
  test("a reminder reads as a reminder at its own time, proper nouns intact", () => {
    // Saturday 3 Oct 06:55; the reminder fires Friday 9 Oct 21:00.
    const now = new Date(2026, 9, 3, 6, 55).getTime();
    const line = nextLine({
      kind: "reminder",
      title: "Chelsea vs Bournemouth is tomorrow \u2014 Saturday 10 October, 15:00 UK / 21:00 Ban\u2026",
      next_run_at: new Date(2026, 9, 9, 21, 0).toISOString(),
    }, now);
    expect(line).toMatch(/^Next, Friday \S+( PM)?, a reminder: Chelsea vs Bournemouth is tomorrow$/);
  });
  test("a title cut short loses the broken word, not the sentence", () => {
    expect(nextLine({ title: "Check the fare to Shenzhen before it goes up again on Mon\u2026", schedule: "Every Monday at 08:00" }, NOW))
      .toBe("Next, every Monday at 08:00: Check the fare to Shenzhen before it goes up again on");
  });
  test("a routine is when, then what", () => {
    expect(nextLine({ title: "Morning brief", next_run_at: at(30 * 60_000) }, NOW)).toBe("Next, in 30 min: Morning brief");
  });
});
