import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { GhostButton, GhostSheet } from "@/components/ghost";
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
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">Routines</GhostText>
        <GhostText type="subhead" style={styles.sub}>What Ghost does automatically. Create them by talking to Ghost.</GhostText>
      </View>
      {!config ? (
        <View style={styles.center}>
          <Text style={styles.emptyHello}>
            <Text style={styles.emptyInk}>Not connected. </Text>
            <Text style={styles.emptyMuted}>Connect to manage routines.</Text>
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={Ghost.text.primary} size="large" /></View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyHello}>
            <Text style={styles.emptyInk}>Routines would not load. </Text>
            <Text style={styles.emptyMuted}>Check your connection and try again.</Text>
          </Text>
          <TouchableOpacity onPress={() => load()} hitSlop={12} accessibilityLabel="Retry loading routines">
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyHello}>
            <Text style={styles.emptyInk}>No routines yet. </Text>
            <Text style={styles.emptyMuted}>Just ask Ghost to do something regularly.</Text>
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.text.primary} />}
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
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 44,
  },
  emptyHello: {
    fontSize: 21,
    lineHeight: 30,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  emptyMuted: {
    color: "#7A746C",
  },
  emptyInk: {
    color: "#1A1611",
    fontWeight: "700",
  },
  retry: {
    marginTop: Space.lg,
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1611",
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
