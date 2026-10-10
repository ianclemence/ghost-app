import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
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
import { GhostButton, GhostToggle } from "@/components/ghost";
import { lifeStyles } from "@/components/life-ui";
import { alpha, Fonts, Ghost, Hue, Inter, Space } from "@/constants/theme";
import { createGoal, fetchGoals, fetchJobs, fetchWatches, goalAction, setJob, stopWatch, type GhostJob, type GoalItem, type WatchItem } from "@/lib/ghostApi";
import { isWatching, watchName, watchWant } from "@/lib/watching";
import { showDialog } from "@/lib/dialog";
import { GET_TO_KNOW_YOU, jobWhen } from "@/lib/jobs";
import { useGhostStore } from "@/lib/store";

// One hue each, none repeated: the sun for the morning, green for money,
// rose for the heart, cool teal for travel, lilac for the house at night.
const LOOK: Record<string, { Icon: typeof Inbox; tint: string }> = {
  morning_brief: { Icon: Sunrise, tint: Hue.gold },
  inbox: { Icon: Inbox, tint: Hue.sky },
  bills: { Icon: Receipt, tint: Hue.mint },
  trips: { Icon: Plane, tint: Hue.teal },
  meals: { Icon: UtensilsCrossed, tint: Hue.coral },
  life_admin: { Icon: ListChecks, tint: Hue.iris },
  home: { Icon: Home, tint: Hue.lilac },
  health: { Icon: HeartPulse, tint: Hue.rose },
  learn: { Icon: BookOpen, tint: Hue.lime },
  watch: { Icon: Eye, tint: Hue.stone },
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

  // A switch moves the moment it is touched, like every switch in the app;
  // it goes back only if the Pod couldn't set the job up.
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const apply = async (j: GhostJob, enabled: boolean, time?: string) => {
    if (!config) return;
    setFlipped((f) => ({ ...f, [j.id]: enabled }));
    setError(null);
    const r = await setJob(config, j.id, { enabled, time: time ?? j.settings.time ?? j.time, topic: topics[j.id] ?? j.settings.topic });
    if (!r.ok) {
      setFlipped((f) => { const next = { ...f }; delete next[j.id]; return next; });
      setError(`${j.title}: ${r.error}`);
      return;
    }
    await load();
    setFlipped((f) => { const next = { ...f }; delete next[j.id]; return next; });
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

        {jobs && jobs.length > 0 ? <Text style={styles.section}>{on.length > 0 ? `Ghost’s jobs · ${on.length} on` : "Ghost’s jobs"}</Text> : null}
        {(jobs ?? []).filter((j) => !!j.time).map((j) => {
          const look = LOOK[j.id] ?? LOOK.watch;
          const schedulable = !!j.time;
          const blocked = (j.missing ?? []).length > 0;
          return (
            <View key={j.id} style={[lifeStyles.group, styles.job]}>
              <View style={styles.head}>
                <View style={[styles.icon, { backgroundColor: alpha(look.tint, 0.13), borderColor: alpha(look.tint, 0.32) }]}>
                  <look.Icon size={18} color={look.tint} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={styles.title}>{j.title}</Text>
                  <Text style={styles.when}>{jobWhen(j)}</Text>
                </View>
                {schedulable ? (
                  <GhostToggle
                    value={flipped[j.id] ?? j.enabled}
                    onValueChange={(v) => void apply(j, v)}
                    disabled={blocked && !j.enabled}
                    accessibilityLabel={j.title}
                  />
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
            </View>
          );
        })}

        {config && jobs ? <OwnJobs /> : null}
        {config && jobs ? <Watching /> : null}
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

/**
 * Jobs in the owner's own words (Ghost's goals): something to keep looking
 * after, with no fixed time ("keep my school emails in hand"). Ghost works
 * on them as things come up and says when one has gone quiet.
 */
function OwnJobs() {
  const config = useGhostStore((s) => s.config)!;
  const [goals, setGoals] = useState<GoalItem[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setGoals(await fetchGoals(config));
    } catch {
      setError("Couldn't load your own jobs.");
    }
  }, [config]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      Haptics.selectionAsync().catch(() => {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    }
    setBusy(null);
  };
  const add = () => {
    const t = text.trim();
    if (!t) return;
    void run("new", async () => {
      await createGoal(config, t);
      setText("");
    });
  };
  const live = (goals ?? []).filter((g) => g.status === "active" || g.status === "paused" || g.status === "expired");
  return (
    <View style={{ gap: Space.sm }}>
      <Text style={styles.section}>Your own</Text>
      <Text style={styles.sectionLead}>Something for Ghost to keep looking after, in your words. No time needed: it works on it as things come up.</Text>
      {live.length > 0 ? (
        <View style={lifeStyles.group}>
          {live.map((g, i) => (
            <View key={g.id} style={[styles.ownRow, i > 0 && styles.rowLine]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.ownText}>{g.text}</Text>
                <Text style={[styles.when, g.status !== "active" && { color: Ghost.status.warning }]}>
                  {g.status === "active" ? "Looking after it" : g.status === "paused" ? "Paused" : "Ran its course"}
                </Text>
              </View>
              {busy === g.id ? (
                <ActivityIndicator color={Ghost.text.secondary} />
              ) : (
                <View style={styles.ownActions}>
                  <GhostButton title={g.status === "active" ? "Pause" : "Resume"} size="sm" variant="secondary"
                    onPress={() => void run(g.id, () => goalAction(config, g.id, g.status === "active" ? "pause" : "resume"))} />
                  <GhostButton title="Done" size="sm" variant="secondary" onPress={() => void run(g.id, () => goalAction(config, g.id, "complete"))} />
                </View>
              )}
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.addRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Keep on top of the car’s service"
          placeholderTextColor={Ghost.text.tertiary}
          style={[styles.topic, { flex: 1 }]}
          maxLength={200}
          returnKeyType="done"
          onSubmitEditing={add}
          accessibilityLabel="A job in your own words"
          selectionColor={Ghost.accent.primary}
        />
        <GhostButton title={busy === "new" ? "Adding…" : "Add"} size="sm" disabled={!text.trim() || busy === "new"} onPress={add} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * What Ghost is checking for the owner: a page until it drops under a price
 * or comes back in stock, a flight's times. Asked for in the conversation;
 * stopped here.
 */
function Watching() {
  const config = useGhostStore((s) => s.config)!;
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetchWatches(config);
    if (r.ok) setItems((r.data.watches ?? []).filter(isWatching));
    else setError(r.error);
  }, [config]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const stop = (w: WatchItem) =>
    showDialog(`Stop watching ${watchName(w)}?`, "Ghost stops checking it and won't tell you about it again.", [
      { text: "Keep watching", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: async () => {
        const r = await stopWatch(config, w.id);
        if (!r.ok) return setError(r.error);
        await load();
      } },
    ]);
  return (
    <View style={{ gap: Space.sm }}>
      <Text style={styles.section}>Watching</Text>
      {items && items.length === 0 ? (
        <Text style={styles.sectionLead}>Send Ghost a link and say what you&apos;re waiting for, like “tell me when this is under KES 25,000” or “when it&apos;s back in stock”. It checks and tells you.</Text>
      ) : null}
      {items && items.length > 0 ? (
        <View style={lifeStyles.group}>
          {items.map((w, i) => (
            <View key={w.id} style={[styles.ownRow, i > 0 && styles.rowLine]}>
              <View style={[styles.icon, { width: 34, height: 34, backgroundColor: alpha(Hue.stone, 0.12), borderColor: alpha(Hue.stone, 0.3) }]}>
                <Eye size={16} color={Hue.stone} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.ownText} numberOfLines={1}>{watchName(w)}</Text>
                <Text style={styles.when} numberOfLines={1}>{watchWant(w)}</Text>
              </View>
              <GhostButton title="Stop" size="sm" variant="secondary" onPress={() => stop(w)} />
            </View>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg, gap: Space.md },
  intro: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.lg, borderRadius: 24, borderCurve: "continuous", backgroundColor: alpha(Ghost.accent.primary, 0.09), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(Ghost.accent.primary, 0.35) },
  introTitle: { fontFamily: Fonts.voice, fontSize: 24, lineHeight: 28, color: Ghost.text.primary },
  introText: { fontSize: 13.5, lineHeight: 19, color: Ghost.text.secondary },
  section: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 4, marginTop: Space.md },
  sectionLead: { fontSize: 13.5, lineHeight: 19, color: Ghost.text.tertiary, marginLeft: 4, marginRight: 8 },
  ownRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  ownText: { fontSize: 15, lineHeight: 20, fontWeight: "500", color: Ghost.text.primary },
  ownActions: { flexDirection: "row", gap: 6 },
  addRow: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  job: { padding: Space.lg, gap: Space.sm },
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
