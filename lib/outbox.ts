/**
 * Offline outbox: messages typed while Ghost is unreachable are queued
 * locally and delivered FIFO when connectivity returns.
 *
 * Design notes:
 * - Only network/timeout failures are queued. Auth, provider, and other
 *   errors mean "don't retry blindly" and surface immediately instead.
 * - Entries persist in AsyncStorage (app-sandboxed, like the rest of the
 *   chat state) so a restart doesn't lose queued messages. These are the
 *   user's own typed drafts — no different in sensitivity from the thread
 *   itself — but they never leave the device except as the eventual send.
 * - Flush is strictly FIFO, one turn at a time. A failed flush stops and
 *   leaves the entry queued; it never reorders or duplicates.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GhostErrorKind } from "./ghostApi";

export interface OutboxEntry {
  id: string;
  /** Temp id of the user message shown in the thread. */
  messageId: string;
  content: string;
  sessionKey: string;
  createdAt: number;
  attempts: number;
}

const STORAGE_KEY = "ghost:outbox";
const MAX_ENTRIES = 50;

export function isRetryableSendError(kind: GhostErrorKind): boolean {
  return kind === "network" || kind === "timeout";
}

export function makeOutboxId(): string {
  return `q-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export async function loadOutbox(): Promise<OutboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOutboxEntry);
  } catch {
    return [];
  }
}

function isOutboxEntry(v: unknown): v is OutboxEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.messageId === "string" &&
    typeof e.content === "string" &&
    typeof e.sessionKey === "string" &&
    typeof e.createdAt === "number"
  );
}

export async function saveOutbox(entries: OutboxEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** Append an entry, oldest-first. Caps the queue; drops the oldest on overflow. */
export async function enqueueOutbox(entry: OutboxEntry): Promise<OutboxEntry[]> {
  const entries = await loadOutbox();
  const next = [...entries.filter((e) => e.id !== entry.id), entry];
  while (next.length > MAX_ENTRIES) next.shift();
  await saveOutbox(next);
  return next;
}

export async function removeOutboxEntry(id: string): Promise<OutboxEntry[]> {
  const entries = await loadOutbox();
  const next = entries.filter((e) => e.id !== id);
  if (next.length !== entries.length) await saveOutbox(next);
  return next;
}

export async function clearOutbox(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
