import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
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
}

const CONFIG_KEY = 'ghost_config';

export async function loadConfig(): Promise<GhostConfig | null> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveConfig(cfg: GhostConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify({
    piHost: normalizeHost(cfg.piHost),
    piPort: normalizePort(cfg.piPort),
    secret: cfg.secret.trim(),
  }));
}

function baseURL(cfg: GhostConfig): string {
  return `http://${normalizeHost(cfg.piHost)}:${normalizePort(cfg.piPort)}`;
}

function wsURL(cfg: GhostConfig): string {
  return `ws://${normalizeHost(cfg.piHost)}:${normalizePort(cfg.piPort)}`;
}

function normalizeHost(host: string): string {
  return host
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/:\d+$/, '');
}

function normalizePort(port: string): string {
  const p = port.trim();
  return p === '' ? '8765' : p;
}

function headers(cfg: GhostConfig): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Ghost-Secret': cfg.secret,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  if (typeof AbortController === 'undefined') {
    return fetch(url, init);
  }

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
    const res = await fetchWithTimeout(`${baseURL(cfg)}/health`, {
      headers: headers(cfg),
    }, 5000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkHealthDebug(cfg: GhostConfig): Promise<ConnectionDebugResult> {
  const url = `${baseURL(cfg)}/health`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: headers(cfg),
    }, 5000);
    const body = await res.text().catch(() => '');
    return {
      ok: res.ok,
      url,
      status: res.status,
      statusText: res.statusText,
      body: body.slice(0, 300),
    };
  } catch (err: any) {
    return {
      ok: false,
      url,
      error: err?.message ?? String(err),
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

export async function searchMessages(cfg: GhostConfig, q: string): Promise<Message[]> {
  const res = await fetch(
    `${baseURL(cfg)}/search?q=${encodeURIComponent(q)}&limit=30`,
    { headers: headers(cfg) },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function deleteMessage(cfg: GhostConfig, id: string): Promise<void> {
  await fetch(`${baseURL(cfg)}/message?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(cfg),
  });
}

// ─── Send (streaming SSE) ─────────────────────────────────────────────────

export interface SendOptions {
  content: string;
  mediaB64?: string;
  mediaType?: string;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: string) => void;
}

export async function sendMessage(cfg: GhostConfig, opts: SendOptions): Promise<void> {
  const body: Record<string, string> = { content: opts.content };
  if (opts.mediaB64) body.media_b64 = opts.mediaB64;
  if (opts.mediaType) body.media_type = opts.mediaType;

  try {
    const res = await fetch(`${baseURL(cfg)}/send`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      opts.onError(`Server error: ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          opts.onDone(fullText);
          return;
        }
        try {
          const text = JSON.parse(data) as string;
          fullText += text;
          opts.onChunk(text);
        } catch {
          // skip malformed chunk
        }
      }
    }
    opts.onDone(fullText);
  } catch (err: any) {
    opts.onError(err.message ?? 'Network error');
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
  form.append('file', { uri, type: mimeType, name: filename } as any);

  const res = await fetch(`${baseURL(cfg)}/upload`, {
    method: 'POST',
    headers: { 'X-Ghost-Secret': cfg.secret },
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

// ─── Voice Transcription ───────────────────────────────────────────────────

/**
 * Upload recorded audio to ghost-bridge for Whisper (Moonshot) transcription.
 * Returns the transcript string, or '' on failure.
 */
export async function transcribeAudio(
  cfg: GhostConfig,
  audioUri: string,
  filename = 'recording.m4a',
): Promise<string> {
  const form = new FormData();
  form.append('audio', { uri: audioUri, type: 'audio/m4a', name: filename } as any);

  try {
    const res = await fetch(`${baseURL(cfg)}/transcribe`, {
      method: 'POST',
      headers: { 'X-Ghost-Secret': cfg.secret },
      body: form,
    });
    if (!res.ok) return '';
    const data: { text: string; error?: string } = await res.json();
    return data.text ?? '';
  } catch {
    return '';
  }
}

// ─── Memory Files ──────────────────────────────────────────────────────────

export async function fetchMemoryFiles(
  cfg: GhostConfig,
): Promise<{ name: string; modified: number; size: number }[]> {
  const res = await fetch(`${baseURL(cfg)}/memory/files`, { headers: headers(cfg) });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchMemoryFile(cfg: GhostConfig, name: string): Promise<string> {
  const res = await fetch(
    `${baseURL(cfg)}/memory/file?name=${encodeURIComponent(name)}`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new Error('Not found');
  const data = await res.json();
  return data.content;
}

// ─── Pi System ────────────────────────────────────────────────────────────

export async function fetchStats(cfg: GhostConfig): Promise<PiStats> {
  const res = await fetch(`${baseURL(cfg)}/stats`, { headers: headers(cfg) });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function runExec(
  cfg: GhostConfig,
  command: string,
  timeout = 10,
): Promise<ExecResult> {
  const res = await fetch(`${baseURL(cfg)}/exec`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ command, timeout }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? 'exec failed');
  }
  return res.json();
}

export async function openOnPi(
  cfg: GhostConfig,
  target: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${baseURL(cfg)}/open`, {
    method: 'POST',
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
  const res = await fetch(`${baseURL(cfg)}/screenshot`, { headers: headers(cfg) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? 'screenshot failed');
  }
  return res.json();
}

// ─── WebSocket ─────────────────────────────────────────────────────────────

type WSHandler = (msg: { type: string; content: string }) => void;
let wsInstance: WebSocket | null = null;
let wsHandlers: WSHandler[] = [];
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connectWebSocket(cfg: GhostConfig): void {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  try { wsInstance?.close(); } catch {}

  const url = `${wsURL(cfg)}/ws?secret=${encodeURIComponent(cfg.secret)}`;
  wsInstance = new WebSocket(url);

  wsInstance.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      wsHandlers.forEach((h) => h(msg));
    } catch {}
  };

  wsInstance.onclose = () => {
    wsReconnectTimer = setTimeout(() => connectWebSocket(cfg), 5000);
  };

  wsInstance.onerror = () => {
    try { wsInstance?.close(); } catch {}
  };
}

export function onWSMessage(handler: WSHandler): () => void {
  wsHandlers.push(handler);
  return () => { wsHandlers = wsHandlers.filter((h) => h !== handler); };
}

export function disconnectWebSocket(): void {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  try { wsInstance?.close(); } catch {}
  wsInstance = null;
}
