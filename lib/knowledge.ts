/**
 * How what the owner reads and studies reads on the phone. Pure.
 */
import type { Learning } from "./ghostApi";

const UNIT: Record<string, [string, string]> = {
  page: ["page", "pages"], chapter: ["chapter", "chapters"], lesson: ["lesson", "lessons"], module: ["module", "modules"],
  episode: ["episode", "episodes"], unit: ["unit", "units"],
};

/** "Page 140 of 443", "Lesson 6", "40%", or null. */
export function progressText(l: Pick<Learning, "current" | "total" | "unit">): string | null {
  const cur = l.current ?? 0;
  const tot = l.total ?? 0;
  if (!cur && !tot) return null;
  if (l.unit === "percent") return `${cur}%`;
  const word = (UNIT[l.unit ?? "page"] ?? UNIT.page)[0];
  const cap = word.charAt(0).toUpperCase() + word.slice(1);
  if (!cur && tot) return `${tot} ${(UNIT[l.unit ?? "page"] ?? UNIT.page)[1]}`;
  return tot ? `${cap} ${cur} of ${tot}` : `${cap} ${cur}`;
}

/** How far along, 0 to 1, or null when it can't be said. */
export function fraction(l: Pick<Learning, "current" | "total" | "unit" | "status">): number | null {
  if (l.status === "done") return 1;
  if (l.unit === "percent") return Math.max(0, Math.min(1, (l.current ?? 0) / 100));
  if (!l.total) return null;
  return Math.max(0, Math.min(1, (l.current ?? 0) / l.total));
}

export const KIND_WORD: Record<string, string> = {
  book: "Book", course: "Course", subject: "Studying", article: "Article", podcast: "Podcast", video: "Video", paper: "Paper", other: "Learning",
};

/** "Exam in 6 days", "Due tomorrow", "Was due 2 days ago", or null. */
export function dueText(due: string | undefined, now = new Date()): { text: string; tone: "warn" | "neutral" | "bad" } | null {
  if (!due) return null;
  const d = new Date(`${due}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: `Was due ${-days === 1 ? "yesterday" : `${-days} days ago`}`, tone: "bad" };
  if (days === 0) return { text: "Due today", tone: "warn" };
  if (days === 1) return { text: "Due tomorrow", tone: "warn" };
  if (days <= 14) return { text: `Due in ${days} days`, tone: "warn" };
  return { text: `Due ${d.toLocaleDateString([], { day: "numeric", month: "short" })}`, tone: "neutral" };
}

/** The list in its sections, each only when it has something. */
export function sections(items: Learning[]): { title: string; items: Learning[] }[] {
  const by = (s: Learning["status"]) => items.filter((l) => l.status === s);
  return [
    { title: "Reading and studying", items: by("active") },
    { title: "Want to", items: by("want") },
    { title: "Paused", items: by("paused") },
    { title: "Finished", items: by("done") },
  ].filter((g) => g.items.length > 0);
}
