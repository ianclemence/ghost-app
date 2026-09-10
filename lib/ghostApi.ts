import { activityQuery } from "./activity";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  media_type?: string;
  media_url?: string;
}

export interface GhostConfig {
  piHost: string;
  piPort: string;
  session?: string;
  sendLocation?: boolean;
  // Relay transport is the default — the gateway binds to localhost only,
  // so all traffic reaches Ghost through the relay tunnel. "lan" is only
  // used for the direct pairing exchange itself.
  transport?: "lan" | "relay";
  relayServer?: string; // relay HTTP endpoint, e.g. "https://relay.example.com"
  ghostId?: string; // device ID for relay client auth
  clientToken?: string; // raw token for relay auth (stored in SecureStore)
  // Per-device auth (paired devices — set after secure pairing)
  deviceID?: string;
  credential?: string;
}

export interface PiStats {
  version?: string;
  uptime?: string;
  ip?: string;
  hostname?: string;
  cpu_percent?: number;
  cpu_count?: number;
  load?: { one: number; five: number; fifteen: number };
  memory?: { used: number; total: number };
  disk?: { used: number; total: number };
  timestamp?: number;
}

// Device-facing contracts (health/doctor/stats/identity/activity/permissions/
// routines/connections/voice) live further below. Removed surface (sessions,
// search, models, exec, workspace, skills, cron, channels, traces) is
// intentionally absent: the mobile product does not expose those concepts.

type DebugMeta = Record<string, unknown>;
function trace(event: string, meta?: DebugMeta): void {
  console.log(`[ghost-api] ${event}`, meta ?? {});
}

// ─── Error Classification ──────────────────────────────────────────────────

export type GhostErrorKind =
  | "auth"
  | "rate_limit"
  | "provider"
  | "network"
  | "empty_stream"
  | "interrupted"
  | "timeout";

export interface GhostError {
  kind: GhostErrorKind;
  message: string;
  statusCode?: number;
  retryable: boolean;
}

export function classifyError(status: number, body: string): GhostError {
  if (status === 401 || status === 403) {
    noteAuthFailure(status, body);
    return {
      kind: "auth",
      message: "Ghost no longer recognizes this device. Re-pair to reconnect.",
      statusCode: status,
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      kind: "rate_limit",
      message: "Ghost is temporarily busy. Try again in a moment.",
      statusCode: status,
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      kind: "provider",
      message: "Ghost couldn't generate a response. This is a temporary issue.",
      statusCode: status,
      retryable: true,
    };
  }
  return {
    kind: "provider",
    message: `Server error (${status})`,
    statusCode: status,
    retryable: true,
  };
}

function networkError(err: any): GhostError {
  const msg = err?.message ?? String(err);
  if (msg.includes("abort") || msg.includes("Abort")) {
    return {
      kind: "timeout",
      message: "Response timed out. Ghost may be processing a complex request.",
      retryable: true,
    };
  }
  return {
    kind: "network",
    message: "Can't reach Ghost — check your Wi-Fi and Pi connection",
    retryable: true,
  };
}

// ─── Auth Failure Notification ─────────────────────────────────────────────
// The gateway authenticates devices via per-device credentials and the relay
// authenticates apps via client tokens. When an authenticated request is
// rejected with 401/403, the stored credential or client token is no longer
// valid (e.g. the device was disconnected from the Ghost Pod). The connection
// layer registers a handler to route the user to the auth-failure/revoked
// screens instead of showing generic offline errors.

export type AuthFailureReason = "revoked" | "invalid";
type AuthFailureHandler = (reason: AuthFailureReason) => void;

let authFailureHandler: AuthFailureHandler | null = null;
let authFailureNotified = false;

export function setAuthFailureHandler(handler: AuthFailureHandler): void {
  authFailureHandler = handler;
}

export function resetAuthFailureState(): void {
  authFailureNotified = false;
}

export function authFailureReason(status: number, body: string): AuthFailureReason | null {
  if (status !== 401 && status !== 403) return null;
  let code = "";
  try {
    const parsed = JSON.parse(body);
    code = parsed?.error?.code ?? "";
  } catch {}
  return code === "device_revoked" ? "revoked" : "invalid";
}

