/**
 * Status taxonomy: the server reports fine-grained activity, but users care
 * about phases, not mechanisms. This maps tool names to a small set of
 * user-facing phases. Internal paths, filenames, commands, and URLs must
 * never reach the bubble — the quarantine filter keeps them out of message
 * text, and this keeps them out of status too.
 *
 * Anything we cannot classify becomes one calm phrase; a server label is
 * only used when it is verifiably free of machinery.
 */

export type StatusPhase =
  | "Thinking"
  | "Checking memory"
  | "Searching the web"
  | "Reading the page"
  | "Working on it";

const MEMORY_TOOLS = new Set([
  "remember",
  "memory_recall",
  "memory_curate",
  "context_get",
  "session_search",
  "oracle",
]);

const WEB_TOOLS = new Set(["web_search"]);

const PAGE_TOOLS = new Set(["web_fetch"]);

/** The specific phase for tools we classify; null for everything else. */
export function specificPhaseForTool(tool: string): StatusPhase | null {
  const name = tool.trim().toLowerCase();
  if (!name) return null;
  if (MEMORY_TOOLS.has(name)) return "Checking memory";
  if (WEB_TOOLS.has(name)) return "Searching the web";
  if (PAGE_TOOLS.has(name)) return "Reading the page";
  return null;
}

export function statusPhaseForTool(tool: string): StatusPhase | null {
  const name = tool.trim().toLowerCase();
  if (!name) return null;
  return specificPhaseForTool(name) ?? "Working on it";
}

/**
 * A server label is only trusted when it reads like plain words: no paths,
 * commands, URLs, file names, or raw tool identifiers. Otherwise it is
 * dropped so machinery can never reach the status line.
 */
export function safeStatusLabel(label: string | null | undefined): string {
  const s = (label ?? "").trim();
  if (!s || s.length > 60) return "";
  if (/[\/\\:<>{}$`"@]/.test(s)) return "";
  if (/\b[a-z0-9]+(_[a-z0-9]+)+\b/.test(s)) return ""; // snake_case tool names
  if (/\b\w+\.(md|py|sh|js|ts|tsx|json|txt|html|css|go|csv|png|jpg|jpeg|pdf|yaml|yml|log|db)\b/i.test(s)) return "";
  if (/^[a-z0-9]+$/.test(s)) return ""; // bare identifier
  return s;
}

/** Final display string for the live status line. */
export function displayStatusForTool(tool: string, label?: string | null): string {
  const specific = specificPhaseForTool(tool);
  if (specific) return specific;
  return safeStatusLabel(label) || "Working on it";
}

/** Display text for the status line. Empty content always reads Thinking. */
export function statusText(tool: string | null, hasContent: boolean): string {
  if (hasContent) return "";
  if (!tool) return "Thinking";
  return statusPhaseForTool(tool) ?? "Thinking";
}
