/**
 * Background-task conversation state.
 *
 * The daemon emits `background_started` / `background_done` bus events
 * (forwarded over the app WebSocket) when a detached subagent starts and
 * finishes. This module is the pure state transition: given the current
 * running list and one event, it returns the next list plus an optional
 * assistant message to append. No I/O, no timers — the screen owns those.
 */

export interface BackgroundRunningTask {
  key: string;
  label: string;
  startedAt: number;
}

export interface BackgroundAppend {
  content: string;
  ok: boolean;
}

export interface BackgroundEventInput {
  type?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Session gate: untagged events are accepted (older daemons); tagged ones
 * must name this conversation. Never render another thread's work here. */
export function backgroundSessionMatches(eventSession: string, currentSession: string): boolean {
  if (!eventSession) return true;
  return eventSession === currentSession;
}

export function formatBackgroundElapsed(startedAt: number, now: number): string {
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, "0")}s`;
}

function formatDurationMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

/** Assistant message body for a finished task: status line plus findings.
 * Failures are stated plainly, never softened. */
export function backgroundDoneContent(label: string, ok: boolean, findings: string, elapsedMs: number): string {
  const head = ok ? `✓ ${label} · done in ${formatDurationMs(elapsedMs)}` : `✗ ${label} · failed after ${formatDurationMs(elapsedMs)}`;
  const body = findings.trim();
  return body ? `${head}\n\n${body}` : head;
}

export function applyBackgroundEvent(
  running: BackgroundRunningTask[],
  msg: BackgroundEventInput,
  currentSession: string,
  now: number,
): { running: BackgroundRunningTask[]; append?: BackgroundAppend } {
  const t = msg.type ?? str(msg.metadata?.["type"]);
  if (t !== "background_started" && t !== "background_done") return { running };
  const meta = msg.metadata ?? {};
  if (!backgroundSessionMatches(str(meta["session_id"]), currentSession)) return { running };
  const label = str(meta["label"]) || "background task";
  if (t === "background_started") {
    if (running.some((r) => r.label === label)) return { running };
    return { running: [...running, { key: `${label}@${now}`, label, startedAt: now }] };
  }
  const idx = running.findIndex((r) => r.label === label);
  const next = idx >= 0 ? [...running.slice(0, idx), ...running.slice(idx + 1)] : running;
  const ok = meta["ok"] !== false;
  return { running: next, append: { content: backgroundDoneContent(label, ok, msg.content ?? "", Number(meta["elapsed_ms"] ?? 0)), ok } };
}