function noteAuthFailure(status: number, body: string): void {
  if (authFailureNotified) return;
  const reason = authFailureReason(status, body);
  if (!reason) return;
  authFailureNotified = true;
  authFailureHandler?.(reason);
}

// ─── Transport ─────────────────────────────────────────────────────────────

function resolveTransport(cfg: GhostConfig): "lan" | "relay" {
  return cfg.transport ?? "relay";
}

function baseURL(cfg: GhostConfig): string {
  if (resolveTransport(cfg) === "relay" && cfg.relayServer) {
    return cfg.relayServer.replace(/\/+$/, "");
  }
  return `http://${normalizeHost(cfg.piHost)}:${normalizePort(cfg.piPort)}`;
}

function wsURL(cfg: GhostConfig): string {
  if (resolveTransport(cfg) === "relay" && cfg.relayServer) {
    return cfg.relayServer.replace(/^http/i, "ws").replace(/\/+$/, "");
  }
  return `ws://${normalizeHost(cfg.piHost)}:${normalizePort(cfg.piPort)}`;
}

function normalizeHost(host: string): string {
  let value = host.trim().replace(/^['"`\s]+|['"`\s]+$/g, "");
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).hostname;
    } catch {}
  }
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .replace(/:\d+$/, "");
}

function normalizePort(port: string): string {
  const p = port.trim().replace(/^['"`\s]+|['"`\s]+$/g, "");
  if (p === "") return "8766";
  const numeric = p.match(/\d+/)?.[0] ?? "";
  return numeric === "" ? "8766" : numeric;
}

export function normalizeSession(session?: string): string {
  const value = (session ?? "").trim();
  return value === "" ? "mobile:default" : value;
}

function authHeaders(cfg: GhostConfig): Record<string, string> {
  // Per-hop credentials: the relay authenticates the client token, and the
  // gateway (behind the tunnel) validates the device credential. A paired
  // device connecting remotely sends both.
  const h: Record<string, string> = {};
  if (resolveTransport(cfg) === "relay" && cfg.ghostId && cfg.clientToken) {
    h["X-Ghost-Client-Id"] = cfg.ghostId;
    h["X-Ghost-Client-Token"] = cfg.clientToken;
  }
  if (cfg.deviceID && cfg.credential) {
    h["X-Ghost-Device-ID"] = cfg.deviceID;
    h["X-Ghost-Credential"] = cfg.credential;
  }
  return h;
}

function headers(cfg: GhostConfig): HeadersInit {
  return { "Content-Type": "application/json", ...authHeaders(cfg) };
}

function messageHeaders(cfg: GhostConfig): HeadersInit {
  return { ...headers(cfg), "X-Ghost-Session": normalizeSession(cfg.session) };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  if (typeof AbortController === "undefined") return fetch(url, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Health ────────────────────────────────────────────────────────────────

export interface HealthStatus {
  ok: boolean;
  uptimeS?: number;
  statusCode?: number;
}

export async function checkHealthInfo(cfg: GhostConfig): Promise<HealthStatus> {
  const url = `${baseURL(cfg)}/v1/health`;
  try {
    const res = await fetchWithTimeout(url, { headers: headers(cfg) }, 5000);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      noteAuthFailure(res.status, body);
      return { ok: false, statusCode: res.status };
    }
    const data = (await res.json().catch(() => null)) as
      | { status?: string; uptime_s?: number }
      | null;
    return {
      ok: data?.status === "ok" || data === null,
      uptimeS: typeof data?.uptime_s === "number" ? data.uptime_s : undefined,
      statusCode: res.status,
    };
  } catch {
    return { ok: false };
  }
}

// ─── Pairing ─────────────────────────────────────────────────────────────

export interface PairingCompleteResult {
  device_id: string;
  credential: string;
  paired_at: string;
  ghost_name?: string;
}

/**
 * Complete pairing. Mobile app presents token + device metadata, gets credentials.
 * Single-use. Token expires after 5 minutes.
 * PUBLIC endpoint — no auth headers needed.
 */
export async function completePairing(
  cfg: GhostConfig,
  token: string,
  displayName: string,
  platform: string,
): Promise<PairingCompleteResult> {
  const res = await fetch(`${baseURL(cfg)}/v1/pairing/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, display_name: displayName, platform }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (body?.error?.code) {
      throw { code: body.error.code, message: body.error.message };
    }
    throw new Error(`Failed to complete pairing (HTTP ${res.status})`);
  }
  return res.json();
}

// ─── History ───────────────────────────────────────────────────────────────

export async function fetchHistory(
  cfg: GhostConfig,
  limit = 50,
  offset = 0,
  since?: number,
  sessionKey?: string,
): Promise<{ messages: Message[]; total: number }> {
  const session = normalizeSession(sessionKey ?? cfg.session);
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    session,
  });
  if (typeof since === "number" && Number.isFinite(since) && since > 0) {
    qs.set("since", String(Math.floor(since)));
  }
  const res = await fetch(`${baseURL(cfg)}/v1/history?${qs.toString()}`, {
    headers: {
      ...headers(cfg),
      "X-Ghost-Session": session,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch history (HTTP ${res.status})`);
  return res.json();
}

// ─── Send (streaming SSE) ─────────────────────────────────────────────────

export type ChatOutcome =
  | "success"
  | "failed"
  | "waiting_for_user"
  | "waiting_for_permission";

export interface ClarifyInfo {
  questionId: string;
  question: string;
  choices: string[];
  requestId: string;
}

export interface SendOptions {
  content: string;
  requestId?: string;
  mediaB64?: string;
  mediaType?: string;
  signal?: AbortSignal;
  // Override the session this message belongs to. Defaults to cfg.session.
  // The contract default conversation is mobile:default. The key is opaque.
  sessionKey?: string;
  onChunk: (chunk: string) => void;
  onLifecycle?: (requestId: string, state: string) => void;
  onOutcome?: (requestId: string, outcome: ChatOutcome) => void;
  onClarify?: (info: ClarifyInfo) => void;
  onSanitized?: (reason: string) => void;
  onToolStatus?: (tool: string, label: string) => void;
  onCancelled?: () => void;
  onDone: (fullText: string) => void;
  onError: (err: GhostError) => void;
}

// 300 seconds — handles complex multi-step agent tasks (web search + fetches + tool chains)
// Keep-alive pings from the server prevent the connection dying before this fires
const STREAM_TIMEOUT_MS = 300_000;

export function isQuarantinedChunk(data: string): boolean {
  const text = data.trim();
  const lower = text.toLowerCase();
  if (!text) return true;
  if (text.length > 12000) return true;
  if (/^\d{4}[-/]\d{2}[-/]\d{2}.*\[(INFO|WARN|ERROR|DEBUG)\]/i.test(text))
    return true;
  if (/^Command (successfully )?executed/i.test(text)) return true;
  if (/^\[ghost(-api|-chat)?\]/i.test(text)) return true;
  if (lower.includes("<skills>") || lower.includes("</skills>")) return true;
  if (lower.includes("skills/{skill-name}/skill.md")) return true;
  if (/^name:\s*[\w\-]+\s*$/im.test(text) && /\ndescription:/i.test(text))
    return true;
  // Tool-internals echo: skill files, workspace paths, fetch/read narration.
  // Genuine assistant answers may contain links, but never bare skill paths,
  // so these only match machine chatter. Markdown links ([text](url)) are
  // explicitly preserved.
  if (/skill\.md/i.test(text)) return true;
  if (/workspace\/(skills|data|memory)\//i.test(text)) return true;
  if (/^(fetching|fetch|reading|read|crawling|crawl|searching|running|executing|loading)\b.*https?:\/\//i.test(text))
    return true;
  if (/^https?:\/\/\S+$/.test(text) && !text.includes("](")) return true;
  if (/^file:\s*\S+\.(md|txt|json|log)$/im.test(text)) return true;
  if (
    lower.includes('"metadata"') &&
    lower.includes('"homepage"') &&
    lower.includes('"description"')
  )
    return true;
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  if (
    replacementCount > 12 ||
    replacementCount / Math.max(text.length, 1) > 0.04
  ) {
    return true;
  }
  const controlOnly = text
    .replace(/[\t\n\r]/g, "")
    .replace(/[\x20-\x7E\u00A0-\uFFFF]/g, "");
  if (controlOnly.length > 0) return true;
  return false;
}

// Contract metadata for /v1/chat is timezone-only. No GPS, no IP lookup:
// the frozen contract accepts metadata.timezone and nothing else mobile-side.
function getDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" ? tz : "";
  } catch {
    return "";
  }
}

export type StreamEvent =
  | { kind: "keepalive" }
  | { kind: "skip" }
  | { kind: "done" }
  | { kind: "text"; text: string }
  | { kind: "raw"; text: string }
  | { kind: "lifecycle"; requestId: string; state: string; outcome: ChatOutcome | null }
  | { kind: "tool"; tool: string; label: string }
  | { kind: "clarify"; questionId: string; question: string; choices: string[]; requestId: string }
  | { kind: "unknown" };

function knownOutcome(value: string): ChatOutcome | null {
  return value === "success" ||
    value === "failed" ||
    value === "waiting_for_user" ||
    value === "waiting_for_permission"
    ? (value as ChatOutcome)
    : null;
}

/**
 * Pure SSE line parser for /v1/chat. Structured frames are never content;
 * only text/raw deltas may append to the message. Unknown or malformed
 * frames parse to "unknown" so the client can never invent meaning.
 */
export function parseStreamLine(line: string, fallbackRequestId?: string): StreamEvent {
  if (line.startsWith(":")) return { kind: "keepalive" };
  if (!line.startsWith("data: ")) return { kind: "skip" };
  const data = line.slice(6).trim();
  if (data === "[DONE]") return { kind: "done" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { kind: "raw", text: data };
  }
  if (typeof parsed === "string") return { kind: "text", text: parsed };
  if (typeof parsed !== "object" || parsed === null) return { kind: "unknown" };
  const frame = parsed as Record<string, unknown>;
  const type = typeof frame.type === "string" ? frame.type : "";
  if (type === "lifecycle") {
    const state = String(frame.state ?? "");
    const outcome = state === "completed" ? knownOutcome(String(frame.outcome ?? "")) : null;
    return { kind: "lifecycle", requestId: String(frame.request_id ?? fallbackRequestId ?? ""), state, outcome };
  }
  if (type === "tool_status") {
    return { kind: "tool", tool: String(frame.tool ?? ""), label: String(frame.label ?? "") };
  }
  if (type === "clarify_request") {
    const questionId = String(frame.question_id ?? "");
    const question = String(frame.question ?? "");
    if (!questionId || !question) return { kind: "unknown" };
    const choices = Array.isArray(frame.choices)
      ? (frame.choices as unknown[]).filter((c): c is string => typeof c === "string")
      : [];
    return { kind: "clarify", questionId, question, choices, requestId: String(frame.request_id ?? fallbackRequestId ?? "") };
  }
  return { kind: "unknown" };
}

function applyStreamEvent(
  ev: StreamEvent,
  session: { fullText: string },
  opts: SendOptions,
  sanitizedTag: string,
): "done" | "continue" {
  switch (ev.kind) {
    case "keepalive":
    case "skip":
      return "continue";
    case "unknown":
      trace("stream_object", { type: "unknown" });
      return "continue";
    case "done":
      trace("stream_done_marker");
      opts.onDone(session.fullText);
      return "done";
    case "text":
      session.fullText += ev.text;
      opts.onChunk(ev.text);
      trace("stream_chunk", { length: ev.text.length });
      return "continue";
    case "raw":
      if (isQuarantinedChunk(ev.text)) {
        trace("stream_raw_chunk_ignored", { length: ev.text.length });
        if (opts.onSanitized) opts.onSanitized(sanitizedTag);
        return "continue";
      }
      session.fullText += ev.text;
      opts.onChunk(ev.text);
      trace("stream_raw_chunk", { length: ev.text.length });
      return "continue";
    case "lifecycle":
      opts.onLifecycle?.(ev.requestId, ev.state);
      if (ev.outcome) opts.onOutcome?.(ev.requestId, ev.outcome);
      trace("stream_object", { type: "lifecycle" });
      return "continue";
    case "tool":
      opts.onToolStatus?.(ev.tool, ev.label);
      trace("stream_object", { type: "tool_status" });
      return "continue";
    case "clarify":
      opts.onClarify?.({ questionId: ev.questionId, question: ev.question, choices: ev.choices, requestId: ev.requestId });
      trace("stream_object", { type: "clarify_request" });
      return "continue";
  }
}

export async function sendMessage(
  cfg: GhostConfig,
  opts: SendOptions,
): Promise<void> {
  const mediaItems =
    opts.mediaB64 && opts.mediaType
      ? [{ base64: opts.mediaB64, mime_type: opts.mediaType }]
      : opts.mediaB64
        ? [{ base64: opts.mediaB64 }]
        : [];

  const sessionKey = normalizeSession(opts.sessionKey ?? cfg.session);
  const body: Record<string, unknown> = {
    request_id: opts.requestId,
    content: opts.content,
    session_key: sessionKey,
    channel: "mobile",
    chat_id: "default",
  };
  if (mediaItems.length > 0) body.media = mediaItems;
  const deviceTimezone = getDeviceTimezone();
  if (deviceTimezone) body.metadata = { timezone: deviceTimezone };

  const url = `${baseURL(cfg)}/v1/chat`;
  trace("send_start", {
    session: normalizeSession(cfg.session),
    hasMedia: mediaItems.length > 0,
    contentLength: opts.content.length,
  });

  const abortController =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutTimer = abortController
    ? setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS)
    : null;
  const handleExternalAbort = () => abortController?.abort();
  if (opts.signal) {
    if (opts.signal.aborted) {
      abortController?.abort();
    } else {
      opts.signal.addEventListener("abort", handleExternalAbort, {
        once: true,
      });
    }
  }

  const isCancelled = () => !!opts.signal?.aborted;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...messageHeaders(cfg),
        "X-Ghost-Session": sessionKey,
      },
      body: JSON.stringify(body),
      signal: abortController?.signal,
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      opts.onError(classifyError(res.status, errorBody));
      return;
    }

    // ── Streaming path ──────────────────────────────────────────────────
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const session = { fullText: "" };
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (applyStreamEvent(parseStreamLine(line, opts.requestId), session, opts, "raw_chunk_quarantined") === "done") {
            return;
          }
        }
      }

      // Stream ended without [DONE]
      if (session.fullText.length > 0) {
        trace("stream_done_no_marker", { fullLength: session.fullText.length });
        opts.onDone(session.fullText);
      } else {
        opts.onError({
          kind: "empty_stream",
          message: "Ghost started thinking but didn't respond. Try rephrasing.",
          retryable: true,
        });
      }
      return;
    }

    // ── Fallback: no streaming body ─────────────────────────────────────
    const fallbackBody = await res.text().catch(() => "");
    const fallback = { fullText: "" };
    for (const line of fallbackBody.split(/\r?\n/)) {
      if (applyStreamEvent(parseStreamLine(line, opts.requestId), fallback, opts, "fallback_chunk_quarantined") === "done") {
        return;
      }
    }
    trace("fallback_done", { fullLength: fallback.fullText.length });
    opts.onDone(fallback.fullText);
  } catch (err: any) {
    if (isCancelled()) {
      trace("send_cancelled");
      if (opts.onCancelled) {
        opts.onCancelled();
      } else {
        opts.onError({
          kind: "interrupted",
          message: "Request cancelled.",
          retryable: false,
        });
      }
    } else {
      trace("send_error", { message: err?.message ?? String(err) });
      opts.onError(networkError(err));
    }
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (opts.signal) {
      opts.signal.removeEventListener("abort", handleExternalAbort);
    }
  }
}

