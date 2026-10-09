/**
 * What Ghost is watching, in the owner's words. Pure, so it is testable.
 */
import type { WatchItem } from "./ghostApi";

/** "Under 25,000", "Back in stock", "When “Sold out” goes away". */
export function watchWant(w: Pick<WatchItem, "kind" | "rule">): string {
  const r = w.rule;
  if (!r) return w.kind === "flight" ? "Delays, gates and times" : "Any change";
  switch (r.want) {
    case "below":
      return `At or under ${r.threshold !== undefined ? r.threshold.toLocaleString("en-US") : "your price"}`;
    case "drop":
      return "Any price drop";
    case "stock":
      return "Back in stock";
    case "appears":
      return r.phrase ? `When “${r.phrase}” appears` : "When it appears";
    case "disappears":
      return r.phrase ? `When “${r.phrase}” goes away` : "When it goes away";
  }
  return "Any change";
}

/** The page's site, or the watch's own name. */
export function watchName(w: Pick<WatchItem, "label" | "entity" | "url">): string {
  if (w.label) return w.label;
  if (w.url) {
    try {
      return new URL(w.url).hostname.replace(/^www\./, "");
    } catch {
      // not a URL
    }
  }
  return w.entity || "Something";
}

/** Still being watched (not stopped, finished or failed). */
export function isWatching(w: Pick<WatchItem, "status">): boolean {
  return w.status === "active" || w.status === "snoozed" || w.status === "triggered";
}
