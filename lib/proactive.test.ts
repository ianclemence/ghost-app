import { describe, expect, test } from "bun:test";
import { proactiveLine } from "./proactive";
import type { ProactiveStatus } from "./ghostApi";

const base: ProactiveStatus = {
  quiet: false, budget_used: 0, budget_max: 5, waiting: 0,
};

describe("proactiveLine", () => {
  test("nothing to say when idle and not quiet", () => {
    expect(proactiveLine(base).text).toBeNull();
    expect(proactiveLine(null).text).toBeNull();
  });

  test("waiting during quiet hours says when it will arrive", () => {
    const l = proactiveLine({ ...base, quiet: true, quiet_end: "08:00", waiting: 2 });
    expect(l.text).toBe("2 things waiting until 08:00.");
  });

  test("waiting while awake is ready now", () => {
    const l = proactiveLine({ ...base, waiting: 1 });
    expect(l.text).toBe("1 update ready when you are.");
  });

  test("quiet with nothing waiting still reassures it is watching", () => {
    const l = proactiveLine({ ...base, quiet: true, quiet_end: "08:00" });
    expect(l.text).toBe("Watching quietly until 08:00.");
  });

  test("falls back to a word when no quiet end is known", () => {
    const l = proactiveLine({ ...base, quiet: true, waiting: 3 });
    expect(l.text).toBe("3 things waiting until morning.");
  });
});
