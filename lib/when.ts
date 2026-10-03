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

/**
 * The Panel's "Next" sentence: when first, then what, in the item's own words.
 * A reminder's title is the message Ghost will send when it fires ("Chelsea vs
 * Bournemouth is tomorrow"), so it is named as a reminder: worded as an event,
 * "is tomorrow, Friday 21:00" read as a wrong date. The title is never
 * lowercased (that made "chelsea"), and a title cut short on the Pod keeps only
 * its first clause rather than ending in "Ban…".
 */
export function nextLine(
  item: { title: string; kind?: string; schedule?: string; next_run_at?: string | null },
  now = Date.now(),
): string {
  let what = item.title.trim();
  const dash = what.search(/\s[\u2014\u2013-]\s/);
  if (dash > 0) what = what.slice(0, dash);
  else if (what.endsWith("\u2026")) what = what.slice(0, -1).replace(/\s+\S*$/, "");
  what = what.replace(/[\s,;:.]+$/, "");
  const sched = (item.schedule ?? "").trim();
  const when = whenAhead(item.next_run_at, now) ?? (sched ? sched.charAt(0).toLowerCase() + sched.slice(1) : "");
  if (!when) return item.kind === "reminder" ? `Next, a reminder: ${what}` : `Next: ${what}`;
  return item.kind === "reminder" ? `Next, ${when}, a reminder: ${what}` : `Next, ${when}: ${what}`;
}
