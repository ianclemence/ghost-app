/**
 * Status taxonomy: the server reports fine-grained tool activity
 * ("Reading: SKILL.md", "Running: curl …"), but users care about phases,
 * not mechanisms. This maps tool names to a small set of user-facing
 * phases. Internal paths, filenames, commands, and URLs must never reach
 * the bubble — the quarantine filter already keeps them out of message
 * text, and this keeps them out of status too.
 *
 * Unknown tools fall back to the server label (never invented text).
 */

export type StatusPhase =
  | "Thinking"
  | "Checking memory"
  | "Searching the web"
  | "Working on it";

const MEMORY_TOOLS = new Set([
  "remember",
  "memory_recall",
  "memory_curate",
  "context_get",
  "session_search",
]);

const WEB_TOOLS = new Set(["web_search", "web_fetch"]);

export function statusPhaseForTool(tool: string): StatusPhase | null {
  const name = tool.trim().toLowerCase();
  if (!name) return null;
  if (MEMORY_TOOLS.has(name)) return "Checking memory";
  if (WEB_TOOLS.has(name)) return "Searching the web";
  return "Working on it";
}

/** Display text for the status line. Empty content always reads Thinking. */
export function statusText(tool: string | null, hasContent: boolean): string {
  if (hasContent) return "";
  if (!tool) return "Thinking";
  return statusPhaseForTool(tool) ?? "Thinking";
}
