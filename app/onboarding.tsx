import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Space } from "@/constants/theme";

/**
 * First launch screen.
 *
 * Ghost is one system that runs wherever you have hardware. The phone is a
 * first-class Ghost, so the primary path is local setup; a Ghost Pod is the
 * optional extension for home hardware and always-on service.
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
          Your AI. Your Memory. Your Machine.
        </GhostText>
      </View>

      <View style={styles.bottom}>
        <GhostButton
          title="Set up on this phone"
          variant="primary"
          onPress={() => router.push("/local-models?firstRun=1" as never)}
          fullWidth
        />
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => router.push("/connect")}
          activeOpacity={0.6}
        >
          <GhostText type="callout" style={styles.secondaryText}>
            Connect a Ghost Pod
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Space.xl,
  },
  content: {
    alignItems: "center",
    gap: Space.xs,
  },
  title: {
    color: Ghost.text.primary,
  },
  tagline: {
    color: Ghost.text.secondary,
    opacity: 0.7,
  },
  bottom: {
    position: "absolute",
    bottom: 80,
    left: Space.xl,
    right: Space.xl,
    gap: Space.md,
  },
  secondary: {
    alignItems: "center",
    paddingVertical: Space.md,
  },
  secondaryText: {
    color: Ghost.text.tertiary,
  },
});
