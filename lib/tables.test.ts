import { describe, expect, test } from "bun:test";
import { fitWidths, isNumeric, measureTable, nodeText, tableRows, MAX_COL, MIN_COL } from "./tables";

const cell = (type: string, text: string) => ({ type, children: [{ type: "text", content: text }] });
const table = {
  type: "table",
  children: [
    { type: "thead", children: [{ type: "tr", children: [cell("th", "Airline"), cell("th", "Price"), cell("th", "Notes")] }] },
    {
      type: "tbody",
      children: [
        { type: "tr", children: [cell("td", "Thai AirAsia"), cell("td", "$212"), cell("td", "One stop in Kuala Lumpur, 9h 40m total")] },
        { type: "tr", children: [cell("td", "Bangkok Airways"), cell("td", "$1,048.50"), cell("td", "Direct")] },
      ],
    },
  ],
};

describe("reading a table", () => {
  test("rows come out as plain text, header first", () => {
    expect(tableRows(table)).toEqual([
      ["Airline", "Price", "Notes"],
      ["Thai AirAsia", "$212", "One stop in Kuala Lumpur, 9h 40m total"],
      ["Bangkok Airways", "$1,048.50", "Direct"],
    ]);
  });

  test("inline formatting inside a cell still reads as its text", () => {
    const n = { type: "td", children: [{ type: "strong", children: [{ type: "text", content: "Best" }] }, { type: "text", content: " pick" }] };
    expect(nodeText(n)).toBe("Best pick");
  });
});

describe("sizing columns", () => {
  test("a column is as wide as what is in it, within limits", () => {
    const { widths } = measureTable(tableRows(table));
    expect(widths[1]).toBeLessThan(110); // a price is narrow
    expect(measureTable([["h"], ["$9"]]).widths[0]).toBe(MIN_COL); // and never below the minimum
    expect(widths[2]).toBe(MAX_COL); // a long note is capped and wraps
    expect(widths[0]).toBeGreaterThan(widths[1]);
  });

  test("a long unbroken word isn't cut mid-word", () => {
    const { widths } = measureTable([["h"], ["Internationalization"]]);
    expect(widths[0]).toBeGreaterThanOrEqual(20 * 8);
  });

  test("numbers are recognised, words are not", () => {
    for (const t of ["$212", "1,048.50", "42%", "3 kg", "−7", "~120", "€9.99", "12k"]) expect(isNumeric(t)).toBe(true);
    for (const t of ["Direct", "N/A", "2 stops, KUL", "", "Q3 2026 plan for everyone"]) expect(isNumeric(t)).toBe(false);
  });

  test("a column is numeric only when every cell in it is", () => {
    const { numeric } = measureTable(tableRows(table));
    expect(numeric).toEqual([false, true, false]);
    expect(measureTable([["n"], ["1"], ["two"]]).numeric).toEqual([false]);
  });
});

describe("fitting the screen", () => {
  const sum = (w: number[] | null) => (w ?? []).reduce((a, b) => a + b, 0);

  test("a narrow table grows to fill the room, exactly", () => {
    const w = fitWidths([100, 100, 100], 400)!;
    expect(sum(w)).toBe(400);
    expect(w.every((x) => x >= 130)).toBe(true);
  });

  test("a wide table is squeezed to the room, never wider, so nothing scrolls", () => {
    const w = fitWidths([200, 240, 240], 340)!;
    expect(sum(w)).toBe(340);
    expect(w.every((x) => x >= 72)).toBe(true);
  });

  test("short columns keep their width while long ones give way", () => {
    const w = fitWidths([84, 240, 240], 340)!;
    expect(sum(w)).toBe(340);
    expect(w[0]).toBeGreaterThanOrEqual(84 * 0.8);
    expect(w[1]).toBeLessThan(240);
  });

  test("too many columns to keep readable is left to be stacked", () => {
    expect(fitWidths([100, 100, 100, 100, 100, 100], 340)).toBeNull();
  });

  test("no room measured yet is safe", () => {
    expect(fitWidths([100, 100], 0)).toEqual([100, 100]);
    expect(fitWidths([], 300)).toEqual([]);
  });
});
