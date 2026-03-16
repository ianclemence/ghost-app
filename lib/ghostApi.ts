import AsyncStorage from "@react-native-async-storage/async-storage";

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
  secret: string;
  session?: string;
}

export interface PiStats {
  uptime: string;
  cpu_temp: string;
  memory: string;
  disk: string;
  load: string;
  ip: string;
  hostname: string;
  ghost_svc: string;
  timestamp: string;
}

export interface DoctorCheckResult {
  name: string;
  status: string; // ok, fail, warn
  message: string;
  latency_ms: number;
}

export interface ProfileInfo {
  name: string;
  permissions: string[];
}

export interface DoctorResponse {
  uptime: number;
  version: string;
  checks: DoctorCheckResult[];
  profile: ProfileInfo;
  timestamp: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

export interface ConnectionDebugResult {
  ok: boolean;
  url: string;
  status?: number;
  statusText?: string;
  body?: string;
  error?: string;
  latencyMs?: number;
}

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

function classifyError(status: number, body: string): GhostError {
  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      message: "Connection rejected — check your secret in Settings",
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

function classifyStreamError(errorText: string): GhostError {
  const lower = errorText.toLowerCase();
  if (
    lower.includes("429") ||
    lower.includes("rate") ||
    lower.includes("too many")
  ) {
    return {
      kind: "rate_limit",
      message: "Ghost is temporarily busy. Try again in a moment.",
      retryable: true,
    };
  }
  if (
    lower.includes("401") ||
    lower.includes("unauthorized") ||
    lower.includes("auth")
  ) {
    return {
      kind: "auth",
      message: "AI provider authentication failed.",
      retryable: false,
    };
  }
  if (lower.includes("no text chunks") || lower.includes("empty")) {
    return {
      kind: "empty_stream",
      message: "Ghost started thinking but didn't respond. Try rephrasing.",
      retryable: true,
    };
  }
  if (
    lower.includes("upstream http 5") ||
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return {
      kind: "provider",
      message: "Ghost couldn't generate a response. This is a temporary issue.",
      retryable: true,
    };
  }
  return { kind: "provider", message: errorText, retryable: true };
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

// ─── Config ────────────────────────────────────────────────────────────────

const CONFIG_KEY = "ghost_config";

export async function loadConfig(): Promise<GhostConfig | null> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveConfig(cfg: GhostConfig): Promise<void> {
  await AsyncStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({
      piHost: normalizeHost(cfg.piHost),
      piPort: normalizePort(cfg.piPort),
      secret: cfg.secret.trim(),
      session: normalizeSession(cfg.session),
    }),
  );
}

function baseURL(cfg: GhostConfig): string {
  return `http://${normalizeHost(cfg.piHost)}:${normalizePort(cfg.piPort)}`;
}

function wsURL(cfg: GhostConfig): string {
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

function normalizeSession(session?: string): string {
  const value = (session ?? "").trim();
  return value === "" ? "mobile:default" : value;
}

function headers(cfg: GhostConfig): HeadersInit {
  return { "Content-Type": "application/json", "X-Ghost-Secret": cfg.secret };
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

export async function checkHealth(cfg: GhostConfig): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${baseURL(cfg)}/v1/health`,
      { headers: headers(cfg) },
      5000,
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkHealthDebug(
  cfg: GhostConfig,
): Promise<ConnectionDebugResult> {
  const url = `${baseURL(cfg)}/v1/health`;
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, { headers: headers(cfg) }, 5000);
    const latencyMs = Date.now() - start;
    const body = await res.text().catch(() => "");
    return {
      ok: res.ok,
      url,
      status: res.status,
      statusText: res.statusText,
      body: body.slice(0, 300),
      latencyMs,
    };
  } catch (err: any) {
    return {
      ok: false,
      url,
      error: err?.message ?? String(err),
      latencyMs: Date.now() - start,
    };
  }
}

// ─── History ───────────────────────────────────────────────────────────────

export async function fetchHistory(
  cfg: GhostConfig,
  limit = 50,
  offset = 0,
): Promise<{ messages: Message[]; total: number }> {
  const session = normalizeSession(cfg.session);
  const res = await fetch(
    `${baseURL(cfg)}/v1/history?limit=${limit}&offset=${offset}&session=${encodeURIComponent(session)}`,
    { headers: messageHeaders(cfg) },
  );
  if (!res.ok) throw new Error(`Failed to fetch history (HTTP ${res.status})`);
  return res.json();
}

export async function searchMessages(
  cfg: GhostConfig,
  q: string,
  scope: "session" | "all" = "session",
  limit = 30,
): Promise<Message[]> {
  const session = scope === "session" ? normalizeSession(cfg.session) : "";
  const res = await fetch(
    `${baseURL(cfg)}/v1/search?q=${encodeURIComponent(q)}&limit=${limit}&session=${encodeURIComponent(session)}`,
    { headers: messageHeaders(cfg) },
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  return [];
}

export async function deleteMessage(
  cfg: GhostConfig,
  id: string,
): Promise<void> {
  await fetch(`${baseURL(cfg)}/v1/message?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: messageHeaders(cfg),
  });
}

export async function clearChat(cfg: GhostConfig): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/messages`, {
    method: "DELETE",
    headers: messageHeaders(cfg),
  });
  if (!res.ok) throw new Error(`Failed to clear chat (HTTP ${res.status})`);
}

// ─── Send (streaming SSE) ─────────────────────────────────────────────────

export interface SendOptions {
  content: string;
  mediaB64?: string;
  mediaType?: string;
  onChunk: (chunk: string) => void;
  onToolStatus?: (tool: string, label: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: GhostError) => void;
}

// 300 seconds — handles complex multi-step agent tasks (web search + fetches + tool chains)
// Keep-alive pings from the server prevent the connection dying before this fires
const STREAM_TIMEOUT_MS = 300_000;

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

  const body: Record<string, unknown> = {
    content: opts.content,
    session_key: normalizeSession(cfg.session),
    channel: "mobile",
    chat_id: "default",
  };
  if (mediaItems.length > 0) body.media_items = mediaItems;

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

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: messageHeaders(cfg),
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
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith(":")) continue; // SSE comment / keep-alive ping
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();

          if (data === "[DONE]") {
            trace("stream_done_marker");
            opts.onDone(fullText);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            // tool_status event — route to badge, NOT to message content
            if (typeof parsed === "object" && parsed !== null) {
              if (parsed.type === "tool_status" && opts.onToolStatus) {
                opts.onToolStatus(parsed.tool, parsed.label);
              }
              trace("stream_object", { type: parsed.type ?? "unknown" });
              continue; // Never append objects to message content
            }
            // Plain string chunk
            const text = parsed as string;
            fullText += text;
            opts.onChunk(text);
            trace("stream_chunk", { length: text.length });
          } catch {
            fullText += data;
            opts.onChunk(data);
            trace("stream_raw_chunk", { length: data.length });
          }
        }
      }

      // Stream ended without [DONE]
      if (fullText.length > 0) {
        trace("stream_done_no_marker", { fullLength: fullText.length });
        opts.onDone(fullText);
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
    let fullText = "";
    for (const line of fallbackBody.split(/\r?\n/)) {
      if (line.startsWith(":")) continue;
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        opts.onDone(fullText);
        return;
      }
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed === "object" && parsed !== null) {
          if (parsed.type === "tool_status" && opts.onToolStatus) {
            opts.onToolStatus(parsed.tool, parsed.label);
          }
          continue;
        }
        const text = parsed as string;
        fullText += text;
        opts.onChunk(text);
      } catch {
        fullText += data;
        opts.onChunk(data);
      }
    }
    trace("fallback_done", { fullLength: fullText.length });
    opts.onDone(fullText);
  } catch (err: any) {
    trace("send_error", { message: err?.message ?? String(err) });
    opts.onError(networkError(err));
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}

// ─── File Upload ───────────────────────────────────────────────────────────

export async function uploadFile(
  cfg: GhostConfig,
  uri: string,
  mimeType: string,
  filename: string,
): Promise<{ b64: string; mime_type: string }> {
  const form = new FormData();
  form.append("file", { uri, type: mimeType, name: filename } as any);
  const res = await fetch(`${baseURL(cfg)}/v1/upload`, {
    method: "POST",
    headers: { "X-Ghost-Secret": cfg.secret },
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

// ─── Voice Transcription ───────────────────────────────────────────────────

export async function transcribeAudio(
  cfg: GhostConfig,
  audioUri: string,
  filename = "recording.m4a",
): Promise<string> {
  const form = new FormData();
  form.append("audio", {
    uri: audioUri,
    type: "audio/m4a",
    name: filename,
  } as any);
  try {
    const res = await fetch(`${baseURL(cfg)}/v1/transcribe`, {
      method: "POST",
      headers: { "X-Ghost-Secret": cfg.secret },
      body: form,
    });
    if (!res.ok) return "";
    const data: { text: string; error?: string } = await res.json();
    return data.text ?? "";
  } catch {
    return "";
  }
}

// ─── Memory Files ──────────────────────────────────────────────────────────

export async function fetchMemoryFiles(
  cfg: GhostConfig,
): Promise<{ name: string; modified: number; size: number }[]> {
  const res = await fetch(`${baseURL(cfg)}/v1/memory/files`, {
    headers: headers(cfg),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchMemoryFile(
  cfg: GhostConfig,
  name: string,
): Promise<string> {
  const res = await fetch(
    `${baseURL(cfg)}/v1/memory/file?name=${encodeURIComponent(name)}`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new Error("Not found");
  const data = await res.json();
  return data.content;
}

// ─── Pi System ────────────────────────────────────────────────────────────

export async function fetchStats(cfg: GhostConfig): Promise<PiStats> {
  const res = await fetch(`${baseURL(cfg)}/v1/stats`, {
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchDoctor(cfg: GhostConfig): Promise<DoctorResponse> {
  const res = await fetch(`${baseURL(cfg)}/v1/doctor`, {
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error("Failed to fetch doctor stats");
  return res.json();
}

export async function fetchAvailableTools(cfg: GhostConfig): Promise<string[]> {
  const res = await fetch(`${baseURL(cfg)}/v1/tools`, {
    headers: headers(cfg),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const tools = Array.isArray(data?.tools) ? data.tools : [];
  return tools
    .map((t: any) => (typeof t?.name === "string" ? t.name : ""))
    .filter((name: string) => name.length > 0);
}

export async function runExec(
  cfg: GhostConfig,
  command: string,
  timeout = 10,
): Promise<ExecResult> {
  const res = await fetch(`${baseURL(cfg)}/v1/exec`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ command, timeout }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? "exec failed");
  }
  return res.json();
}

export async function openOnPi(
  cfg: GhostConfig,
  target: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${baseURL(cfg)}/v1/open`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ target }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return { ok: false, error: err.error };
  }
  return res.json();
}

