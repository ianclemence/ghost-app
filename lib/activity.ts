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
