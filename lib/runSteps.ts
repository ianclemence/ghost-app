/**
 * What Ghost did while it worked, as the owner reads it.
 *
 * The Pod announces each tool call as it starts and again as it ends (tool_start,
 * tool_result). This module keeps those as an ordered list of steps and turns
 * the list into words: a one-line summary for the thread ("Searched the web,
 * ran 2 commands (1 failed)"), a present-tense line while it runs, and the
 * title of each step. Nothing here is the model's reasoning: only what ran,
 * what it was about, whether it worked, and how long it took.
 *
 * Older Pods announce only a bare tool_status. Those are folded in as steps
 * that end when the next one begins, so the same UI works against either.
 */

export type StepKind = "search" | "page" | "browser" | "command" | "memory" | "files" | "other";
export type StepState = "running" | "done" | "failed";

export interface RunStep {
  id: string;
  tool: string;
  kind: StepKind;
  state: StepState;
  /** What it was about: the query, the site, the command, the file name. */
  detail?: string;
  /** Why it did not work, in one line. */
  note?: string;
  startedAt: number;
  /** How long it took, once it has ended. */
  ms?: number;
}

const MEMORY = new Set(["remember", "memory_recall", "memory_curate", "memory_correct", "memory_explain", "context_get", "session_search", "oracle"]);
const FILES = new Set(["read_file", "write_file", "edit_file", "append_file", "list_dir", "doc_parser"]);
const COMMAND = new Set(["exec", "sandbox", "spawn"]);

export function stepKind(tool: string): StepKind {
  const t = tool.trim().toLowerCase();
  if (t === "web_search") return "search";
  if (t === "web_fetch") return "page";
  if (t.startsWith("browser_") || t === "screenshot" || t.startsWith("computer_")) return "browser";
  if (COMMAND.has(t)) return "command";
  if (MEMORY.has(t)) return "memory";
  if (FILES.has(t)) return "files";
  return "other";
}

const PAST: Record<string, string> = {
  web_search: "Searched the web",
  web_fetch: "Read a page",
  browser_navigate: "Opened a page",
  browser_click: "Clicked",
  browser_type: "Typed",
  browser_fill: "Filled a field",
  browser_fill_form: "Filled in a form",
  browser_press: "Pressed a key",
  browser_scroll: "Scrolled",
  browser_snapshot: "Read the page",
  browser_screenshot: "Captured the page",
  browser_submit: "Submitted",
  exec: "Ran a command",
  sandbox: "Ran a command",
  spawn: "Ran a command",
  read_file: "Read a file",
  write_file: "Wrote a file",
  edit_file: "Edited a file",
  append_file: "Wrote a file",
  list_dir: "Looked through files",
  schedule: "Set a reminder",
  weather_now: "Checked the weather",
  calendar: "Checked your calendar",
  email_search: "Looked through your email",
  vision: "Looked at an image",
  image_generate: "Made an image",
  canvas: "Built a page",
};

const PRESENT: Record<string, string> = {
  web_search: "Searching the web",
  web_fetch: "Reading a page",
  browser_navigate: "Opening a page",
  browser_click: "Clicking",
  browser_type: "Typing",
  browser_fill: "Filling a field",
  browser_fill_form: "Filling in a form",
  browser_press: "Pressing a key",
  browser_scroll: "Scrolling",
  browser_snapshot: "Reading the page",
  browser_screenshot: "Capturing the page",
  browser_submit: "Submitting",
  exec: "Running a command",
  sandbox: "Running a command",
  spawn: "Running a command",
  read_file: "Reading a file",
  write_file: "Writing a file",
  edit_file: "Editing a file",
  append_file: "Writing a file",
  list_dir: "Looking through files",
  schedule: "Setting a reminder",
  weather_now: "Checking the weather",
  calendar: "Checking your calendar",
  email_search: "Looking through your email",
  vision: "Looking at an image",
  image_generate: "Making an image",
  canvas: "Building a page",
};

const KIND_PAST: Record<StepKind, string> = {
  search: "Searched the web",
  page: "Read a page",
  browser: "Used the browser",
  command: "Ran a command",
  memory: "Checked memory",
  files: "Used your files",
  other: "Used a tool",
};
const KIND_PRESENT: Record<StepKind, string> = {
  search: "Searching the web",
  page: "Reading a page",
  browser: "Using the browser",
  command: "Running a command",
  memory: "Checking memory",
  files: "Working with your files",
  other: "Working on it",
};

