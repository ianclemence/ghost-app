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
  channels?: Record<string, ChannelHealth>;
}

export interface ChannelHealth {
  enabled: boolean;
  running: boolean;
  fatal: boolean;
  fatal_reason: string;
  failure_count: number;
  last_send_error: string;
  last_failure_at: number;
  last_success_at: number;
}

export interface SessionInspector {
  requested_session: string;
  active_session: { channel: string; chat_id: string };
  delivery_target: string;
  last_request_id: string;
  timestamp: number;
}

export interface DeliveryTraceEvent {
  request_id: string;
  state: string;
  at: number;
  channel?: string;
  chat_id?: string;
  detail?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

export interface WorkspaceFileEntry {
  name: string;
  modified: number;
  size: number;
}

export interface WorkspaceFilePreview {
  previewable: boolean;
  kind?: "text" | "image" | "binary";
  mime_type?: string;
  reason: string;
  size: number;
  truncated: boolean;
  content: string;
  image_base64?: string;
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

function noteAuthFailure(status: number, body: string): void {
  if (authFailureNotified) return;
  if (status !== 401 && status !== 403) return;
  let code = "";
  try {
    const parsed = JSON.parse(body);
    code = parsed?.error?.code ?? "";
  } catch {}
  authFailureNotified = true;
  authFailureHandler?.(code === "device_revoked" ? "revoked" : "invalid");
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

function normalizeSession(session?: string): string {
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

export async function checkHealth(cfg: GhostConfig): Promise<boolean> {
  return (await checkHealthInfo(cfg)).ok;
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

// ─── Pairing ─────────────────────────────────────────────────────────────

export interface PairingInvitation {
  pairing_id: string;
  pod_id: string;
  transport: string;
  host: string;
  port: string;
  token: string;
  expires_at: string;
  expires_in: number;
}

export interface PairingCompleteResult {
  device_id: string;
  credential: string;
  paired_at: string;
  ghost_name?: string;
}

export interface PairedDevice {
  id: string;
  device_id: string;
  display_name: string;
  platform?: string;
  paired_at: string;
  last_seen_at?: string;
  revoked_at?: string;
}

export interface PairingErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Create a pairing invitation. Returns a short-lived token for QR display.
 * Called from the Ghost Pod web UI (not the mobile app).
 */
export async function createPairingInvitation(
  cfg: GhostConfig,
  displayName: string,
): Promise<PairingInvitation> {
  const res = await fetch(`${baseURL(cfg)}/v1/pairing/invitations`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!res.ok) throw new Error(`Failed to create pairing invitation (HTTP ${res.status})`);
  return res.json();
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

/**
 * @deprecated Use createPairingInvitation() instead.
 */
export async function startPairing(
  cfg: GhostConfig,
  displayName: string,
): Promise<PairingInvitation> {
  return createPairingInvitation(cfg, displayName);
}

/**
 * @deprecated Use completePairing() instead.
 */
export async function redeemPairing(
  cfg: GhostConfig,
  token: string,
): Promise<PairingCompleteResult> {
  return completePairing(cfg, token, "Phone", "unknown");
}

/** List all paired devices. */
export async function listPairedDevices(
  cfg: GhostConfig,
): Promise<PairedDevice[]> {
  const res = await fetch(`${baseURL(cfg)}/v1/pairing/devices`, {
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error(`Failed to list devices (HTTP ${res.status})`);
  const data = await res.json();
  return data.devices ?? [];
}

/** Revoke a paired device. */
export async function revokePairedDevice(
  cfg: GhostConfig,
  deviceID: string,
): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/pairing/revoke`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ device_id: deviceID }),
  });
  if (!res.ok) throw new Error(`Failed to revoke device (HTTP ${res.status})`);
}

/** Cancel a pending pairing token. */
export async function cancelPairing(
  cfg: GhostConfig,
  pairingID: string,
): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/pairing/cancel`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ pairing_id: pairingID }),
  });
  if (!res.ok) throw new Error(`Failed to cancel pairing (HTTP ${res.status})`);
}

// ─── History ───────────────────────────────────────────────────────────────

export async function fetchHistory(
  cfg: GhostConfig,
  limit = 50,
  offset = 0,
  since?: number,
): Promise<{ messages: Message[]; total: number }> {
  const session = normalizeSession(cfg.session);
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    session,
  });
  if (typeof since === "number" && Number.isFinite(since) && since > 0) {
    qs.set("since", String(Math.floor(since)));
  }
  const res = await fetch(`${baseURL(cfg)}/v1/history?${qs.toString()}`, {
    headers: messageHeaders(cfg),
  });
  if (!res.ok) throw new Error(`Failed to fetch history (HTTP ${res.status})`);
  return res.json();
}

export interface SearchResult {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  rank: number;
}

export async function searchMessages(
  cfg: GhostConfig,
  q: string,
  scope: "session" | "all" = "session",
  limit = 30,
): Promise<SearchResult[]> {
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

export async function deleteSession(
  cfg: GhostConfig,
  id: string,
): Promise<void> {
  const res = await fetch(
    `${baseURL(cfg)}/v1/session?id=${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: headers(cfg),
    },
  );
  if (!res.ok) throw new Error(`Failed to delete session (HTTP ${res.status})`);
}

export async function renameSession(
  cfg: GhostConfig,
  oldId: string,
  newId: string,
): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/session/rename`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ old_id: oldId, new_id: newId }),
  });
  if (!res.ok) throw new Error(`Failed to rename session (HTTP ${res.status})`);
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
  requestId?: string;
  mediaB64?: string;
  mediaType?: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
  onLifecycle?: (requestId: string, state: string) => void;
  onSanitized?: (reason: string) => void;
  onToolStatus?: (tool: string, label: string) => void;
  onCancelled?: () => void;
  onDone: (fullText: string) => void;
  onError: (err: GhostError) => void;
}

