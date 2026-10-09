/**
 * Dashboards on the phone: which artifacts are dashboards, and how a tile's
 * numbers read. Pure, so it is testable.
 */
import type { Artifact, DashTile } from "./ghostApi";

const DASH_PATH = /^dashboards\/[a-z0-9-]+\.json$/;

export function isDashboardArtifact(a: Pick<Artifact, "kind" | "path" | "state">): boolean {
  return a.kind === "file" && a.state === "available" && typeof a.path === "string" && DASH_PATH.test(a.path);
}

/** 1,240,500 · 1.2M · 3.5 — short enough for a tile, exact enough to trust. */
export function tileNumber(v: number, unit?: string, compact = false): string {
  const abs = Math.abs(v);
  let s: string;
  if (compact && abs >= 1e6) s = `${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  else if (compact && abs >= 1e4) s = `${Math.round(v / 1e3)}k`;
  else s = v.toLocaleString("en-US", { maximumFractionDigits: abs >= 100 ? 0 : abs >= 1 ? 1 : 2 });
  if (!unit) return s;
  return /^[A-Z]{3}$/.test(unit) ? `${unit} ${s}` : unit === "%" ? `${s}%` : `${s} ${unit}`;
}

/** "+12% on before", or null when there is nothing to compare. */
export function change(t: Pick<DashTile, "value" | "previous">): { text: string; up: boolean } | null {
  if (t.value === undefined || t.previous === undefined || t.previous === 0) return null;
  const pct = ((t.value - t.previous) / Math.abs(t.previous)) * 100;
  if (!Number.isFinite(pct)) return null;
  return { text: `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}% on before`, up: pct >= 0 };
}

/** Shares of a whole, largest first, the tail folded into "Other" past five. */
export function shares(points: { label: string; value: number }[]): { label: string; value: number; share: number }[] {
  const pos = points.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const total = pos.reduce((n, p) => n + p.value, 0) || 1;
  const top = pos.slice(0, 5);
  const rest = pos.slice(5).reduce((n, p) => n + p.value, 0);
  const out = top.map((p) => ({ ...p, share: p.value / total }));
  if (rest > 0) out.push({ label: "Other", value: rest, share: rest / total });
  return out;
}

/** A cell as it should read. */
export function cell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return tileNumber(v);
  return String(v);
}
