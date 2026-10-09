import { describe, expect, test } from "bun:test";
import { chartScale, mapLayout, mapsUrl } from "./cardViews";
import { answerPayload, answerProblem, formatValue, humanValue, initialAnswers, monthGrid, parseLocal, snap } from "./cardAnswers";
import { parseBlocks } from "./blocks";

describe("chart scale", () => {
  test("positive values start from zero", () => {
    const s = chartScale([100, 200]);
    expect(s.min).toBe(0);
    expect(s.y(200)).toBe(1);
    expect(s.y(100)).toBe(0.5);
  });
  test("values that cross zero use their own range", () => {
    const s = chartScale([-10, 10]);
    expect(s.y(-10)).toBe(0);
    expect(s.y(0)).toBe(0.5);
  });
  test("a flat line does not divide by zero", () => {
    expect(chartScale([0, 0]).y(0)).toBe(0);
  });
});

describe("map layout", () => {
  test("one place sits in the middle", () => {
    expect(mapLayout([{ lat: -1.28, lon: 36.82 }], 300, 160, 20)).toEqual([{ x: 150, y: 80 }]);
  });
  test("places stay inside the box, north is up", () => {
    const pins = mapLayout([{ lat: -1.0, lon: 36.0 }, { lat: -1.5, lon: 36.5 }], 300, 160, 20);
    for (const p of pins) {
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThanOrEqual(280);
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThanOrEqual(140);
    }
    expect(pins[0].y).toBeLessThan(pins[1].y);
    expect(pins[0].x).toBeLessThan(pins[1].x);
  });
  test("places on top of each other are pulled apart", () => {
    const pins = mapLayout([{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }, { lat: 2, lon: 2 }], 300, 160, 20);
    expect(Math.hypot(pins[0].x - pins[1].x, pins[0].y - pins[1].y)).toBeGreaterThanOrEqual(18);
  });
  test("a place opens in the phone's own maps app", () => {
    expect(mapsUrl({ name: "Cafe Brera", lat: -1.28, lon: 36.82 }, "android")).toBe("geo:-1.28,36.82?q=-1.28,36.82(Cafe%20Brera)");
    expect(mapsUrl({ name: "x", lat: 1, lon: 2 }, "web")).toContain("query=1,2");
  });
});

describe("card answers", () => {
  const blocks = parseBlocks([
    { type: "choice", key: "place", label: "Where", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
    { type: "datetime", key: "when", label: "When", mode: "date", earliest: "2026-10-10" },
    { type: "slider", key: "people", label: "People", min: 1, max: 8, number: 2 },
    { type: "field", key: "note", label: "Note", optional: true },
    { type: "checklist", key: "bring", checks: [{ id: "wine", label: "Wine", done: true }, { id: "cake", label: "Cake" }] },
  ]);
  test("each input starts where the card suggests", () => {
    expect(initialAnswers(blocks)).toEqual({ place: undefined, when: undefined, people: 2, note: "", bring: ["wine"] });
  });
  test("what is missing is said in words, and nothing once complete", () => {
    const a = initialAnswers(blocks);
    expect(answerProblem(blocks, a)).toBe("Where: pick one");
    a.place = "b";
    expect(answerProblem(blocks, a)).toBe("When: choose a date");
    a.when = "2026-10-01";
    expect(answerProblem(blocks, a)).toBe("When: that's too early");
    a.when = "2026-10-12";
    expect(answerProblem(blocks, a)).toBeNull();
    expect(answerPayload(blocks, a)).toEqual({ place: "b", when: "2026-10-12", people: 2, bring: ["wine"] });
  });
  test("a question is answered by a pick or by words", () => {
    const q = parseBlocks([
      { type: "choice", key: "answer", label: "Choose one", options: [{ id: "1", label: "A" }, { id: "2", label: "B" }] },
      { type: "field", key: "other", label: "Or say something else", optional: true },
    ]);
    expect(answerProblem(q, { answer: undefined, other: "" }, { question: true })).toBe("Choose one: pick one");
    expect(answerProblem(q, { answer: undefined, other: "the one from work" }, { question: true })).toBeNull();
  });
  test("a slider lands on its steps, without float noise", () => {
    expect(snap(0.30000000000000004, 0, 1, 0.1)).toBe(0.3);
    expect(snap(147, 0, 500, 10)).toBe(150);
    expect(snap(900, 0, 500, 10)).toBe(500);
  });
});

describe("dates the way the card says them", () => {
  const now = new Date(2026, 9, 9, 12, 0);
  test("each mode has its own form", () => {
    const d = new Date(2026, 9, 16, 19, 30);
    expect(formatValue("date", d)).toBe("2026-10-16");
    expect(formatValue("time", d)).toBe("19:30");
    expect(formatValue("datetime", d)).toBe("2026-10-16T19:30");
    expect(humanValue("datetime", "2026-10-16T19:30", now)).toBe("Fri 16 Oct, 19:30");
    expect(humanValue("date", "2027-01-02", now)).toBe("Sat 2 Jan 2027");
    expect(parseLocal("nonsense")).toBeNull();
  });
  test("a month is whole weeks, Monday first", () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g[0].slice(0, 3)).toEqual([null, null, null]);
    expect(g[0][3]?.getDate()).toBe(1);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
});
