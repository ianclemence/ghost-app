/**
 * The conversation as the owner reads it: one continuous thread, broken
 * into days, with time shown only where it carries meaning.
 *
 * Time appears when (a) Ghost spoke out of turn — a message the owner did
 * not just ask for (a watch alert, a reminder, a finished background task),
 * or (b) the conversation resumed after a real pause. Everything else stays
 * uncluttered. "Out of turn" is read from the transcript's own structure
 * (an assistant message following another assistant message after a gap),
 * never guessed from wording.
 */
import type { Artifact } from "./ghostApi";
import type { RichCard } from "./cards";
import type { ExtendedMessage } from "./store";

export type ThreadItem =
  | { kind: "day"; key: string; label: string }
  | {
      kind: "message";
      key: string;
      message: ExtendedMessage;
      /** Ghost spoke without being asked just now. */
      outOfTurn: boolean;
      /** Show a small timestamp above this message. */
      showTime: boolean;
      /** First message of a speaker run: gets the larger top gap. */
      groupStart: boolean;
    }
  | { kind: "artifact"; key: string; artifact: Artifact; at: number }
  | { kind: "card"; key: string; card: RichCard; at: number };

const OUT_OF_TURN_GAP_MS = 2 * 60_000;
const RESUME_GAP_MS = 15 * 60_000;
const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today", "Yesterday", a weekday within the week, else a short date. */
export function dayLabel(ms: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const d = new Date(ms);
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString([], sameYear
    ? { weekday: "short", day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
}

/** Clock time in the owner's locale ("15:04" / "3:04 PM"). */
export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function artifactTime(a: Artifact): number | null {
  if (!a.created_at) return null;
  const t = Date.parse(a.created_at);
  return Number.isFinite(t) ? t : null;
}

/**
 * Build the rendered thread. Messages keep their order; artifacts with a
 * creation time are placed where they happened in the conversation, and
 * the rest (no time known) follow the latest message. Cards are placed the
 * same way: where they were shown, so the conversation reads in order and a
 * reload puts everything back where it was.
 */
export function buildThread(
  messages: ExtendedMessage[],
  artifacts: Artifact[] = [],
  now = Date.now(),
  cards: RichCard[] = [],
  /** More history exists above what is loaded. */
  hasMore = false,
): ThreadItem[] {
  type Entry = { at: number; order: number; msg?: ExtendedMessage; art?: Artifact; card?: RichCard };
  const entries: Entry[] = messages.map((m, i) => ({ at: m.timestamp || now, order: i, msg: m }));
  const lastAt = entries.length ? entries[entries.length - 1].at : now;
  artifacts.forEach((a, i) => {
    const t = artifactTime(a);
    entries.push({ at: t ?? lastAt + 1, order: messages.length + i, art: a });
  });
  cards.forEach((c, i) => {
    entries.push({ at: c.created_at ?? lastAt + 1, order: messages.length + artifacts.length + i, card: c });
  });
  entries.sort((a, b) => (a.at - b.at) || (a.order - b.order));
  // Only part of the conversation is loaded. A file or card from further back
  // has none of its surrounding messages here, so it floated at the top like a
  // stray, long after anything it belonged to. It returns when you scroll back
  // to its time and that part of the history loads.
  if (hasMore) {
    const firstMsg = entries.find((e) => e.msg);
    if (firstMsg) {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (!entries[i].msg && entries[i].at < firstMsg.at) entries.splice(i, 1);
      }
    }
  }

  const out: ThreadItem[] = [];
  let prevDay = -1;
  let prev: ExtendedMessage | null = null;
  for (const e of entries) {
    const day = startOfDay(e.at);
    if (day !== prevDay) {
      out.push({ kind: "day", key: `day-${day}`, label: dayLabel(e.at, now) });
      prevDay = day;
    }
    if (e.art) {
      out.push({ kind: "artifact", key: `art-${e.art.id}`, artifact: e.art, at: e.at });
      continue;
    }
    if (e.card) {
      // The same card twice in a row (a browser reset announced after each
      // retry) is one card, and a "my browser got stuck" card is moot once
      // Ghost has answered after it.
      const last = out[out.length - 1];
      if (last && last.kind === "card" && last.card.kind === e.card.kind && last.card.title === e.card.title && (last.card.body ?? "") === (e.card.body ?? "")) continue;
      if (e.card.kind === "browser_recovery" && messages.some((m) => m.role === "assistant" && !m.kind && m.status !== "streaming" && m.content.trim() && m.timestamp > e.at)) continue;
      out.push({ kind: "card", key: `card-${e.card.id}`, card: e.card, at: e.at });
      continue;
    }
    const m = e.msg!;
    // Ghost saying the same notice twice in a row ("My browser got stuck",
    // after each reset) is one notice, not a stack of identical cards.
    if (m.kind && prev && prev.kind === m.kind && prev.content.trim() === m.content.trim()) continue;
    const gap = prev ? m.timestamp - prev.timestamp : Infinity;
    const outOfTurn =
      m.role === "assistant" &&
      m.status !== "streaming" &&
      (prev === null || (prev.role === "assistant" && gap > OUT_OF_TURN_GAP_MS));
    const resumed = prev !== null && gap > RESUME_GAP_MS;
    out.push({
      kind: "message",
      key: m.id,
      message: m,
      outOfTurn,
      showTime: outOfTurn || resumed,
      groupStart: prev === null || prev.role !== m.role || outOfTurn || resumed,
    });
    prev = m;
  }
  return out;
}
