/**
 * Human time phrases for lists of things Ghost did or will do. Short, in the
 * owner's locale, and never falsely precise ("in 20 min", "3 h ago",
 * "Friday 08:25").
 */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function clock(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayDiff(a: number, b: number): number {
  const x = new Date(a); x.setHours(0, 0, 0, 0);
  const y = new Date(b); y.setHours(0, 0, 0, 0);
  return Math.round((x.getTime() - y.getTime()) / DAY);
}

export function whenAhead(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = t - now;
  if (d <= MIN) return "now";
  if (d < HOUR) return `in ${Math.round(d / MIN)} min`;
  const days = dayDiff(t, now);
  const at = new Date(t);
  if (days === 0) return d < 6 * HOUR ? `in ${Math.round(d / HOUR)} h` : `today ${clock(at)}`;
  if (days === 1) return `tomorrow ${clock(at)}`;
  if (days < 7) return `${at.toLocaleDateString([], { weekday: "long" })} ${clock(at)}`;
  return at.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function whenAgo(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = now - t;
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`;
  const days = dayDiff(now, t);
  if (days === 0) return `${Math.round(d / HOUR)} h ago`;
  if (days === 1) return `yesterday ${clock(new Date(t))}`;
  if (days < 7) return new Date(t).toLocaleDateString([], { weekday: "long" });
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}
