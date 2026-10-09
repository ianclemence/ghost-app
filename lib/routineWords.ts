/**
 * How a routine reads in a list. Its title is often its own instruction cut
 * short ("Call Jas" / "Call Jas", "Chelsea vs Bournemouth is tomorrow — Sa…"),
 * so the words under the title are shown only when they add something.
 */
import type { RoutineItem } from "./ghostApi";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[…]|\.\.\.$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The instruction, unless it only repeats the title. */
export function routineDetail(title: string, what: string | undefined): string | null {
  if (!what) return null;
  const t = norm(title);
  const w = norm(what);
  if (!w || w === t || (t.length > 0 && w.startsWith(t))) return null;
  return what;
}

/** Still running or waiting on something, as opposed to over. */
export function isLive(t: Pick<RoutineItem, "state">): boolean {
  return t.state === "active" || t.state === "waiting" || t.state === "paused" || t.state === "failed";
}
