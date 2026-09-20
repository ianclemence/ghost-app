import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { ensureNotificationPermission } from "@/lib/notify";

const SUCCESS_ENTER = FadeIn.duration(300).easing(Easing.bezier(0.23, 1, 0.32, 1));

/**
 * Pairing success screen.
 * Calm, short-lived. Shows after successful pairing.
 * Optionally prompts for notification permission.
 */
export default function PairingSuccessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [askedNotifications, setAskedNotifications] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReducedMotion();

  const handleContinue = async () => {
    if (busy) return;
    if (askedNotifications) {
      router.replace("/(tabs)");
      return;
    }

    // Same shared ask as Mini-download setup: prompt once when undecided,
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
  };

  // After notifications handled, show the final state
  if (askedNotifications) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 100 }]}>
        <View style={styles.content}>
          <Animated.View entering={reduceMotion ? undefined : SUCCESS_ENTER} style={styles.successMark}>
            <GhostMark size={48} />
          </Animated.View>
          <GhostText type="largeTitle" style={styles.title}>
            Ghost connected.
          </GhostText>
          <GhostText type="body" style={styles.description}>
            {notifStatus === "granted"
              ? "Ghost can reach you when something needs your attention."
              : notifStatus === "denied"
                ? "You can enable notifications later in Settings."
                : "Your Ghost is ready."}
          </GhostText>
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 80 }]}>
          <GhostButton
            title="Continue"
            variant="primary"
            onPress={() => router.replace("/(tabs)")}
            fullWidth
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 100 }]}>
      <View style={styles.content}>
        <GhostMark size={48} />
        <GhostText type="largeTitle" style={styles.title}>
          Ghost connected.
        </GhostText>
        <GhostText type="body" style={styles.description}>
          Your Ghost is ready.
        </GhostText>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 80 }]}>
        <GhostButton
          title="Continue"
          variant="primary"
          onPress={handleContinue}
          loading={busy}
          disabled={busy}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
    paddingHorizontal: Space.xl,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Space.md,
  },
  successMark: {
    alignItems: "center",
  },
  title: {
    color: Ghost.text.primary,
    textAlign: "center",
  },
  description: {
    color: Ghost.text.secondary,
    textAlign: "center",
    lineHeight: 24,
  },
  bottom: {},
});
