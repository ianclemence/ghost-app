/**
 * Connection state machine for Ghost mobile app.
 *
 * States:
 *   unpaired → pairing → connecting → connected → reconnecting → offline
 *                                                          ↘ auth_required
 *
 * The ConnectionManager owns:
 * - credential loading/saving
 * - health checks
 * - REST client configuration
 * - WebSocket lifecycle
 * - reconnect behavior
 * - auth failure handling
 * - credential invalidation
 * - connection state
 *
 * Screens consume state. They do not implement their own connection logic.
 */
import {
  getDeviceCredential,
  saveDeviceCredential,
  clearDeviceCredential,
  getConnectionMeta,
  saveConnectionMeta,
  clearAllCredentials,
  hasDeviceCredential,
  type DeviceCredential,
  type ConnectionMeta,
} from "./credentials";
import {
  GhostConfig,
  completePairing as apiCompletePairing,
  checkHealth,
  connectWebSocket,
  disconnectWebSocket,
  listPairedDevices,
  PairedDevice,
} from "./ghostApi";
import { parsePairingURI, SecurePairingPayload } from "./pairing";
import { useGhostStore } from "./store";

// ─── Connection Status ───────────────────────────────────────────────────

export type ConnectionStatus =
  | "unpaired"
  | "pairing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "auth_required";

export interface ConnectionState {
  status: ConnectionStatus;
  config: GhostConfig | null;
  error: string | null;
}

// ─── Error Messages (Ghost voice) ───────────────────────────────────────

export const ERROR_MESSAGES = {
  NETWORK: "I can't reach your Ghost Pod right now.",
  TOKEN_EXPIRED: "This pairing code has expired.",
  TOKEN_USED: "This pairing code has already been used.",
  TOKEN_INVALID: "This pairing code is no longer valid.",
  AUTH_REJECTED: "Ghost rejected this connection.",
  CREDENTIAL_REVOKED: "This phone is no longer paired with Ghost.",
  UNKNOWN: "Ghost couldn't connect.",
} as const;

// ─── Health Monitor ──────────────────────────────────────────────────────

let healthInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;

function startHealthMonitor(config: GhostConfig): void {
  stopHealthMonitor();
  healthInterval = setInterval(async () => {
    try {
      const healthy = await checkHealth(config);
      const store = useGhostStore.getState();
      if (healthy && store.connectionState !== "online") {
        connectWebSocket(config);
        store.setConnectionState("online");
        reconnectAttempts = 0;
      } else if (!healthy && store.connectionState === "online") {
        store.setConnectionState("syncing");
        scheduleReconnect(config);
      }
    } catch {
      const store = useGhostStore.getState();
      if (store.connectionState === "online") {
        store.setConnectionState("syncing");
        scheduleReconnect(config);
      }
    }
  }, 30_000);
}

function stopHealthMonitor(): void {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
}

function scheduleReconnect(config: GhostConfig): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

  const delay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    30_000,
  );
  reconnectAttempts++;

  reconnectTimer = setTimeout(async () => {
    try {
      const healthy = await checkHealth(config);
      if (healthy) {
        connectWebSocket(config);
        useGhostStore.getState().setConnectionState("online");
        reconnectAttempts = 0;
      } else {
        scheduleReconnect(config);
      }
    } catch {
      scheduleReconnect(config);
    }
  }, delay);
}

// ─── Build GhostConfig from stored credentials ───────────────────────────

