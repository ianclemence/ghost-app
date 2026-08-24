import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Fonts, Space } from "@/constants/theme";
import { disconnectAndClear } from "@/lib/connection";

const FONT = Fonts.sans;

/**
 * Revoked device screen.
 * Shown when Ghost explicitly reports this device has been disconnected.
 * The credential should be removed from secure storage.
 */
export default function RevokedScreen() {
  const router = useRouter();

  const handleConnectAgain = async () => {
    await disconnectAndClear();
    router.replace("/onboarding");
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <GhostMark size={48} color={Ghost.text.tertiary} />
        <GhostText type="headline" style={styles.title}>
          This device has been disconnected from your Ghost.
        </GhostText>
        <GhostText type="body" style={styles.description}>
          You'll need to pair again with your Ghost Pod.
        </GhostText>
      </View>

      <View style={styles.bottom}>
        <GhostButton
          title="Connect again"
          variant="primary"
          onPress={handleConnectAgain}
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
    lineHeight: 26,
  },
  description: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    textAlign: "center",
  },
  bottom: {
    paddingBottom: 80,
  },
});
