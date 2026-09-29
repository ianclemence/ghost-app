import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Space } from "@/constants/theme";
import { dismissFirstRun } from "@/lib/firstRun";

/**
 * First launch screen.
 *
 * Ghost lives on a Pod the owner controls: memory, permissions, and tools
 * stay there. The phone is how you reach it, so the first step is always
 * connecting (or setting up) the Pod.
 */
export default function FirstLaunchScreen() {
  const router = useRouter();

  // Look around first: the conversation opens with the way to connect a Pod
  // one tap away, so first run is never a dead end.
  const explore = async () => {
    await dismissFirstRun();
    router.replace("/");
  };

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
        <GhostText type="callout" style={styles.explain}>
          Ghost runs on a small computer you own. This phone is how you talk to it, from anywhere.
        </GhostText>
      </View>

      <View style={styles.bottom}>
        <GhostButton
          title="Connect your Pod"
          variant="primary"
          onPress={() => router.push("/connect")}
          fullWidth
        />
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => router.push("/setup-pod" as never)}
          activeOpacity={0.6}
        >
          <GhostText type="callout" style={styles.secondaryText}>
            Set up a new Pod
          </GhostText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quiet}
          onPress={explore}
          activeOpacity={0.6}
        >
          <GhostText type="footnote" style={styles.quietText}>
            Look around first
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
  explain: {
    color: Ghost.text.secondary,
    textAlign: "center",
    marginTop: Space.lg,
    maxWidth: 300,
  },
  bottom: {
    position: "absolute",
    bottom: Space.section + Space.lg,
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
  quiet: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: Space.sm,
  },
  quietText: {
    color: Ghost.text.tertiary,
    opacity: 0.7,
  },
});
