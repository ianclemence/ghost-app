/**
 * The blocks a presented card is built from, as the phone reads them. The Pod
 * validates a card against the same catalog before it is ever sent; this is the
 * phone's own defence for anything that arrives anyway: an unknown block is
 * skipped, a field that is too long is cut, a tone it does not know becomes
 * neutral, and nothing here can crash the screen. The two sides are pinned
 * together by lib/cards-contract.json, which the Pod tests too.
 *
 * Pure (no React Native imports) so it is testable.
 */
export type Tone = "neutral" | "good" | "warn" | "bad" | "info";
export type StepState = "done" | "now" | "next";

export type Block =
  | { type: "text"; text: string }
  | { type: "note"; text: string; tone: Tone }
  | { type: "facts"; rows: { label: string; value: string; tone: Tone }[] }
  | { type: "list"; items: { title: string; subtitle?: string; trailing?: string; tone: Tone }[] }
  | { type: "timeline"; steps: { time?: string; title: string; detail?: string; state: StepState | null }[] }
  | { type: "metric"; label: string; value: string; unit?: string; delta?: string; tone: Tone }
  | { type: "progress"; label: string; progress: number; caption?: string }
  | { type: "code"; language: string; code: string }
  | CompareBlock
  | ChartBlock
  | MapBlock
  | InputBlock;

export interface Option { id: string; label: string; detail?: string | undefined }
export interface Check { id: string; label: string; done: boolean }
export type CompareBlock = { type: "compare"; options: { id: string; label: string; detail?: string }[]; rows: { label: string; values: string[]; tone: Tone }[]; pick: number | null };
export type ChartBlock = { type: "chart"; chart: "bar" | "line"; label: string; points: { label: string; value: number }[]; unit?: string; caption?: string };
export type MapBlock = { type: "map"; places: { name: string; detail?: string; lat: number; lon: number }[] };

/** A block that asks the owner something; its answer comes back under `key`. */
export type InputBlock =
  | { type: "choice"; key: string; label: string; options: Option[]; multiple: boolean }
  | { type: "datetime"; key: string; label: string; mode: "date" | "time" | "datetime"; value?: string; earliest?: string; optional?: boolean }
  | { type: "slider"; key: string; label: string; min: number; max: number; step: number; number: number; unit?: string }
  | { type: "field"; key: string; label: string; placeholder?: string; value?: string; optional: boolean; multiline: boolean }
  | { type: "checklist"; key: string; label?: string; checks: Check[] };

export const isInput = (b: Block): b is InputBlock =>
  b.type === "choice" || b.type === "datetime" || b.type === "slider" || b.type === "field" || b.type === "checklist";

/** The Pod's limits (pkg/cards/blocks.go), mirrored. */
export const LIMITS = {
  blocks: 8,
  text: 400,
  label: 60,
  value: 80,
  rows: 10,
  items: 12,
  steps: 8,
  codeChars: 1200,
  codeLines: 40,
  language: 20,
  actionText: 200,
  options: 8,
  compare: 4,
  compareRows: 8,
  checks: 20,
  points: 24,
  places: 10,
  answerText: 400,
} as const;

const ID = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
const DATE_FORMS = { date: /^\d{4}-\d{2}-\d{2}$/, time: /^\d{2}:\d{2}$/, datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ } as const;

