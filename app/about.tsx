import { View, StyleSheet, ScrollView, Linking, TouchableOpacity } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { GhostText } from "@/components/themed-text";
import { Ghost, Fonts, Space } from "@/constants/theme";
import { GhostMark } from "@/components/ghost-mark";
import Constants from "expo-constants";
import { useGhostStore } from "@/lib/store";

const FONT = Fonts.sans;

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? "2.0.0";
  const ghostName = useGhostStore((s) => s.ghostName);
  const name = ghostName || "Ghost";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ghost.bg.base }}
      contentContainerStyle={styles.container}
    >
      <GhostText type="title" style={styles.title}>
        About
      </GhostText>

      <View style={styles.center}>
        <GhostMark size={56} />
        <GhostText type="largeTitle" style={styles.appName}>
          {name}
        </GhostText>
        <GhostText type="body" style={styles.tagline}>
          Your AI, Your Memory, Your Machine
        </GhostText>
      </View>

      <View style={styles.infoRow}>
        <GhostText type="caption" style={styles.infoLabel}>
          Name
        </GhostText>
        <GhostText type="body" style={styles.infoValue}>
          {name}
        </GhostText>
      </View>
      <View style={styles.infoRow}>
        <GhostText type="caption" style={styles.infoLabel}>
          Version
        </GhostText>
        <GhostText type="body" style={styles.infoValue}>
          {version}
        </GhostText>
      </View>

      <View style={styles.block}>
        <GhostText type="body" style={styles.prose}>
          Ghost is a personal AI that lives on your own hardware. It remembers
          what matters, works for you without being watched, and stays with you
          across your devices.
        </GhostText>
        <View style={styles.bullets}>
          <GhostText type="body" style={styles.bullet}>
            {"• "}Ghost Web is where you own, configure, understand, and take
            care of Ghost.
          </GhostText>
          <GhostText type="body" style={styles.bullet}>
            {"• "}Ghost Mobile is where you talk to Ghost and take it with you.
          </GhostText>
          <GhostText type="body" style={styles.bullet}>
            {"• "}The Ghost Pod is the hardware Ghost lives on.
          </GhostText>
        </View>
        <GhostText type="body" style={styles.prose}>
          This app is version {version}.
        </GhostText>
        <GhostText type="body" style={styles.prose}>
          Ghost is open-source. Source, documentation, and license are in the
          project repository. Configuration and secrets live only on your
          device — nothing here is sent to a central service unless you
          explicitly connect a cloud provider.
        </GhostText>
      </View>

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
        onPress={() => Linking.openURL("https://github.com/ianclemence/ghost")}
      >
        <GhostText type="body" style={styles.linkLabel}>
          Source code
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
    paddingTop: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 24,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  center: {
    alignItems: "center",
    paddingVertical: Space.xxxl,
    gap: Space.sm,
  },
  appName: {
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  tagline: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    fontStyle: "italic",
    opacity: 0.5,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.sm,
  },
  infoLabel: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  infoValue: {
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  block: {
    marginTop: Space.xl,
  },
  prose: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    lineHeight: 22,
  },
  bullets: {
    gap: Space.xs,
    marginVertical: Space.sm,
  },
  bullet: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    lineHeight: 22,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.md,
    marginTop: Space.md,
  },
  linkLabel: {
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
});
