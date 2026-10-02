import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, Folder, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react-native";
import { Fonts, Ghost, Space, Type } from "@/constants/theme";
import { ScreenBackground } from "@/components/screen-glow";
import { Dock } from "@/components/dock";
import { ActivityTree } from "@/components/activity-tree";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import {
  fetchActivity,
  fetchMemorySelf,
  fetchPendingApprovals,
  fetchProactiveStatus,
  fetchRoutines,
  type ActivityChip,
  type RoutineItem,
} from "@/lib/ghostApi";
import { proactiveLine } from "@/lib/proactive";
import { useGhostStore } from "@/lib/store";
import { whenAhead } from "@/lib/when";

/**
 * Ghost, opened up: the front page. One serif greeting and a few light
 * sentences, each read from the Pod just now (what needs you, what is next,
 * what it remembers), with the rest one tap away in the dock. Nothing here is
 * summarized by a model.
 */
function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
}

/** The Ghost mark, drawn like an icon so the dock can take it. */
function MarkIcon({ size, color }: { size?: number; color?: string }) {
  return <GhostMark size={(size ?? 22) + 2} color={color} />;
}

/** A small glass circle that sits inside a sentence. */
function Chip({ children }: { children: React.ReactNode }) {
  return <View style={styles.chip}>{children}</View>;
}

export default function PanelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();
  const [approvals, setApprovals] = useState(0);
  const [next, setNext] = useState<RoutineItem | null>(null);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [quietLine, setQuietLine] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityChip[]>([]);

  const load = useCallback(async () => {
    if (!config) return;
    await Promise.all([
      fetchPendingApprovals(config).then((r) => setApprovals(r.length)).catch(() => {}),
      fetchRoutines(config).then((r) => {
        const active = r
          .filter((x) => x.state === "active" || x.state === "waiting")
          .sort((a, b) => Date.parse(a.next_run_at ?? "9999") - Date.parse(b.next_run_at ?? "9999"));
        setNext(active[0] ?? null);
      }).catch(() => {}),
      fetchActivity(config, { limit: 12 }).then(setActivity).catch(() => {}),
      fetchMemorySelf(config).then((m) => setMemoryCount(m.entries.length + m.notes.length)).catch(() => {}),
      fetchProactiveStatus(config).then((p) => setQuietLine(proactiveLine(p).text)).catch(() => {}),
    ]);
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  const go = (path: string) => () => router.push(path as never);
  const where = !config
    ? null
    : connectionState === "online" ? "Ghost is on your Pod, online."
      : connectionState === "syncing" ? "Ghost is on your Pod, reconnecting."
      : "Your Pod is offline. Messages will wait.";

  return (
    <View style={styles.container}>
      <ScreenBackground variant="hero" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title} accessibilityRole="header">{config ? greeting() : "Hello."}</Text>

        {config ? (
          <>
            <Text style={styles.prose}>{where}</Text>
            <Text style={styles.prose}>
              {approvals > 0
                ? `${approvals === 1 ? "One thing needs" : `${approvals} things need`} your OK `
                : (quietLine ?? "Nothing needs you right now.")}
              {approvals > 0 ? (
                <Chip>
                  <ShieldCheck size={14} color={Ghost.text.primary} strokeWidth={1.5} />
                </Chip>
              ) : null}
            </Text>
            {next ? (
              <Text style={styles.prose}>
                Next, {next.title.charAt(0).toLowerCase() + next.title.slice(1)}, {whenAhead(next.next_run_at) ?? next.schedule}{" "}
                <Chip>
                  <Calendar size={14} color={Ghost.text.primary} strokeWidth={1.5} />
                </Chip>
              </Text>
            ) : null}
            {memoryCount !== null ? (
              <Text style={styles.prose}>
                Ghost remembers {memoryCount === 1 ? "1 thing" : `${memoryCount} things`}{" "}
                <Chip>
                  <Sparkles size={14} color={Ghost.text.primary} strokeWidth={1.5} />
                </Chip>
              </Text>
            ) : null}
            {activity.length > 0 ? (
              <View style={styles.latest}>
                <Text style={styles.latestLabel}>Latest</Text>
                <ActivityTree items={activity} limit={8} />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.prose}>Ghost lives on your Pod, a small computer you own. Connect it to see what Ghost is doing for you.</Text>
            <View style={styles.buttons}>
              <GhostButton title="Scan QR code" onPress={go("/scan")} />
              <GhostButton title="Enter manually" variant="secondary" onPress={go("/manual")} />
            </View>
          </>
        )}
      </ScrollView>

      {config ? (
        <Dock
          items={[
            { label: "Back to the conversation", icon: MarkIcon, onPress: () => router.back() },
            { label: "Coming up", icon: Calendar, onPress: go("/routines") },
            { label: "What Ghost remembers", icon: Sparkles, onPress: go("/memory") },
            { label: "Files", icon: Folder, onPress: go("/files") },
          ]}
          action={{ label: "Settings", icon: SlidersHorizontal, onPress: go("/settings") }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingHorizontal: 28, gap: Space.md },
  title: {
    fontFamily: Fonts.voice,
    fontSize: 52,
    lineHeight: 62,
    letterSpacing: -1,
    color: Ghost.text.primary,
    marginBottom: Space.xs,
  },
  prose: { ...Type.prose, fontSize: 22, lineHeight: 31, letterSpacing: -0.45, color: "rgba(255,255,255,0.8)" },
  chip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
    backgroundColor: Ghost.glass.fillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  latest: { marginTop: Space.xl },
  latestLabel: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginBottom: Space.sm },
  buttons: { marginTop: Space.lg, gap: Space.sm, alignItems: "flex-start" },
});
