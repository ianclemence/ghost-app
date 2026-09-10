import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { capability } from "@/lib/capabilities";

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

    // Notifications need a dev build; in Expo Go skip straight through.
    // The module throws at import time on newer SDKs, so load it lazily.
    if (!capability("notifications").supported) {
      router.replace("/(tabs)");
      return;
    }

    // Check notification status
    setBusy(true);
    try {
      const Notifications = await import("expo-notifications");
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") {
        setNotifStatus("granted");
        setAskedNotifications(true);
        return;
      }
      if (status === "denied") {
        setNotifStatus("denied");
        setAskedNotifications(true);
        return;
      }
      // Undetermined — request permission
      const result = await Notifications.requestPermissionsAsync();
      setNotifStatus(result.status as "granted" | "denied");
      setAskedNotifications(true);
    } catch {
      // Notifications not available (Expo Go, etc.)
      router.replace("/(tabs)");
    } finally {
      setBusy(false);
    }
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
