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

// ─── Error Classification ──────────────────────────────────────────────────

export type GhostErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'provider'
  | 'network'
  | 'empty_stream'
  | 'interrupted'
  | 'timeout';

export interface GhostError {
  kind: GhostErrorKind;
  message: string;
  statusCode?: number;
  retryable: boolean;
}

function classifyError(status: number, body: string): GhostError {
  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      message: 'Connection rejected — check your secret in Settings',
      statusCode: status,
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      kind: 'rate_limit',
      message: 'Ghost is temporarily busy. Try again in a moment.',
      statusCode: status,
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      kind: 'provider',
      message: "Ghost couldn't generate a response. This is a temporary issue.",
      statusCode: status,
      retryable: true,
    };
  }
  return {
    kind: 'provider',
    message: `Server error (${status})`,
    statusCode: status,
    retryable: true,
  };
}

function classifyStreamError(errorText: string): GhostError {
  const lower = errorText.toLowerCase();
  if (lower.includes('429') || lower.includes('rate') || lower.includes('too many')) {
    return { kind: 'rate_limit', message: 'Ghost is temporarily busy. Try again in a moment.', retryable: true };
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('auth')) {
    return { kind: 'auth', message: 'AI provider authentication failed.', retryable: false };
  }
  if (lower.includes('no text chunks') || lower.includes('empty')) {
    return { kind: 'empty_stream', message: "Ghost started thinking but didn't respond. Try rephrasing.", retryable: true };
  }
  if (lower.includes('upstream http 5') || lower.includes('500') || lower.includes('502') || lower.includes('503')) {
    return { kind: 'provider', message: "Ghost couldn't generate a response. This is a temporary issue.", retryable: true };
  }
  return { kind: 'provider', message: errorText, retryable: true };
}

function networkError(err: any): GhostError {
  const msg = err?.message ?? String(err);
  if (msg.includes('abort') || msg.includes('Abort')) {
    return { kind: 'timeout', message: 'Response timed out. Ghost may be processing a complex request.', retryable: true };
  }
  return { kind: 'network', message: "Can't reach Ghost — check your Wi-Fi and Pi connection", retryable: true };
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
  let value = host.trim();
  value = value.replace(/^['"`\s]+|['"`\s]+$/g, "");

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return parsed.hostname;
    } catch {}
  }

  return value
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .replace(/:\d+$/, "");
}

function normalizePort(port: string): string {
  const p = port.trim().replace(/^['"`\s]+|['"`\s]+$/g, "");
  if (p === "") return "8765";
  const numeric = p.match(/\d+/)?.[0] ?? "";
  return numeric === "" ? "8765" : numeric;
}

function headers(cfg: GhostConfig): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Ghost-Secret": cfg.secret,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  if (typeof AbortController === "undefined") {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Merge signals: if init already has a signal, prefer the outer one for timeout
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Health ────────────────────────────────────────────────────────────────

export async function checkHealth(cfg: GhostConfig): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${baseURL(cfg)}/health`,
      {
        headers: headers(cfg),
      },
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
  const url = `${baseURL(cfg)}/health`;
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: headers(cfg),
      },
      5000,
    );
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
  const res = await fetch(
    `${baseURL(cfg)}/history?limit=${limit}&offset=${offset}`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new Error(`Failed to fetch history (HTTP ${res.status})`);
  return res.json();
}

export async function searchMessages(
  cfg: GhostConfig,
  q: string,
): Promise<Message[]> {
  const res = await fetch(
    `${baseURL(cfg)}/search?q=${encodeURIComponent(q)}&limit=30`,
    { headers: headers(cfg) },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function deleteMessage(
  cfg: GhostConfig,
  id: string,
): Promise<void> {
  await fetch(`${baseURL(cfg)}/message?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(cfg),
  });
}