export async function takeScreenshot(
  cfg: GhostConfig,
): Promise<{ image: string; mime_type: string }> {
  const res = await fetch(`${baseURL(cfg)}/v1/screenshot`, {
    headers: headers(cfg),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? "screenshot failed");
  }
  return res.json();
}

// ─── Cron ──────────────────────────────────────────────────────────────────

export interface CronSchedule {
  kind: string;
  atMs?: number;
  everyMs?: number;
  expr?: string;
  tz?: string;
}

export interface CronPayload {
  kind: string;
  message: string;
  command?: string;
  deliver: boolean;
  channel?: string;
  to?: string;
  target?: string;
  origin_id?: string;
}

export interface CronJobState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: string;
  lastError?: string;
}

export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  lifecycle_state: string;
  paused_at?: string;
  run_count: number;
  last_run_at?: string;
  next_run_at?: string;
  schedule: CronSchedule;
  payload: CronPayload;
  state: CronJobState;
  createdAtMs: number;
  updatedAtMs: number;
  deleteAfterRun: boolean;
}

export async function fetchCronJobs(cfg: GhostConfig): Promise<CronJob[]> {
  const res = await fetch(`${baseURL(cfg)}/v1/cron/jobs`, {
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error("Failed to fetch cron jobs");
  const data = await res.json();
  return data.jobs ?? [];
}

export async function controlCronJob(
  cfg: GhostConfig,
  id: string,
  action: "pause" | "resume" | "run",
): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/cron/jobs/${id}/${action}`, {
    method: "POST",
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error(`Failed to ${action} job`);
}

export async function pauseCronJob(cfg: GhostConfig, id: string): Promise<void> {
  return controlCronJob(cfg, id, "pause");
}

export async function resumeCronJob(cfg: GhostConfig, id: string): Promise<void> {
  return controlCronJob(cfg, id, "resume");
}

export async function runCronJobNow(cfg: GhostConfig, id: string): Promise<void> {
  return controlCronJob(cfg, id, "run");
}

// ─── WebSocket ─────────────────────────────────────────────────────────────

export type WSMessage = {
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

export function connectWebSocket(cfg: GhostConfig): void {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  if (wsPingInterval) clearInterval(wsPingInterval);
  try {
    wsInstance?.close();
  } catch {}

  notifyWSState("reconnecting");
  const url = `${wsURL(cfg)}/v1/ws?secret=${encodeURIComponent(cfg.secret)}&session=${encodeURIComponent(normalizeSession(cfg.session))}`;
  trace("ws_connecting", { url });
  wsInstance = new WebSocket(url);

  wsInstance.onopen = () => {
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
    if (wsPingInterval) clearInterval(wsPingInterval);
    trace("ws_close");
    notifyWSState("disconnected");
    wsReconnectTimer = setTimeout(() => connectWebSocket(cfg), 5000);
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
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  if (wsPingInterval) clearInterval(wsPingInterval);
  try {
    wsInstance?.close();
  } catch {}
  wsInstance = null;
}
