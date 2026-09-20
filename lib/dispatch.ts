/**
 * Send-while-working decision.
 *
 * When the owner types while Ghost is still working, the message must not be
 * silently dropped. The best behavior is to steer it INTO the running turn
 * (Ghost receives the new instruction immediately) rather than park it in a
 * queue that could reorder or delay. This module holds that decision as a
 * pure function so the policy is explicit and testable.
 *
 * Fallback: if steering is unavailable (runtime unreachable), the message is
 * handed to the existing offline outbox — visible, ordered, never lost.
 */
export type DispatchMode = "send" | "steer" | "queue";

export function dispatchMode(isStreaming: boolean, steeringAvailable: boolean): DispatchMode {
  if (!isStreaming) return "send";
  return steeringAvailable ? "steer" : "queue";
}

// What to tell the owner when their message is steered into a running turn.
// The phrasing is honest: the message joined the current turn; it did not
// start a new one, and Ghost may finish the original task first.
export function steerAck(): string {
  return "Sent to Ghost. It picks this up in the current turn.";
}
