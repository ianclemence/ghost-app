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
  | { type: "code"; language: string; code: string };

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
} as const;

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
  }
}
