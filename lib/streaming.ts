/**
 * Streaming-safe markdown preparation.
 *
 * markdown-it tolerates partial input without crashing, but it renders
 * half-written constructs literally: an unclosed `**bold` shows asterisks,
 * an open ``` fence swallows the rest of the message into a code block.
 * During streaming that reads as flicker and raw-markup flashes.
 *
 * prepareStreamingMarkdown() rewrites the TAIL of an in-progress message
 * so incomplete constructs never reach the renderer:
 * - Unclosed inline markers (`**`, `*`, `` ` ``, `~~`) are auto-closed.
 * - An unclosed ``` fence (and everything from it) is held back until
 *   the fence closes.
 * - A table without a separator row, or a dangling final row, is held
 *   back until complete.
 * - An unclosed `[text](url` link renders as its text.
 *
 * Completed messages pass through untouched: only call this while the
 * turn is still streaming.
 */

const INLINE_CLOSERS: [string, string][] = [
  ["**", "**"],
  ["__", "__"],
  ["~~", "~~"],
  ["`", "`"],
];

function countOccurrences(line: string, marker: string): number {
  let count = 0;
  let i = 0;
  while ((i = line.indexOf(marker, i)) >= 0) {
    count++;
    i += marker.length;
  }
  return count;
}

/** Auto-close an unclosed trailing inline marker, if any. */
export function closeInlineMarkers(text: string): string {
  // Never touch content inside fenced blocks — the block filter owns it.
  const lines = text.split("\n");
  if (findLastOpenFenceLine(lines) >= 0) return text;
  const idx = text.lastIndexOf("\n");
  const headText = idx >= 0 ? text.slice(0, idx + 1) : "";
  const last = idx >= 0 ? text.slice(idx + 1) : text;
  for (const [marker, closer] of INLINE_CLOSERS) {
    if (countOccurrences(last, marker) % 2 === 1) return headText + last + closer;
  }
  // A lone single star only counts once double-stars are removed, so
  // balanced bold never trips it (and snake_case stays untouched). A
  // leading list marker ("* item") is not an opener either.
  const withoutBold = last.split("**").join("");
  const withoutListMarker = withoutBold.replace(/^\s*\*\s+/, "");
  if (countOccurrences(withoutListMarker, "*") % 2 === 1) {
    return headText + last + "*";
  }
  // Unclosed link: [text](url-so-far → render the text, hold the URL.
  const linkAt = last.lastIndexOf("[");
  const linkOpen = linkAt >= 0 ? last.slice(linkAt).match(/^\[([^\]]+)\]\([^)\s]*$/) : null;
  if (linkOpen) return headText + last.slice(0, linkAt) + linkOpen[1];
  return text;
}

function fenceMarker(line: string): { fence: string } | null {
  const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
  return m ? { fence: m[1][0] } : null;
}

/** Index of the line holding an UNCLOSED fence marker, or -1. */
function findLastOpenFenceLine(lines: string[]): number {
  let open = -1;
  let fence = "";
  lines.forEach((line, i) => {
    const m = fenceMarker(line);
    if (!m) return;
    if (open < 0) {
      open = i;
      fence = m.fence;
    } else if (m.fence === fence) {
      open = -1;
      fence = "";
    }
  });
  return open;
}

/** True when lines[i..] form a complete table (header + separator). */
function tableComplete(block: string[]): boolean {
  const rows = block.filter((l) => l.trim().startsWith("|"));
  if (rows.length < 2) return false;
  return /^\|?[\s:|\-]+\|?$/.test(rows[1].trim()) && rows[1].includes("-");
}

/**
 * Renderable markdown for an in-progress stream: completed content plus
 * auto-closed inline tail, with incomplete trailing blocks held back.
 */
export function prepareStreamingMarkdown(text: string): string {
  if (!text) return text;
  const lines = text.split("\n");

  // 1. Unclosed fence: hold everything from the open marker.
  const openFence = findLastOpenFenceLine(lines);
  let visible = openFence >= 0 ? lines.slice(0, openFence) : lines;

  // 2. Trailing table block without a separator, or with a dangling row:
  // hold the whole block until it completes.
  const tableStart = (() => {
    let start = -1;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].trim().startsWith("|")) start = i;
      else if (visible[i].trim() === "") break;
      else break;
    }
    return start;
  })();
  if (tableStart >= 0 && !tableComplete(visible.slice(tableStart))) {
    visible = visible.slice(0, tableStart);
  }

  // 3. Unclosed $$ math block: hold from the opener.
  const joined = visible.join("\n");
  const mathOpens = (joined.match(/\$\$/g) ?? []).length;
  if (mathOpens % 2 === 1) {
    const idx = joined.lastIndexOf("$$");
    return closeInlineMarkers(joined.slice(0, idx).replace(/\s+$/, ""));
  }

  return closeInlineMarkers(visible.join("\n"));
}
