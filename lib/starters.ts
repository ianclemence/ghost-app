/**
 * First words for an empty conversation. Each one shows a different kind of
 * thing a personal Ghost does — keep watch, run something on a schedule,
 * remember, think something through — rather than generic chat prompts.
 * Tapping one fills the composer; nothing is sent until the owner sends it.
 */
export interface Starter {
  label: string;
  text: string;
}

export function conversationStarters(opts: { pod: boolean }): Starter[] {
  const always: Starter[] = [
    { label: "What do you know about me?", text: "What do you remember about me?" },
    { label: "Think something through", text: "Help me think through a decision: " },
  ];
  if (!opts.pod) return always;
  return [
    { label: "Keep an eye on a flight", text: "Keep an eye on my flight and tell me if anything changes: " },
    { label: "Every Monday morning…", text: "Every Monday at 8, send me a brief of my week." },
    ...always,
  ];
}
