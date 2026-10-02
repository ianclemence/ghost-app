import { useState } from "react";
import { useRouter } from "expo-router";
import { GhostButton } from "@/components/ghost";
import { StatusScreen } from "@/components/status-screen";
import { ensureNotificationPermission } from "@/lib/notify";
import { useGhostStore } from "@/lib/store";

/**
 * Pairing success screen.
 * Calm, short-lived. Shows after successful pairing.
 * Optionally prompts for notification permission.
 */
export default function PairingSuccessScreen() {
  const router = useRouter();
  const [askedNotifications, setAskedNotifications] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [busy, setBusy] = useState(false);

  const handleContinue = async () => {
    if (busy) return;
    if (askedNotifications) {
      router.replace("/(tabs)");
      return;
    }

    // Prompt once when undecided,
    // otherwise report the existing state. Unavailable (Expo Go, etc.)
    // skips straight through.
    setBusy(true);
    const result = await ensureNotificationPermission();
    setBusy(false);
    if (result === "unavailable") {
      router.replace("/(tabs)");
      return;
    }
    setNotifStatus(result);
    setAskedNotifications(true);
    // Now that the owner has decided, hand the Pod a push token so it can
    // reach this phone when the app is closed.
    if (result === "granted") {
      const cfg = useGhostStore.getState().config;
      if (cfg) void import("@/lib/push").then((m) => m.syncPushToken(cfg)).catch(() => {});
    }
  };

  // After notifications handled, show the final state
  if (askedNotifications) {
    return (
      <StatusScreen
        title="Ghost connected."
        body={
          notifStatus === "granted"
            ? "Ghost can reach you when something needs your attention."
            : notifStatus === "denied"
              ? "You can enable notifications later in Settings."
              : "Your Ghost is ready."
        }
        actions={<GhostButton title="Continue" onPress={() => router.replace("/(tabs)")} fullWidth />}
      />
    );
  }

  return (
    <StatusScreen
      title="Ghost connected."
      body="Your Ghost is ready."
      actions={<GhostButton title="Continue" onPress={handleContinue} loading={busy} disabled={busy} fullWidth />}
    />
  );
}
