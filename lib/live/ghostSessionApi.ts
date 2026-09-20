import { authHeaders, baseURL, type GhostConfig } from "../ghostApi";
import type { SessionAPI } from "./types";
import { createToolConnection } from "./tool-connection";
import { isLiveVoice } from "./voices";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestJson(cfg: GhostConfig, path: string, method: "POST" | "DELETE", body: unknown, timeoutMs = 35000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseURL(cfg)}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders(cfg) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 204) return null;
    const result: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = isRecord(result) ? (result as { error?: unknown }).error : undefined;
      const message =
        isRecord(err) && typeof err.message === "string"
          ? (err.message as string)
          : typeof err === "string"
            ? err
            : null;
      if (res.status === 401 || res.status === 403) {
        throw new Error("Ghost no longer recognizes this device. Re-pair to reconnect.");
      }
      if (res.status === 429) {
        throw new Error("Ghost voice is temporarily busy. Try again in a moment.");
      }
      if (res.status === 503) {
        throw new Error(message ?? "Live voice isn't set up yet. Add an OpenAI key in Intelligence settings.");
      }
      throw new Error(message ?? `Ghost voice returned HTTP ${res.status}. Try again.`);
    }
    return result;
  } catch (error) {
    if (error instanceof Error) {
      if (controller.signal.aborted || ["AbortError", "NetworkError"].includes(error.name)) {
        throw new Error("Can't reach Ghost. Check your Wi-Fi and Pod connection.");
      }
      if (["Network request failed", "Failed to fetch", "fetch failed"].includes(error.message)) {
        throw new Error("Can't reach Ghost. Check your Wi-Fi and Pod connection.");
      }
      throw error;
    }
    throw new Error("Can't reach Ghost. Check your Wi-Fi and Pod connection.");
  } finally {
    clearTimeout(timeout);
  }
}

export function createGhostSessionAPI(cfg: GhostConfig): SessionAPI {
  return {
    prepare() {
      if (!cfg) throw new Error("Pair your Ghost Pod to use live voice.");
    },
    async create(sdp, voice) {
      if (!sdp || !sdp.includes("v=0")) throw new Error("Could not prepare the audio connection.");
      if (voice && !isLiveVoice(voice)) throw new Error("Unknown voice.");
      const result = await requestJson(cfg, "/v1/voice/live/session", "POST", { sdp, voice });
      if (
        !isRecord(result) ||
        typeof result.sdp !== "string" ||
        !result.sdp ||
        typeof result.sessionId !== "string" ||
        !result.sessionId
      ) {
        throw new Error("Ghost voice returned an invalid session. Try again.");
      }
      return { sdp: result.sdp as string, sessionId: result.sessionId as string, tools: true };
    },
    connectTools(sessionId, onFailure) {
      return createToolConnection({
        onFailure,
        open: async (signal) => {
          return fetch(`${baseURL(cfg)}/v1/voice/live/tools`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/x-ndjson",
              ...authHeaders(cfg),
            },
            body: JSON.stringify({ sessionId }),
            signal,
          });
        },
      });
    },
    async close(sessionId) {
      await requestJson(cfg, "/v1/voice/live/session", "DELETE", { sessionId }, 15000).catch(() => null);
    },
  };
}

export interface LiveStatus {
  ok: boolean;
  enabled: boolean;
  model: string;
  maxSeconds: number;
}

export async function fetchLiveStatus(cfg: GhostConfig): Promise<LiveStatus | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${baseURL(cfg)}/v1/voice/live/status`, {
        headers: authHeaders(cfg),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as {
        enabled?: boolean;
        model?: string;
        max_seconds?: number;
      } | null;
      if (!data) return null;
      return {
        ok: true,
        enabled: data.enabled === true,
        model: String(data.model ?? "gpt-live-1"),
        maxSeconds: typeof data.max_seconds === "number" ? data.max_seconds : 600,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}
