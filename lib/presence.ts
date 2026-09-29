/**
 * The one line under Ghost's name: what it is doing right now, in the
 * owner's words. Runtime state only — nothing is displayed that the app
 * did not just observe — and one line, never a dashboard.
 */
export type PresenceTone = "working" | "attention" | "idle" | "offline";

export interface PresenceInput {
  paired: boolean;
  connection: "online" | "syncing" | "offline";
  streaming: boolean;
  /** Live phase label from the runtime ("Searching the web"). */
  phase: string | null;
  backgroundRunning: number;
  approvalsWaiting: number;
  /** Active watches / routines Ghost is keeping for the owner. */
  keeping: number;
}

export interface Presence {
  text: string;
  tone: PresenceTone;
}

export function presence(p: PresenceInput): Presence {
  if (!p.paired) return { text: "Not connected to your Pod", tone: "offline" };
  if (p.connection === "offline") return { text: "Pod offline · messages will wait", tone: "offline" };
  if (p.connection === "syncing") return { text: "Reconnecting", tone: "offline" };
  if (p.streaming) return { text: p.phase?.trim() || "Thinking", tone: "working" };
  if (p.approvalsWaiting > 0) {
    return {
      text: p.approvalsWaiting === 1 ? "Waiting for your OK" : `Waiting for your OK on ${p.approvalsWaiting} things`,
      tone: "attention",
    };
  }
  if (p.backgroundRunning > 0) {
    return {
      text: p.backgroundRunning === 1 ? "Working on something" : `Working on ${p.backgroundRunning} things`,
      tone: "working",
    };
  }
  if (p.keeping > 0) {
    return { text: p.keeping === 1 ? "Keeping an eye on 1 thing" : `Keeping an eye on ${p.keeping} things`, tone: "idle" };
  }
  return { text: "On your Pod", tone: "idle" };
}
