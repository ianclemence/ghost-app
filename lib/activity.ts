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

/**
 * True when text reads like an error from code rather than a sentence for an
 * owner: a SQL or driver message, a snake_case identifier, a UUID, a very long
 * dump. Such text is kept (it is the audit trail) but not put in front of the
 * owner by default.
 */
export function isTechnical(text: string | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (t.length > 160) return true;
  if (/\b[a-z]+_[a-z0-9_]+\b/.test(t)) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(t)) return true;
  return /(sql|driver\.|column|exception|panic|stack trace|errno|fts5|unmarshal|nil pointer|syntax error|logic error|traceback)/i.test(t);
}

/** One row of the tree: the newest of a run of identical outcomes, and how many there were. */
export interface ActivityEntry {
  item: ActivityChip;
  count: number;
  /** Every item in the run, newest first. */
  items: ActivityChip[];
}
/**
 * Folds consecutive items with the same title, outcome and summary into one
 * entry, so a failure that happened six times in a minute is one line saying
 * so, not six. Order is kept; only neighbours merge.
 *
 * The summary is part of the match: "Used the browser" covers opening a page,
 * typing and clicking, and merging on title alone showed Wikipedia typing
 * under "Opened timeanddate.com ×4". A row with no summary next to one that
 * has one says nothing new, so it joins it without adding to the count.
 */
export function collapseRepeats(items: ActivityChip[]): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    const same = !!last && last.item.title === it.title && (last.item.state ?? "") === (it.state ?? "");
    const said = (it.summary ?? "").trim();
    const lastSaid = same ? (last!.item.summary ?? "").trim() : "";
    if (same && !said && lastSaid) {
      last!.items.push(it);
    } else if (same && said === lastSaid) {
      last!.items.push(it);
      last!.count += 1;
    } else {
      out.push({ item: it, count: 1, items: [it] });
    }
  }
  return out;
}

/**
 * Drops publish chips whose artifact the owner later deleted (an
 * `artifact.deleted` chip in the same feed names the id). The shelf no
 * longer holds them, so Today must not show them as if Ghost still did.
 * With hideTombstones the removal chips go too, for views where a deleted
 * thing reads as gone entirely rather than as an audit trail.
 */
export function withoutDeletedArtifacts(items: ActivityChip[], hideTombstones = false): ActivityChip[] {
  const deleted = new Set(
    items
      .filter((c) => c.kind === "artifact.deleted" && (c.artifact_id ?? "").trim() !== "")
      .map((c) => c.artifact_id as string),
  );
  if (deleted.size === 0 && !hideTombstones) return items;
  return items.filter((c) => {
    if (c.kind === "artifact.deleted") return !hideTombstones;
    const id = (c.artifact_id ?? "").trim();
    return id === "" || !deleted.has(id);
  });
}
