/**
 * Sizing for tables in a reply.
 *
 * A phone screen is narrow and a table isn't. Squeezing every column to fit
 * makes each one unreadable, so columns are sized to what is in them and the
 * the columns then share the screen, wrapping their text. A table with too
 * many columns for that is shown as stacked rows. Nothing scrolls sideways.
 */

/** Just enough of the markdown tree to read a table. */
export interface TableNode {
  type?: string;
  content?: string;
  children?: TableNode[];
}

export const MIN_COL = 84;
export const MAX_COL = 240;
const CHAR = 7.8; // a body-size character, on average (Inter)
const WORD = 10.2; // the widest a character in a word can be (semibold capitals)
const PAD = 28; // horizontal padding inside a cell

/** The text a node holds, in reading order. */
export function nodeText(n: TableNode): string {
  if (!n) return "";
  if (n.type === "softbreak" || n.type === "hardbreak") return " ";
  const own = n.content ?? "";
  const kids = (n.children ?? []).map(nodeText).join("");
  return kids || own;
}

/** A table's cells as rows of plain text; the first row is the header. */
export function tableRows(table: TableNode): string[][] {
  const rows: string[][] = [];
  const walk = (n: TableNode) => {
    if (n.type === "tr") rows.push((n.children ?? []).map((c) => nodeText(c).trim()));
    else (n.children ?? []).forEach(walk);
  };
  walk(table);
  return rows;
}

const NUMBER = /^[\s~≈<>+\-−]*[$€£¥₹฿]?\s*[+\-−]?\d[\d,.\s]*(?:[kKmMbB]|%|\s?(?:usd|thb|eur|gbp|kg|km|mb|gb|ms|s|m|h|d|x))?\s*$/i;

export function isNumeric(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 18 && NUMBER.test(t);
}

export interface TableModel {
  /** The cells as plain text, header first, for showing a table as stacked rows. */
  rows: string[][];
  /** Natural width of each column. */
  widths: number[];
  /** The least each column can take without breaking a word in two. */
  mins: number[];
  /** Columns that hold numbers, which read better aligned right. */
  numeric: boolean[];
}

export function measureTable(rows: string[][]): TableModel {
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const widths: number[] = [];
  const mins: number[] = [];
  const numeric: boolean[] = [];
  for (let c = 0; c < cols; c++) {
    let longest = 0;
    let widestWord = 0;
    for (const r of rows) {
      const t = r[c] ?? "";
      longest = Math.max(longest, t.length);
      for (const w of t.split(/\s+/)) widestWord = Math.max(widestWord, w.length);
    }
    const byText = longest * CHAR + PAD;
    const byWord = widestWord * WORD + PAD;
    widths.push(Math.round(Math.min(MAX_COL, Math.max(MIN_COL, byText, byWord))));
    mins.push(Math.round(Math.min(MAX_COL, Math.max(FLOOR_COL, byWord))));
    const body = rows.slice(1).map((r) => r[c] ?? "").filter((t) => t.trim() !== "");
    numeric.push(body.length > 0 && body.every(isNumeric));
  }
  return { rows, widths, mins, numeric };
}

/** The narrowest a column may be squeezed to when nothing says otherwise. */
export const FLOOR_COL = 72;

/**
 * Column widths that fit the room available, so a table never scrolls sideways:
 * scaled up to fill it when narrower, and squeezed (text wraps) when wider, with
 * short columns left alone and the long ones giving way first. No column goes
 * below its floor (by default FLOOR_COL; pass each column's widest word so a
 * word is never broken in two). Returns null when the floors alone don't fit,
 * which means the table is better shown as stacked rows. Before the room is
 * known, the natural widths.
 */
export function fitWidths(natural: number[], available: number, mins?: number[]): number[] | null {
  const total = natural.reduce((a, b) => a + b, 0);
  if (!(available > 0) || total === 0) return natural;
  if (total <= available) {
    const k = available / total;
    const scaled = natural.map((w) => Math.floor(w * k));
    scaled[scaled.length - 1] += available - scaled.reduce((a, b) => a + b, 0);
    return scaled;
  }
  const floor = natural.map((_, i) => Math.min(natural[i], mins?.[i] ?? FLOOR_COL));
  if (floor.reduce((a, b) => a + b, 0) > available) return null;
  const fixed = new Set<number>();
  let k = 1;
  for (let pass = 0; pass <= natural.length; pass++) {
    const fixedSum = [...fixed].reduce((a, i) => a + floor[i], 0);
    const free = natural.reduce((sum, w, i) => (fixed.has(i) ? sum : sum + w), 0);
    k = (available - fixedSum) / free;
    let grew = false;
    natural.forEach((w, i) => {
      if (!fixed.has(i) && w * k < floor[i]) {
        fixed.add(i);
        grew = true;
      }
    });
    if (!grew) break;
  }
  const out = natural.map((w, i) => (fixed.has(i) ? floor[i] : Math.floor(w * k)));
  out[out.length - 1] += available - out.reduce((a, b) => a + b, 0);
  return out;
}
