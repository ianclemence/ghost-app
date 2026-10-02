import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { Fonts, Ghost, Space, Type, UI } from "@/constants/theme";
import { ScreenBackground } from "@/components/screen-glow";

/**
 * Connect to Ghost screen.
 * Primary: Scan QR Code.
 * Secondary: Enter manually (visually quiet).
 */
export default function ConnectToGhostScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top + UI.modal.top }]}>
      <ScreenBackground variant="hero" />
      <View style={styles.content}>
        <GhostText type="largeTitle" style={styles.title}>
          Connect to Ghost
        </GhostText>
        <GhostText type="body" style={styles.description}>
          Scan the QR code shown on your Ghost Pod to connect this phone.
        </GhostText>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + UI.modal.bottom }]}>
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
    alignItems: "flex-start",
  },
  title: {
    fontFamily: Fonts.voice,
    fontSize: 52,
    lineHeight: 54,
    letterSpacing: -1,
    color: Ghost.text.primary,
    marginBottom: Space.md,
  },
  description: {
    ...Type.prose,
    fontSize: 20,
    lineHeight: 29,
    color: "rgba(255,255,255,0.78)",
  },
  bottom: {
    gap: Space.md,
  },
  manualButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: Space.md,
  },
  manualText: {
    color: Ghost.text.tertiary,
  },
});
