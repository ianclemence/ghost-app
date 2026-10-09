import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { showDialog } from "@/lib/dialog";
import { useRouter } from "expo-router";
import { Ghost, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostButton, EmptyState, OfflineBadge, SectionHeader, StatusPill } from "@/components/ghost";
import { GlassCard } from "@/components/glass";
import {
  controlRoutineItem,
  fetchRoutines,
  kindLabel,
  stateLabel,
  type RoutineItem,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import { isLive, routineDetail } from "@/lib/routineWords";
import { EdgeScrollView } from "@/components/scroll-edge";

// Routines: what runs on a schedule. Reminders, recurring briefs, the jobs
// the owner switched on and anything else timed. The owner never files their
// intent as a "routine": they say it in conversation and Ghost gives it a
// time. What Ghost looks after without a time (goals, in the owner's own
// words) and what it is watching live on Jobs, so each thing has one home.

type PillTone = "ok" | "warn" | "bad" | "off";

function badgeFor(t: RoutineItem): { label: string; tone: PillTone } {
  switch (t.state) {
    case "waiting":
      return { label: stateLabel(t.state), tone: "warn" };
    case "failed":
      return { label: stateLabel(t.state), tone: "bad" };
    case "paused":
    case "cancelled":
      return { label: stateLabel(t.state), tone: "off" };
    default:
      return { label: stateLabel(t.state), tone: "ok" };
  }
}


export default function RoutinesScreen() {
  const router = useRouter();
  const { config } = useGhostStore();
  const connectionState = useGhostStore((s) => s.connectionState);
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [showAllDone, setShowAllDone] = useState(false);
  const finished = items
    .filter((t) => !isLive(t))
    .sort((a, b) => Date.parse(b.last_run_at ?? b.next_run_at ?? "0") - Date.parse(a.last_run_at ?? a.next_run_at ?? "0"));
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      setItems(await fetchRoutines(config));
    } catch {
      setError("Couldn't load what Ghost is doing.");
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOp = useCallback(
    async (t: RoutineItem, op: "pause" | "resume" | "cancel") => {
      if (!config || busyId) return;
      const run = async () => {
        setBusyId(t.id);
        try {
          await controlRoutineItem(config, t, op);
          await load(true);
        } catch (e) {
          showDialog("Couldn't do that", e instanceof Error ? e.message : "Unknown error");
        }
        setBusyId(null);
      };
      if (op === "cancel") {
        showDialog("Stop this?", `Ghost will stop "${t.title}".`, [
          { text: "Keep it", style: "cancel" },
          { text: "Stop", style: "destructive", onPress: run },
        ]);
        return;
      }
      await run();
    },
    [config, busyId, load],
  );


  const active = items.filter((t) => t.state === "active" || t.state === "waiting").length;

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader
        title="Routines"
        subtitle={active > 0
          ? `${active} ${active === 1 ? "routine" : "routines"} on a schedule`
          : "Nothing scheduled yet"}
      />
      {config && connectionState !== "online" ? (
        <View style={styles.offlineWrap}>
          <OfflineBadge state={connectionState === "syncing" ? "syncing" : "offline"} />
        </View>
      ) : null}

      {!config ? (
        <EmptyState
          title="Not connected"
          subtitle="This lives on a Ghost Pod. Connect one to see what Ghost is doing."
          action={<GhostButton title="Connect a Ghost Pod" onPress={() => router.push("/connect")} />}
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Ghost.text.primary} size="large" />
        </View>
      ) : (
        <EdgeScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load(true);
                setRefreshing(false);
              }}
              tintColor={Ghost.text.primary}
            />
          }
        >
          {error && items.length === 0 ? (
            <EmptyState
              title="Couldn't load"
              subtitle={error}
              action={<GhostButton title="Try again" onPress={() => load()} />}
            />
          ) : null}

          {items.some(isLive) ? <SectionHeader title="Running" style={{ paddingTop: Space.md }} /> : null}
          {!error && items.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              subtitle="Say \u201cevery Monday at 9, prepare my weekly brief\u201d in a chat and it appears here."
              action={<GhostButton title="Start a chat" onPress={() => router.replace("/")} />}
            />
          ) : (
            items.filter(isLive).map((t) => {
              const busy = busyId === t.id;
              const badge = badgeFor(t);
              const canPause = t.state === "active";
              const canResume = t.state === "paused" || t.state === "failed";
              const canStop =
                t.state === "active" || t.state === "paused" || t.state === "waiting";
              return (
                <GlassCard key={t.id} style={styles.card}>
                  <View style={styles.rowHead}>
                    <GhostText type="headline" style={styles.rowTitle}>
                      {t.title}
                    </GhostText>
                    <StatusPill label={badge.label} tone={badge.tone} />
                  </View>
                  <GhostText type="footnote" style={styles.rowMeta}>
                    {kindLabel(t.kind)} · {t.schedule}
                    {t.run_count > 0 ? ` · ran ${t.run_count}\u00d7` : ""}
                  </GhostText>
                  {routineDetail(t.title, t.what) ? (
                    <GhostText type="footnote" style={styles.rowWhat} numberOfLines={2}>
                      {t.what}
                    </GhostText>
                  ) : null}
                  {t.last_error ? (
                    <GhostText type="footnote" style={styles.rowError} numberOfLines={2}>
                      {t.last_error}
                    </GhostText>
                  ) : null}
                  {canPause || canResume || canStop ? (
                  <View style={styles.actions}>
                    {canPause ? (
                      <GhostButton title={busy ? "\u2026" : "Pause"} variant="secondary" size="sm" onPress={() => handleOp(t, "pause")} />
                    ) : null}
                    {canResume ? (
                      <GhostButton title={busy ? "\u2026" : "Resume"} variant="secondary" size="sm" onPress={() => handleOp(t, "resume")} />
                    ) : null}
                    {canStop ? (
                      <GhostButton title={busy ? "\u2026" : "Stop"} variant="danger" size="sm" onPress={() => handleOp(t, "cancel")} />
                    ) : null}
                  </View>
                  ) : null}
                </GlassCard>
              );
            })
          )}

          {/* What is over: one quiet group, newest first, never in the way. */}
          {finished.length > 0 ? (
            <>
              <SectionHeader title="Finished" style={{ paddingTop: Space.lg }} />
              <GlassCard style={[styles.card, styles.doneCard]}>
                {(showAllDone ? finished : finished.slice(0, 5)).map((t, i) => (
                  <View key={t.id} style={[styles.doneRow, i > 0 && styles.doneLine]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <GhostText type="body" style={styles.doneTitle} numberOfLines={1}>{t.title}</GhostText>
                      <GhostText type="footnote" style={styles.rowMeta} numberOfLines={1}>
                        {t.state === "cancelled" ? "Stopped" : "Done"} · {t.schedule}
                      </GhostText>
                    </View>
                  </View>
                ))}
                {finished.length > 5 ? (
                  <GhostButton
                    title={showAllDone ? "Show fewer" : `Show all ${finished.length}`}
                    variant="ghost"
                    size="sm"
                    style={{ alignSelf: "center", marginVertical: Space.sm }}
                    onPress={() => setShowAllDone((v) => !v)}
                  />
                ) : null}
              </GlassCard>
            </>
          ) : null}

          <Pressable onPress={() => router.push("/jobs" as never)} style={({ pressed }) => [styles.toJobs, pressed && { opacity: 0.7 }]} accessibilityRole="link">
            <GhostText type="footnote" style={styles.toJobsText}>Things Ghost looks after in your words, and what it&apos;s watching, are on Jobs.</GhostText>
          </Pressable>
        </EdgeScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  offlineWrap: {
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
  },
  list: {
    paddingBottom: 96,
  },
  card: {
    marginHorizontal: Space.lg,
    marginBottom: Space.md,
    gap: 4,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.sm,
  },
  rowTitle: {
    color: Ghost.text.primary,
    flexShrink: 1,
    fontSize: 16.5,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  rowMeta: {
    color: Ghost.text.secondary,
    fontWeight: "300",
    fontSize: 13.5,
  },
  rowWhat: {
    color: Ghost.text.tertiary,
    marginTop: 2,
  },
  rowError: {
    color: Ghost.status.error,
    marginTop: 2,
  },
  toJobs: { marginHorizontal: Space.lg, marginTop: Space.xl, paddingVertical: Space.sm },
  toJobsText: { color: Ghost.text.tertiary, textAlign: "center" },
  doneCard: { paddingVertical: Space.xs, paddingHorizontal: 0 },
  doneRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: Space.lg, paddingVertical: Space.md },
  doneLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  doneTitle: { color: Ghost.text.secondary },
  actions: {
    flexDirection: "row",
    gap: Space.sm,
    marginTop: Space.md,
  },
  none: {
    color: Ghost.text.tertiary,
    textAlign: "center",
    marginTop: Space.lg,
  },
});
