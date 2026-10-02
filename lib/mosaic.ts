// How several photos sit together in a message: one large, two side by side,
// one large with two small, then a two-by-two with a "+N" on the last tile.
// Pure geometry, so the arrangement can be tested without a screen.

export type Tile = { x: number; y: number; w: number; h: number; more?: number };

export const MOSAIC_GAP = 3;

/** Tiles for `count` photos inside a box `width` wide, and the box's height. */
export function mosaic(count: number, width: number): { tiles: Tile[]; height: number } {
  const g = MOSAIC_GAP;
  if (count <= 0) return { tiles: [], height: 0 };
  if (count === 1) {
    const h = Math.round(width * 0.75);
    return { tiles: [{ x: 0, y: 0, w: width, h }], height: h };
  }
  if (count === 2) {
    const s = Math.floor((width - g) / 2);
    return { tiles: [{ x: 0, y: 0, w: s, h: s }, { x: s + g, y: 0, w: width - s - g, h: s }], height: s };
  }
  if (count === 3) {
    const big = Math.floor((width - g) * 0.62);
    const small = width - big - g;
    const h = big;
    const half = Math.floor((h - g) / 2);
    return {
      tiles: [
        { x: 0, y: 0, w: big, h },
        { x: big + g, y: 0, w: small, h: half },
        { x: big + g, y: half + g, w: small, h: h - half - g },
      ],
      height: h,
    };
  }
  const s = Math.floor((width - g) / 2);
  const tiles: Tile[] = [
    { x: 0, y: 0, w: s, h: s },
    { x: s + g, y: 0, w: width - s - g, h: s },
    { x: 0, y: s + g, w: s, h: s },
    { x: s + g, y: s + g, w: width - s - g, h: s, ...(count > 4 ? { more: count - 4 } : {}) },
  ];
  return { tiles, height: s * 2 + g };
}
