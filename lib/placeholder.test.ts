import { describe, expect, test } from "bun:test";
import { composerPlaceholder, PLACEHOLDER_MAX } from "./placeholder";

const at = (iso: string) => new Date(iso);
const base = { online: true, streaming: false, firstTime: false };

describe("composerPlaceholder", () => {
  test("is honest when the Pod is away or Ghost is busy", () => {
    expect(composerPlaceholder({ ...base, online: false })).toBe("Sends when your Pod is back");
    expect(composerPlaceholder({ ...base, streaming: true })).toBe("Add to what I'm doing");
  });

  test("welcomes an empty conversation without a generic prompt", () => {
    expect(composerPlaceholder({ ...base, firstTime: true })).toBe("Tell me about your week");
  });

  test("follows the part of the day", () => {
    const morning = composerPlaceholder({ ...base, now: at("2026-10-05T08:00:00") });
    const night = composerPlaceholder({ ...base, now: at("2026-10-05T23:30:00") });
    expect(morning).not.toBe(night);
    expect(["What's the plan today?", "What are we starting with?", "Anything to set up for today?"]).toContain(morning);
    expect(["Can't sleep? Tell me.", "Still up? Tell me.", "Something on your mind?"]).toContain(night);
  });

  test("is stable within a day and changes between days", () => {
    const a = composerPlaceholder({ ...base, now: at("2026-10-05T09:00:00") });
    const b = composerPlaceholder({ ...base, now: at("2026-10-05T10:30:00") });
    expect(a).toBe(b);
    const seen = new Set<string>();
    for (let d = 5; d < 8; d++) seen.add(composerPlaceholder({ ...base, now: at(`2026-10-0${d}T09:00:00`) }));
    expect(seen.size).toBeGreaterThan(1);
  });

  test("always fits one row", () => {
    for (let h = 0; h < 24; h++) {
      for (let d = 1; d <= 9; d++) {
        const text = composerPlaceholder({ ...base, now: at(`2026-10-0${d}T${String(h).padStart(2, "0")}:00:00`) });
        expect(text.length).toBeLessThanOrEqual(PLACEHOLDER_MAX);
      }
    }
  });
});
