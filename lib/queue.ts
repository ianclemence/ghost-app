/**
 * Messages sent while Ghost is working.
 *
 * Typing while Ghost works is never dropped and never ambiguous. Each message
 * is sent into the running turn at once, so Ghost reads it at its next step,
 * and it lives in a small tray above the bar until its fate is known:
 *
 *   steering  sent into the turn, not read yet
 *   picked    Ghost has read it and is acting on it
 *   waiting   the turn could not take it (it ended first, or steering failed);
 *             it goes out as the next message when the turn is over
 *
 * The Pod settles every steered message one way or the other: it announces
 * "picked" when the model reads it, and hands back anything the turn finished
 * without reading. This module is only the bookkeeping, so the rule is one
 * place and testable: a message is in the tray from the moment it is typed
 * until it is part of the conversation, in order, exactly once.
 */

export type QueueState = "steering" | "picked" | "waiting";

export interface QueuedMessage {
  id: string;
  text: string;
  state: QueueState;
  createdAt: number;
  /** The outbox entry that keeps it across an app restart. */
  outboxId?: string;
}

export function enqueue(list: QueuedMessage[], m: { id: string; text: string; now: number; outboxId?: string }): QueuedMessage[] {
  if (list.some((q) => q.id === m.id)) return list;
  return [...list, { id: m.id, text: m.text, state: "steering", createdAt: m.now, outboxId: m.outboxId }];
}

/** Steering was refused or the Pod could not be reached: hold it for the next turn. */
export function hold(list: QueuedMessage[], id: string): QueuedMessage[] {
  return list.map((q) => (q.id === id && q.state === "steering" ? { ...q, state: "waiting" as const } : q));
}

function matchFirst(list: QueuedMessage[], contents: string[], from: QueueState, to: QueueState): QueuedMessage[] {
  const used = new Set<string>();
  const next = list.slice();
  for (const c of contents) {
    const i = next.findIndex((q) => q.state === from && !used.has(q.id) && q.text.trim() === c.trim());
    if (i < 0) continue;
    used.add(next[i].id);
    next[i] = { ...next[i], state: to };
  }
  return next;
}

/** The Pod says the model has read these. */
export function picked(list: QueuedMessage[], contents: string[]): QueuedMessage[] {
  return matchFirst(list, contents, "steering", "picked");
}

/** The Pod hands these back unread: they go out as the next message. */
export function returned(list: QueuedMessage[], contents: string[]): QueuedMessage[] {
  return matchFirst(list, contents, "steering", "waiting");
}

/** Only a message nothing has seen yet can be taken back. */
export function cancel(list: QueuedMessage[], id: string): QueuedMessage[] {
  return list.filter((q) => !(q.id === id && q.state === "waiting"));
}

export function canCancel(q: QueuedMessage): boolean {
  return q.state === "waiting";
}

export interface TurnEnd {
  /** Read by Ghost during the turn: now part of the conversation, in order. */
  intoThread: QueuedMessage[];
  /** What is left in the tray; the first goes out next. */
  tray: QueuedMessage[];
}

/**
 * The turn is over. What Ghost read becomes part of the conversation. What
 * the turn left unresolved is waiting, except on a Pod that never reports
 * pickup (no step events seen), where steering that was accepted was read.
 */
export function endTurn(list: QueuedMessage[], opts: { clean: boolean; podReportsPickup: boolean }): TurnEnd {
  const intoThread: QueuedMessage[] = [];
  const tray: QueuedMessage[] = [];
  for (const q of list) {
    if (q.state === "picked") intoThread.push(q);
    else if (q.state === "steering" && opts.clean && !opts.podReportsPickup) intoThread.push({ ...q, state: "picked" });
    else tray.push(q.state === "steering" ? { ...q, state: "waiting" } : q);
  }
  return { intoThread, tray };
}

export function nextWaiting(list: QueuedMessage[]): QueuedMessage | null {
  return list.find((q) => q.state === "waiting") ?? null;
}

export function remove(list: QueuedMessage[], id: string): QueuedMessage[] {
  return list.some((q) => q.id === id) ? list.filter((q) => q.id !== id) : list;
}

/** What the composer is for right now. */
export type ComposerIntent = "send" | "queue";

export function composerIntent(busy: boolean): ComposerIntent {
  return busy ? "queue" : "send";
}
