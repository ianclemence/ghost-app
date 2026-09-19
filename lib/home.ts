import type { Thing } from "./ghostApi";

// Home is the first screen. Its job is to answer "what does Ghost do for
// me?" in one calm line, without becoming a dashboard. This module holds
// the pure derivation so it can be tested without rendering.

export interface HomeSummary {
  // The single most relevant thing to surface, or null when nothing is
  // running. Kept singular on purpose: Home states one fact, it does not
  // list.
  headline: string | null;
  // True when at least one Thing is waiting on the owner. Home nudges,
  // it never blocks.
  needsYou: boolean;
}

const KIND_VERB: Record<string, string> = {
  reminder: "I’ll remind you about",
  routine: "I keep doing",
  automation: "I handle",
  task: "I’ve queued",
};

// deriveHomeSummary picks the most useful single thing to say. Priority:
//  1. something waiting on the owner (needs action now),
//  2. otherwise the soonest active thing,
//  3. otherwise nothing.
// It is deterministic and total.
export function deriveHomeSummary(things: Thing[]): HomeSummary {
  if (!things || things.length === 0) {
    return { headline: null, needsYou: false };
  }

  const waiting = things.find((t) => t.state === "waiting");
  if (waiting) {
    return { headline: `One thing needs you: ${waiting.title}.`, needsYou: true };
  }

  const active = things.filter((t) => t.state === "active");
  if (active.length === 0) {
    return { headline: null, needsYou: false };
  }

  const first = active[0];
  const verb = KIND_VERB[first.kind] ?? "I’m on";
  if (active.length === 1) {
    return { headline: `${verb} \u201c${first.title}\u201d.`, needsYou: false };
  }
  return {
    headline: `${verb} \u201c${first.title}\u201d and ${active.length - 1} more.`,
    needsYou: false,
  };
}
