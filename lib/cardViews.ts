/**
 * The arithmetic behind the chart and map blocks, kept apart from drawing so
 * it can be tested: where a value sits on a chart, where a place sits in the
 * map box, and the link that opens a place in the phone's own maps app.
 */

/**
 * A chart's vertical scale. Values that are all positive start from zero (a bar
 * twice as tall means twice as much); values that cross zero or are all
 * negative use their own range. y() maps a value to 0 (bottom) .. 1 (top).
 */
export function chartScale(values: number[]): { min: number; max: number; y: (v: number) => number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const min = lo >= 0 ? 0 : lo;
  const max = hi <= 0 && lo < 0 ? 0 : hi;
  const span = max - min || 1;
  return { min, max, y: (v: number) => Math.min(1, Math.max(0, (v - min) / span)) };
}

export interface Pin {
  x: number;
  y: number;
}

/**
 * Where each place goes in a box of width × height, keeping `pad` clear at the
 * edges. Longitude is scaled by the cosine of the latitude so distances look
 * right; the spread is fitted to the box without stretching one direction more
 * than the other. One place sits in the middle; places on top of each other
 * are nudged apart so every pin can be seen.
 */
export function mapLayout(places: { lat: number; lon: number }[], width: number, height: number, pad: number): Pin[] {
  if (places.length === 0) return [];
  if (places.length === 1) return [{ x: width / 2, y: height / 2 }];
  const midLat = places.reduce((n, p) => n + p.lat, 0) / places.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = places.map((p) => p.lon * k);
  const ys = places.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY;
  const w = width - pad * 2, h = height - pad * 2;
  const scale = Math.min(spanX > 0 ? w / spanX : Infinity, spanY > 0 ? h / spanY : Infinity);
  const s = isFinite(scale) ? scale : 0;
  const offX = pad + (w - spanX * s) / 2;
  const offY = pad + (h - spanY * s) / 2;
  const pins = places.map((_, i) => ({ x: offX + (xs[i] - minX) * s, y: offY + (ys[i] - minY) * s }));
  // Nudge pins that land on each other (the same building) apart.
  for (let i = 0; i < pins.length; i++) {
    for (let j = 0; j < i; j++) {
      const dx = pins[i].x - pins[j].x, dy = pins[i].y - pins[j].y;
      if (Math.hypot(dx, dy) < 18) {
        pins[i] = { x: Math.min(width - pad, pins[i].x + 20), y: pins[i].y };
      }
    }
  }
  return pins;
}

/** The link that opens a place in the phone's maps app (or on the web). */
export function mapsUrl(p: { name: string; lat: number; lon: number }, platform: string): string {
  const q = encodeURIComponent(p.name);
  if (platform === "android") return `geo:${p.lat},${p.lon}?q=${p.lat},${p.lon}(${q})`;
  if (platform === "ios") return `maps:?q=${q}&ll=${p.lat},${p.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
}
