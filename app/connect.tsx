import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { Ghost, Radius, Space } from "@/constants/theme";

/**
 * Connect to Ghost screen.
 * Primary: Scan QR Code.
 * Secondary: Enter manually (visually quiet).
 */
export default function ConnectToGhostScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 100 }]}>
      <View style={styles.content}>
        <GhostText type="largeTitle" style={styles.title}>
          Connect to Ghost
        </GhostText>
        <GhostText type="body" style={styles.description}>
          Your Ghost is running on your Ghost Pod.{"\n"}Scan the QR code shown on your Ghost Pod to connect this phone.
        </GhostText>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 80 }]}>
        <GhostButton
          title="Scan QR Code"
          variant="primary"
          onPress={() => router.push("/scan")}
          fullWidth
        />
        <TouchableOpacity
          style={styles.manualButton}
          onPress={() => router.push("/manual")}
          activeOpacity={0.6}
        >
          <GhostText type="callout" style={styles.manualText}>
            Enter manually
          </GhostText>
        </TouchableOpacity>
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
  },
  title: {
    color: Ghost.text.primary,
    textAlign: "center",
    marginBottom: Space.md,
  },
  description: {
    color: Ghost.text.secondary,
    textAlign: "center",
    lineHeight: 24,
  },
  bottom: {
    gap: Space.md,
  },
  manualButton: {
    alignItems: "center",
    paddingVertical: Space.md,
  },
  manualText: {
    color: Ghost.text.tertiary,
  },
});
