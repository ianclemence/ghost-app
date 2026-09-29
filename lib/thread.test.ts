import { describe, expect, test } from "bun:test";
import { buildThread, dayLabel } from "./thread";
import type { ExtendedMessage } from "./store";

const NOW = new Date(2026, 8, 29, 15, 0).getTime();
const H = 3_600_000;
const m = (id: string, role: "user" | "assistant", at: number, content = "x"): ExtendedMessage =>
  ({ id, role, content, timestamp: at });

describe("buildThread", () => {
  test("days separate the thread", () => {
    const items = buildThread([m("1", "user", NOW - 26 * H), m("2", "assistant", NOW - 26 * H + 5000), m("3", "user", NOW - H)], [], NOW);
    expect(items.filter((i) => i.kind === "day").map((i) => (i as { label: string }).label)).toEqual(["Yesterday", "Today"]);
  });

  test("a reply is in turn; an unprompted message is out of turn with its time", () => {
    const items = buildThread([
      m("u", "user", NOW - 5 * H),
      m("a", "assistant", NOW - 5 * H + 3000),
      m("alert", "assistant", NOW - 2 * H),
    ], [], NOW).filter((i) => i.kind === "message") as Extract<ReturnType<typeof buildThread>[number], { kind: "message" }>[];
    expect(items[1].outOfTurn).toBe(false);
    expect(items[1].showTime).toBe(false);
    expect(items[2].outOfTurn).toBe(true);
    expect(items[2].showTime).toBe(true);
  });

  test("a multi-part reply seconds apart is not out of turn", () => {
    const items = buildThread([m("u", "user", NOW - H), m("a1", "assistant", NOW - H + 2000), m("a2", "assistant", NOW - H + 9000)], [], NOW)
      .filter((i) => i.kind === "message") as Extract<ReturnType<typeof buildThread>[number], { kind: "message" }>[];
    expect(items[2].outOfTurn).toBe(false);
  });

  test("resuming after a pause shows the time", () => {
    const items = buildThread([m("u1", "user", NOW - 3 * H), m("a1", "assistant", NOW - 3 * H + 2000), m("u2", "user", NOW - H)], [], NOW)
      .filter((i) => i.kind === "message") as Extract<ReturnType<typeof buildThread>[number], { kind: "message" }>[];
    expect(items[2].showTime).toBe(true);
    expect(items[1].showTime).toBe(false);
  });

  test("artifacts sit where they happened", () => {
    const items = buildThread(
      [m("u", "user", NOW - 2 * H), m("a", "assistant", NOW - 2 * H + 1000), m("u2", "user", NOW - H)],
      [{ id: "doc", kind: "document", title: "Itinerary", state: "ready", actions: [], created_at: new Date(NOW - 2 * H + 2000).toISOString() } as never],
      NOW,
    );
    expect(items.map((i) => i.key)).toEqual([expect.stringMatching(/^day-/), "u", "a", "art-doc", "u2"]);
  });
});

describe("dayLabel", () => {
  test("recent days read naturally", () => {
    expect(dayLabel(NOW - H, NOW)).toBe("Today");
    expect(dayLabel(NOW - 24 * H, NOW)).toBe("Yesterday");
  });
});
