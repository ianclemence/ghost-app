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
import { router } from "expo-router";
import {
  getDeviceCredential,
  saveDeviceCredential,
  clearDeviceCredential,
  getConnectionMeta,
  saveConnectionMeta,
  clearAllCredentials,
  hasDeviceCredential,
  saveClientToken,
  getClientToken,
} from "./credentials";
import {
  GhostConfig,
  completePairing as apiCompletePairing,
  checkHealthInfo,
  connectWebSocket,
  disconnectWebSocket,
  listPairedDevices,
  setAuthFailureHandler,
  resetAuthFailureState,
  HealthStatus,
  PairedDevice,
} from "./ghostApi";
import { parsePairingURI } from "./pairing";
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

async function pollHealth(config: GhostConfig): Promise<HealthStatus> {
  const health = await checkHealthInfo(config);
  useGhostStore
    .getState()
    .setUptimeSeconds(health.ok ? (health.uptimeS ?? null) : null);
  return health;
}

function startHealthMonitor(config: GhostConfig): void {
  stopHealthMonitor();
  healthInterval = setInterval(async () => {
    try {
      const health = await pollHealth(config);
      const store = useGhostStore.getState();
      if (health.ok && store.connectionState !== "online") {
        connectWebSocket(config);
        store.setConnectionState("online");
        reconnectAttempts = 0;
      } else if (!health.ok && store.connectionState === "online") {
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
      const health = await pollHealth(config);
      if (health.ok) {
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
  if (!meta) return null;
  if (!cred && !(meta.transport === "relay" && meta.relayServer)) return null;

  const clientToken = (await getClientToken()) ?? undefined;

  return {
    piHost: meta.host,
    piPort: meta.port,
    session: "mobile:default",
    sendLocation: true,
    transport: meta.transport ?? "relay",
    relayServer: meta.relayServer,
    ghostId: meta.ghostId,
    clientToken,
    deviceID: cred?.deviceID,
    credential: cred?.credential,
  };
}

// ─── Auth Failure Routing ────────────────────────────────────────────────

function registerAuthFailureHandler(): void {
  setAuthFailureHandler((reason) => {
    void handleCredentialRevoked(reason);
  });
}

/**
 * Handle credential revocation — the stored device credential or relay
 * client token is no longer valid (e.g. the device was disconnected from
 * the Ghost Pod). Clears credentials and routes to the matching screen.
 */
export async function handleCredentialRevoked(
  reason: "revoked" | "invalid" = "invalid",
): Promise<void> {
  const paired = await isPaired();
  stopHealthMonitor();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  disconnectWebSocket();
  await clearDeviceCredential();
  const store = useGhostStore.getState();
  store.setConnectionState("offline");
  store.setUptimeSeconds(null);
  if (paired) {
    router.replace(reason === "revoked" ? "/revoked" : "/auth-failure");
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Check if the device can authenticate to a Ghost: either a paired device
 * credential, or an adopted relay connection (client token + relay meta).
 */
export async function isPaired(): Promise<boolean> {
  if (await hasDeviceCredential()) return true;
  const [token, meta] = await Promise.all([getClientToken(), getConnectionMeta()]);
  return !!(token && meta?.transport === "relay" && meta.relayServer);
}

/** Initialize connection on app start. Loads saved credentials and connects. */
export async function initializeConnection(): Promise<void> {
  const store = useGhostStore.getState();
  store.setConnectionState("offline");

  const meta = await getConnectionMeta();
  if (meta?.ghostName) store.setGhostName(meta.ghostName);

  const config = await buildConfig();
  if (!config) {
    store.setConnectionState("offline");
    return;
  }

  resetAuthFailureState();
  registerAuthFailureHandler();
  store.setConfig(config);
  store.setConnectionState("syncing");

  try {
    const health = await pollHealth(config);
    if (health.ok) {
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

/** Pairing request derived from a scanned QR code or deep link. */
export interface PairingRequest {
  token: string;
  host?: string;
  port?: string;
  transport: "lan" | "relay";
  relayServer?: string;
  ghostId?: string;
}

/**
 * Redeem a pairing token and connect.
 * Called after QR scan or deep link with a secure pairing payload.
 * The transport from the pairing payload is persisted so the connection
 * uses the same route the invitation was issued for.
 */
export async function completePairing(
  req: PairingRequest,
): Promise<{ ok: boolean; error?: string; errorCode?: string }> {
  const store = useGhostStore.getState();
  store.setConnectionState("syncing");

  try {
    // Build temp config for API call (pairing/complete is a public endpoint).
    const tempConfig: GhostConfig = {
      piHost: req.host ?? "",
      piPort: req.port ?? "8766",
      transport: req.transport,
      relayServer: req.relayServer,
      ghostId: req.ghostId,
    };

    // Get platform for device metadata.
    const platform = process.env.EXPO_OS ?? "unknown";

    const result = await apiCompletePairing(tempConfig, req.token, "Phone", platform);

    // Store credentials securely.
    await saveDeviceCredential({
      deviceID: result.device_id,
      credential: result.credential,
    });
    await saveConnectionMeta({
      host: req.host ?? "",
      port: req.port ?? "8766",
      transport: req.transport,
      relayServer: req.relayServer,
      ghostId: req.ghostId,
      ghostName: result.ghost_name,
    });
    resetAuthFailureState();
    registerAuthFailureHandler();
    store.setGhostName(result.ghost_name ?? null);

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
  store.setConfig({ piHost: "", piPort: "" });
  store.setGhostName(null);
  store.setUptimeSeconds(null);
  store.setConnectionState("offline");
}

/** Attempt to reconnect using stored credentials. */
export async function reconnect(): Promise<void> {
  const config = await buildConfig();
  if (!config) return;

  const store = useGhostStore.getState();
  resetAuthFailureState();
  registerAuthFailureHandler();
  store.setConfig(config);
  store.setConnectionState("syncing");

  try {
    const health = await pollHealth(config);
    if (health.ok) {
      connectWebSocket(config);
      store.setConnectionState("online");
      reconnectAttempts = 0;
      startHealthMonitor(config);
    } else {
      store.setConnectionState("offline");
      scheduleReconnect(config);
    }
  } catch {
    store.setConnectionState("offline");
    scheduleReconnect(config);
  }
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

/**
 * Adopt a legacy relay deep link (ghost://connect?transport=relay&...) —
 * the only supported legacy format. Persisted through the credentials
 * system: client token in SecureStore, relay metadata in AsyncStorage.
 */
async function adoptLegacyRelayLink(config: GhostConfig): Promise<void> {
  const existingMeta = await getConnectionMeta();
  const sameGhost =
    existingMeta?.ghostId && existingMeta.ghostId === config.ghostId;
  if (!sameGhost) {
    await clearAllCredentials();
  }

  if (config.clientToken) {
    await saveClientToken(config.clientToken);
  }
  await saveConnectionMeta({
    host: config.piHost,
    port: config.piPort || "8766",
    transport: "relay",
    relayServer: config.relayServer,
    ghostId: config.ghostId,
  });

  const store = useGhostStore.getState();
  resetAuthFailureState();
  registerAuthFailureHandler();

  const adopted = await buildConfig();
  if (!adopted) {
    store.setConnectionState("offline");
    return;
  }

  store.setConfig(adopted);
  store.setConnectionState("syncing");
  try {
    const health = await pollHealth(adopted);
    if (health.ok) {
      connectWebSocket(adopted);
      store.setConnectionState("online");
      startHealthMonitor(adopted);
    } else {
      store.setConnectionState("offline");
      startHealthMonitor(adopted);
    }
  } catch {
    store.setConnectionState("offline");
    startHealthMonitor(adopted);
  }
}

/** Handle deep link with pairing URI. */
export async function handlePairingDeepLink(url: string): Promise<{ ok: boolean; error?: string }> {
  const payload = parsePairingURI(url);
  if (!payload) return { ok: false, error: "Invalid pairing code." };

  if (payload.type === "secure") {
    const result = await completePairing({
      token: payload.token,
      host: payload.host,
      port: payload.port,
      transport: payload.transport,
      relayServer: payload.relayServer,
      ghostId: payload.ghostId,
    });
    return { ok: result.ok, error: result.error };
  }

  // Legacy pairing — relay deep link adopted through the credentials system.
  if (payload.type === "legacy") {
    await adoptLegacyRelayLink(payload.config);
    const state = useGhostStore.getState().connectionState;
    return { ok: state === "online" };
  }

  return { ok: false, error: ERROR_MESSAGES.UNKNOWN };
}
