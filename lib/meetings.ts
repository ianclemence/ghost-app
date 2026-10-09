/**
 * Recording a meeting: how the recording is sent to the Pod in pieces, what
 * its progress says, and the message that asks Ghost to make something of
 * the transcript. Pure, so it is testable.
 */
import type { Meeting } from "./ghostApi";

/** 1.5 MB of audio a piece: a whole number of base64 quads, under the Pod's 2 MB. */
export const PIECE_BYTES = 1_572_864;

/** A recording's base64 cut into pieces that each decode on their own. */
export function pieces(b64: string, pieceBytes = PIECE_BYTES): string[] {
  const size = Math.ceil(pieceBytes / 3) * 4;
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += size) out.push(b64.slice(i, i + size));
  return out;
}

/** "12:05" or "1:02:05" for a running clock. */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Where a recording stands, in the owner's words. */
export function meetingStatus(m: Pick<Meeting, "state" | "parts" | "part_done" | "seconds" | "words" | "error">): string {
  switch (m.state) {
    case "receiving":
      return "Sending to your Pod…";
    case "transcribing":
      return m.parts ? `Transcribing on your Pod · ${m.part_done ?? 0} of ${m.parts}` : "Getting ready to transcribe…";
    case "done":
      return `${Math.max(1, Math.round((m.seconds ?? 0) / 60))} min · ${(m.words ?? 0).toLocaleString("en-US")} words`;
    case "failed":
      return m.error ? `Didn't work: ${m.error}` : "Didn't work";
  }
}

/** What the owner sends Ghost to turn a transcript into a summary and to-dos. */
export function summarizePrompt(m: Pick<Meeting, "title" | "seconds" | "transcript">): string {
  const mins = Math.max(1, Math.round((m.seconds ?? 0) / 60));
  return `I recorded “${m.title}” (${mins} min). The transcript is on my Pod at ${m.transcript}. Read it and summarize it for me: what it was about, what was decided, and the action items as a checklist I can tick. Add the ones that are mine to my to-do list.`;
}
