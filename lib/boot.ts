import { isPaired, restoreConfig } from "@/lib/connection";
import { useGhostStore } from "@/lib/store";
import { loadLocalThread } from "@/lib/threadCache";

/**
 * Everything the first screen needs, restored from the phone itself and
 * without the network: whether this phone is paired, the saved config, and the
 * last conversation. The splash stays up until this is done, so the first thing
 * drawn is the right screen: the conversation already holding your thread, or
 * onboarding for a phone that has never paired. Returns whether it is paired.
 */
export async function restoreForBoot(): Promise<boolean> {
  const paired = await isPaired().catch(() => false);
  if (!paired) return false;
  await restoreConfig().catch(() => false);
  const cached = await loadLocalThread().catch(() => []);
  const store = useGhostStore.getState();
  if (cached.length > 0 && store.messages.length === 0) {
    store.setMessages(
      cached.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: m.timestamp,
      })),
    );
  }
  return true;
}
