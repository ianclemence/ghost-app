import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { GhostText } from "@/components/themed-text";
import { GhostList, GhostRow, SectionHeader } from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import Constants from "expo-constants";

const FONT = Fonts.sans;

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ghost.bg.base }}
      contentContainerStyle={styles.container}
    >
      <GhostText type="title" style={styles.title}>
        About
      </GhostText>

      <SectionHeader title="Ghost" />
      <View style={styles.card}>
        <View style={styles.center}>
          <GhostText type="title" style={styles.appName}>
            Ghost
          </GhostText>
          <GhostText type="body" style={styles.version}>
            Version {version}
          </GhostText>
          <GhostText type="body" style={styles.tagline}>
            Your personal AI.
          </GhostText>
        </View>
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
  card: {
    padding: 16,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
  },
  center: {
    alignItems: "center",
    paddingVertical: 12,
  },
  appName: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 4,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  version: {
    opacity: 0.5,
    marginBottom: 8,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  tagline: {
    fontStyle: "italic",
    opacity: 0.6,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
});
