import { View, StyleSheet, ScrollView, Linking, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";
import { GhostText } from "@/components/themed-text";
import { Ghost, Space } from "@/constants/theme";
import { GhostMark } from "@/components/ghost-mark";
import { useGhostStore } from "@/lib/store";

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const ghostName = useGhostStore((s) => s.ghostName);
  const name = ghostName || "Ghost";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ghost.bg.base }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + Space.xl }]}
    >
      <View style={styles.brand}>
        <GhostMark size={48} />
        <GhostText type="footnote" style={styles.brandTagline}>
          Your AI, Your Memory, Your Machine
        </GhostText>
      </View>

      <View style={styles.section}>
        <GhostText type="body" style={styles.prose}>
          <GhostText style={styles.proseBold}>{name}</GhostText> is a personal AI
          that lives on your own hardware. It remembers what matters, works for
          you without being watched, and stays with you across your devices.
        </GhostText>
      </View>

      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionLabel}>
          How it works
        </GhostText>
        <View style={styles.item}>
          <GhostText type="body" style={styles.itemTitle}>Ghost Web</GhostText>
          <GhostText type="caption" style={styles.itemDesc}>
            The control center. Configure, understand, and take care of Ghost.
          </GhostText>
        </View>
        <View style={styles.item}>
          <GhostText type="body" style={styles.itemTitle}>Ghost Mobile</GhostText>
          <GhostText type="caption" style={styles.itemDesc}>
            Your daily driver. Talk to Ghost and take it with you.
          </GhostText>
        </View>
        <View style={styles.item}>
          <GhostText type="body" style={styles.itemTitle}>The Ghost Pod</GhostText>
          <GhostText type="caption" style={styles.itemDesc}>
            The hardware Ghost lives on. A Raspberry Pi, RK1, or any Linux machine.
          </GhostText>
        </View>
      </View>

      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionLabel}>
          Privacy
        </GhostText>
        <GhostText type="body" style={styles.prose}>
          Configuration and secrets live only on your device. Nothing is sent to
          a central service unless you explicitly connect a cloud provider.
        </GhostText>
      </View>

      <View style={styles.links}>
        <TouchableOpacity
          style={styles.linkRow}
          activeOpacity={0.6}
          onPress={() => Linking.openURL("https://ghost.ianclemence.com")}
        >
          <GhostText type="body" style={styles.linkLabel}>
            Documentation
          </GhostText>
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkRow}
          activeOpacity={0.6}
          onPress={() =>
            Linking.openURL("https://github.com/ianclemence/ghost/issues")
          }
        >
          <GhostText type="body" style={styles.linkLabel}>
            Report an issue
          </GhostText>
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        </TouchableOpacity>
      </View>

      <GhostText type="caption" style={styles.license}>
        Open source under the MIT License.
      </GhostText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
  },
  brand: {
    alignItems: "center",
    paddingVertical: Space.xxxl,
    gap: Space.sm,
  },
  brandTagline: {
    color: Ghost.text.tertiary,
    fontStyle: "italic",
  },
  section: {
    marginBottom: Space.xl,
  },
  sectionLabel: {
    color: Ghost.text.tertiary,
    textTransform: "uppercase",
    marginBottom: Space.sm,
  },
  prose: {
    color: Ghost.text.secondary,
  },
  proseBold: {
    color: Ghost.text.primary,
    fontWeight: "700",
  },
  item: {
    paddingVertical: Space.sm,
  },
  itemTitle: {
    color: Ghost.text.primary,
    fontWeight: "600",
  },
  itemDesc: {
    color: Ghost.text.secondary,
    marginTop: Space.xxs,
  },
  links: {
    marginTop: Space.md,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.md,
  },
  linkLabel: {
    color: Ghost.text.primary,
  },
  license: {
    color: Ghost.text.tertiary,
    textAlign: "center",
    marginTop: Space.xxxl,
    paddingBottom: Space.xl,
  },
});
