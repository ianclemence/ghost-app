import { View, StyleSheet, Linking, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";
import Constants from "expo-constants";
import { GhostText } from "@/components/themed-text";
import { ScreenHeader } from "@/components/screen-header";
import { Ghost, Space } from "@/constants/theme";
import { GhostMark } from "@/components/ghost-mark";
import { useGhostStore } from "@/lib/store";
import { EdgeScrollView } from "@/components/scroll-edge";

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const ghostName = useGhostStore((s) => s.ghostName);
  const name = ghostName || "Ghost";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <View style={{ flex: 1, backgroundColor: Ghost.bg.base }}>
    <ScreenHeader title="About" />
    <EdgeScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.container, { paddingTop: Space.md, paddingBottom: insets.bottom + Space.huge }]}
    >
      <View style={styles.brand}>
        <GhostMark size={48} />
        <GhostText type="footnote" style={styles.brandTagline}>
          Your AI. Your Memory. Your Machine.
        </GhostText>
      </View>

      <View style={styles.section}>
        <GhostText type="body" style={styles.prose}>
          <GhostText style={styles.proseBold}>{name}</GhostText> is a personal AI
          that lives on a small computer in your home. It remembers the people and
          plans in your life, does things for you, and speaks up when something
          needs you. It is the same Ghost on your phone, in a browser and in a
          terminal.
        </GhostText>
      </View>

      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionLabel}>
          How it works
        </GhostText>
        <View style={styles.item}>
          <GhostText type="body" style={styles.itemTitle}>Ghost Web</GhostText>
          <GhostText type="caption" style={styles.itemDesc}>
            Set up, connect and look after your Ghost from any browser.
          </GhostText>
        </View>
        <View style={styles.item}>
          <GhostText type="body" style={styles.itemTitle}>Ghost Mobile</GhostText>
          <GhostText type="caption" style={styles.itemDesc}>
            Talk to Ghost, approve what it wants to do, and step in when it needs you.
          </GhostText>
        </View>
        <View style={styles.item}>
          <GhostText type="body" style={styles.itemTitle}>The Ghost Pod</GhostText>
          <GhostText type="caption" style={styles.itemDesc}>
            The small always-on computer Ghost lives on.
          </GhostText>
        </View>
      </View>

      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionLabel}>
          Privacy
        </GhostText>
        <GhostText type="body" style={styles.prose}>
          Your memory, files and logins stay on your Pod. Nothing is sent to a
          central service. Only what you ask Ghost to think about goes to the AI
          model you chose, and only if that model is in the cloud.
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
        Ghost Mobile v{appVersion} · Open source under the MIT License.
      </GhostText>
    </EdgeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
  },
  brand: {
    alignItems: "center",
    paddingVertical: Space.xl,
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
    marginTop: Space.xxl,
    paddingBottom: Space.xl,
  },
});
