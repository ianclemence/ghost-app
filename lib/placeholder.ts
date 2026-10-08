// What the message bar says when it is empty. It should sound like someone who
// knows what time it is and what is going on, not like a form field: the words
// follow the part of the day, change from one day to the next, and say so
// honestly when Ghost is busy or the Pod is away. Every line is short enough to
// fit one row on a narrow phone, because a placeholder that wraps looks broken.

export const PLACEHOLDER_MAX = 30;

const MORNING = ["What's the plan today?", "What are we starting with?", "Anything to set up for today?"];
const AFTERNOON = ["What needs doing today?", "Need anything looked up?", "What should I remember?"];
const EVENING = ["How did today go?", "Anything for tomorrow?", "What's still on your mind?"];
const NIGHT = ["Can't sleep? Tell me.", "Still up? Tell me.", "Something on your mind?"];

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0).getTime();
  return Math.floor((d.getTime() - start) / 86_400_000);
}

export function composerPlaceholder(opts: {
  online: boolean;
  streaming: boolean;
  /** True when the conversation has no messages yet. */
  firstTime: boolean;
  now?: Date;
}): string {
  if (!opts.online) return "Sends when your Pod is back";
  if (opts.streaming) return "Queue a message…";
  if (opts.firstTime) return "Tell me about your week";
  const now = opts.now ?? new Date();
  const h = now.getHours();
  const pool = h >= 5 && h < 11 ? MORNING : h >= 11 && h < 17 ? AFTERNOON : h >= 17 && h < 22 ? EVENING : NIGHT;
  return pool[dayOfYear(now) % pool.length];
}
