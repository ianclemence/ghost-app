import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  BookOpen,
  Sunrise,
  Clock,
  Eye,
  HeartPulse,
  Home,
  Inbox,
  ListChecks,
  Plane,
  Receipt,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { DateTimeSheet } from "@/components/card-inputs";
import { GhostButton } from "@/components/ghost";
import { lifeStyles } from "@/components/life-ui";
import { alpha, Fonts, Ghost, Inter, Space } from "@/constants/theme";
import { fetchJobs, setJob, type GhostJob } from "@/lib/ghostApi";
import { GET_TO_KNOW_YOU, jobWhen } from "@/lib/jobs";
import { useGhostStore } from "@/lib/store";

const LOOK: Record<string, { Icon: typeof Inbox; tint: string }> = {
  morning_brief: { Icon: Sunrise, tint: "#FFC24D" },
  inbox: { Icon: Inbox, tint: "#8FB8FF" },
  bills: { Icon: Receipt, tint: "#6FE3A0" },
  trips: { Icon: Plane, tint: "#8FB8FF" },
  meals: { Icon: UtensilsCrossed, tint: "#FFA928" },
  life_admin: { Icon: ListChecks, tint: "#9C95FF" },
  home: { Icon: Home, tint: "#FFC24D" },
  health: { Icon: HeartPulse, tint: "#6FE3A0" },
  learn: { Icon: BookOpen, tint: "#9C95FF" },
  watch: { Icon: Eye, tint: "#B3B1BD" },
};

/**
 * What Ghost can take on for the owner, as jobs: each one switch and a time.
 * Switching one on asks the Pod, which sets it up as a routine; the switch
 * shows what the Pod says, not what was tapped. What a job still needs (a
 * mailbox, Home Assistant, health from the phone) is said on the job.
 */
