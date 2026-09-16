// Offline thread durability: phone-local answers live only in the Zustand
// thread view, and Pod history is unreachable offline. Without this cache a
// reinstall (or process kill before sync) loses offline turns entirely.
//
// Stores the last 100 thread messages in AsyncStorage (app-sandboxed, same
// sensitivity as the thread itself). Pod history remains authoritative on
// reconnect — conversation.tsx reconciles underneath via reconcileHistory.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ghost:local:thread:v1";
const MAX = 100;

export interface CachedMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
}

export async function saveLocalThread(messages: CachedMessage[]): Promise<void> {
  try {
    const trimmed = messages.filter((m) => m.content).slice(-MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch { /* cache never breaks chat */ }
}

export async function loadLocalThread(): Promise<CachedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is CachedMessage =>
        typeof m === "object" && m !== null &&
        typeof (m as { id?: unknown }).id === "string" &&
        typeof (m as { role?: unknown }).role === "string" &&
        typeof (m as { content?: unknown }).content === "string",
    ).slice(-MAX);
  } catch {
    return [];
  }
}

export async function clearLocalThread(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch { /* best effort */ }
}
