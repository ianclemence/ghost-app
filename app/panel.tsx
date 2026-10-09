import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppWindow, Bell, Briefcase, Clapperboard, Calendar, ChevronRight, FileText, Folder, Image as ImageIcon, Link2, NotebookPen, Pin, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react-native";
import { alpha, Fonts, Ghost, Space, Type } from "@/constants/theme";
import { ScreenBackground } from "@/components/screen-glow";
import { Dock } from "@/components/dock";
import { ActivityTree } from "@/components/activity-tree";
import { EdgeScrollView } from "@/components/scroll-edge";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import {
  fetchActivity,
  fetchIdentity,
  fetchMemorySelf,
  fetchPendingApprovals,
  fetchRoutines,
  fetchShelf,
  type ActivityChip,
  type RoutineItem,
  type ShelfItem,
  fetchJobs,
} from "@/lib/ghostApi";
import { shelfKindOf, shelfMeta } from "@/lib/shelf";
import { isCanvasArtifact } from "@/lib/canvas";
import { isMotionArtifact } from "@/lib/motion";
import { isDocumentArtifact } from "@/lib/documents";
import { useGhostStore } from "@/lib/store";
import { nextLine } from "@/lib/when";

/**
 * Ghost, opened up: the front page. One serif greeting and a few light
 * sentences, each read from the Pod just now (what needs you, what is next,
 * what it remembers), with the rest one tap away in the dock. Nothing here is
 * summarized by a model.
 */
/** "Good morning, Ian." — the owner's name when the Pod knows it, as the console greets them. */
function greeting(now = new Date(), name = ""): string {
  const h = now.getHours();
  const n = name.trim();
  if (h < 5) return n ? `Still up, ${n}?` : "Still up?";
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return n ? `${part}, ${n}.` : `${part}.`;
}

// Kept across visits so the name does not appear a beat after the greeting.
let knownOwner = "";

/** The Ghost mark, drawn like an icon so the dock can take it. */
function MarkIcon({ size, color }: { size?: number; color?: string }) {
  return <GhostMark size={(size ?? 22) + 2} color={color} />;
}

