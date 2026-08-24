/**
 * Typed credential abstraction for Ghost device pairing.
 *
 * All permanent device credentials MUST be stored in platform secure storage
 * (iOS Keychain / Android Keystore-backed expo-secure-store).
 *
 * AsyncStorage holds only non-sensitive connection metadata.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// ─── Secure Keys (expo-secure-store) ────────────────────────────────────

const SECURE = {
  DEVICE_ID: "ghost.device_id",
  CREDENTIAL: "ghost.credential",
  CLIENT_TOKEN: "ghost.client_token",
  BRIDGE_SECRET: "ghost_secret",
} as const;

// ─── AsyncStorage Keys (non-sensitive metadata) ──────────────────────────

const ASYNC = {
  PI_HOST: "ghost:pi_host",
  PI_PORT: "ghost:pi_port",
  TRANSPORT: "ghost:transport",
  RELAY_SERVER: "ghost:relay_server",
  GHOST_ID: "ghost:ghost_id",
  GHOST_NAME: "ghost:ghost_name",
} as const;

// ─── Credential Types ────────────────────────────────────────────────────

export interface DeviceCredential {
  deviceID: string;
  credential: string;
}

export interface ConnectionMeta {
  host: string;
  port: string;
  transport?: "lan" | "relay";
  relayServer?: string;
  ghostId?: string;
  ghostName?: string;
}

// ─── Device Credential Operations ────────────────────────────────────────

export async function saveDeviceCredential(cred: DeviceCredential): Promise<void> {
  await SecureStore.setItemAsync(SECURE.DEVICE_ID, cred.deviceID);
  await SecureStore.setItemAsync(SECURE.CREDENTIAL, cred.credential);
}

export async function getDeviceCredential(): Promise<DeviceCredential | null> {
  const deviceID = await SecureStore.getItemAsync(SECURE.DEVICE_ID);
  const credential = await SecureStore.getItemAsync(SECURE.CREDENTIAL);
  if (!deviceID || !credential) return null;
  return { deviceID, credential };
}

export async function hasDeviceCredential(): Promise<boolean> {
  const deviceID = await SecureStore.getItemAsync(SECURE.DEVICE_ID);
  return deviceID !== null;
}

export async function clearDeviceCredential(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE.DEVICE_ID);
  await SecureStore.deleteItemAsync(SECURE.CREDENTIAL);
  await SecureStore.deleteItemAsync(SECURE.CLIENT_TOKEN);
}

// ─── Connection Metadata Operations ──────────────────────────────────────

export async function saveConnectionMeta(meta: ConnectionMeta): Promise<void> {
  await AsyncStorage.setItem(ASYNC.PI_HOST, meta.host);
  await AsyncStorage.setItem(ASYNC.PI_PORT, meta.port);
  if (meta.transport) await AsyncStorage.setItem(ASYNC.TRANSPORT, meta.transport);
  if (meta.relayServer) await AsyncStorage.setItem(ASYNC.RELAY_SERVER, meta.relayServer);
  if (meta.ghostId) await AsyncStorage.setItem(ASYNC.GHOST_ID, meta.ghostId);
  if (meta.ghostName) await AsyncStorage.setItem(ASYNC.GHOST_NAME, meta.ghostName);
}

export async function getConnectionMeta(): Promise<ConnectionMeta | null> {
  const host = await AsyncStorage.getItem(ASYNC.PI_HOST);
  const port = await AsyncStorage.getItem(ASYNC.PI_PORT);
  if (!host) return null;
  return {
    host,
    port: port || "8766",
    transport: (await AsyncStorage.getItem(ASYNC.TRANSPORT)) as "lan" | "relay" | undefined,
    relayServer: (await AsyncStorage.getItem(ASYNC.RELAY_SERVER)) || undefined,
    ghostId: (await AsyncStorage.getItem(ASYNC.GHOST_ID)) || undefined,
    ghostName: (await AsyncStorage.getItem(ASYNC.GHOST_NAME)) || undefined,
  };
}

// ─── Bridge Secret (legacy, for LAN fallback) ────────────────────────────

export async function saveBridgeSecret(secret: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE.BRIDGE_SECRET, secret);
}

export async function getBridgeSecret(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE.BRIDGE_SECRET);
}

// ─── Client Token (relay) ───────────────────────────────────────────────

export async function saveClientToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE.CLIENT_TOKEN, token);
}

export async function getClientToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE.CLIENT_TOKEN);
}

// ─── Clear Everything ────────────────────────────────────────────────────

export async function clearAllCredentials(): Promise<void> {
  await clearDeviceCredential();
  await AsyncStorage.removeItem(ASYNC.PI_HOST);
  await AsyncStorage.removeItem(ASYNC.PI_PORT);
  await AsyncStorage.removeItem(ASYNC.TRANSPORT);
  await AsyncStorage.removeItem(ASYNC.RELAY_SERVER);
  await AsyncStorage.removeItem(ASYNC.GHOST_ID);
  await AsyncStorage.removeItem(ASYNC.GHOST_NAME);
}

// ─── Redacted Logging ───────────────────────────────────────────────────

export function redact(value: string, showLast = 4): string {
  if (value.length <= showLast) return "[REDACTED]";
  return "*".repeat(value.length - showLast) + value.slice(-showLast);
}
