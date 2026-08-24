import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";

const FONT = Fonts.sans;

/**
 * Connect to Ghost screen.
 * Primary: Scan QR Code.
 * Secondary: Enter manually (visually quiet).
 */
export default function ConnectToGhostScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <GhostText type="largeTitle" style={styles.title}>
          Connect to Ghost
        </GhostText>
        <GhostText type="body" style={styles.description}>
          Your Ghost is running on your Ghost Pod.{"\n"}Scan the QR code shown on your Ghost Pod to connect this phone.
        </GhostText>
      </View>

      <View style={styles.bottom}>
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
    paddingTop: 100,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    textAlign: "center",
    marginBottom: Space.md,
  },
  description: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    textAlign: "center",
    lineHeight: 24,
  },
  bottom: {
    paddingBottom: 80,
    gap: Space.md,
  },
  manualButton: {
    alignItems: "center",
    paddingVertical: Space.md,
  },
  manualText: {
    fontFamily: FONT,
    color: Ghost.text.tertiary,
  },
});
