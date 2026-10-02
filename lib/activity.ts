import type { ActivityChip } from "./ghostApi";

/**
 * Pure cursor helpers for the canonical Activity feed.
 *
 * The backend owns ordering; the client only tracks the high-water `seq`
 * it has already seen and merges pages without duplicating chips.
 */

export function maxActivitySeq(items: ActivityChip[]): number {
  return items.reduce((m, c) => Math.max(m, typeof c.seq === "number" ? c.seq : 0), 0);
}

export function mergeActivityChips(prev: ActivityChip[], fresh: ActivityChip[]): ActivityChip[] {
  if (fresh.length === 0) return prev;
  const seen = new Set(prev.map((c) => `${c.seq}:${c.id}`));
  const merged = [...prev];
  for (const chip of fresh) {
    const key = `${chip.seq}:${chip.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(chip);
    }
  }
  merged.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
  return merged;
}

export function activityQuery(limit: number, sinceSeq?: number, conversationId?: string): string {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (typeof sinceSeq === "number" && sinceSeq > 0) qs.set("since_seq", String(sinceSeq));
  if (conversationId) qs.set("conversation_id", conversationId);
  return qs.toString();
}

/** One day of activity, newest first, with the label the owner reads. */
export interface ActivityDay {
  label: string;
  items: ActivityChip[];
}

/**
 * Groups activity into days (Today, Yesterday, then dates), newest day first
 * and newest item first inside it. An item with no readable time goes under
 * "Earlier". `label` turns a time into its day's name.
 */
export function groupActivityByDay(items: ActivityChip[], label: (ms: number) => string): ActivityDay[] {
  // An unreadable time sorts last rather than poisoning the comparison.
  const when = (c: ActivityChip) => (Number.isFinite(Date.parse(c.timestamp)) ? Date.parse(c.timestamp) : -Infinity);
  const sorted = [...items].sort((a, b) => (when(a) === when(b) ? 0 : when(b) > when(a) ? 1 : -1));
  const days: ActivityDay[] = [];
  for (const it of sorted) {
    const t = Date.parse(it.timestamp);
    const name = Number.isFinite(t) ? label(t) : "Earlier";
    const last = days[days.length - 1];
    if (last && last.label === name) last.items.push(it);
    else days.push({ label: name, items: [it] });
  }
  return days;
}

/** How an outcome reads as a light: failure red, waiting or changed amber, done green, the rest quiet. */
export type ActivityTone = "bad" | "attention" | "ok" | "quiet";

export function activityTone(state: string | undefined): ActivityTone {
  const s = (state ?? "").toLowerCase();
  if (s === "failed" || s === "error") return "bad";
  if (s === "waiting" || s === "pending" || s === "changed") return "attention";
  if (s === "done" || s === "completed" || s === "succeeded" || s === "verified") return "ok";
  return "quiet";
}