// 300 seconds — handles complex multi-step agent tasks (web search + fetches + tool chains)
// Keep-alive pings from the server prevent the connection dying before this fires
const STREAM_TIMEOUT_MS = 300_000;

function isLikelyLogOrCorruptChunk(data: string): boolean {
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

type WeatherLocationMeta = {
  city?: string;
  region?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  location_source?: string;
};

function isWeatherPrompt(text: string): boolean {
  const lc = text.toLowerCase();
  return (
    lc.includes("weather") ||
    lc.includes("forecast") ||
    lc.includes("temperature")
  );
}

function hasExplicitLocation(text: string): boolean {
  const lc = text.toLowerCase();
  return lc.includes(" in ") || lc.includes(" at ") || lc.includes(" for ");
}

async function resolveApproxLocationMetadata(): Promise<WeatherLocationMeta | null> {
  try {
    const res = await fetchWithTimeout("https://ipapi.co/json/", {}, 2500);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const city = typeof data.city === "string" ? data.city : "";
    const region = typeof data.region === "string" ? data.region : "";
    const country =
      typeof data.country_name === "string" ? data.country_name : "";
    const latitude =
      typeof data.latitude === "number"
        ? String(data.latitude)
        : typeof data.latitude === "string"
          ? data.latitude
          : "";
    const longitude =
      typeof data.longitude === "number"
        ? String(data.longitude)
        : typeof data.longitude === "string"
          ? data.longitude
          : "";
    const timezone = typeof data.timezone === "string" ? data.timezone : "";
    if (!city && !latitude) return null;
    return {
      city,
      region,
      country,
      latitude,
      longitude,
      timezone,
      location_source: "mobile_ip",
    };
  } catch {
    return null;
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

  const body: Record<string, unknown> = {
    request_id: opts.requestId,
    content: opts.content,
    session_key: normalizeSession(cfg.session),
    channel: "mobile",
    chat_id: "default",
  };
  if (mediaItems.length > 0) body.media_items = mediaItems;
  if (cfg.sendLocation !== false && isWeatherPrompt(opts.content)) {
    const meta = await resolveApproxLocationMetadata();
    if (meta) {
      body.metadata = meta;
    } else if (!hasExplicitLocation(opts.content)) {
      body.metadata = {
        location_source: "none",
        location_hint: "ask_or_label_fallback",
      };
    }
  }

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
              if (parsed.type === "lifecycle" && opts.onLifecycle) {
                opts.onLifecycle(
                  String(parsed.request_id || opts.requestId || ""),
                  String(parsed.state || ""),
                );
              }
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
            if (isLikelyLogOrCorruptChunk(data)) {
              trace("stream_raw_chunk_ignored", { length: data.length });
              if (opts.onSanitized) opts.onSanitized("raw_chunk_quarantined");
              continue;
            }
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
          if (parsed.type === "lifecycle" && opts.onLifecycle) {
            opts.onLifecycle(
              String(parsed.request_id || opts.requestId || ""),
              String(parsed.state || ""),
            );
          }
          if (parsed.type === "tool_status" && opts.onToolStatus) {
            opts.onToolStatus(parsed.tool, parsed.label);
          }
          continue;
        }
        const text = parsed as string;
        fullText += text;
        opts.onChunk(text);
      } catch {
        if (isLikelyLogOrCorruptChunk(data)) {
          if (opts.onSanitized) opts.onSanitized("fallback_chunk_quarantined");
          continue;
        }
        fullText += data;
        opts.onChunk(data);
      }
    }
    trace("fallback_done", { fullLength: fullText.length });
    opts.onDone(fullText);
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
    headers: authHeaders(cfg),
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
      headers: authHeaders(cfg),
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

