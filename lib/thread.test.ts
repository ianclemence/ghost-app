import { describe, expect, test } from "bun:test";
import { buildThread, dayLabel } from "./thread";
import { normalizeCard } from "./cards";
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


describe("buildThread places cards where they were shown", () => {
  const card = (id: string, at?: number) => ({ id, kind: "present" as const, title: id, created_at: at });

  test("a card sits between the messages it came between, not at the end", () => {
    const items = buildThread(
      [m("1", "user", NOW - 3 * H), m("2", "assistant", NOW - H)],
      [],
      NOW,
      [card("c1", NOW - 2 * H)],
    );
    const order = items.filter((i) => i.kind !== "day").map((i) => (i.kind === "card" ? "card" : i.kind === "message" ? i.message.id : i.kind));
    expect(order).toEqual(["1", "card", "2"]);
  });

  test("a card with no time follows the latest message", () => {
    const items = buildThread([m("1", "user", NOW - H)], [], NOW, [card("c1")]);
    expect(items[items.length - 1].kind).toBe("card");
  });

  test("two cards keep the order they were given when made together", () => {
    const items = buildThread([], [], NOW, [card("a", NOW - 5), card("b", NOW - 5)]);
    expect(items.filter((i) => i.kind === "card").map((i) => (i as { card: { id: string } }).card.id)).toEqual(["a", "b"]);
  });
});

describe("repeated notices", () => {
  test("the same notice twice in a row is shown once", () => {
    const n = (id: string, at: number) => ({ id, role: "assistant", content: "My browser got stuck", timestamp: at, kind: "notice" }) as never;
    const items = buildThread([n("a", 1000), n("b", 2000)], [], 3000);
    expect(items.filter((i) => i.kind === "message").length).toBe(1);
  });
});

describe("browser recovery cards", () => {
  const card = (id: string, at: number) => ({ id, kind: "browser_recovery", title: "My browser got stuck", body: "Reset.", created_at: at }) as never;
  test("two identical cards in a row show once", () => {
    const items = buildThread([], [], 9000, [card("a", 1000), card("b", 2000)]);
    expect(items.filter((i) => i.kind === "card").length).toBe(1);
  });
  test("a recovery card disappears once Ghost has answered after it", () => {
    const answer = { id: "m", role: "assistant", content: "Here are the prices", timestamp: 5000 } as never;
    const items = buildThread([answer], [], 9000, [card("a", 1000)]);
    expect(items.filter((i) => i.kind === "card").length).toBe(0);
  });
  test("a card fetched from history (RFC 3339 time) clears once Ghost has answered", () => {
    const fetched = normalizeCard({
      id: "card_x", kind: "browser_recovery", title: "My browser got stuck", body: "Reset.",
      created_at: "2026-10-03T01:32:38.380195064+07:00",
    });
    expect(fetched?.created_at).toBe(Date.parse("2026-10-03T01:32:38.380+07:00"));
    const answer = { id: "m", role: "assistant", content: "Fair enough.", timestamp: Date.parse("2026-10-03T06:41:58+07:00") } as never;
    const items = buildThread([answer], [], Date.parse("2026-10-03T06:43:00+07:00"), [fetched!]);
    expect(items.filter((i) => i.kind === "card").length).toBe(0);
  });
});

describe("a partly loaded conversation", () => {
  test("a file from before the loaded part does not float at the top", () => {
    const msg = { id: "m", role: "assistant", content: "hi", timestamp: 5000 } as never;
    const art = { id: "a", kind: "file", title: "Browser screenshot", state: "available", actions: [], created_at: new Date(1000).toISOString() } as never;
    expect(buildThread([msg], [art], 9000, [], true).some((i) => i.kind === "artifact")).toBe(false);
    expect(buildThread([msg], [art], 9000, [], false).some((i) => i.kind === "artifact")).toBe(true);
  });
});

describe("a reminder's buttons sit under the reminder", () => {
  test("even when the Pod's whole-second stamp falls just before the message", () => {
    // The reminder message arrived at 10:04:00.800; its card is stamped 10:04:00.
    const at = new Date(2026, 8, 29, 10, 4, 0, 800).getTime();
    const cardAt = new Date(2026, 8, 29, 10, 4, 0).getTime();
    const reminder: ExtendedMessage = { id: "r", role: "assistant", content: "Reminder: water", timestamp: at, kind: "reminder" };
    const card = { id: "card_r", kind: "reminder" as const, title: "Drink water", created_at: cardAt };
    const items = buildThread([m("u", "user", at - 5 * H), reminder], [], NOW, [card]);
    const order = items.filter((i) => i.kind !== "day").map((i) => (i.kind === "card" ? "card" : i.kind === "message" ? i.message.id : i.kind));
    expect(order).toEqual(["u", "r", "card"]);
  });
});

describe("a canvas sits under its request and above Ghost's words", () => {
  const canvas = (id: string, at: number) =>
    ({ id, kind: "file", title: "Pong", path: "canvas/pong-v1.html", state: "available", actions: [], created_at: new Date(at).toISOString() }) as import("./ghostApi").Artifact;
  const order = (items: ReturnType<typeof buildThread>) =>
    items.filter((i) => i.kind !== "day").map((i) => (i.kind === "artifact" ? `art:${i.artifact.id}` : i.kind === "message" ? i.message.id : i.kind));

  test("published while the reply is still being written", () => {
    const u = m("u", "user", NOW - 3 * H);
    const reply: ExtendedMessage = { ...m("a", "assistant", NOW - 3 * H + 100, "I made a Pong game."), status: "streaming" };
    expect(order(buildThread([u, reply], [canvas("c1", NOW - 3 * H + 5000)], NOW))).toEqual(["u", "art:c1", "a"]);
  });

  test("a document file is still placed by time", () => {
    const pdf = { ...canvas("doc", NOW - 3 * H + 5000), path: "report.pdf" };
    const items = buildThread([m("u", "user", NOW - 3 * H), m("a", "assistant", NOW - 3 * H + 100)], [pdf], NOW);
    expect(order(items)).toEqual(["u", "a", "art:doc"]);
  });

  test("a canvas Ghost made long after it answered stays at its own time", () => {
    const items = buildThread([m("u", "user", NOW - 5 * H), m("a", "assistant", NOW - 5 * H + 3000), m("later", "user", NOW - H)], [canvas("c1", NOW - 4 * H)], NOW);
    expect(order(items)).toEqual(["u", "a", "art:c1", "later"]);
  });
});
