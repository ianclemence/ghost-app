/**
 * Sizing for tables in a reply.
 *
 * A phone screen is narrow and a table isn't. Squeezing every column to fit
 * makes each one unreadable, so columns are sized to what is in them and the
 * table scrolls sideways when it is wider than the screen. When it is
 * narrower, the columns share the extra room so it doesn't look lost.
 */

/** Just enough of the markdown tree to read a table. */
export interface TableNode {
  type?: string;
  content?: string;
  children?: TableNode[];
}

export const MIN_COL = 84;
export const MAX_COL = 240;
const CHAR = 7.4; // a body-size character, on average
const WORD = 8.2; // the widest a character in a word can be
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
  /** Natural width of each column. */
  widths: number[];
  /** Columns that hold numbers, which read better aligned right. */
  numeric: boolean[];
}

export function measureTable(rows: string[][]): TableModel {
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const widths: number[] = [];
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
    const body = rows.slice(1).map((r) => r[c] ?? "").filter((t) => t.trim() !== "");
    numeric.push(body.length > 0 && body.every(isNumeric));
  }
  return { widths, numeric };
}

/**
 * Column widths to draw at, given the room available: scaled up to fill it
 * when the table is narrower, left as they are (so it scrolls) when wider.
 */
export function fitWidths(natural: number[], available: number): number[] {
  const total = natural.reduce((a, b) => a + b, 0);
  if (!(available > 0) || total >= available || total === 0) return natural;
  const k = available / total;
  const scaled = natural.map((w) => Math.floor(w * k));
  scaled[scaled.length - 1] += available - scaled.reduce((a, b) => a + b, 0);
  return scaled;
}

export function isWiderThan(widths: number[], available: number): boolean {
  return available > 0 && widths.reduce((a, b) => a + b, 0) > available + 1;
}