/** The step's own title: "Searched the web", or "Searching the web" while it runs. */
export function stepTitle(s: RunStep): string {
  const t = s.tool.trim().toLowerCase();
  if (s.state === "running") return PRESENT[t] ?? KIND_PRESENT[s.kind];
  return PAST[t] ?? KIND_PAST[s.kind];
}

export function startStep(steps: RunStep[], e: { id: string; tool: string; detail?: string; now: number }): RunStep[] {
  if (steps.some((s) => s.id === e.id)) return steps;
  return [...steps, { id: e.id, tool: e.tool, kind: stepKind(e.tool), state: "running", detail: e.detail || undefined, startedAt: e.now }];
}

export function endStep(steps: RunStep[], e: { id: string; ok: boolean; ms?: number; note?: string; now: number }): RunStep[] {
  const i = steps.findIndex((s) => s.id === e.id);
  if (i < 0) return steps;
  const s = steps[i];
  const next = steps.slice();
  next[i] = {
    ...s,
    state: e.ok ? "done" : "failed",
    ms: typeof e.ms === "number" && e.ms >= 0 ? e.ms : Math.max(0, e.now - s.startedAt),
    note: e.ok ? undefined : e.note || undefined,
  };
  return next;
}

/**
 * A bare tool_status from a Pod that does not send tool_start. The previous
 * legacy step ends where this one begins.
 */
export function legacyStep(steps: RunStep[], e: { tool: string; now: number }): RunStep[] {
  const closed = steps.map((s) => (s.state === "running" && s.id.startsWith("legacy-") ? { ...s, state: "done" as const, ms: Math.max(0, e.now - s.startedAt) } : s));
  return startStep(closed, { id: `legacy-${steps.length + 1}`, tool: e.tool, now: e.now });
}

/** The turn is over: nothing is still running. */
export function settleSteps(steps: RunStep[], now: number): RunStep[] {
  if (!steps.some((s) => s.state === "running")) return steps;
  return steps.map((s) => (s.state === "running" ? { ...s, state: "done" as const, ms: Math.max(0, now - s.startedAt) } : s));
}

export function currentStep(steps: RunStep[]): RunStep | null {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].state === "running") return steps[i];
  return null;
}

/** "3.2s", "14s", "1m 19s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 950) return "<1s";
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s - m * 60)).padStart(2, "0")}s`;
}

const MAX_PHRASES = 3;

function phrase(kind: StepKind, n: number): string {
  switch (kind) {
    case "search": return n === 1 ? "searched the web" : `searched the web ${n} times`;
    case "page": return n === 1 ? "read a page" : `read ${n} pages`;
    case "browser": return "browsed the web";
    case "command": return n === 1 ? "ran a command" : `ran ${n} commands`;
    case "memory": return "checked memory";
    case "files": return n === 1 ? "used a file" : `used ${n} files`;
    default: return n === 1 ? "used a tool" : `used ${n} tools`;
  }
}

/**
 * The thread's one line for a run: "Searched the web, ran 2 commands (1
 * failed)". Kinds appear in the order they first happened. A failure is
 * counted on the kind that failed, so the owner sees where to look.
 */
export function summarize(steps: RunStep[]): string {
  if (steps.length === 0) return "";
  const order: StepKind[] = [];
  const count: Partial<Record<StepKind, number>> = {};
  const failed: Partial<Record<StepKind, number>> = {};
  for (const s of steps) {
    if (!count[s.kind]) order.push(s.kind);
    count[s.kind] = (count[s.kind] ?? 0) + 1;
    if (s.state === "failed") failed[s.kind] = (failed[s.kind] ?? 0) + 1;
  }
  const parts = order.slice(0, MAX_PHRASES).map((k) => {
    const f = failed[k] ?? 0;
    const text = phrase(k, count[k]!);
    return f > 0 ? `${text} (${f === count[k] && f > 1 ? "all" : f} failed)` : text;
  });
  const rest = order.length - parts.length;
  let line = parts.join(", ");
  if (rest > 0) line += `, and ${rest} more`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** What the thread says while the run is in flight: the step Ghost is on. */
export function liveLine(steps: RunStep[]): string {
  const cur = currentStep(steps);
  if (cur) return stepTitle(cur);
  return steps.length ? "Working on it" : "Thinking";
}

export function totalMs(steps: RunStep[]): number {
  return steps.reduce((n, s) => n + (s.ms ?? 0), 0);
}

export function failedCount(steps: RunStep[]): number {
  return steps.filter((s) => s.state === "failed").length;
}
