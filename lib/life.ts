/**
 * How the phone says what Ghost knows about the owner's life (pkg/life): finances
 * the way the Pod writes it, where each fact came from, how long until a
 * birthday or an expiry. Pure, so it is testable.
 */
import type { LifeSource, Paper, Person } from "./ghostApi";

/** Decimal places a currency's amounts have (pkg/life minorDigits). */
export function minorDigits(cur: string): number {
  if (["JPY", "KRW", "UGX", "RWF", "VND", "CLP", "ISK", "XAF", "XOF", "TZS"].includes(cur)) return 0;
  if (["BHD", "KWD", "OMR", "JOD", "TND"].includes(cur)) return 3;
  return 2;
}

/** Minor units as "KES 1,250.50" (whole amounts without decimals), the Pod's form. */
export function formatCurrency(minor: number, cur: string, opts: { short?: boolean } = {}): string {
  const dg = minorDigits(cur);
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 10 ** dg);
  const frac = abs - whole * 10 ** dg;
  let n = whole.toLocaleString("en-US");
  if (opts.short && whole >= 10000) {
    n = whole >= 1_000_000 ? `${(whole / 1_000_000).toFixed(whole >= 10_000_000 ? 0 : 1)}M` : `${(whole / 1000).toFixed(whole >= 100_000 ? 0 : 1)}K`;
  } else if (dg > 0 && frac !== 0) {
    n += "." + String(frac).padStart(dg, "0");
  }
  return `${neg ? "-" : ""}${cur} ${n}`;
}

/** Where a fact came from, in the owner's words. */
export function sourceLabel(s: LifeSource | undefined): string {
  switch (s?.kind) {
    case "conversation":
      return "You told Ghost";
    case "photo":
      return "Read from a photo";
    case "document":
      return "Read from a document";
    case "email":
      return "From your email";
    case "calendar":
      return "From your calendar";
    case "import":
      return "Imported";
    case "phone":
      return "From your phone";
    case "owner":
      return "You edited it";
  }
  return "Kept by Ghost";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Birthday today", "Birthday tomorrow", "Birthday in 6 days", "Birthday 12 March". */
export function birthdayLine(p: Pick<Person, "next_birthday" | "days_to_birthday" | "turning">): string | null {
  if (!p.next_birthday || p.days_to_birthday === undefined) return null;
  const d = p.days_to_birthday;
  const turning = p.turning ? `, turning ${p.turning}` : "";
  if (d === 0) return `Birthday today${turning}`;
  if (d === 1) return `Birthday tomorrow${turning}`;
  if (d < 14) return `Birthday in ${d} days${turning}`;
  const [, m, dd] = p.next_birthday.split("-").map(Number);
  return `Birthday ${dd} ${MONTHS[m - 1]}`;
}

export type StatusTone = "bad" | "warn" | "neutral";

/** How a document stands: expired, soon, or fine until a date. */
export function paperStatus(p: Pick<Paper, "days_left" | "what" | "expires" | "renews">): { text: string; tone: StatusTone } | null {
  if (p.days_left === undefined) return null;
  const d = p.days_left;
  const verb = p.what === "renews" ? "Renews" : "Expires";
  const date = p.what === "renews" ? p.renews : p.expires;
  if (d < 0) return { text: p.what === "renews" ? `Renewal was ${-d} days ago` : `Expired ${-d === 1 ? "yesterday" : `${-d} days ago`}`, tone: "bad" };
  if (d === 0) return { text: `${verb} today`, tone: "bad" };
  if (d <= 30) return { text: `${verb} in ${d} ${d === 1 ? "day" : "days"}`, tone: "warn" };
  if (d <= 90) return { text: `${verb} in ${Math.round(d / 7)} weeks`, tone: "warn" };
  if (!date) return null;
  const [y, m] = date.split("-").map(Number);
  return { text: `${p.what === "renews" ? "Renews" : "Valid until"} ${MONTHS[m - 1].slice(0, 3)} ${y}`, tone: "neutral" };
}

/** "GW" for Grace Wanjiru, "S" for Sam. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** A steady hue per person (same name, same colour), from the aurora's side of the wheel. */
export function personHue(name: string): number {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 230 + (h % 120); // indigo through magenta to amber
}

/** "2026-10" moved by n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "October 2026", or "October" this year. */
export function monthName(month: string, now = new Date()): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ""}`;
}
