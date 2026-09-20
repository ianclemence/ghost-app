import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostButton, EmptyState, GhostInput, OfflineBadge } from "@/components/ghost";
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

function badgeFor(t: RoutineItem): { label: string; color: string } {
  switch (t.state) {
    case "waiting":
      return { label: stateLabel(t.state), color: Ghost.status.warning };
    case "failed":
      return { label: stateLabel(t.state), color: Ghost.status.error };
    case "paused":
      return { label: stateLabel(t.state), color: Ghost.text.tertiary };
    case "done":
      return { label: stateLabel(t.state), color: Ghost.status.success };
    case "cancelled":
      return { label: stateLabel(t.state), color: Ghost.text.tertiary };
    default:
      return { label: stateLabel(t.state), color: Ghost.status.success };
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
  const insets = useSafeAreaInsets();
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenBackground />
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">
          Routines
        </GhostText>
        <GhostText type="subhead" style={styles.sub}>
          {active > 0
            ? `${active} ${active === 1 ? "routine" : "routines"} running for you.`
            : "Tell Ghost in a chat: \u201cevery Monday at 9, prepare my brief\u201d."}
        </GhostText>
      </View>
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
        <ScrollView
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

          {!error && items.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              subtitle="Say \u201cevery Monday at 9, prepare my weekly brief\u201d in a chat and it appears here."
              action={<GhostButton title="Start a chat" onPress={() => router.push("/conversation")} />}
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
                <View key={t.id} style={styles.row}>
                  <View style={styles.rowHead}>
                    <GhostText type="headline" style={styles.rowTitle}>
                      {t.title}
                    </GhostText>
                    <View style={[styles.badge, { borderColor: badge.color }]}>
                      <GhostText type="footnote" style={{ color: badge.color }}>
                        {badge.label}
                      </GhostText>
                    </View>
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
                      <GhostButton
                        title={busy ? "\u2026" : "Pause"}
                        variant="secondary"
                        onPress={() => handleOp(t, "pause")}
                      />
                    ) : null}
                    {canResume ? (
                      <GhostButton
                        title={busy ? "\u2026" : "Resume"}
                        variant="secondary"
                        onPress={() => handleOp(t, "resume")}
                      />
                    ) : null}
                    {canStop ? (
                      <GhostButton
                        title={busy ? "\u2026" : "Stop"}
                        variant="ghost"
                        onPress={() => handleOp(t, "cancel")}
                      />
                    ) : null}
                  </View>
                </View>
              );
            })
          )}

          <GhostText type="caption" style={styles.sectionLabel}>
            Goals
          </GhostText>
          <GhostText type="footnote" style={styles.sectionDesc}>
            Standing intents Ghost keeps working on. Tell it once, it reports back.
          </GhostText>
          {goalsError && goals.length === 0 ? (
            <EmptyState
              title="Couldn't load goals"
              subtitle={goalsError}
              action={<GhostButton title="Try again" onPress={() => load()} />}
            />
          ) : null}
          <View style={styles.creator}>
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
          </View>
          {goals.length === 0 && !goalsError ? (
            <GhostText type="footnote" style={styles.rowMeta}>
              No goals yet. Set one above and Ghost will keep at it.
            </GhostText>
          ) : (
            goals.map((g) => {
              const busy = goalBusy === g.id;
              const isActive = g.status === "active";
              return (
                <View key={g.id} style={styles.row}>
                  <View style={styles.rowHead}>
                    <GhostText type="headline" style={styles.rowTitle}>
                      {g.text}
                    </GhostText>
                    <View style={[styles.badge, { borderColor: Ghost.text.tertiary }]}>
                      <GhostText type="footnote" style={{ color: Ghost.text.tertiary }}>
                        Goal
                      </GhostText>
                    </View>
                  </View>
                  <GhostText type="footnote" style={styles.rowMeta}>
                    {goalStatusLabel(g.status)}{g.scope ? ` · ${g.scope}` : ""}
                  </GhostText>
                  <View style={styles.actions}>
                    {isActive ? (
                      <GhostButton
                        title={busy ? "…" : "Pause"}
                        variant="secondary"
                        onPress={() => handleGoalOp(g, "pause")}
                      />
                    ) : g.status === "paused" || g.status === "expired" ? (
                      <GhostButton
                        title={busy ? "…" : "Resume"}
                        variant="secondary"
                        onPress={() => handleGoalOp(g, "resume")}
                      />
                    ) : null}
                    {g.status !== "completed" ? (
                      <GhostButton
                        title={busy ? "…" : "Done"}
                        variant="ghost"
                        onPress={() => handleGoalOp(g, "complete")}
                      />
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
      <PlusMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  header: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  title: {
    ...Type.largeTitle,
    color: Ghost.text.primary,
  },
  sub: {
    ...Type.subhead,
    color: Ghost.text.secondary,
    marginTop: 2,
  },
  offlineWrap: {
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: Space.xl,
    // FAB clearance: button height + edge distance, so the last row
    // never slides under the menu button.
    paddingBottom: Space.huge + Space.edge,
  },
  row: {
    paddingVertical: Space.lg,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.border.subtle,
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
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
  },
  rowMeta: {
    color: Ghost.text.secondary,
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
    marginTop: Space.sm,
  },
  sectionLabel: {
    color: Ghost.text.tertiary,
    textTransform: "uppercase",
    marginTop: Space.xl,
    marginBottom: Space.xs,
  },
  sectionDesc: {
    color: Ghost.text.secondary,
    marginBottom: Space.sm,
  },
  creator: {
    gap: Space.sm,
    marginBottom: Space.lg,
  },
});
