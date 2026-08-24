import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Fonts, Space } from "@/constants/theme";
import * as Notifications from "expo-notifications";
import Constants, { AppOwnership } from "expo-constants";

const FONT = Fonts.sans;
const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

/**
 * Pairing success screen.
 * Calm, short-lived. Shows after successful pairing.
 * Optionally prompts for notification permission.
 */
export default function PairingSuccessScreen() {
  const router = useRouter();
  const [askedNotifications, setAskedNotifications] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");

  const handleContinue = async () => {
    if (askedNotifications) {
      router.replace("/(tabs)");
      return;
    }

    // Check notification status
    try {
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
    }
  };

  // After notifications handled, show the final state
  if (askedNotifications) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <GhostMark size={48} />
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

        <View style={styles.bottom}>
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
    <View style={styles.container}>
      <View style={styles.content}>
        <GhostMark size={48} />
        <GhostText type="largeTitle" style={styles.title}>
          Ghost connected.
        </GhostText>
        <GhostText type="body" style={styles.description}>
          Your Ghost is ready.
        </GhostText>
      </View>

      <View style={styles.bottom}>
        <GhostButton
          title="Continue"
          variant="primary"
          onPress={handleContinue}
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
    paddingTop: 100,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Space.md,
  },
  title: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    textAlign: "center",
  },
  description: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    textAlign: "center",
    lineHeight: 24,
  },
  bottom: {
    paddingBottom: 80,
  },
});
