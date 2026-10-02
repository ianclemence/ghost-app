import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ghost, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostButton, EmptyState, GhostInput, OfflineBadge, Panel, SectionHeader, StatusPill } from "@/components/ghost";
import { GlassCard } from "@/components/glass";
import {
  controlRoutineItem,
  createGoal,
  fetchGoals,
  fetchRoutines,
  goalAction,
  kindLabel,
  stateLabel,
  type GoalItem,
  type RoutineItem,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import { EdgeScrollView } from "@/components/scroll-edge";

// Routines — the one place that answers "what does Ghost do for me?".
//
// Scheduled work (reminders, recurring briefs, automations) and standing
// goals live here together. The owner never files their intent as a
// "routine", an "automation", or a "goal" — they say what they want in
// conversation and Ghost infers the shape. Kind and goal badges are quiet
// metadata, never a filing decision.
//
// Routines are created in conversation ("every Monday at 9…"). Goals are
// declared here or in conversation; the heartbeat evaluates them. This
// surface is for reviewing and steering, not for filling forms — matching
// the design principle that talk is the primary verb, not configuration.

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

function goalStatusLabel(s: string): string {
  switch (s) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Done";
    case "expired":
      return "Expired";
    default:
      return s ? s.replace(/_/g, " ") : "Unknown";
  }
}

export default function RoutinesScreen() {
  const router = useRouter();
  const { config } = useGhostStore();
  const connectionState = useGhostStore((s) => s.connectionState);
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [goalText, setGoalText] = useState("");
  const [goalScope, setGoalScope] = useState("");
  const [goalBusy, setGoalBusy] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    setGoalsError(null);
    try {
      setItems(await fetchRoutines(config));
    } catch {
      setError("Couldn't load what Ghost is doing.");
    }
    try {
      setGoals(await fetchGoals(config));
    } catch {
      setGoalsError("Couldn't load goals.");
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
          Alert.alert("Couldn't do that", e instanceof Error ? e.message : "Unknown error");
        }
        setBusyId(null);
      };
      if (op === "cancel") {
        Alert.alert("Stop this?", `Ghost will stop "${t.title}".`, [
          { text: "Keep it", style: "cancel" },
          { text: "Stop", style: "destructive", onPress: run },
        ]);
        return;
      }
      await run();
    },
    [config, busyId, load],
  );

  const handleCreateGoal = useCallback(async () => {
    if (!config || goalBusy) return;
    const t = goalText.trim();
    if (!t) {
      Alert.alert("Missing goal", "Describe what Ghost should keep doing for you.");
      return;
    }
    setGoalBusy("new");
    try {
      await createGoal(config, t, goalScope.trim() || undefined);
      setGoalText("");
      setGoalScope("");
      await load(true);
    } catch (e) {
      Alert.alert("Couldn't create goal", e instanceof Error ? e.message : "Unknown error");
    }
    setGoalBusy(null);
  }, [config, goalBusy, goalText, goalScope, load]);

  const handleGoalOp = useCallback(
    async (g: GoalItem, op: "pause" | "resume" | "complete") => {
      if (!config || goalBusy) return;
      if (op === "complete") {
        Alert.alert("Mark done?", `"${g.text}" will stop being evaluated.`, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Done", onPress: async () => {
              setGoalBusy(g.id);
              try {
                await goalAction(config, g.id, op);
                await load(true);
              } catch (e) {
                Alert.alert("Failed", e instanceof Error ? e.message : "Unknown error");
              }
              setGoalBusy(null);
            },
          },
        ]);
        return;
      }
      setGoalBusy(g.id);
      try {
        await goalAction(config, g.id, op);
        await load(true);
      } catch (e) {
        Alert.alert("Failed", e instanceof Error ? e.message : "Unknown error");
      }
      setGoalBusy(null);
    },
    [config, goalBusy, load],
  );

  const active = items.filter((t) => t.state === "active" || t.state === "waiting").length;

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader
        title="Routines"
        subtitle={active > 0
          ? `${active} ${active === 1 ? "thing" : "things"} Ghost keeps doing for you`
          : "Tell Ghost: \u201cevery Monday at 9, prepare my brief\u201d"}
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

          {items.length > 0 ? <SectionHeader title="Routines" style={{ paddingTop: Space.md }} /> : null}
          {!error && items.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              subtitle="Say \u201cevery Monday at 9, prepare my weekly brief\u201d in a chat and it appears here."
              action={<GhostButton title="Start a chat" onPress={() => router.replace("/")} />}
            />
          ) : (
            items.map((t) => {
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
                  {t.what ? (
                    <GhostText type="footnote" style={styles.rowWhat} numberOfLines={2}>
                      {t.what}
                    </GhostText>
                  ) : null}
                  {t.last_error ? (
                    <GhostText type="footnote" style={styles.rowError} numberOfLines={2}>
                      {t.last_error}
                    </GhostText>
                  ) : null}
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
                </GlassCard>
              );
            })
          )}

          <SectionHeader title="Goals" subtitle="Standing intents Ghost keeps working on. Tell it once, it reports back." />
          {goalsError && goals.length === 0 ? (
            <EmptyState
              title="Couldn't load goals"
              subtitle={goalsError}
              action={<GhostButton title="Try again" onPress={() => load()} />}
            />
          ) : null}
          <Panel style={{ marginTop: 0 }}>
            <GhostInput
              placeholder="e.g. Take care of school emails"
              value={goalText}
              onChangeText={setGoalText}
              editable={goalBusy !== "new"}
            />
            <GhostInput
              placeholder="Scope (optional, e.g. school.edu inbox)"
              value={goalScope}
              onChangeText={setGoalScope}
              editable={goalBusy !== "new"}
            />
            <GhostButton title={goalBusy === "new" ? "Working…" : "Set goal"} onPress={handleCreateGoal} />
          </Panel>
          {goals.length === 0 && !goalsError ? (
            <GhostText type="footnote" style={styles.none}>
              No goals yet. Set one above and Ghost will keep at it.
            </GhostText>
          ) : (
            goals.map((g) => {
              const busy = goalBusy === g.id;
              const isActive = g.status === "active";
              return (
                <GlassCard key={g.id} style={styles.card}>
                  <View style={styles.rowHead}>
                    <GhostText type="headline" style={styles.rowTitle}>
                      {g.text}
                    </GhostText>
                    <StatusPill label={goalStatusLabel(g.status)} tone={isActive ? "ok" : g.status === "completed" ? "off" : "warn"} />
                  </View>
                  {g.scope ? (
                    <GhostText type="footnote" style={styles.rowMeta}>
                      {g.scope}
                    </GhostText>
                  ) : null}
                  <View style={styles.actions}>
                    {isActive ? (
                      <GhostButton title={busy ? "…" : "Pause"} variant="secondary" size="sm" onPress={() => handleGoalOp(g, "pause")} />
                    ) : g.status === "paused" || g.status === "expired" ? (
                      <GhostButton title={busy ? "…" : "Resume"} variant="secondary" size="sm" onPress={() => handleGoalOp(g, "resume")} />
                    ) : null}
                    {g.status !== "completed" ? (
                      <GhostButton title={busy ? "…" : "Done"} variant="secondary" size="sm" onPress={() => handleGoalOp(g, "complete")} />
                    ) : null}
                  </View>
                </GlassCard>
              );
            })
          )}
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