// ─── Memory Self (canonical personal-context store) ───────────────────────
// Same source the web console reads: live structured facts Ghost extracted
// from conversation, plus curated notes. This is the source of truth — the
// user-profile.md / curated-memory.md files are only a human-readable mirror.

export interface MemoryFact {
  id: string;
  kind: string;
  label: string;
  title: string;
  summary: string;
  domain: string;
  domain_label: string;
  value: string;
  created_at?: string;
  reinforce_count?: number;
  reinforced_at?: string | null;
}

export interface MemorySelf {
  entries: MemoryFact[];
  notes: string[];
  you: string[];
}

export async function fetchMemorySelf(cfg: GhostConfig): Promise<MemorySelf> {
  const res = await fetch(`${baseURL(cfg)}/v1/memory/self`, {
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error(`Failed to load memory (HTTP ${res.status})`);
  const data = await res.json();
  return {
    entries: Array.isArray(data?.entries) ? data.entries : [],
    notes: Array.isArray(data?.notes) ? data.notes : [],
    you: Array.isArray(data?.you) ? data.you : [],
  };
}

export async function forgetMemoryFact(cfg: GhostConfig, id: string): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/memory/self/forget`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`Failed to forget (HTTP ${res.status})`);
}

export async function forgetMemoryNote(
  cfg: GhostConfig,
  target: "user" | "memory",
  entry: string,
): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/memory/self/forget`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ target, entry }),
  });
  if (!res.ok) throw new Error(`Failed to forget (HTTP ${res.status})`);
}

