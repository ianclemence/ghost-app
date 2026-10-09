/**
 * A trip as the phone shows it: its dates in a few words, and its legs as the
 * steps of a timeline (done, now, next by the clock). Pure, so it is testable.
 */
import type { StepState } from "./blocks";
import type { Trip } from "./ghostApi";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const local = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) : null;
};

/** "16 to 20 Oct", "28 Oct to 3 Nov", "16 Oct". */
export function tripRange(t: Pick<Trip, "start" | "end">): string {
  const a = local(t.start);
  const b = local(t.end);
  if (!a) return "";
  if (!b || t.start === t.end) return `${a.getDate()} ${MONTHS[a.getMonth()]}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()} to ${b.getDate()} ${MONTHS[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]} to ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Each leg as a timeline step: when, what, and the details that matter on the day. */
export function tripSteps(t: Pick<Trip, "legs">, now: Date): { time?: string; title: string; detail?: string; state: StepState | null }[] {
  let lit = false;
  return t.legs.slice(0, 8).map((l) => {
    const s = local(l.start);
    const e = l.end ? local(l.end) : null;
    const end = e ?? (s ? new Date(s.getTime() + 60 * 60 * 1000) : null);
    let state: StepState | null = null;
    if (s && end) {
      if (now >= end) state = "done";
      else if (now >= s) state = "now";
      else if (!lit) state = "next";
    }
    if (state === "now" || state === "next") lit = true;
    const route = l.from || l.to ? [l.from, l.to].filter(Boolean).join(" → ") : "";
    const leave = l.leave_by ? local(l.leave_by) : null;
    const detail = [l.ref, route, l.place, leave && state !== "done" ? `leave by ${hm(leave)}` : null, l.kind === "hotel" && e ? `until ${DAYS[e.getDay()]} ${hm(e)}` : null]
      .filter(Boolean)
      .join(" · ");
    return {
      time: s ? `${DAYS[s.getDay()]} ${hm(s)}` : undefined,
      title: l.title,
      detail: detail || undefined,
      state,
    };
  });
}