export async function clearChat(
  cfg: GhostConfig,
): Promise<void> {
  const res = await fetch(`${baseURL(cfg)}/messages`, {
    method: "DELETE",
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error(`Failed to clear chat (HTTP ${res.status})`);
}

// ─── Send (streaming SSE) ─────────────────────────────────────────────────

export interface SendOptions {
  content: string;
  mediaB64?: string;
  mediaType?: string;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: GhostError) => void;
}

const STREAM_TIMEOUT_MS = 120_000; // 120 second global timeout

export async function sendMessage(
  cfg: GhostConfig,
  opts: SendOptions,
): Promise<void> {
  const body: Record<string, string> = { content: opts.content };
  if (opts.mediaB64) body.media_b64 = opts.mediaB64;
  if (opts.mediaType) body.media_type = opts.mediaType;
  const url = `${baseURL(cfg)}/send`;
  console.log("[ghost-bridge:send:start]", {
    url,
    contentLength: opts.content.length,
    hasMedia: Boolean(opts.mediaB64),
  });

  // Global stream timeout via AbortController
  const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutTimer = abortController
    ? setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS)
    : null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify(body),
      signal: abortController?.signal,
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.log("[ghost-bridge:send:response-error]", {
        status: res.status,
        body: errorBody.slice(0, 300),
      });
      opts.onError(classifyError(res.status, errorBody));
      return;
    }

    if (!res.body) {
      const fallbackBody = await res.text().catch(() => "");
      console.log("[ghost-bridge:send:stream-fallback]", {
        status: res.status,
        bodyLength: fallbackBody.length,
      });

      let fullText = "";
      const lines = fallbackBody.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          opts.onDone(fullText);
          return;
        }
        // Check for upstream error messages in the stream data
        if (data.startsWith('"') && (data.includes('Upstream HTTP') || data.includes('No text chunks'))) {
          try {
            const errorText = JSON.parse(data) as string;
            opts.onError(classifyStreamError(errorText));
            return;
          } catch {}
        }
        try {
          const text = JSON.parse(data) as string;
          fullText += text;
          opts.onChunk(text);
        } catch {
          fullText += data;
          opts.onChunk(data);
        }
      }
      opts.onDone(fullText);
      return;
    }

    console.log("[ghost-bridge:send:stream-open]", {
      status: res.status,
    });

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
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          console.log("[ghost-bridge:send:done]", {
            responseLength: fullText.length,
          });
          opts.onDone(fullText);
          return;
        }
        // Check for upstream error messages in the stream data
        try {
          const parsed = JSON.parse(data);
          if (typeof parsed === 'string') {
            // Check if this looks like an error message from bridge
            if (parsed.startsWith('Upstream HTTP') || parsed.startsWith('No text chunks') || parsed.includes('API key is missing')) {
              opts.onError(classifyStreamError(parsed));
              return;
            }
            fullText += parsed;
            opts.onChunk(parsed);
          }
        } catch {
          console.log("[ghost-bridge:send:chunk-parse-error]", {
            rawChunk: data.slice(0, 200),
          });
        }
      }
    }
    console.log("[ghost-bridge:send:end-without-done]", {
      responseLength: fullText.length,
    });
    if (fullText.length > 0) {
      opts.onDone(fullText);
    } else {
      opts.onError({ kind: 'empty_stream', message: "Ghost started thinking but didn't respond. Try rephrasing.", retryable: true });
    }
  } catch (err: any) {
    console.log("[ghost-bridge:send:fetch-error]", {
      name: err?.name ?? "UnknownError",
      message: err?.message ?? String(err),
    });
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

  const res = await fetch(`${baseURL(cfg)}/upload`, {
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
    const res = await fetch(`${baseURL(cfg)}/transcribe`, {
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
  const res = await fetch(`${baseURL(cfg)}/memory/files`, {
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
    `${baseURL(cfg)}/memory/file?name=${encodeURIComponent(name)}`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new Error("Not found");
  const data = await res.json();
  return data.content;
}

// ─── Pi System ────────────────────────────────────────────────────────────

export async function fetchStats(cfg: GhostConfig): Promise<PiStats> {
  const res = await fetch(`${baseURL(cfg)}/stats`, { headers: headers(cfg) });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function runExec(
  cfg: GhostConfig,
  command: string,
  timeout = 10,
): Promise<ExecResult> {
  const res = await fetch(`${baseURL(cfg)}/exec`, {
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
  const res = await fetch(`${baseURL(cfg)}/open`, {
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
  const res = await fetch(`${baseURL(cfg)}/screenshot`, {
    headers: headers(cfg),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? "screenshot failed");
  }
  return res.json();
}

// ─── WebSocket ─────────────────────────────────────────────────────────────

type WSHandler = (msg: { type: string; content: string }) => void;
type WSStateHandler = (state: 'connected' | 'disconnected' | 'reconnecting') => void;

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

  notifyWSState('reconnecting');
  const url = `${wsURL(cfg)}/ws?secret=${encodeURIComponent(cfg.secret)}`;
  wsInstance = new WebSocket(url);

  wsInstance.onopen = () => {
    wsLastPong = Date.now();
    notifyWSState('connected');

    // Client-side ping/pong health check every 25s
    wsPingInterval = setInterval(() => {
      if (Date.now() - wsLastPong > 60_000) {
        // No pong in 60s, reconnect
        console.log("[ghost-ws] No pong in 60s, reconnecting");
        notifyWSState('reconnecting');
        try { wsInstance?.close(); } catch {}
      }
    }, 25_000);
  };

  wsInstance.onmessage = (e) => {
    wsLastPong = Date.now(); // Any message counts as a "pong"
    try {
      const msg = JSON.parse(e.data);
      wsHandlers.forEach((h) => h(msg));
    } catch {}
  };

  wsInstance.onclose = () => {
    if (wsPingInterval) clearInterval(wsPingInterval);
    notifyWSState('disconnected');
    wsReconnectTimer = setTimeout(() => connectWebSocket(cfg), 5000);
  };

  wsInstance.onerror = () => {
    try {
      wsInstance?.close();
    } catch {}
  };
}

function notifyWSState(state: 'connected' | 'disconnected' | 'reconnecting') {
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

export function getWSState(): 'connected' | 'disconnected' | 'reconnecting' {
  if (!wsInstance) return 'disconnected';
  if (wsInstance.readyState === WebSocket.OPEN) return 'connected';
  if (wsInstance.readyState === WebSocket.CONNECTING) return 'reconnecting';
  return 'disconnected';
}

export function disconnectWebSocket(): void {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  if (wsPingInterval) clearInterval(wsPingInterval);
  try {
    wsInstance?.close();
  } catch {}
  wsInstance = null;
}
