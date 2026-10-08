/**
 * Inline code beside ordinary words, without inline views.
 *
 * A pill drawn as a View inside a line of text was laid over its neighbours: the
 * text engine reserved a slot for it before the monospace face was applied, so
 * the slot came out narrower than the pill and the next word started inside it.
 * No width we could compute on our side fixed that on every device.
 *
 * A paragraph that holds inline code is therefore laid out as a wrapping row of
 * its own pieces instead: each word is its own Text, each code span its own
 * pill, and the row wraps them at whatever width the screen has. Every piece is
 * measured by itself with its real font, so nothing can overlap, and the pill
 * is a real rounded box that sizes itself to its text. This module is the part
 * that is not drawing: it turns the paragraph's pieces into that row's items.
 */

/** One piece of a paragraph as the renderer produced it. */
export type Seg<T = unknown> =
  | { kind: "text"; text: string; style?: unknown; press?: unknown }
  | { kind: "pill"; node: T }
  | { kind: "other"; node: T }
  | { kind: "break" };

/** One item of the wrapping row. `space` means a space follows it. */
export type FlowItem<T = unknown> =
  | { kind: "word"; text: string; style?: unknown; press?: unknown; space: boolean }
  | { kind: "pill"; node: T; space: boolean }
  | { kind: "other"; node: T; space: boolean }
  | { kind: "break" };

/**
 * Words and spaces from pieces. A space between two pieces is kept (`"a "` then
 * a pill), and none is invented where there was none (`` `ls`: `` keeps its
 * colon against the code). Runs of whitespace, soft line breaks included, are
 * one space. A hard break ends the line.
 */
export function flow<T = unknown>(segs: Seg<T>[]): FlowItem<T>[] {
  const out: FlowItem<T>[] = [];
  const spaceBefore = () => {
    const last = out[out.length - 1];
    if (last && last.kind !== "break") last.space = true;
  };
  for (const s of segs) {
    if (s.kind === "break") {
      out.push({ kind: "break" });
      continue;
    }
    if (s.kind === "pill" || s.kind === "other") {
      out.push({ kind: s.kind, node: s.node, space: false });
      continue;
    }
    for (const part of s.text.split(/(\s+)/)) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) spaceBefore();
      else out.push({ kind: "word", text: part, style: s.style, press: s.press, space: false });
    }
  }
  // Nothing follows the last item.
  const last = out[out.length - 1];
  if (last && last.kind !== "break") last.space = false;
  return out;
}

/** Whether a paragraph needs the row at all: only one with inline code does. */
export function hasPill(segs: Seg[]): boolean {
  return segs.some((s) => s.kind === "pill");
}

/** The width of one space for text of this size. */
export function spaceWidth(fontSize: number | undefined): number {
  return Math.round((fontSize ?? 17) * 0.27 * 10) / 10;
}

/**
 * Items that must stay together on a line: one that has no space after it is
 * glued to the next (`` `ls`: `` or `(see )` never split across a line break).
 * A break ends a group.
 */
export function glue<T>(items: FlowItem<T>[]): FlowItem<T>[][] {
  const groups: FlowItem<T>[][] = [];
  let open = false;
  for (const it of items) {
    if (open && it.kind !== "break") groups[groups.length - 1].push(it);
    else groups.push([it]);
    open = it.kind !== "break" && !it.space;
  }
  return groups;
}
