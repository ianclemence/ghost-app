import { View, StyleSheet, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { GhostMark } from "@/components/ghost-mark";
import { GhostList, GhostRow, Panel, SectionHeader } from "@/components/ghost";
import { useGhostStore } from "@/lib/store";
import { EdgeScrollView } from "@/components/scroll-edge";
import { runningUpdate } from "@/hooks/use-ota-updates";

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const ghostName = useGhostStore((s) => s.ghostName);
  const name = ghostName || "Ghost";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  // Which over-the-air update is running, so it is easy to see one arrived.
  const update = runningUpdate();

  return (
    <View style={{ flex: 1, backgroundColor: Ghost.bg.base }}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="About" />
      <EdgeScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <GhostMark size={56} />
          <Text style={styles.wordmark}>{name}</Text>
          <Text style={styles.tagline}>Your AI. Your Memory. Your Machine.</Text>
        </View>

        <Panel>
          <Text style={styles.prose}>
            <Text style={styles.proseBold}>{name}</Text> is a personal AI that lives on a small computer in your home. It
            remembers the people and plans in your life, does things for you, and speaks up when something needs you. It
            is the same Ghost on your phone, in a browser and in a terminal.
          </Text>
        </Panel>

        <SectionHeader title="How it works" />
        <GhostList>
          <GhostRow title="Ghost Web" subtitle="Set up, connect and look after your Ghost from any browser." />
          <GhostRow title="Ghost Mobile" subtitle="Talk to Ghost, approve what it wants to do, and step in when it needs you." />
          <GhostRow title="The Ghost Pod" subtitle="The small always-on computer Ghost lives on." />
        </GhostList>

        <SectionHeader title="Privacy" />
        <Panel style={{ marginTop: 0 }}>
          <Text style={styles.prose}>
            Your memory, files and logins stay on your Pod. Nothing is sent to a central service. Only what you ask Ghost
            to think about goes to the AI model you chose, and only if that model is in the cloud.
          </Text>
        </Panel>

        <SectionHeader title="Links" />
        <GhostList>
          <GhostRow title="Documentation" chevron onPress={() => Linking.openURL("https://ghost.ianclemence.com")} />
          <GhostRow title="Report an issue" chevron onPress={() => Linking.openURL("https://github.com/ianclemence/ghost/issues")} />
        </GhostList>

        <Text style={styles.license}>Ghost Mobile v{appVersion}{update ? ` · updated ${update}` : ""} · Open source under the MIT License.</Text>
      </EdgeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", paddingTop: Space.sm, paddingBottom: Space.lg, gap: Space.xs },
  wordmark: { fontFamily: Fonts.voice, fontSize: 40, lineHeight: 48, letterSpacing: -0.8, color: Ghost.text.primary, marginTop: Space.sm },
  tagline: { fontSize: 14.5, fontWeight: "300", color: Ghost.text.secondary },
  prose: { fontSize: 15.5, lineHeight: 24, fontWeight: "300", color: "rgba(255,255,255,0.82)" },
  proseBold: { color: Ghost.text.primary, fontWeight: "600" },
  license: { fontSize: 12.5, color: Ghost.text.tertiary, textAlign: "center", marginTop: Space.xxl },
});
