import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton, GhostSheet } from "@/components/ghost";
import { PlusMenu } from "@/components/plus-menu";
import { useGhostStore } from "@/lib/store";
import { fetchMemorySelf, forgetMemoryFact, forgetMemoryNote, type MemoryFact } from "@/lib/ghostApi";

function kindLabel(kind: string): string {
  switch (kind) {
    case "identity":
      return "Identity";
    case "preference":
      return "Preferences";
    case "goal":
      return "Goals";
    case "relationship":
      return "People";
    case "routine":
      return "Routines";
    default:
      return "About you";
  }
}

type Row =
  | { type: "group"; key: string; label: string }
  | { type: "fact"; key: string; fact: MemoryFact }
  | { type: "note"; key: string; note: string };

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forgettingId, setForgettingId] = useState<string | null>(null);
  const [forgetTarget, setForgetTarget] = useState<{ kind: "fact"; fact: MemoryFact } | { kind: "note"; note: string } | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const loadMemory = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    setLoadError(null);
    try {
      const self = await fetchMemorySelf(config);
      const seen = new Set<string>();
      setFacts(self.entries.filter((e) => {
        if (!e.id || seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      }));
      setNotes(self.notes);
    } catch {
      setLoadError("Couldn't load what Ghost remembers.");
    }
    setLoading(false);
  }, [config]);

  const onRefresh = useCallback(async () => {
    if (!config) return;
    setRefreshing(true);
    setLoadError(null);
    try {
      const self = await fetchMemorySelf(config);
      const seen = new Set<string>();
      setFacts(self.entries.filter((e) => {
        if (!e.id || seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      }));
      setNotes(self.notes);
    } catch {
      setLoadError("Couldn't load what Ghost remembers.");
    }
    setRefreshing(false);
  }, [config]);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  const doForget = async () => {
    if (!config || !forgetTarget) return;
    setSheetError(null);
    if (forgetTarget.kind === "fact") {
      const f = forgetTarget.fact;
      setForgettingId(f.id);
      try {
        await forgetMemoryFact(config, f.id);
        setFacts((prev) => prev.filter((x) => x.id !== f.id));
        setForgetTarget(null);
      } catch {
        setSheetError("Check your connection and try again.");
      }
      setForgettingId(null);
    } else {
      const note = forgetTarget.note;
      setForgettingId(`note:${note}`);
      try {
        await forgetMemoryNote(config, "memory", note);
        setNotes((prev) => prev.filter((x) => x !== note));
        setForgetTarget(null);
      } catch {
        setSheetError("Check your connection and try again.");
      }
      setForgettingId(null);
    }
  };

  const rows: Row[] = [];
  const byGroup: Record<string, MemoryFact[]> = {};
  for (const f of facts) {
    const key = f.domain_label || kindLabel(f.kind);
    (byGroup[key] = byGroup[key] || []).push(f);
  }
  for (const label of Object.keys(byGroup).sort()) {
    rows.push({ type: "group", key: `group:${label}`, label });
    for (const f of byGroup[label]) rows.push({ type: "fact", key: `fact:${f.id}`, fact: f });
  }
  if (notes.length) {
    rows.push({ type: "group", key: "group:notes", label: "Notes" });
    notes.forEach((n, i) => rows.push({ type: "note", key: `note:${i}`, note: n }));
  }

  const offline = connectionState !== "online";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.headerTitle} accessibilityRole="header">Memory</GhostText>
        <GhostText type="subhead" style={styles.headerSubtitle}>
          What Ghost knows about you.
        </GhostText>
      </View>
      {!config ? (
        <View style={styles.emptyFill}>
          <EmptyState title="Not connected" subtitle="Connect to your Ghost to see what it remembers." />
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Ghost.text.primary} size="large" />
        </View>
      ) : loadError && rows.length === 0 ? (
        <View style={styles.emptyFill}>
          <EmptyState
            title="Couldn't load memory."
            subtitle={offline ? "Ghost looks offline. Reconnect and try again." : "Check your connection and try again."}
            action={<GhostButton title="Retry" onPress={loadMemory} />}
          />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyHello}>
            <Text style={styles.emptyInk}>Nothing remembered yet. </Text>
            <Text style={styles.emptyMuted}>Talk to Ghost and what matters will live here.</Text>
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            if (item.type === "group") {
              return <GhostText type="caption" style={styles.groupLabel}>{item.label.toUpperCase()}</GhostText>;
            }
            if (item.type === "note") {
              const busy = forgettingId === `note:${item.note}`;
              return (
                <View style={styles.row}>
                  <GhostText type="callout" style={styles.rowPreview} numberOfLines={3}>{item.note}</GhostText>
                  <TouchableOpacity onPress={() => setForgetTarget({ kind: "note", note: item.note })} disabled={busy} hitSlop={8} accessibilityLabel="Forget this note">
                    <GhostText type="subhead" style={styles.forget}>{busy ? "…" : "Forget"}</GhostText>
                  </TouchableOpacity>
                </View>
              );
            }
            const busy = forgettingId === item.fact.id;
            return (
              <View style={styles.row}>
                <View style={styles.rowContent}>
                  <GhostText type="headline" style={styles.rowTitle} numberOfLines={2}>{item.fact.title || item.fact.value}</GhostText>
                  {item.fact.summary ? <GhostText type="footnote" style={styles.rowMeta} numberOfLines={3}>{item.fact.summary}</GhostText> : null}
                </View>
                <TouchableOpacity onPress={() => setForgetTarget({ kind: "fact", fact: item.fact })} disabled={busy} hitSlop={8} accessibilityLabel={`Forget ${item.fact.title}`}>
                  <GhostText type="subhead" style={styles.forget}>{busy ? "…" : "Forget"}</GhostText>
                </TouchableOpacity>
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Ghost.text.primary} />}
        />
      )}
      <PlusMenu />
      <GhostSheet
        visible={forgetTarget !== null}
        onClose={() => {
          setForgetTarget(null);
          setSheetError(null);
        }}
        title={sheetError ? "Couldn't forget that" : "Forget this?"}
        message={sheetError ?? "This won't be used anymore."}
        confirmTitle={sheetError ? "Try again" : "Forget"}
        variant="destructive"
        onConfirm={doForget}
      />
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
    paddingVertical: Space.md,
  },
  headerTitle: {
    color: Ghost.text.primary,
  },
  headerSubtitle: {
    color: Ghost.text.secondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyCenter: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    paddingHorizontal: 44,
  },
  emptyFill: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
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
  listContent: {
    paddingHorizontal: Space.xl,
    paddingBottom: 128,
  },
  groupLabel: {
    color: Ghost.text.tertiary,
    marginTop: Space.xl,
    marginBottom: Space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
  },
  rowContent: {
    flex: 1,
    gap: Space.xxs,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowMeta: {
    color: Ghost.text.tertiary,
  },
  rowPreview: {
    color: Ghost.text.secondary,
    lineHeight: 20,
    flex: 1,
  },
  forget: {
    color: Ghost.text.tertiary,
  },
});