export default function JobsScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const [jobs, setJobs] = useState<GhostJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState<GhostJob | null>(null);
  const [topics, setTopics] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!config) return;
    const r = await fetchJobs(config);
    if (r.ok) {
      setJobs(r.data.jobs);
      setError(null);
    } else setError(r.error);
  }, [config]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const apply = async (j: GhostJob, enabled: boolean, time?: string) => {
    if (!config) return;
    setBusy(j.id);
    setError(null);
    const r = await setJob(config, j.id, { enabled, time: time ?? j.settings.time ?? j.time, topic: topics[j.id] ?? j.settings.topic });
    setBusy(null);
    if (!r.ok) {
      setError(`${j.title}: ${r.error}`);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await load();
  };

  const getToKnow = () => {
    useGhostStore.getState().setIntent({ text: GET_TO_KNOW_YOU, send: true });
    router.replace("/" as never);
  };

  const on = (jobs ?? []).filter((j) => j.enabled && j.time);
  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Jobs" subtitle="What Ghost takes on for you" />
      <EdgeScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={getToKnow} style={({ pressed }) => [styles.intro, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Get to know me. Ghost asks a few questions you answer with a tap">
          <View style={[styles.icon, { backgroundColor: alpha(Ghost.accent.primary, 0.16), borderColor: alpha(Ghost.accent.primary, 0.4) }]}>
            <Sparkles size={18} color={Ghost.accent.primary} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.introTitle}>Get to know me</Text>
            <Text style={styles.introText}>A few questions you answer with a tap, so Ghost starts out knowing you.</Text>
          </View>
        </Pressable>

        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        {jobs === null && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}
        {on.length > 0 ? <Text style={styles.count}>{on.length} {on.length === 1 ? "job" : "jobs"} on</Text> : null}

        {(jobs ?? []).map((j) => {
          const look = LOOK[j.id] ?? LOOK.watch;
          const schedulable = !!j.time;
          const blocked = (j.missing ?? []).length > 0;
          return (
            <View key={j.id} style={[lifeStyles.group, styles.job, j.enabled && schedulable && styles.jobOn]}>
              <View style={styles.head}>
                <View style={[styles.icon, { backgroundColor: alpha(look.tint, 0.13), borderColor: alpha(look.tint, 0.32) }]}>
                  <look.Icon size={18} color={look.tint} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={styles.title}>{j.title}</Text>
                  <Text style={styles.when}>{jobWhen(j)}</Text>
                </View>
                {schedulable ? (
                  busy === j.id ? (
                    <ActivityIndicator color={Ghost.text.secondary} />
                  ) : (
                    <Switch
                      value={j.enabled}
                      onValueChange={(v) => void apply(j, v)}
                      disabled={blocked && !j.enabled}
                      trackColor={{ false: "rgba(255,255,255,0.14)", true: alpha(Ghost.accent.primary, 0.7) }}
                      thumbColor={j.enabled ? "#FFFFFF" : "#B3B1BD"}
                      accessibilityLabel={`${j.title}, ${j.enabled ? "on" : "off"}`}
                    />
                  )
                ) : null}
              </View>
              <Text style={styles.promise}>{j.promise}</Text>
              {blocked ? <Text style={styles.missing}>{(j.missing ?? []).join(" · ")}</Text> : null}
              {j.ask && !j.enabled ? (
                <TextInput
                  value={topics[j.id] ?? ""}
                  onChangeText={(t) => setTopics((m) => ({ ...m, [j.id]: t }))}
                  placeholder={j.ask}
                  placeholderTextColor={Ghost.text.tertiary}
                  style={styles.topic}
                  maxLength={80}
                  accessibilityLabel={j.ask}
                  selectionColor={Ghost.accent.primary}
                />
              ) : null}
              {j.ask && j.enabled && j.settings.topic ? <Text style={styles.when}>Learning: {j.settings.topic}</Text> : null}
              {schedulable && j.enabled ? (
                <Pressable onPress={() => setPicking(j)} style={({ pressed }) => [styles.timeBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`Change the time, now ${j.settings.time}`}>
                  <Clock size={14} color={Ghost.text.secondary} strokeWidth={2} />
                  <Text style={styles.timeText}>{j.settings.time}</Text>
                </Pressable>
              ) : null}
              {!schedulable ? <GhostButton title="Show me how" size="sm" variant="secondary" onPress={() => {
                useGhostStore.getState().setIntent({ text: "How do I ask you to watch a page for me?", send: true });
                router.replace("/" as never);
              }} /> : null}
            </View>
          );
        })}
      </EdgeScrollView>
      <DateTimeSheet
        visible={picking !== null}
        mode="time"
        title={picking ? `${picking.title} at` : ""}
        value={picking?.settings.time}
        onClose={() => setPicking(null)}
        onDone={(v) => {
          const j = picking;
          setPicking(null);
          if (j) void apply(j, true, v);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg, gap: Space.md },
  intro: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.lg, borderRadius: 24, borderCurve: "continuous", backgroundColor: alpha(Ghost.accent.primary, 0.09), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(Ghost.accent.primary, 0.35) },
  introTitle: { fontFamily: Fonts.voice, fontSize: 24, lineHeight: 28, color: Ghost.text.primary },
  introText: { fontSize: 13.5, lineHeight: 19, color: Ghost.text.secondary },
  count: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 4, marginTop: Space.xs },
  job: { padding: Space.lg, gap: Space.sm },
  jobOn: { borderColor: alpha(Ghost.accent.primary, 0.35) },
  head: { flexDirection: "row", alignItems: "center", gap: Space.md },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16.5, fontWeight: "500", color: Ghost.text.primary, letterSpacing: -0.15 },
  when: { fontSize: 12.5, color: Ghost.text.tertiary },
  promise: { fontSize: 14.5, lineHeight: 21, fontWeight: "300", color: Ghost.text.secondary },
  missing: { fontSize: 13, color: Ghost.status.warning },
  topic: { height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, color: Ghost.text.primary, fontFamily: Inter.regular, fontSize: 15 },
  timeBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  timeText: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.primary, fontVariant: ["tabular-nums"] },
  error: { fontSize: 13.5, lineHeight: 19, color: Ghost.status.error, textAlign: "center" },
});
