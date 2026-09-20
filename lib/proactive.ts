import type { ProactiveStatus } from "./ghostApi";

// Home states one honest fact about what Ghost is doing. Proactivity is part
// of that: the owner should know when Ghost is quietly watching, holding off
// during quiet hours, or has something waiting — without a dashboard.
//
// This is a pure derivation so the copy is testable and consistent.

export interface ProactiveLine {
  // A single calm sentence, or null when there is nothing worth saying.
  text: string | null;
}

export function proactiveLine(p: ProactiveStatus | null): ProactiveLine {
  if (!p) return { text: null };

  if (p.waiting > 0) {
    const n = p.waiting;
    return {
      text: p.quiet
        ? `${n} ${n === 1 ? "thing" : "things"} waiting until ${p.quiet_end ?? "morning"}.`
        : `${n} ${n === 1 ? "update" : "updates"} ready when you are.`,
    };
  }

  if (p.quiet) {
    return { text: `Watching quietly until ${p.quiet_end ?? "morning"}.` };
  }

  return { text: null };
}
