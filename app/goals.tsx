import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { ScreenBackground } from "@/components/screen-glow";
import { EmptyState, GhostButton } from "@/components/ghost";
import { createGoal, fetchGoals, goalAction, type GoalItem } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

function statusLabel(s: string): string {
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

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [items, setItems] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [scope, setScope] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      setItems(await fetchGoals(config));
    } catch {
      setError("Couldn't load goals.");
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!config || busyId) return;
    const t = text.trim();
    if (!t) {
      Alert.alert("Missing goal", "Describe what Ghost should keep doing for you.");
      return;
    }
    setBusyId("new");
    try {
      await createGoal(config, t, scope.trim() || undefined);
      setText("");
      setScope("");
      await load(true);
    } catch (e) {
      Alert.alert("Couldn't create goal", e instanceof Error ? e.message : "Unknown error");
    }
    setBusyId(null);
  }, [config, busyId, text, scope, load]);

  const handleOp = useCallback(async (g: GoalItem, op: "pause" | "resume" | "complete") => {
    if (!config || busyId) return;
    if (op === "complete") {
      Alert.alert("Mark done?", `"${g.text}" will stop being evaluated.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Done", onPress: async () => {
            setBusyId(g.id);
            try {
              await goalAction(config, g.id, op);
              await load(true);
            } catch (e) {
              Alert.alert("Failed", e instanceof Error ? e.message : "Unknown error");
            }
            setBusyId(null);
          },
        },
      ]);
      return;
    }
    setBusyId(g.id);
    try {
      await goalAction(config, g.id, op);
      await load(true);
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Unknown error");
    }
    setBusyId(null);
  }, [config, busyId, load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenBackground />
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">Goals</GhostText>
        <GhostText type="subhead" style={styles.sub}>Standing intents Ghost keeps working — tell it once, it reports back.</GhostText>
      </View>
      {!config ? (
        <EmptyState title="Not connected" subtitle="Connect to see goals." />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={Ghost.text.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.text.primary} />}
        >
          {error && items.length === 0 ? (
            <EmptyState title="Couldn't load goals." subtitle={error} action={<GhostButton title="Retry" onPress={() => load()} />} />
          ) : null}
          <View style={styles.creator}>
            <TextInput
              style={styles.input}
              placeholder="e.g. Take care of school emails"
              value={text}
              onChangeText={setText}
              editable={busyId !== "new"}
            />
            <TextInput
              style={styles.input}
              placeholder="Scope (optional, e.g. school.edu inbox)"
              value={scope}
              onChangeText={setScope}
              editable={busyId !== "new"}
            />
            <GhostButton title={busyId === "new" ? "Working…" : "Set goal"} onPress={handleCreate} />
          </View>
          {items.length === 0 && !error ? (
            <EmptyState title="No goals yet." subtitle="Set one above and Ghost will keep at it." />
          ) : (
            items.map((g) => {
              const busy = busyId === g.id;
              const active = g.status === "active";
              return (
                <View key={g.id} style={styles.row}>
                  <View style={styles.rowBody}>
                    <GhostText type="headline" style={styles.rowTitle}>{g.text}</GhostText>
                    <GhostText type="footnote" style={styles.rowMeta}>
                      {statusLabel(g.status)}{g.scope ? ` · ${g.scope}` : ""}
                    </GhostText>
                    <View style={styles.actions}>
                      {active ? (
                        <GhostButton title={busy ? "…" : "Pause"} onPress={() => handleOp(g, "pause")} />
                      ) : g.status === "paused" || g.status === "expired" ? (
                        <GhostButton title={busy ? "…" : "Resume"} onPress={() => handleOp(g, "resume")} />
                      ) : null}
                      {g.status !== "completed" ? (
                        <GhostButton title={busy ? "…" : "Done"} onPress={() => handleOp(g, "complete")} />
                      ) : null}
                    </View>
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
  center: {
    flex: 1,
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.huge,
  },
  creator: {
    gap: 8,
    marginBottom: Space.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Ghost.text.primary,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.border.subtle,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowMeta: {
    color: Ghost.text.secondary,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
});