async function buildConfig(): Promise<GhostConfig | null> {
  const cred = await getDeviceCredential();
  const meta = await getConnectionMeta();
  if (!cred || !meta) return null;

  return {
    piHost: meta.host,
    piPort: meta.port,
    secret: "",
    session: "mobile:default",
    sendLocation: true,
    transport: meta.transport,
    relayServer: meta.relayServer,
    ghostId: meta.ghostId,
    deviceID: cred.deviceID,
    credential: cred.credential,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

/** Check if device is paired (has stored credentials). */
export async function isPaired(): Promise<boolean> {
  return hasDeviceCredential();
}

/** Initialize connection on app start. Loads saved credentials and connects. */
export async function initializeConnection(): Promise<void> {
  const store = useGhostStore.getState();
  store.setConnectionState("offline");

  const config = await buildConfig();
  if (!config) {
    store.setConnectionState("offline");
    return;
  }

  store.setConfig(config);
  store.setConnectionState("syncing");

  try {
    const healthy = await checkHealth(config);
    if (healthy) {
      connectWebSocket(config);
      store.setConnectionState("online");
      startHealthMonitor(config);
    } else {
      store.setConnectionState("offline");
      // Still start health monitor to auto-reconnect when Ghost comes back
      startHealthMonitor(config);
    }
  } catch {
    store.setConnectionState("offline");
    startHealthMonitor(config);
  }
}

/**
 * Redeem a pairing token and connect.
 * Called after QR scan or deep link with secure pairing payload.
 */
export async function completePairing(
  host: string,
  port: string,
  token: string,
): Promise<{ ok: boolean; error?: string; errorCode?: string }> {
  const store = useGhostStore.getState();
  store.setConnectionState("syncing");

  try {
    // Build temp config for API call (pairing/complete is public endpoint).
    const tempConfig: GhostConfig = {
      piHost: host,
      piPort: port,
      secret: "",
    };

    // Get platform for device metadata.
    const platform = require("react-native").Platform.OS;

    const result = await apiCompletePairing(tempConfig, token, "Phone", platform);

    // Store credentials securely.
    await saveDeviceCredential({
      deviceID: result.device_id,
      credential: result.credential,
    });
    await saveConnectionMeta({
      host,
      port,
      transport: "lan",
      ghostName: result.ghost_name,
    });

    // Build final config and connect.
    const config = await buildConfig();
    if (!config) {
      store.setConnectionState("offline");
      return { ok: false, error: ERROR_MESSAGES.UNKNOWN };
    }

    store.setConfig(config);
    connectWebSocket(config);
    store.setConnectionState("online");
    startHealthMonitor(config);

    return { ok: true };
  } catch (err: any) {
    store.setConnectionState("offline");

    // Handle structured pairing errors from the backend.
    if (err?.code) {
      const code = err.code as string;
      switch (code) {
        case "pairing_expired":
          return { ok: false, error: ERROR_MESSAGES.TOKEN_EXPIRED, errorCode: code };
        case "pairing_consumed":
          return { ok: false, error: ERROR_MESSAGES.TOKEN_USED, errorCode: code };
        case "pairing_invalid":
          return { ok: false, error: ERROR_MESSAGES.TOKEN_INVALID, errorCode: code };
        case "pairing_rejected":
          return { ok: false, error: ERROR_MESSAGES.AUTH_REJECTED, errorCode: code };
        default:
          return { ok: false, error: ERROR_MESSAGES.UNKNOWN, errorCode: code };
      }
    }

    // Fallback to string matching for legacy errors.
    const msg = err?.message ?? "";
    if (msg.includes("expired")) return { ok: false, error: ERROR_MESSAGES.TOKEN_EXPIRED };
    if (msg.includes("already")) return { ok: false, error: ERROR_MESSAGES.TOKEN_USED };
    if (msg.includes("invalid")) return { ok: false, error: ERROR_MESSAGES.TOKEN_INVALID };
    if (msg.includes("401") || msg.includes("unauthorized")) return { ok: false, error: ERROR_MESSAGES.AUTH_REJECTED };
    return { ok: false, error: ERROR_MESSAGES.NETWORK };
  }
}

/** Disconnect and clear all stored credentials. */
export async function disconnectAndClear(): Promise<void> {
  stopHealthMonitor();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  disconnectWebSocket();
  await clearAllCredentials();
  const store = useGhostStore.getState();
  store.setConfig({ piHost: "", piPort: "", secret: "" });
  store.setConnectionState("offline");
}

/** Attempt to reconnect using stored credentials. */
export async function reconnect(): Promise<void> {
  const config = await buildConfig();
  if (!config) return;

  const store = useGhostStore.getState();
  store.setConfig(config);
  store.setConnectionState("syncing");

  try {
    const healthy = await checkHealth(config);
    if (healthy) {
      connectWebSocket(config);
      store.setConnectionState("online");
      reconnectAttempts = 0;
    } else {
      store.setConnectionState("offline");
      scheduleReconnect(config);
    }
  } catch {
    store.setConnectionState("offline");
    scheduleReconnect(config);
  }
}

/** Handle credential revocation — clear credentials and set auth_required. */
export async function handleCredentialRevoked(): Promise<void> {
  stopHealthMonitor();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  disconnectWebSocket();
  await clearDeviceCredential();
  const store = useGhostStore.getState();
  store.setConnectionState("offline");
}

/** Start pairing flow. */
export function startPairing(): void {
  useGhostStore.getState().setConnectionState("syncing");
}

/** Fetch paired devices list. */
export async function refreshDevices(): Promise<PairedDevice[]> {
  const config = await buildConfig();
  if (!config) return [];
  try {
    return await listPairedDevices(config);
  } catch {
    return [];
  }
}

/** Handle deep link with pairing URI. */
export async function handlePairingDeepLink(url: string): Promise<{ ok: boolean; error?: string }> {
  const payload = parsePairingURI(url);
  if (!payload) return { ok: false, error: "Invalid pairing code." };

  if (payload.type === "secure") {
    return completePairing(payload.host, payload.port, payload.token);
  }

  // Legacy pairing — direct config (deprecated).
  if (payload.type === "legacy") {
    const { saveConfig } = await import("./ghostApi");
    await saveConfig(payload.config);
    useGhostStore.getState().setConfig(payload.config);
    const ok = await checkHealth(payload.config);
    useGhostStore.getState().setConnected(ok);
    if (ok) connectWebSocket(payload.config);
    return { ok };
  }

  return { ok: false, error: ERROR_MESSAGES.UNKNOWN };
}
