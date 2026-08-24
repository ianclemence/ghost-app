import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Fonts, Space } from "@/constants/theme";

const FONT = Fonts.sans;

/**
 * First launch screen.
 * Minimal — opens like a physical Ghost product.
 * Ghost mark, name, tagline, one CTA.
 */
export default function FirstLaunchScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <GhostMark size={64} />
        <GhostText type="largeTitle" style={styles.title}>
          Ghost
        </GhostText>
        <GhostText type="body" style={styles.tagline}>
          Your AI, your hardware.
        </GhostText>
      </View>

      <View style={styles.bottom}>
        <GhostButton
          title="Connect to Ghost"
          variant="primary"
          onPress={() => router.push("/connect")}
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Space.xl,
  },
  content: {
    alignItems: "center",
    gap: Space.md,
  },
  title: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    marginTop: Space.sm,
  },
  tagline: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    opacity: 0.7,
  },
  bottom: {
    position: "absolute",
    bottom: 80,
    left: Space.xl,
    right: Space.xl,
  },
});
