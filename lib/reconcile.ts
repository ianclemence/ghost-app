/**
 * Commit-stream-first history reconciliation.
 *
 * The old flow replaced the whole thread with the server snapshot on
 * every completed turn, so the message you just watched stream in would
 * visibly rewrite itself (different wording, gained/lost passages).
 *
 * The new flow keeps what was streamed and reconciles against the server:
 * - Rows with matching ids are the same row: keep the local copy (it
 *   carries UI status; content is identical).
 * - Client-id rows (temp-/msg-) match a server row by role + timestamp
 *   proximity + content relation (equal, or one contains the other —
 *   the quarantine filter legitimately hides some streamed content from
 *   display while the server stores the full text). Keep the local copy:
 *   what the user watched stays put.
 * - Server rows with no local correspondent (other devices, scheduler
 *   turns, anything missed) are appended by timestamp.
 * - Local rows with no server correspondent (queued, just-sent) are kept.
 *
 * The server remains the authority on what exists; this only decides
 * what the user keeps looking at. No content is invented here.
 */
import type { Message } from "./ghostApi";
import type { ExtendedMessage } from "./store";

const CLIENT_ID_PREFIXES = ["temp-", "msg-", "q-"];
const MATCH_WINDOW_MS = 120_000;

function isClientId(id: string): boolean {
  return CLIENT_ID_PREFIXES.some((p) => id.startsWith(p));
}

function sameContent(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function corresponds(local: ExtendedMessage, remote: Message): boolean {
  if (local.id && local.id === remote.id) return true;
  if (!isClientId(local.id)) return false;
  if (local.role !== remote.role) return false;
  if (Math.abs(local.timestamp - remote.timestamp) > MATCH_WINDOW_MS) return false;
  return sameContent(local.content, remote.content);
}

export function reconcileHistory(
  local: ExtendedMessage[],
  server: Message[],
): ExtendedMessage[] {
  const matchedServer = new Set<string>();
  const matchedLocal = new Set<string>();

  const tryMatch = (s: Message, unmatchedOnly: boolean): boolean => {
    for (const m of local) {
      if (unmatchedOnly && matchedLocal.has(m.id)) continue;
      if (corresponds(m, s)) {
        matchedServer.add(s.id);
        matchedLocal.add(m.id);
        return true;
      }
    }
    return false;
  };

  // Pass 1: exact ids and one-to-one fuzzy matches.
  for (const s of server) tryMatch(s, true);
  // Pass 2: absorb leftovers into an already-matched bubble whose text
  // contains them. This is the multi-iteration turn: one streamed bubble
  // holds iterations A+B while the server stores rows A and B. Without
  // this pass, B would append as a visible duplicate.
  for (const s of server) {
    if (!matchedServer.has(s.id)) tryMatch(s, false);
  }

  const out: ExtendedMessage[] = [...local];
  const fresh = server
    .filter((s) => !matchedServer.has(s.id))
    .map((s) => ({ ...s }) as ExtendedMessage)
    .sort((a, b) => a.timestamp - b.timestamp);
  out.push(...fresh);
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}
