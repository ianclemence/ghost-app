/**
 * Onboarding funnel metrics.
 *
 * The product bet is simple: a person should get one thing Ghost does for
 * them in the first day, and grant standing permission for the handful of
 * capabilities that constitute their actual use case — so Ghost goes quiet
 * and just works. Two milestones define whether that happened:
 *
 *   - first_routine: the first time an owner sees a Routine Ghost is running
 *   - first_grant:   the first time an owner chooses "always" for a capability
 *
 * We cannot improve a funnel we do not measure, so this persists timestamps
 * locally (AsyncStorage, non-sensitive) and derives time-to-milestone from
 * first-launch. It never leaves the device and never blocks a turn.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ghost:onboarding:milestones:v1";

export type Milestone = "first_launch" | "first_routine" | "first_grant";

export type Milestones = Partial<Record<Milestone, number>> & {
  // Legacy key from before the Things → Routines rename. Read for migration
  // only; new writes use first_routine.
  first_thing?: number;
};

export async function getMilestones(): Promise<Milestones> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Milestones;
  } catch {
    return {};
  }
}

// recordMilestone stamps a milestone once. Re-recording is a no-op, so the
// metric always reports time-to-FIRST, never the most recent occurrence.
// Returns the updated map; a storage failure degrades to the in-memory value
// rather than throwing into a UI path.
export async function recordMilestone(m: Milestone, now = Date.now()): Promise<Milestones> {
  const cur = await getMilestones();
  if (cur[m] != null) return cur;
  cur[m] = now;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cur));
  } catch {
    /* metrics never break the app */
  }
  return cur;
}

// timeToMilestone returns milliseconds from first launch to the milestone,
// or null when either endpoint is unknown. Negative values (clock skew) are
// clamped to 0 so the metric stays honest.
export function timeToMilestone(ms: Milestones, m: Milestone): number | null {
  const start = ms.first_launch;
  const end = m === "first_routine" ? firstRoutineAt(ms) : ms[m];
  if (start == null || end == null) return null;
  return Math.max(0, end - start);
}

// funnelSnapshot is the compact, testable view of the funnel used by the
// Ghost screen.
export interface FunnelSnapshot {
  launched: boolean;
  gotFirstRoutine: boolean;
  gotFirstGrant: boolean;
  msToFirstRoutine: number | null;
  msToFirstGrant: number | null;
}

function firstRoutineAt(ms: Milestones): number | undefined {
  return ms.first_routine ?? ms.first_thing;
}

export function funnelSnapshot(ms: Milestones): FunnelSnapshot {
  return {
    launched: ms.first_launch != null,
    gotFirstRoutine: firstRoutineAt(ms) != null,
    gotFirstGrant: ms.first_grant != null,
    msToFirstRoutine: timeToMilestone(ms, "first_routine"),
    msToFirstGrant: timeToMilestone(ms, "first_grant"),
  };
}