// ─── Pi System ────────────────────────────────────────────────────────────

export async function fetchStats(cfg: GhostConfig): Promise<PiStats> {
  const res = await fetch(`${baseURL(cfg)}/v1/stats`, {
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

// ─── Mid-turn steering ──────────────────────────────────────────────────────

export interface SteeringInput {
  sessionKey: string;
  content?: string;
  action: "redirect" | "interrupt" | "abort";
}

export async function sendSteering(
  cfg: GhostConfig,
  input: SteeringInput,
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${baseURL(cfg)}/v1/steering`,
      {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          session_key: input.sessionKey,
          content: input.content ?? "",
          action: input.action,
        }),
      },
      8000,
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Frozen contract: identity / activity / permissions / routines ──────────

export interface GhostIdentity {
  ghostId: string;
  name: string;
  owner: string;
}

export async function fetchIdentity(cfg: GhostConfig): Promise<GhostIdentity | null> {
  try {
    const res = await fetchWithTimeout(`${baseURL(cfg)}/v1/identity`, { headers: headers(cfg) }, 8000);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const g = data?.ghost ?? {};
    return {
      ghostId: String(g.ghost_id ?? ""),
      name: String(g.name ?? "Ghost"),
      owner: String(g.owner ?? ""),
    };
  } catch {
    return null;
  }
}

export interface ActivityChip {
  id: string;
  event_id: string;
  seq: number;
  title: string;
  kind: string;
  state: string;
  timestamp: string;
  summary?: string;
  detail?: string;
}

export async function fetchActivity(
  cfg: GhostConfig,
  opts?: { limit?: number; sinceSeq?: number; conversationId?: string },
): Promise<ActivityChip[]> {
  const qs = activityQuery(opts?.limit ?? 50, opts?.sinceSeq, opts?.conversationId);
  const res = await fetch(`${baseURL(cfg)}/v1/activity?${qs}`, { headers: headers(cfg) });
  if (!res.ok) throw new Error(`Activity failed (HTTP ${res.status})`);
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.activity) ? data.activity : [];
}

export interface ApprovalAction {
  id: string;
  label: string;
  style: string;
}

export interface ApprovalCard {
  request_id: string;
  agent_id: string;
  title: string;
  description: string;
  risk: string;
  expires_at: string;
  actions: ApprovalAction[];
}

export interface PendingApproval {
  id: string;
  request_id: string;
  capability: string;
  action: string;
  status: string;
  created_at: string;
  expires_at: string;
  card?: ApprovalCard;
}

export async function fetchPendingApprovals(cfg: GhostConfig): Promise<PendingApproval[]> {
  const res = await fetch(`${baseURL(cfg)}/v1/permissions/requests?status=pending`, { headers: headers(cfg) });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.requests) ? data.requests : [];
}

export type ApprovalGrant = "allow_once" | "allow_always" | "deny";

export function isValidGrant(grant: string): grant is ApprovalGrant {
  return grant === "allow_once" || grant === "allow_always" || grant === "deny";
}

export async function resolveApproval(
  cfg: GhostConfig,
  id: string,
  grant: ApprovalGrant,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidGrant(grant)) {
    return { ok: false, error: "Unknown approval action. Nothing was sent." };
  }
  try {
    const res = await fetchWithTimeout(
      `${baseURL(cfg)}/v1/permissions/resolve`,
      { method: "POST", headers: headers(cfg), body: JSON.stringify({ id, grant }) },
      10000,
    );
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => null);
    return { ok: false, error: data?.error?.message ?? "That approval is no longer answerable." };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export interface RoutineItem {
  id: string;
  name: string;
  instruction: string;
  timezone?: string;
  status: string;
  next_run?: string | null;
  last_run?: string | null;
}

export async function fetchRoutines(cfg: GhostConfig): Promise<RoutineItem[]> {
  const res = await fetchWithTimeout(`${baseURL(cfg)}/v1/routines`, { headers: headers(cfg) }, 10000);
  if (!res.ok) throw new Error(`Routines failed (HTTP ${res.status})`);
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.routines) ? data.routines : [];
}

export async function controlRoutine(
  cfg: GhostConfig,
  id: string,
  action: "pause" | "resume" | "cancel" | "delete",
): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/routines/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error(`Routine ${action} failed (HTTP ${res.status})`);
}

export interface ConnectionInfo {
  id: string;
  provider: string;
  display_name: string;
  status: string;
  capabilities?: string[] | Record<string, unknown>;
}

export async function fetchConnections(cfg: GhostConfig): Promise<ConnectionInfo[]> {
  const res = await fetchWithTimeout(`${baseURL(cfg)}/v1/connections`, { headers: headers(cfg) }, 10000);
  if (!res.ok) throw new Error(`Connections failed (HTTP ${res.status})`);
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.connections) ? data.connections : [];
}

export interface DoctorCheck {
  name: string;
  status: string;
  message: string;
}

export interface DoctorStatus {
  status: string;
  checks: DoctorCheck[];
}

export async function fetchDoctorStatus(cfg: GhostConfig): Promise<DoctorStatus | null> {
  try {
    const res = await fetchWithTimeout(`${baseURL(cfg)}/v1/doctor`, { headers: headers(cfg) }, 10000);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return { status: String(data?.status ?? "unknown"), checks: Array.isArray(data?.checks) ? data.checks : [] };
  } catch {
    return null;
  }
}

export interface VoiceTurnResult {
  ok: boolean;
  transcript?: string;
  responseText?: string;
  error?: string;
}

export async function voiceTurn(
  cfg: GhostConfig,
  audioBase64: string,
  mime: string,
  sessionKey: string,
): Promise<VoiceTurnResult> {
  try {
    const res = await fetchWithTimeout(
      `${baseURL(cfg)}/v1/voice/turn`,
      {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({ audio_base64: audioBase64, mime, session_key: sessionKey }),
      },
      60000,
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? "Voice input isn't set up yet." };
    }
    return { ok: true, transcript: String(data?.transcript ?? ""), responseText: String(data?.response_text ?? "") };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function voiceTranscribeUri(cfg: GhostConfig, uri: string, sessionKey: string): Promise<string> {
  try {
    const FS = await import("expo-file-system");
    const read = (FS as unknown as { readAsStringAsync?: (u: string, o?: unknown) => Promise<string> }).readAsStringAsync;
    if (!read) return "";
    const b64 = await read(uri, { encoding: "base64" });
    if (!b64) return "";
    const out = await voiceTurn(cfg, b64, "audio/m4a", sessionKey);
    return out.ok ? (out.transcript ?? "") : "";
  } catch {
    return "";
  }
}

// ─── Cron / scheduled / skills: intentionally absent ───────────────────────
// These backend capabilities have no mobile product surface. Routines are
// managed through /v1/routines. (Removed to prevent contract drift.)

// ─── WebSocket ─────────────────────────────────────────────────────────────

export type WSMessage = {
  id?: string;
  timestamp?: number;
  session_id?: string;
  type?: string;
  content?: string;
  channel?: string;
  chat_id?: string;
  metadata?: Record<string, unknown>;
};
type WSHandler = (msg: WSMessage) => void;
type WSStateHandler = (
  state: "connected" | "disconnected" | "reconnecting",
) => void;

let wsInstance: WebSocket | null = null;
let wsHandlers: WSHandler[] = [];
let wsStateHandlers: WSStateHandler[] = [];
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsLastPong: number = 0;
let wsPingInterval: ReturnType<typeof setInterval> | null = null;
let wsIsConnecting = false;
let wsShouldReconnect = true;
let wsCurrentURL: string | null = null;
let wsReconnectConfig: GhostConfig | null = null;

export function connectWebSocket(cfg: GhostConfig): void {
  // Credentials are never placed in URLs (they leak into logs, history, and
  // referer headers). The gateway trusts localhost traffic and validates
  // device credentials on relay-forwarded requests; the relay authenticates
  // the app tunnel itself. React Native WebSocket cannot send custom
  // headers, so the connection is unauthenticated by design.
  const url = `${wsURL(cfg)}/v1/ws`;
  wsReconnectConfig = cfg;
  wsShouldReconnect = true;
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  if (wsPingInterval) {
    clearInterval(wsPingInterval);
    wsPingInterval = null;
  }
  if (
    wsInstance &&
    wsCurrentURL === url &&
    (wsInstance.readyState === WebSocket.OPEN ||
      wsInstance.readyState === WebSocket.CONNECTING ||
      wsIsConnecting)
  ) {
    trace("ws_connect_skip_existing", { url, state: wsInstance.readyState });
    return;
  }
  if (
    wsInstance &&
    wsInstance.readyState === WebSocket.CONNECTING &&
    wsIsConnecting
  ) {
    trace("ws_connect_skip_inflight", { url });
    return;
  }
  if (wsInstance) {
    try {
      wsShouldReconnect = false;
      wsInstance.close();
    } catch {}
  }

  notifyWSState("reconnecting");
  trace("ws_connecting", { url });
  wsCurrentURL = url;
  wsIsConnecting = true;
  wsInstance = new WebSocket(url);

  wsInstance.onopen = () => {
    wsIsConnecting = false;
    wsLastPong = Date.now();
    trace("ws_open");
    notifyWSState("connected");
    // Health check: reconnect if no message received in 60s
    wsPingInterval = setInterval(() => {
      if (Date.now() - wsLastPong > 60_000) {
        trace("ws_stale_reconnect");
        notifyWSState("reconnecting");
        try {
          wsInstance?.close();
        } catch {}
      }
    }, 25_000);
  };

  wsInstance.onmessage = (e) => {
    wsLastPong = Date.now();
    try {
      const msg = JSON.parse(e.data);
      trace("ws_message", {
        type: msg?.type ?? msg?.metadata?.type ?? "unknown",
        channel: msg?.channel ?? "unknown",
      });
      wsHandlers.forEach((h) => h(msg));
    } catch {}
  };

  wsInstance.onclose = () => {
    wsIsConnecting = false;
    if (wsPingInterval) {
      clearInterval(wsPingInterval);
      wsPingInterval = null;
    }
    trace("ws_close");
    notifyWSState("disconnected");
    wsInstance = null;
    if (wsShouldReconnect && wsReconnectConfig) {
      wsReconnectTimer = setTimeout(
        () => connectWebSocket(wsReconnectConfig as GhostConfig),
        5000,
      );
    }
  };

  wsInstance.onerror = () => {
    trace("ws_error");
    try {
      wsInstance?.close();
    } catch {}
  };
}

function notifyWSState(state: "connected" | "disconnected" | "reconnecting") {
  wsStateHandlers.forEach((h) => h(state));
}

export function onWSMessage(handler: WSHandler): () => void {
  wsHandlers.push(handler);
  return () => {
    wsHandlers = wsHandlers.filter((h) => h !== handler);
  };
}

export function onWSStateChange(handler: WSStateHandler): () => void {
  wsStateHandlers.push(handler);
  return () => {
    wsStateHandlers = wsStateHandlers.filter((h) => h !== handler);
  };
}

export function getWSState(): "connected" | "disconnected" | "reconnecting" {
  if (!wsInstance) return "disconnected";
  if (wsInstance.readyState === WebSocket.OPEN) return "connected";
  if (wsInstance.readyState === WebSocket.CONNECTING) return "reconnecting";
  return "disconnected";
}

export function disconnectWebSocket(): void {
  wsShouldReconnect = false;
  wsIsConnecting = false;
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  wsReconnectTimer = null;
  if (wsPingInterval) clearInterval(wsPingInterval);
  wsPingInterval = null;
  wsCurrentURL = null;
  wsReconnectConfig = null;
  try {
    wsInstance?.close();
  } catch {}
  wsInstance = null;
}
