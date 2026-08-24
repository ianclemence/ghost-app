/**
 * Connection state machine for Ghost mobile app.
 *
 * States:
 *   unpaired → pairing → connecting → connected → reconnecting → offline
 *                                                  ↘ auth_failed
 *                                                  ↘ revoked
 *
 * Pairing flow:
 *   1. Scan QR → parseSecurePairingURI()
 *   2. Redeem token via API → get deviceID + credential
 *   3. Store in SecureStore → connectWebSocket()
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  GhostConfig,
  redeemPairing,
  checkHealth,
  connectWebSocket,
  disconnectWebSocket,
  listPairedDevices,
  PairedDevice,
} from "./ghostApi";
import { parsePairingURI, SecurePairingPayload } from "./pairing";
import { useGhostStore } from "./store";

// ─── Credential Storage ──────────────────────────────────────────────────

const STORAGE_KEYS = {
  PI_HOST: "ghost:pi_host",
  PI_PORT: "ghost:pi_port",
  TRANSPORT: "ghost:transport",
  RELAY_SERVER: "ghost:relay_server",
  GHOST_ID: "ghost:ghost_id",
} as const;

const SECURE_KEYS = {
  DEVICE_ID: "ghost.device_id",
  CREDENTIAL: "ghost.credential",
  CLIENT_TOKEN: "ghost.client_token",
} as const;

/** Save paired device credentials to SecureStore + AsyncStorage. */
async function saveDeviceCredentials(
  host: string,
  port: string,
  deviceID: string,
  credential: string,
): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.DEVICE_ID, deviceID);
  await SecureStore.setItemAsync(SECURE_KEYS.CREDENTIAL, credential);
  await AsyncStorage.setItem(STORAGE_KEYS.PI_HOST, host);
  await AsyncStorage.setItem(STORAGE_KEYS.PI_PORT, port);
}

/** Load paired device credentials from storage. */
async function loadDeviceCredentials(): Promise<GhostConfig | null> {
  const deviceID = await SecureStore.getItemAsync(SECURE_KEYS.DEVICE_ID);
  const credential = await SecureStore.getItemAsync(SECURE_KEYS.CREDENTIAL);
  if (!deviceID || !credential) return null;

  const host = (await AsyncStorage.getItem(STORAGE_KEYS.PI_HOST)) ?? "";
  const port = (await AsyncStorage.getItem(STORAGE_KEYS.PI_PORT)) ?? "8766";
  const transport = (await AsyncStorage.getItem(STORAGE_KEYS.TRANSPORT)) as
    | "lan"
    | "relay"
    | null;
  const relayServer = (await AsyncStorage.getItem(STORAGE_KEYS.RELAY_SERVER)) ?? undefined;
  const ghostId = (await AsyncStorage.getItem(STORAGE_KEYS.GHOST_ID)) ?? undefined;
  const clientToken = await SecureStore.getItemAsync(SECURE_KEYS.CLIENT_TOKEN);

  return {
    piHost: host,
    piPort: port,
    secret: "",
    session: "mobile:default",
    sendLocation: true,
    transport: transport ?? undefined,
    relayServer,
    ghostId,
    clientToken: clientToken ?? undefined,
    deviceID,
    credential,
  };
}

/** Clear all stored credentials. */
async function clearDeviceCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEYS.DEVICE_ID);
  await SecureStore.deleteItemAsync(SECURE_KEYS.CREDENTIAL);
  await SecureStore.deleteItemAsync(SECURE_KEYS.CLIENT_TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.PI_HOST);
  await AsyncStorage.removeItem(STORAGE_KEYS.PI_PORT);
  await AsyncStorage.removeItem(STORAGE_KEYS.TRANSPORT);
  await AsyncStorage.removeItem(STORAGE_KEYS.RELAY_SERVER);
  await AsyncStorage.removeItem(STORAGE_KEYS.GHOST_ID);
}

// ─── Connection State Machine ────────────────────────────────────────────

export type PairingStatus =
  | "unpaired"
  | "pairing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "auth_failed"
  | "revoked";

export interface ConnectionState {
  status: PairingStatus;
  config: GhostConfig | null;
  error: string | null;
  devices: PairedDevice[];
}

let healthInterval: ReturnType<typeof setInterval> | null = null;

/** Initialize connection on app start. Loads saved credentials and connects. */
export async function initializeConnection(): Promise<void> {
  const store = useGhostStore.getState();
  store.setConnectionState("offline");

  const config = await loadDeviceCredentials();
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
    }
  } catch {
    store.setConnectionState("offline");
  }
}

/** Redeem a secure pairing token and connect. */
export async function completePairing(
  host: string,
  port: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const store = useGhostStore.getState();
  store.setConnectionState("syncing");

  // Build a temporary config for the API call (uses bridge secret).
  // The pairing/redeem endpoint is protected by bridge secret, so the mobile
  // app needs to know the secret OR the endpoint needs to be public.
  // For simplicity, we pass an empty secret — the backend pairing/redeem
  // endpoint is NOT behind authMiddleware (it's a public endpoint).
  const tempConfig: GhostConfig = {
    piHost: host,
    piPort: port,
    secret: "",
    session: "mobile:default",
  };

  try {
    const result = await redeemPairing(tempConfig, token);

    // Save credentials.
    await saveDeviceCredentials(host, port, result.device_id, result.credential);

    // Build final config.
    const config = await loadDeviceCredentials();
    if (!config) {
      store.setConnectionState("offline");
      return { ok: false, error: "Failed to load credentials" };
    }

    store.setConfig(config);
    connectWebSocket(config);
    store.setConnectionState("online");
    startHealthMonitor(config);

    return { ok: true };
  } catch (err: any) {
    store.setConnectionState("offline");
    return { ok: false, error: err?.message ?? "Pairing failed" };
  }
}

/** Disconnect and clear all stored credentials. */
export async function disconnectAndClear(): Promise<void> {
  stopHealthMonitor();
  disconnectWebSocket();
  await clearDeviceCredentials();
  const store = useGhostStore.getState();
  store.setConfig({ piHost: "", piPort: "", secret: "" });
  store.setConnectionState("offline");
}

/** Attempt to reconnect using stored credentials. */
export async function reconnect(): Promise<void> {
  const config = await loadDeviceCredentials();
  if (!config) return;

  const store = useGhostStore.getState();
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
    }
  } catch {
    store.setConnectionState("offline");
  }
}

/** Fetch paired devices list. */
export async function refreshDevices(): Promise<PairedDevice[]> {
  const config = await loadDeviceCredentials();
  if (!config) return [];
  try {
    return await listPairedDevices(config);
  } catch {
    return [];
  }
}

// ─── Health Monitor ──────────────────────────────────────────────────────

function startHealthMonitor(config: GhostConfig): void {
  stopHealthMonitor();
  healthInterval = setInterval(async () => {
    try {
      const healthy = await checkHealth(config);
      const store = useGhostStore.getState();
      if (healthy && store.connectionState !== "online") {
        connectWebSocket(config);
        store.setConnectionState("online");
      } else if (!healthy && store.connectionState === "online") {
        store.setConnectionState("syncing");
      }
    } catch {
      const store = useGhostStore.getState();
      if (store.connectionState === "online") {
        store.setConnectionState("syncing");
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
