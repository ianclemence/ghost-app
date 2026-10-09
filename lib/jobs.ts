/**
 * Jobs on the phone: the words for when a job runs, and the message that
 * starts getting to know the owner. Pure, so it is testable.
 */
import type { GhostJob } from "./ghostApi";

/** "Every morning at 07:30", or "Whenever you ask". */
export function jobWhen(j: Pick<GhostJob, "when" | "time" | "settings">): string {
  const t = j.settings?.time || j.time;
  return t ? `${j.when} at ${t}` : j.when;
}

/**
 * What the owner sends to start getting to know each other: Ghost asks with
 * cards they answer by tapping, a few things at a time, and keeps what they say
 * with the people and memory tools.
 */
export const GET_TO_KNOW_YOU =
  "Let's get to know each other. Ask me with cards I can answer with a tap (present_card with choice, datetime and field blocks), a few things at a time, no more than three cards in all: what to call me and where I live; the people who matter most to me (their names and who they are to me; their birthdays only if I know them, so make the birthday optional); and what I'd like you to take on (offer a morning brief, keeping my inbox in hand, bills and subscriptions, trips, meals and groceries, life admin, my home at night, my health week, and learning something). Keep what I tell you with the people and memory tools, and point me to the Jobs screen for the jobs I choose.";
