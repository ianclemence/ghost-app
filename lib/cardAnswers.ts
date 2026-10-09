/**
 * The owner's answers to a card that asks, while they are still answering it.
 *
 * The Pod checks every answer against the card before it counts (pkg/cards
 * inputs.go); this mirrors those rules so the Send button can say what is still
 * missing before anything is sent, never so the phone can decide. Pure, so it
 * is testable.
 */
import type { Block, InputBlock } from "./blocks";
import { isInput } from "./blocks";

export type AnswerValue = string | string[] | number | undefined;
export type Answers = Record<string, AnswerValue>;

/** Where each input starts: the card's own suggestion, or empty. */
export function initialAnswers(blocks: Block[]): Answers {
  const out: Answers = {};
  for (const b of blocks) {
    if (!isInput(b)) continue;
    switch (b.type) {
      case "choice":
        out[b.key] = b.multiple ? [] : undefined;
        break;
      case "datetime":
        out[b.key] = b.value;
        break;
      case "slider":
        out[b.key] = b.number;
        break;
      case "field":
        out[b.key] = b.value ?? "";
        break;
      case "checklist":
        out[b.key] = b.checks.filter((c) => c.done).map((c) => c.id);
        break;
    }
  }
  return out;
}

/** The answers as the Pod reads them: strings trimmed, empty optional ones left out. */
export function answerPayload(blocks: Block[], answers: Answers): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const b of blocks) {
    if (!isInput(b)) continue;
    const v = answers[b.key];
    if (v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) continue;
      out[b.key] = t;
    } else {
      out[b.key] = v;
    }
  }
  return out;
}

const word = (b: InputBlock) => ("label" in b && b.label ? b.label : "This");

/**
 * What still stops the card from being sent, in the owner's words, or null.
 * A question with choices is answered by a pick or by words in the box beside it.
 */
export function answerProblem(blocks: Block[], answers: Answers, opts: { question?: boolean } = {}): string | null {
  const other = typeof answers.other === "string" ? answers.other.trim() : "";
  for (const b of blocks) {
    if (!isInput(b)) continue;
    const v = answers[b.key];
    switch (b.type) {
      case "choice":
        if (opts.question && other) break;
        if (!b.multiple && (typeof v !== "string" || !v)) return `${word(b)}: pick one`;
        break;
      case "datetime":
        if ((typeof v !== "string" || !v) && b.optional) break;
        if (typeof v !== "string" || !v) return `${word(b)}: choose a ${b.mode === "datetime" ? "date and time" : b.mode}`;
        if (b.earliest && v < b.earliest) return `${word(b)}: that's too early`;
        break;
      case "field":
        if (!b.optional && (typeof v !== "string" || !v.trim())) return `${word(b)}: write something`;
        if (typeof v === "string" && v.trim().length > 400) return `${word(b)}: keep it under 400 characters`;
        break;
      case "slider":
      case "checklist":
        break;
    }
  }
  return null;
}

/** A slider value snapped to its step and kept in range. */
export function snap(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const n = Math.round((clamped - min) / step);
  // Round away float noise (0.1 + 0.2) so the Pod's step check agrees.
  return Math.min(max, Number((min + n * step).toFixed(6)));
}

// ─── dates and times, the way the picker and the card say them ───────────

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-12" for a local date. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A local Date from "2026-10-12", "14:30" (today) or "2026-10-12T14:30". */
export function parseLocal(v: string | undefined, now = new Date()): Date | null {
  if (!v) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  m = /^(\d{2}):(\d{2})$/.exec(v);
  if (m) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2]);
  return null;
}

/** The value a datetime block sends, in its own form. */
export function formatValue(mode: "date" | "time" | "datetime", d: Date): string {
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (mode === "date") return dateKey(d);
  if (mode === "time") return t;
  return `${dateKey(d)}T${t}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri 16 Oct", "19:30" or "Fri 16 Oct, 19:30": the year only when it is not this one. */
export function humanValue(mode: "date" | "time" | "datetime", v: string | undefined, now = new Date()): string {
  const d = parseLocal(v, now);
  if (!d) return "";
  const day = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (mode === "date") return day;
  if (mode === "time") return time;
  return `${day}, ${time}`;
}

/** The weeks of a month for a calendar grid: 6 rows of 7 days (Monday first), null outside the month. */
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