export async function fetchWorkspaceFiles(
  cfg: GhostConfig,
): Promise<WorkspaceFileEntry[]> {
  const res = await fetch(`${baseURL(cfg)}/v1/workspace/files`, {
    headers: headers(cfg),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchWorkspaceFilePreview(
  cfg: GhostConfig,
  name: string,
): Promise<WorkspaceFilePreview> {
  const res = await fetch(
    `${baseURL(cfg)}/v1/workspace/file?name=${encodeURIComponent(name)}`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new Error("Not found");
  return res.json();
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

export async function fetchChannelStatus(
  cfg: GhostConfig,
): Promise<Record<string, ChannelHealth>> {
  const res = await fetch(`${baseURL(cfg)}/v1/channels/status`, {
    headers: headers(cfg),
  });
  if (!res.ok) return {};
  const data = await res.json();
  return (data?.channels ?? {}) as Record<string, ChannelHealth>;
}

export async function reconnectChannel(
  cfg: GhostConfig,
  channel: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${baseURL(cfg)}/v1/channels/reconnect`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ channel }),
  });
  return { ok: res.ok };
}

export async function inspectSession(
  cfg: GhostConfig,
  channel = "mobile",
  chatID = "default",
): Promise<SessionInspector | null> {
  const session = encodeURIComponent(normalizeSession(cfg.session));
  const url = `${baseURL(cfg)}/v1/session/inspect?session=${session}&channel=${encodeURIComponent(
    channel,
  )}&chat_id=${encodeURIComponent(chatID)}`;
  const res = await fetch(url, { headers: headers(cfg) });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchDeliveryTrace(
  cfg: GhostConfig,
  requestID: string,
): Promise<DeliveryTraceEvent[]> {
  const url = `${baseURL(cfg)}/v1/traces?request_id=${encodeURIComponent(requestID)}`;
  const res = await fetch(url, { headers: headers(cfg) });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.events) ? data.events : [];
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

// ─── Clarify responses ──────────────────────────────────────────────────────

export async function respondClarify(
  cfg: GhostConfig,
  questionId: string,
  response: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${baseURL(cfg)}/v1/clarify/respond`,
      {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({ question_id: questionId, response }),
      },
      8000,
    );
    if (res.ok) return { ok: true };
    const err = await res.json().catch(() => ({}));
    return {
      ok: false,
      error:
        (err as { error?: string }).error ??
        `Clarify failed (HTTP ${res.status})`,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

// ─── Model presets ──────────────────────────────────────────────────────────

export interface ModelPresetInfo {
  name: string;
  provider: string;
  model: string;
}

export interface ModelInfo {
  active: string;
  provider: string;
  presets: ModelPresetInfo[];
}

export async function fetchModelInfo(
  cfg: GhostConfig,
): Promise<ModelInfo | null> {
  try {
    const res = await fetchWithTimeout(
      `${baseURL(cfg)}/v1/model`,
      { headers: headers(cfg) },
      8000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      active: String(data?.active ?? ""),
      provider: String(data?.provider ?? ""),
      presets: Array.isArray(data?.presets)
        ? data.presets.map((p: Record<string, unknown>) => ({
            name: String(p.name ?? ""),
            provider: String(p.provider ?? ""),
            model: String(p.model ?? ""),
          }))
        : [],
    };
  } catch {
    return null;
  }
}

export async function setActiveModel(
  cfg: GhostConfig,
  model: string,
): Promise<{ ok: boolean; active?: string; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${baseURL(cfg)}/v1/model`,
      {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({ model }),
      },
      8000,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error:
          (data as { error?: { message?: string } })?.error?.message ??
          (data as { error?: string })?.error ??
          `Switch failed (HTTP ${res.status})`,
      };
    }
    return { ok: true, active: String(data?.active ?? model) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  title: string;
  message_count: number;
  last_activity: number;
}

export async function fetchSessions(
  cfg: GhostConfig,
): Promise<SessionSummary[]> {
  const res = await fetchWithTimeout(
    `${baseURL(cfg)}/v1/sessions`,
    { headers: headers(cfg) },
    10000,
  );
  if (!res.ok) throw new Error(`Failed to fetch sessions (HTTP ${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data?.sessions)) return [];
  return data.sessions.map((s: Record<string, unknown>) => ({
    id: String(s.id ?? ""),
    title: String(s.title ?? ""),
    message_count: Number(s.message_count ?? 0),
    last_activity: Number(s.last_activity ?? 0),
  }));
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
  const res = await fetchWithTimeout(
    `${baseURL(cfg)}/v1/cron/jobs`,
    {
      headers: headers(cfg),
    },
    10000,
  );
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

export async function pauseCronJob(
  cfg: GhostConfig,
  id: string,
): Promise<void> {
  return controlCronJob(cfg, id, "pause");
}

export async function resumeCronJob(
  cfg: GhostConfig,
  id: string,
): Promise<void> {
  return controlCronJob(cfg, id, "resume");
}

export async function runCronJobNow(
  cfg: GhostConfig,
  id: string,
): Promise<void> {
  return controlCronJob(cfg, id, "run");
}

export interface CronJobCreateInput {
  name: string;
  schedule: CronSchedule;
  message?: string;
  command?: string;
  deliver?: boolean;
  channel?: string;
  to?: string;
  skills?: string[];
  no_agent?: boolean;
}

export type CronJobUpdate = Partial<{
  name: string;
  schedule: CronSchedule;
  message: string;
  command: string;
  deliver: boolean;
  channel: string;
  to: string;
  target: string;
  enabled: boolean;
  skills: string[];
  no_agent: boolean;
}>;

export async function createCronJob(
  cfg: GhostConfig,
  input: CronJobCreateInput,
): Promise<CronJob> {
  const res = await fetch(`${baseURL(cfg)}/v1/cron/jobs`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(
      err?.error?.message ?? err?.error ?? `Failed to create job (HTTP ${res.status})`,
    );
  }
  const data = await res.json();
  if (!data?.job) throw new Error("Create job returned no job");
  return data.job;
}

export async function updateCronJob(
  cfg: GhostConfig,
  id: string,
  updates: CronJobUpdate,
): Promise<CronJob> {
  const res = await fetch(`${baseURL(cfg)}/v1/cron/jobs`, {
    method: "PATCH",
    headers: headers(cfg),
    body: JSON.stringify({ id, updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(
      err?.error?.message ?? err?.error ?? `Failed to update job (HTTP ${res.status})`,
    );
  }
  const data = await res.json();
  if (!data?.job) throw new Error("Update job returned no job");
  return data.job;
}

export async function deleteCronJob(
  cfg: GhostConfig,
  id: string,
): Promise<void> {
  const res = await fetch(
    `${baseURL(cfg)}/v1/cron/jobs/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: headers(cfg) },
  );
  if (!res.ok) throw new Error(`Failed to delete job (HTTP ${res.status})`);
}

// ─── Skills ─────────────────────────────────────────────────────────────────

export interface GhostSkill {
  name: string;
  description: string;
  bundled: boolean;
  user_modified: boolean;
  enabled: boolean;
}

export interface GhostSkillFile {
  path: string;
  content: string;
}

export interface GhostSkillDetail extends GhostSkill {
  files: GhostSkillFile[];
}

export async function fetchSkills(cfg: GhostConfig): Promise<GhostSkill[]> {
  const res = await fetch(`${baseURL(cfg)}/v1/skills`, {
    headers: headers(cfg),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const skills = Array.isArray(data?.skills) ? data.skills : [];
  return skills.map((s: Record<string, unknown>) => ({
    name: String(s.name ?? ""),
    description: String(s.description ?? ""),
    bundled: s.bundled === true || s.bundled === "true",
    user_modified: s.user_modified === true || s.user_modified === "true",
    enabled: s.enabled === true || s.enabled === "true",
  }));
}

export async function toggleSkill(
  cfg: GhostConfig,
  name: string,
  enabled: boolean,
): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/skills/toggle`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ name, enabled }),
  });
  if (!res.ok) throw new Error(`Failed to toggle skill (HTTP ${res.status})`);
}

export async function fetchSkillDetail(
  cfg: GhostConfig,
  name: string,
): Promise<GhostSkillDetail | null> {
  const res = await fetch(
    `${baseURL(cfg)}/v1/skills/read?name=${encodeURIComponent(name)}`,
    { headers: headers(cfg) },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return {
    name: String(data.name ?? name),
    description: String(data.description ?? ""),
    bundled: data.bundled === true,
    user_modified: data.user_modified === true,
    enabled: data.enabled !== false,
    files: Array.isArray(data.files)
      ? data.files.map((f: Record<string, unknown>) => ({
          path: String(f.path ?? ""),
          content: String(f.content ?? ""),
        }))
      : [],
  };
}

export async function installSkill(
  cfg: GhostConfig,
  install: { owner: string; repo: string; path: string; name?: string; branch?: string },
): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/v1/skills/install`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify(install),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err?.error?.message ?? err?.error ?? "Failed to install skill");
  }
}

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
