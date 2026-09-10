/**
 * Client-side phase for a user-requested turn cancellation.
 *
 * There is deliberately no "stopped" or "cancelled" terminal phase: only
 * the runtime's terminal outcome (delivered through the normal chat
 * lifecycle) may settle the turn. These phases describe the *request*,
 * never the execution.
 */
export type CancelPhase = "idle" | "requesting" | "requested" | "unavailable";

export type CancelEvent = "request" | "sent" | "failed" | "settled";

export function nextCancelState(current: CancelPhase, event: CancelEvent): CancelPhase {
  switch (event) {
    case "request":
      return current === "idle" ? "requesting" : current;
    case "sent":
      return current === "requesting" ? "requested" : current;
    case "failed":
      return current === "requesting" ? "unavailable" : current;
    case "settled":
      return "idle";
  }
}

export function cancelStatusLine(phase: CancelPhase): string | null {
  switch (phase) {
    case "requesting":
      return "Asking Ghost to stop…";
    case "requested":
      return "Cancelling…";
    case "unavailable":
      return "Couldn't reach Ghost to cancel. Showing its final state when it arrives.";
    default:
      return null;
  }
}
