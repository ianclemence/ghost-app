import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { GhostText } from "@/components/themed-text";
import { GhostList, GhostRow, SectionHeader } from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { GhostMark } from "@/components/ghost-mark";
import Constants from "expo-constants";

const FONT = Fonts.sans;

/**
 * About screen.
 * Minimal — Ghost mark, name, version, tagline.
 * Optional links that actually work.
 */
export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? "2.0.0";

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
          Ghost
        </GhostText>
        <GhostText type="body" style={styles.version}>
          Version {version}
        </GhostText>
        <GhostText type="body" style={styles.tagline}>
          Your AI, your hardware.
        </GhostText>
      </View>

      <SectionHeader title="Links" />
      <View style={styles.card}>
        <GhostList>
          <GhostRow
            title="Documentation"
            onPress={() => Linking.openURL("https://ghost.ianclemence.com")}
            chevron
          />
          <GhostRow
            title="Source code"
            onPress={() => Linking.openURL("https://github.com/ianclemence/ghost")}
            chevron
          />
          <GhostRow
            title="Report an issue"
            onPress={() => Linking.openURL("https://github.com/ianclemence/ghost/issues")}
            chevron
          />
        </GhostList>
      </View>
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
  version: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    opacity: 0.6,
  },
  tagline: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    fontStyle: "italic",
    opacity: 0.5,
  },
  card: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
    overflow: "hidden",
  },
});
