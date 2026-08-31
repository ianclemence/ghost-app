import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Space } from "@/constants/theme";
import { disconnectAndClear } from "@/lib/connection";

/**
 * Authentication failure screen.
 * Shown when the stored credential is rejected by Ghost.
 * Not a temporary network issue — the credential itself is invalid.
 */
export default function AuthFailureScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleConnectAgain = async () => {
    await disconnectAndClear();
    router.replace("/onboarding");
  };

  const handleTryReconnect = () => {
    router.replace("/(tabs)");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 100 }]}>
      <View style={styles.content}>
        <GhostMark size={48} color={Ghost.text.tertiary} />
        <GhostText type="headline" style={styles.title}>
          This device is no longer connected to your Ghost.
        </GhostText>
        <GhostText type="body" style={styles.description}>
          The connection may have been removed from your Ghost Pod.
        </GhostText>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 80 }]}>
        <GhostButton
          title="Connect again"
          variant="primary"
          onPress={handleConnectAgain}
          fullWidth
        />
        <GhostButton
          title="Try reconnect"
          variant="ghost"
          onPress={handleTryReconnect}
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
  title: {
    color: Ghost.text.primary,
    textAlign: "center",
    lineHeight: 26,
  },
  description: {
    color: Ghost.text.secondary,
    textAlign: "center",
  },
  bottom: {
    gap: Space.sm,
  },
});
