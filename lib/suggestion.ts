// The predicted next message, offered in the empty message bar.
//
// The Pod works it out from the conversation as it stands (rules for the
// common endings, a small model call otherwise). The phone's part is small and
// careful: ask only when Ghost has just spoken and is idle, drop the answer if
// the conversation moved on while it was coming, and never let it sit over
// something the owner is typing.

export const SUGGESTION_MAX = 24; // one row beside the "Use" button on a narrow phone

/** A suggestion safe to show, or "" when it is not. */
export function usableSuggestion(text: unknown): string {
  if (typeof text !== "string") return "";
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > SUGGESTION_MAX) return "";
  return s;
}

/**
 * Whether it is the moment to ask: Ghost spoke last, it has finished, the Pod is
 * reachable, and nothing is running. Anything else means "no suggestion".
 */
export function shouldAskForSuggestion(s: {
  online: boolean;
  streaming: boolean;
  lastRole: "user" | "assistant" | undefined;
  lastStatus?: string;
}): boolean {
  if (!s.online || s.streaming) return false;
  if (s.lastRole !== "assistant") return false;
  return s.lastStatus !== "streaming";
}

/** Whether a suggestion should be on screen right now. */
export function showSuggestion(s: { suggestion: string; draft: string; streaming: boolean; recording?: boolean }): boolean {
  return !!s.suggestion && s.draft.trim() === "" && !s.streaming && !s.recording;
}
