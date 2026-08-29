import { View, StyleSheet, ScrollView } from "react-native";
import { GhostText } from "@/components/themed-text";
import { Ghost, Fonts, Space } from "@/constants/theme";

const FONT = Fonts.sans;

type Part = { text: string; bold?: boolean; italic?: boolean };
type Block = { heading: string; body: Part[] };

const BLOCKS: Block[] = [
  {
    heading: "Connecting devices",
    body: [
      { text: "Open " },
      { text: "Devices", bold: true },
      { text: " and choose " },
      { text: "Connect another device", italic: true },
      {
        text: ". Ghost shows a code that expires after a few minutes and can be used once. Scan it with the Ghost app on your phone. Once paired, that device can reach your Ghost — but your Ghost itself stays on this hardware.",
      },
    ],
  },
  {
    heading: "AI",
    body: [
      { text: "Ghost runs a small model on your hardware for everyday tasks (" },
      { text: "Local intelligence", italic: true },
      {
        text: "). You can optionally add a cloud provider for harder reasoning. Ghost decides where each task runs based on capability, privacy, latency, cost, and availability.",
      },
    ],
  },
  {
    heading: "Memory",
    body: [
      { text: "Open " },
      { text: "Memory", bold: true },
      {
        text: " to browse, read, and forget them. Forgetting deletes a note from your Ghost.",
      },
    ],
  },
  {
    heading: "Skills",
    body: [
      {
        text: "Skills are capabilities Ghost has installed. Built-ins come with Ghost; you can add more from a GitHub repository. Disable a skill to turn it off without deleting it.",
      },
    ],
  },
  {
    heading: "Automations",
    body: [
      {
        text: "Automations are tasks Ghost runs on a schedule — a morning briefing, a weekly research roundup. Create one with a name, what it should do, and when it should run.",
      },
    ],
  },
  {
    heading: "Backups",
    body: [
      {
        text: "A backup is a download containing your memory, skills, configuration, and automations. Secrets are kept out of backups for safety. Store the file somewhere you trust.",
      },
    ],
  },
  {
    heading: "Diagnostics",
    body: [
      { text: "If something seems off, open " },
      { text: "System", bold: true },
      { text: " and run " },
      { text: "Diagnostics", italic: true },
      {
        text: ". It checks Ghost, its services, storage, and connections, and tells you what’s healthy and what isn’t.",
      },
    ],
  },
  {
    heading: "Recovery",
    body: [
      {
        text: "If you’re locked out, you can re-run setup from the Ghost service with the force flag to reset owner access. Your memory and skills are preserved.",
      },
    ],
  },
];

export default function HelpScreen() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ghost.bg.base }}
      contentContainerStyle={styles.container}
    >
      <GhostText type="title" style={styles.title}>
        Help
      </GhostText>
      <GhostText type="body" style={styles.intro}>
        How Ghost works.
      </GhostText>

      <View style={styles.prose}>
        {BLOCKS.map((block) => (
          <View key={block.heading} style={styles.block}>
            <GhostText type="headline" style={styles.heading}>
              {block.heading}
            </GhostText>
            <GhostText type="body" style={styles.body}>
              {block.body.map((part, i) => (
                <GhostText
                  key={i}
                  style={[
                    part.bold && styles.bold,
                    part.italic && styles.italic,
                  ]}
                >
                  {part.text}
                </GhostText>
              ))}
            </GhostText>
          </View>
        ))}
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
  intro: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    marginTop: Space.xs,
    marginBottom: Space.lg,
  },
  prose: {
    gap: Space.xl,
  },
  block: {
    gap: Space.xs,
  },
  heading: {
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "600",
    color: Ghost.text.primary,
    marginBottom: 2,
  },
  body: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    lineHeight: 22,
  },
  bold: {
    fontFamily: FONT,
    fontWeight: "700",
    color: Ghost.text.secondary,
  },
  italic: {
    fontFamily: FONT,
    fontStyle: "italic",
    color: Ghost.text.secondary,
  },
});
