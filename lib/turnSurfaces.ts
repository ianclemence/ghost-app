/**
 * Ghost's browser (and computer) as part of the conversation.
 *
 * A browser card belongs to the request that opened it: it sits in the thread
 * right after the owner's message, says what Ghost is doing while the work
 * runs, and when the work is over it settles into a one-line record of what
 * was done. It used to be a footer pinned under the newest message, filled in
 * once and never updated, so it kept saying "Ghost is working…" under the
 * finished answer, and later replies landed above it.
 *
 * The Pod is the authority. Every change it announces is fetched, and an
 * answer older than what is on screen (two fetches crossing) is ignored, using
 * the surface's own change counter.
 */
import type { LiveSurface, SurfaceState } from "./ghostApi";

export interface TrackedSurface {
  surface: LiveSurface;
  /** Where it sits in the conversation (ms). */
  at: number;
}

export type SurfaceMap = Record<string, TrackedSurface>;

/** Work on the surface is still going (or waiting on the owner). */
const LIVE: SurfaceState[] = ["created", "starting", "active", "waiting", "user_control", "paused", "disconnected"];

export type SurfacePhase = "live" | "done" | "stopped" | "hidden";

/** What the conversation shows for a surface. */
export function surfacePhase(s: LiveSurface): SurfacePhase {
  if (s.state === "completed") return "done";
  if (s.state === "failed") return "stopped";
  if (s.state === "expired") {
    // An idle surface that timed out was finished work nobody settled: a
    // record if it got anywhere, otherwise nothing worth showing.
    return s.observation?.domain || s.observation?.title ? "done" : "hidden";
  }
  if (LIVE.includes(s.state)) {
    // The always-present local computer sits in "created" with no turn using
    // it. It is not work, and it used to appear as a permanent
    // "Ghost is opening the computer…" card.
    if (s.state === "created" && !s.session) return "hidden";
    return "live";
  }
  return "hidden";
}

export function isLive(s: LiveSurface): boolean {
  return surfacePhase(s) === "live";
}

function parseTime(v: string | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * Takes one answer from the Pod into the map. Returns the same map when
 * nothing changed, so React skips the render.
 *
 * - An answer older than the one on screen is ignored.
 * - A surface belongs where its work started. When parked work starts again
 *   in a later request (approved, handed back), it moves to that request:
 *   the owner is looking there, not three messages up.
 */
export function acceptSurface(prev: SurfaceMap, s: LiveSurface, now: number = Date.now()): SurfaceMap {
  const cur = prev[s.id];
  if (cur && typeof cur.surface.sequence === "number" && typeof s.sequence === "number" && s.sequence < cur.surface.sequence) {
    return prev;
  }
  if (cur && cur.surface.sequence === s.sequence && cur.surface.state === s.state && cur.surface.activity === s.activity) {
    return prev;
  }
  let at = cur?.at ?? parseTime(s.started) ?? now;
  const wasParked = !!cur && ["waiting", "paused", "user_control"].includes(cur.surface.state);
  const wasOver = !!cur && !LIVE.includes(cur.surface.state);
  if ((wasParked || wasOver) && s.state === "active") at = now;
  return { ...prev, [s.id]: { surface: s, at } };
}

export function dropSurface(prev: SurfaceMap, id: string): SurfaceMap {
  if (!prev[id]) return prev;
  const next = { ...prev };
  delete next[id];
  return next;
}

/**
 * Whether a surface from the Pod's list belongs in this conversation. Only
 * surfaces a turn of this conversation used: never another conversation's
 * work, and never the idle local computer.
 */
export function belongsTo(s: LiveSurface, session: string): boolean {
  return s.session === session && surfacePhase(s) !== "hidden";
}

/**
 * Applies the Pod's full list: adds and updates this conversation's surfaces
 * and drops ones the Pod no longer has. Keeps the map's identity when nothing
 * changed.
 */
export function applySurfaceList(prev: SurfaceMap, list: LiveSurface[], session: string, now: number = Date.now()): SurfaceMap {
  let next = prev;
  const seen = new Set<string>();
  for (const s of list) {
    if (!belongsTo(s, session) && !prev[s.id]) continue;
    seen.add(s.id);
    next = acceptSurface(next, s, now);
  }
  for (const id of Object.keys(prev)) {
    if (!seen.has(id)) next = dropSurface(next, id);
  }
  return next;
}

/** The surfaces the thread should draw, oldest first. */
export function visibleSurfaces(map: SurfaceMap): TrackedSurface[] {
  return Object.values(map)
    .filter((t) => surfacePhase(t.surface) !== "hidden")
    .sort((a, b) => a.at - b.at);
}