const TONES = new Set<string>(["neutral", "good", "warn", "bad", "info"]);
const STATES = new Set<string>(["done", "now", "next"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A single-line string cut to max, or "" when it is not a string. */
function str(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const t = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, "").trim();
  return Array.from(t).slice(0, max).join("");
}

const line = (v: unknown, max: number) => str(typeof v === "string" ? v.replace(/\s+/g, " ") : v, max);

function tone(v: unknown): Tone {
  return typeof v === "string" && TONES.has(v) ? (v as Tone) : "neutral";
}

/** One block, or null when it is not one the phone knows how to draw. */
export function parseBlock(raw: unknown): Block | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case "text": {
      const text = str(raw.text, LIMITS.text);
      return text ? { type: "text", text } : null;
    }
    case "note": {
      const text = str(raw.text, LIMITS.text);
      return text ? { type: "note", text, tone: tone(raw.tone) } : null;
    }
    case "facts": {
      const rows = (Array.isArray(raw.rows) ? raw.rows : [])
        .slice(0, LIMITS.rows)
        .map((r) => (isObj(r) ? { label: line(r.label, LIMITS.label), value: line(r.value, LIMITS.value), tone: tone(r.tone) } : null))
        .filter((r): r is { label: string; value: string; tone: Tone } => !!r && !!r.label && !!r.value);
      return rows.length ? { type: "facts", rows } : null;
    }
    case "list": {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .slice(0, LIMITS.items)
        .map((r) => {
          if (!isObj(r)) return null;
          const title = line(r.title, LIMITS.value);
          if (!title) return null;
          return {
            title,
            subtitle: line(r.subtitle, LIMITS.value * 2) || undefined,
            trailing: line(r.trailing, LIMITS.label) || undefined,
            tone: tone(r.tone),
          };
        })
        .filter((r): r is NonNullable<typeof r> => !!r);
      return items.length ? { type: "list", items } : null;
    }
    case "timeline": {
      const steps = (Array.isArray(raw.steps) ? raw.steps : [])
        .slice(0, LIMITS.steps)
        .map((r) => {
          if (!isObj(r)) return null;
          const title = line(r.title, LIMITS.value);
          if (!title) return null;
          return {
            time: line(r.time, LIMITS.label) || undefined,
            title,
            detail: line(r.detail, LIMITS.value * 2) || undefined,
            state: typeof r.state === "string" && STATES.has(r.state) ? (r.state as StepState) : null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => !!r);
      return steps.length ? { type: "timeline", steps } : null;
    }
    case "metric": {
      const label = line(raw.label, LIMITS.label);
      const value = line(raw.value, 24);
      if (!label || !value) return null;
      return { type: "metric", label, value, unit: line(raw.unit, 16) || undefined, delta: line(raw.delta, 24) || undefined, tone: tone(raw.tone) };
    }
    case "progress": {
      const label = line(raw.label, LIMITS.label);
      const p = typeof raw.progress === "number" && isFinite(raw.progress) ? raw.progress : null;
      if (!label || p === null) return null;
      return { type: "progress", label, progress: Math.min(1, Math.max(0, p)), caption: line(raw.caption, LIMITS.value) || undefined };
    }
    case "code": {
      const code = str(typeof raw.code === "string" ? raw.code.replace(/\r\n/g, "\n") : "", LIMITS.codeChars);
      if (!code) return null;
      const lines = code.split("\n");
      const lang = typeof raw.language === "string" ? raw.language.toLowerCase().trim() : "";
      return {
        type: "code",
        language: /^[a-z0-9+#.\-]{0,20}$/.test(lang) ? lang : "",
        code: lines.slice(0, LIMITS.codeLines).join("\n"),
      };
    }
    case "compare": {
      const options = (Array.isArray(raw.options) ? raw.options : []).slice(0, LIMITS.compare)
        .map((o, i) => (isObj(o) && line(o.label, 40) ? { id: typeof o.id === "string" && ID.test(o.id) ? o.id : String(i + 1), label: line(o.label, 40), detail: line(o.detail, LIMITS.label) || undefined } : null))
        .filter((o): o is NonNullable<typeof o> => !!o);
      if (options.length < 2) return null;
      const rows = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, LIMITS.compareRows)
        .map((r) => {
          if (!isObj(r) || !line(r.label, 40) || !Array.isArray(r.values)) return null;
          const values = options.map((_, i) => line((r.values as unknown[])[i], 40));
          return { label: line(r.label, 40), values, tone: tone(r.tone) };
        })
        .filter((r): r is NonNullable<typeof r> => !!r);
      if (!rows.length) return null;
      const pick = typeof raw.pick === "number" && Number.isInteger(raw.pick) && raw.pick >= 0 && raw.pick < options.length ? raw.pick : null;
      return { type: "compare", options, rows, pick };
    }
    case "chart": {
      const label = line(raw.label, LIMITS.label);
      const points = (Array.isArray(raw.points) ? raw.points : []).slice(0, LIMITS.points)
        .map((p) => (isObj(p) && line(p.label, 16) && num(p.value) !== null ? { label: line(p.label, 16), value: p.value as number } : null))
        .filter((p): p is NonNullable<typeof p> => !!p);
      if (!label || points.length < 2) return null;
      return { type: "chart", chart: raw.chart === "line" ? "line" : "bar", label, points, unit: line(raw.unit, 12) || undefined, caption: line(raw.caption, LIMITS.value) || undefined };
    }
    case "map": {
      const places = (Array.isArray(raw.places) ? raw.places : []).slice(0, LIMITS.places)
        .map((p) => {
          if (!isObj(p)) return null;
          const name = line(p.name, LIMITS.label);
          const lat = num(p.lat), lon = num(p.lon);
          if (!name || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
          return { name, detail: line(p.detail, LIMITS.value) || undefined, lat, lon };
        })
        .filter((p): p is NonNullable<typeof p> => !!p);
      return places.length ? { type: "map", places } : null;
    }
    case "choice": {
      const key = typeof raw.key === "string" && ID.test(raw.key) ? raw.key : "";
      const label = line(raw.label, LIMITS.label);
      const options = (Array.isArray(raw.options) ? raw.options : []).slice(0, LIMITS.options)
        .map((o, i): Option | null => (isObj(o) && line(o.label, LIMITS.label) ? { id: typeof o.id === "string" && ID.test(o.id) ? o.id : String(i + 1), label: line(o.label, LIMITS.label), detail: line(o.detail, LIMITS.value) || undefined } : null))
        .filter((o): o is Option => !!o);
      if (!key || !label || options.length < 2) return null;
      return { type: "choice", key, label, options, multiple: raw.multiple === true };
    }
    case "datetime": {
      const key = typeof raw.key === "string" && ID.test(raw.key) ? raw.key : "";
      const label = line(raw.label, LIMITS.label);
      const mode = raw.mode === "date" || raw.mode === "time" ? raw.mode : "datetime";
      if (!key || !label) return null;
      const form = DATE_FORMS[mode];
      const value = typeof raw.value === "string" && form.test(raw.value) ? raw.value : undefined;
      const earliest = typeof raw.earliest === "string" && form.test(raw.earliest) ? raw.earliest : undefined;
      return { type: "datetime", key, label, mode, value, earliest, ...(raw.optional === true ? { optional: true } : {}) };
    }
    case "slider": {
      const key = typeof raw.key === "string" && ID.test(raw.key) ? raw.key : "";
      const label = line(raw.label, LIMITS.label);
      const min = num(raw.min), max = num(raw.max);
      if (!key || !label || min === null || max === null || min >= max) return null;
      const stepRaw = num(raw.step);
      const step = stepRaw !== null && stepRaw > 0 && stepRaw <= max - min && (max - min) / stepRaw <= 1000 ? stepRaw : 1;
      const start = num(raw.number);
      const number = start !== null && start >= min && start <= max ? start : min;
      return { type: "slider", key, label, min, max, step, number, unit: line(raw.unit, 16) || undefined };
    }
    case "field": {
      const key = typeof raw.key === "string" && ID.test(raw.key) ? raw.key : "";
      const label = line(raw.label, LIMITS.label);
      if (!key || !label) return null;
      return {
        type: "field", key, label,
        placeholder: line(raw.placeholder, 80) || undefined,
        value: str(raw.value, LIMITS.answerText) || undefined,
        optional: raw.optional === true,
        multiline: raw.multiline === true,
      };
    }
    case "checklist": {
      const key = typeof raw.key === "string" && ID.test(raw.key) ? raw.key : "";
      const checks = (Array.isArray(raw.checks) ? raw.checks : []).slice(0, LIMITS.checks)
        .map((c, i): Check | null => (isObj(c) && line(c.label, LIMITS.value) ? { id: typeof c.id === "string" && ID.test(c.id) ? c.id : String(i + 1), label: line(c.label, LIMITS.value), done: c.done === true } : null))
        .filter((c): c is Check => !!c);
      if (!key || !checks.length) return null;
      return { type: "checklist", key, label: line(raw.label, LIMITS.label) || undefined, checks };
    }
    default:
      return null;
  }
}

/** The blocks of a card: known ones only, in order, at most eight. */
export function parseBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const r of raw) {
    const b = parseBlock(r);
    if (b) out.push(b);
    if (out.length >= LIMITS.blocks) break;
  }
  return out;
}

