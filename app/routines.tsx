import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton, GhostSheet } from "@/components/ghost";
import { controlRoutine, fetchRoutines, type RoutineItem } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

export default function RoutinesScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RoutineItem | null>(null);
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      setItems(await fetchRoutines(config));
    } catch {
      setError("Couldn't load routines.");
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: "pause" | "resume" | "cancel" | "delete") => {
    if (!config || !selected) return;
    setMutating(true);
    setMutationError(null);
    try {
      await controlRoutine(config, selected.id, action);
      setSelected(null);
      await load(true);
    } catch {
      setMutationError("Couldn't do that. Try again.");
    }
    setMutating(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title}>Routines</GhostText>
        <GhostText type="subhead" style={styles.sub}>What Ghost does automatically. Create them by talking to Ghost.</GhostText>
      </View>
      {!config ? (
        <EmptyState title="Not connected" subtitle="Connect to manage routines." />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={Ghost.accent.primary} size="large" /></View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}><EmptyState title="Couldn't load routines." subtitle={error} action={<GhostButton title="Retry" onPress={() => load()} />} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><EmptyState title="No routines yet." subtitle="Say: every weekday morning, tell me what's on my calendar." /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.accent.primary} />}
        >
          {items.map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={styles.rowBody}>
                <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>{r.name}</GhostText>
                <GhostText type="footnote" style={styles.rowMeta} numberOfLines={2}>
                  {[r.status, r.next_run ? `Next ${r.next_run}` : null, r.last_run ? `Last ${r.last_run}` : null].filter(Boolean).join(" · ")}
                </GhostText>
                {r.instruction ? <GhostText type="footnote" style={styles.rowMeta} numberOfLines={2}>{r.instruction}</GhostText> : null}
              </View>
              <GhostButton title="Manage" variant="secondary" onPress={() => { setSelected(r); setMutationError(null); }} />
            </View>
          ))}
        </ScrollView>
      )}
      <GhostSheet
        visible={selected !== null}
        onClose={() => { if (!mutating) setSelected(null); }}
        title={selected?.name ?? "Routine"}
        message={mutationError ?? undefined}
      >
        <GhostButton title="Pause" variant="secondary" fullWidth onPress={() => void act("pause")} disabled={mutating} />
        <GhostButton title="Resume" variant="secondary" fullWidth onPress={() => void act("resume")} disabled={mutating} />
        <GhostButton title="Cancel" variant="danger" fullWidth onPress={() => void act("cancel")} disabled={mutating} />
      </GhostSheet>
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
    gap: Space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowMeta: {
    color: Ghost.text.secondary,
  },
});
