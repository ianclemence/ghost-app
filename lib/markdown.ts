/**
 * Pure Markdown helpers shared by the chat renderer.
 *
 * Everything here is UI-free so it can be unit tested directly: the
 * components in components/markdown-rules.tsx only turn these decisions
 * into React elements.
 */

/** Language token from a fence info string ("```go title" → "go"). */
export function fenceLanguage(info: string | null | undefined): string {
  const t = (info ?? "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0].toLowerCase();
}

export interface TaskMarker {
  checked: boolean;
  /** Content after the marker, with the separator space removed. */
  rest: string;
}

/**
 * GFM task marker at the start of a list item's text: `[ ]` or `[x]`.
 * Returns null when the text is not a task item.
 */
export function parseTaskMarker(content: string): TaskMarker | null {
  const m = /^\[([ xX])\]\s+/.exec(content ?? "");
  if (!m) return null;
  return { checked: m[1].toLowerCase() === "x", rest: content.slice(m[0].length) };
}

/** Display label for a fence: its language, or "code" when unspecified. */
export function codeLabel(info: string | null | undefined): string {
  return fenceLanguage(info) || "code";
}

/**
 * Bounded copy of diagram source for the accessible fallback: never the
 * whole payload, never empty.
 */
export function boundedDiagramFallback(source: string, maxLines = 12): string {
  const lines = source.split("\n").filter((l) => l.trim() !== "");
  if (lines.length <= maxLines) return lines.join("\n");
  return lines.slice(0, maxLines).join("\n") + "\n…";
}