/** The plain-text form of a block, for screen readers. */
export function blockSpeech(b: Block): string {
  switch (b.type) {
    case "text":
    case "note":
      return b.text;
    case "facts":
      return b.rows.map((r) => `${r.label}: ${r.value}`).join(". ");
    case "list":
      return b.items.map((i) => [i.title, i.subtitle, i.trailing].filter(Boolean).join(", ")).join(". ");
    case "timeline":
      return b.steps.map((s) => [s.time, s.title, s.detail, s.state === "now" ? "now" : s.state === "done" ? "done" : null].filter(Boolean).join(" ")).join(". ");
    case "metric":
      return `${b.label}: ${b.value}${b.unit ? " " + b.unit : ""}${b.delta ? ", " + b.delta : ""}`;
    case "progress":
      return `${b.label}: ${Math.round(b.progress * 100)} percent${b.caption ? ", " + b.caption : ""}`;
    case "code":
      return `${b.language || "code"} snippet`;
    case "compare":
      return `Comparing ${b.options.map((o) => o.label).join(", ")}. ` + b.rows.map((r) => `${r.label}: ${r.values.join(", ")}`).join(". ") + (b.pick !== null ? `. Recommended: ${b.options[b.pick].label}` : "");
    case "chart":
      return `${b.label}: ` + b.points.map((p) => `${p.label} ${p.value}${b.unit ?? ""}`).join(", ");
    case "map":
      return b.places.map((p) => [p.name, p.detail].filter(Boolean).join(", ")).join(". ");
    case "choice":
      return `${b.label}: ${b.options.map((o) => o.label).join(", ")}`;
    case "datetime":
    case "slider":
    case "field":
      return b.label;
    case "checklist":
      return [b.label, ...b.checks.map((c) => `${c.label}${c.done ? ", done" : ""}`)].filter(Boolean).join(". ");
  }
}
