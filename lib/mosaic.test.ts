import { describe, expect, test } from "bun:test";
import { mosaic, MOSAIC_GAP } from "./mosaic";

const inside = (t: { x: number; y: number; w: number; h: number }, w: number, h: number) =>
  t.x >= 0 && t.y >= 0 && t.x + t.w <= w && t.y + t.h <= h;

describe("mosaic", () => {
  test("nothing, one, two", () => {
    expect(mosaic(0, 232)).toEqual({ tiles: [], height: 0 });
    expect(mosaic(1, 232).tiles).toHaveLength(1);
    const two = mosaic(2, 232);
    expect(two.tiles[0].w + MOSAIC_GAP + two.tiles[1].w).toBe(232);
  });

  test("three: one large, two small, stacked to the same height", () => {
    const m = mosaic(3, 232);
    expect(m.tiles).toHaveLength(3);
    const [big, a, b] = m.tiles;
    expect(big.h).toBe(m.height);
    expect(a.y + a.h + MOSAIC_GAP).toBe(b.y);
    expect(b.y + b.h).toBe(m.height);
    expect(big.w + MOSAIC_GAP + a.w).toBe(232);
  });

  test("four fill a grid; more than four say how many are hidden", () => {
    expect(mosaic(4, 232).tiles.some((t) => t.more)).toBe(false);
    const m = mosaic(9, 232);
    expect(m.tiles).toHaveLength(4);
    expect(m.tiles[3].more).toBe(5);
  });

  test("every tile stays inside the box, whatever the width", () => {
    for (const w of [160, 232, 300]) {
      for (let n = 1; n <= 10; n++) {
        const m = mosaic(n, w);
        for (const t of m.tiles) expect(inside(t, w, m.height)).toBe(true);
      }
    }
  });
});