export default function PanelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();
  const [approvals, setApprovals] = useState(0);
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [owner, setOwner] = useState(knownOwner);
  const [activity, setActivity] = useState<ActivityChip[]>([]);
  const [made, setMade] = useState<ShelfItem[]>([]);
  const [jobsOn, setJobsOn] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!config) return;
    await Promise.all([
      fetchPendingApprovals(config).then((r) => setApprovals(r.length)).catch(() => {}),
      fetchRoutines(config).then(setRoutines).catch(() => {}),
      fetchActivity(config, { limit: 12 }).then(setActivity).catch(() => {}),
      fetchShelf(config, { limit: 3 }).then(setMade).catch(() => {}),
      fetchJobs(config).then((r) => r.ok && setJobsOn(r.data.jobs.filter((j) => j.enabled && j.time).length)).catch(() => {}),
      fetchMemorySelf(config).then((m) => setMemoryCount(m.entries.length + m.notes.length)).catch(() => {}),
      fetchIdentity(config).then((id) => {
        if (id?.owner) {
          knownOwner = id.owner;
          setOwner(id.owner);
        }
      }).catch(() => {}),
    ]);
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  const go = (path: string) => () => router.push(path as never);
  const online = connectionState === "online";
  const syncing = connectionState === "syncing";
  const where = !config
    ? null
    : online ? "Ghost is on your Pod, online."
      : syncing ? "Ghost is on your Pod, reconnecting."
      : "Your Pod is offline. Messages will wait.";

  const live = routines.filter((x) => x.state === "active" || x.state === "waiting");
  const next = [...live].sort((a, b) => Date.parse(a.next_run_at ?? "9999") - Date.parse(b.next_run_at ?? "9999"))[0] ?? null;
  const scheduledCount = live.length;
  const todayKey = new Date().toDateString();
  const todayItems = activity.filter((a) => {
    const t = Date.parse(a.timestamp);
    return Number.isFinite(t) && new Date(t).toDateString() === todayKey;
  });

  return (
    <View style={styles.container}>
      <ScreenBackground variant="hero" />
      <EdgeScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title} accessibilityRole="header">{config ? greeting(new Date(), owner) : "Hello."}</Text>

        {config ? (
          <>
            <Text style={styles.prose}>{where}</Text>
            {/* Pod state and what's next: the two things worth a glance. */}
            <View style={styles.statusRow}>
              <Pressable
                style={styles.statusCard}
                onPress={go("/device")}
                accessibilityRole="button"
                accessibilityLabel={online ? "Pod online. All systems good." : "Pod status."}
              >
                <View style={[styles.dot, { backgroundColor: online ? Ghost.status.success : syncing ? Ghost.status.warning : Ghost.status.error }]} />
                <View style={styles.statusText}>
                  <Text style={styles.statusTitle}>{online ? "Pod Online" : syncing ? "Reconnecting" : "Pod Offline"}</Text>
                  <Text style={styles.statusSub} numberOfLines={1}>{online ? "All systems good" : syncing ? "Holding your messages" : "Messages will wait"}</Text>
                </View>
                <ChevronRight size={16} color={Ghost.text.tertiary} strokeWidth={1.8} />
              </Pressable>
              <Pressable
                style={styles.statusCard}
                onPress={go("/routines")}
                accessibilityRole="button"
                accessibilityLabel={next ? `Next: ${next.title}` : "Nothing scheduled."}
              >
                {next?.kind === "reminder"
                  ? <Bell size={18} color={Ghost.text.primary} strokeWidth={1.5} />
                  : <Calendar size={18} color={Ghost.text.primary} strokeWidth={1.5} />}
                <View style={styles.statusText}>
                  <Text style={styles.statusTitle}>{next ? (next.kind === "reminder" ? "Next Reminder" : "Next Up") : "Nothing Scheduled"}</Text>
                  <Text style={styles.statusSub} numberOfLines={2}>{next ? nextLine(next) : "Ask Ghost to remind you"}</Text>
                </View>
                <ChevronRight size={16} color={Ghost.text.tertiary} strokeWidth={1.8} />
              </Pressable>
            </View>
            {/* Live counts, each one a door to its screen. */}
            <Text style={styles.eyebrow}>At a glance</Text>
            <View style={styles.tiles}>
              {/* Reminders and routines are one list on one screen, so one door. */}
              <Pressable style={styles.tile} onPress={go("/routines")} accessibilityRole="button" accessibilityLabel={`${scheduledCount} scheduled: reminders and routines.`}>
                <Calendar size={18} color={Ghost.text.primary} strokeWidth={1.5} />
                <Text style={styles.tileNumber}>{scheduledCount}</Text>
                <Text style={styles.tileLabel}>Scheduled</Text>
              </Pressable>
              <Pressable style={styles.tile} onPress={go("/jobs")} accessibilityRole="button" accessibilityLabel={jobsOn !== null ? `${jobsOn} ${jobsOn === 1 ? "job" : "jobs"} on.` : "Jobs Ghost can take on."}>
                <Briefcase size={18} color={Ghost.text.primary} strokeWidth={1.5} />
                <Text style={styles.tileNumber}>{jobsOn ?? "–"}</Text>
                <Text style={styles.tileLabel}>{jobsOn === 1 ? "Job On" : "Jobs On"}</Text>
              </Pressable>
              {/* Needs-you only exists when something actually needs you. */}
              {approvals > 0 ? (
              <Pressable style={styles.tile} onPress={() => router.push("/(tabs)" as never)} accessibilityRole="button" accessibilityLabel={`${approvals} need your OK.`}>
                <ShieldCheck size={18} color={Ghost.text.primary} strokeWidth={1.5} />
                <Text style={styles.tileNumber}>{approvals}</Text>
                <Text style={styles.tileLabel}>Needs You</Text>
              </Pressable>
              ) : null}
              <Pressable style={styles.tile} onPress={go("/memory")} accessibilityRole="button" accessibilityLabel={memoryCount !== null ? `Ghost remembers ${memoryCount} things.` : "What Ghost remembers."}>
                <Sparkles size={18} color={Ghost.text.primary} strokeWidth={1.5} />
                <Text style={styles.tileNumber}>{memoryCount ?? "–"}</Text>
                <Text style={styles.tileLabel}>Remembered</Text>
              </Pressable>
            </View>
            {/* What Ghost made: the newest (and pinned) things, a door to the shelf. */}
            {made.length > 0 ? (
              <View style={styles.todayCard}>
                <View style={styles.todayHead}>
                  <Text style={styles.todayTitle}>Made by Ghost</Text>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={go("/shelf")} hitSlop={8} accessibilityRole="button" accessibilityLabel="See everything Ghost made.">
                    <Text style={styles.todayAll}>See all</Text>
                  </Pressable>
                </View>
                {made.map((it, i) => {
                  const k = MADE[shelfKindOf(it)];
                  return (
                    <Pressable
                      key={it.id}
                      onPress={() => {
                        if (isMotionArtifact(it)) router.push({ pathname: "/motion", params: { id: it.id } } as never);
    else if (isCanvasArtifact(it)) router.push({ pathname: "/canvas", params: { id: it.id } } as never);
                        else if (isDocumentArtifact(it)) router.push({ pathname: "/document", params: { id: it.id } } as never);
                        else router.push("/shelf" as never);
                      }}
                      style={({ pressed }) => [styles.madeRow, i > 0 && styles.madeLine, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${it.title}. ${shelfMeta(it)}`}
                    >
                      <View style={[styles.madeTile, { backgroundColor: alpha(k.tint, 0.12), borderColor: alpha(k.tint, 0.3) }]}>
                        <k.Icon size={17} color={k.tint} strokeWidth={1.8} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Text style={styles.madeTitle} numberOfLines={1}>{it.title}</Text>
                        <Text style={styles.madeMeta} numberOfLines={1}>{shelfMeta(it)}</Text>
                      </View>
                      {it.pinned ? <Pin size={13} color={Ghost.accent.primary} fill={Ghost.accent.primary} strokeWidth={1.9} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {/* Today: what Ghost did, newest first, in its own words. */}
            {todayItems.length > 0 ? (
              <View style={styles.todayCard}>
                <View style={styles.todayHead}>
                  <Text style={styles.todayTitle}>Today</Text>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={go("/activity")} hitSlop={8} accessibilityRole="button" accessibilityLabel="See all activity.">
                    <Text style={styles.todayAll}>See all</Text>
                  </Pressable>
                </View>
                {/* Dark glass, so the tree reads even where the aurora is brightest behind it. */}
                <ActivityTree items={todayItems} limit={6} bare />
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
      </EdgeScrollView>

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

const MADE = {
  pages: { Icon: AppWindow, tint: Ghost.accent.primary },
  documents: { Icon: FileText, tint: Ghost.status.warning },
  pictures: { Icon: ImageIcon, tint: Ghost.status.success },
  links: { Icon: Link2, tint: Ghost.status.info },
  notes: { Icon: NotebookPen, tint: "#B3B1BD" },
  motion: { Icon: Clapperboard, tint: "#FFB547" },
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  madeRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8 },
  madeLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  madeTile: { width: 38, height: 38, borderRadius: 12, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  madeTitle: { fontSize: 15, lineHeight: 20, fontWeight: "500", color: Ghost.text.primary, letterSpacing: -0.1 },
  madeMeta: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.tertiary },
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
  // Two status cards: Pod state and what's next. One row, equal halves.
  statusRow: { flexDirection: "row", gap: Space.sm, marginTop: Space.lg },
  statusCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { flex: 1, gap: 1 },
  statusTitle: { fontSize: 15, lineHeight: 20, fontWeight: "500", letterSpacing: -0.2, color: Ghost.text.primary },
  statusSub: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.secondary },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: "500",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Ghost.text.tertiary,
    marginTop: Space.xl,
    marginBottom: Space.sm,
  },
  // Four glance tiles: one row, equal quarters, serif numerals.
  tiles: { flexDirection: "row", gap: Space.sm },
  tile: {
    flex: 1,
    gap: 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.md,
    borderRadius: 20,
    borderCurve: "continuous",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  tileNumber: { fontFamily: Fonts.voice, fontSize: 27, lineHeight: 32, color: Ghost.text.primary, marginTop: Space.xs },
  tileLabel: { fontSize: 11.5, lineHeight: 15, color: Ghost.text.secondary },
  // Today: one dark card, serif title with its count, then the tree bare.
  todayCard: {
    marginTop: Space.xl,
    borderRadius: 26,
    borderCurve: "continuous",
    padding: Space.lg,
    backgroundColor: "rgba(0,0,0,0.52)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  todayHead: { flexDirection: "row", alignItems: "center", gap: Space.sm, marginBottom: Space.sm },
  todayTitle: { fontFamily: Fonts.voice, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: Ghost.text.primary },
  todayAll: { fontSize: 13, fontWeight: "500", color: Ghost.text.tertiary },
  buttons: { marginTop: Space.lg, gap: Space.sm, alignItems: "flex-start" },
});
