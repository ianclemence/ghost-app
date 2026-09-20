import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Radius, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { ScreenBackground } from "@/components/screen-glow";
import { EmptyState, GhostButton } from "@/components/ghost";
import {
  fetchDesk,
  deskKindLabel,
  formatDeskSize,
  type DeskItem,
  type DeskKind,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

// The Desk — the work Ghost has done on your machine.
//
// Ghost's agent has a persistent working space on your own hardware: files
// it writes, things it makes for you, tools it builds, and live sessions it
// acts on. The Desk is where all of it lives, in one place you can inspect.
//
// This is a read-only projection. Opening an item previews it; acting on it
// is a new conversation turn that goes through the normal approval flow. The
// Desk itself grants nothing.

type Filter = "all" | DeskKind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "artifact", label: "Made for you" },
  { id: "document", label: "Files" },
  { id: "tool", label: "Tools" },
  { id: "surface", label: "Live" },
];

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function kindBadgeColor(kind: DeskKind): string {
  switch (kind) {
    case "artifact":
      return Ghost.status.success;
    case "tool":
      return Ghost.accent.primary;
    case "surface":
      return Ghost.status.info;
    default:
      return Ghost.text.tertiary;
  }
}

export default function DeskScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config } = useGhostStore();
  const [items, setItems] = useState<DeskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      setItems(await fetchDesk(config));
    } catch {
      setError("Couldn't reach your Ghost's desk.");
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, document: 0, artifact: 0, tool: 0, surface: 0 };
    for (const it of items) c[it.kind] = (c[it.kind] ?? 0) + 1;
    return c;
  }, [items]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenBackground />
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">
          The Desk
        </GhostText>
        <GhostText type="subhead" style={styles.sub}>
          {items.length > 0
            ? `What Ghost has been working on, on your machine.`
            : "Files, tools, and things Ghost makes for you — all here."}
        </GhostText>
      </View>

      {!config ? (
        <EmptyState
          title="Not connected"
          subtitle="Your Ghost's desk lives on your Ghost Pod. Connect one to see it."
          action={<GhostButton title="Connect a Ghost Pod" onPress={() => router.push("/connect")} />}
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Ghost.text.primary} size="large" />
        </View>
      ) : (
        <>
          {items.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              style={styles.filterScroll}
            >
              {FILTERS.map((f) => {
                const active = filter === f.id;
                const n = counts[f.id] ?? 0;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setFilter(f.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${f.label}, ${n} items`}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <GhostText
                      type="footnote"
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {f.label}
                      {n > 0 ? ` ${n}` : ""}
                    </GhostText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

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
                title="Couldn't reach your desk"
                subtitle={error}
                action={<GhostButton title="Try again" onPress={() => load()} />}
              />
            ) : null}

            {!error && items.length === 0 ? (
              <EmptyState
                title="Your desk is clear"
                subtitle="When Ghost writes a file, makes something for you, or builds a tool, it appears here."
                action={<GhostButton title="Start a chat" onPress={() => router.push("/conversation")} />}
              />
            ) : null}

            {visible.map((it) => (
              <View key={it.id} style={styles.row}>
                <View style={styles.rowHead}>
                  <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>
                    {it.title}
                  </GhostText>
                  <View style={[styles.badge, { borderColor: kindBadgeColor(it.kind) }]}>
                    <GhostText type="footnote" style={{ color: kindBadgeColor(it.kind) }}>
                      {deskKindLabel(it.kind)}
                    </GhostText>
                  </View>
                </View>
                {it.summary ? (
                  <GhostText type="footnote" style={styles.rowSummary} numberOfLines={1}>
                    {it.summary}
                  </GhostText>
                ) : null}
                <GhostText type="footnote" style={styles.rowMeta}>
                  {[relTime(it.updated_at), formatDeskSize(it.size)].filter(Boolean).join(" · ")}
                </GhostText>
              </View>
            ))}
          </ScrollView>
        </>
      )}
      <PlusMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  header: { paddingHorizontal: Space.xl, paddingVertical: Space.lg },
  title: { ...Type.largeTitle, color: Ghost.text.primary },
  sub: { ...Type.subhead, color: Ghost.text.secondary, marginTop: 2 },
  center: { flex: 1, justifyContent: "center" },
  filterScroll: { maxHeight: 48, marginBottom: Space.sm },
  filterRow: { paddingHorizontal: Space.xl, gap: Space.sm, alignItems: "center" },
  chip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    paddingHorizontal: Space.md,
    minHeight: 34,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: Ghost.text.primary, borderColor: Ghost.text.primary },
  chipText: { color: Ghost.text.secondary },
  chipTextActive: { color: Ghost.text.inverse },
  list: { paddingHorizontal: Space.xl, paddingBottom: Space.huge },
  row: {
    paddingVertical: Space.lg,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.border.subtle,
    gap: 3,
  },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.sm },
  rowTitle: { color: Ghost.text.primary, flexShrink: 1 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Space.sm, paddingVertical: 2 },
  rowSummary: { color: Ghost.text.secondary },
  rowMeta: { color: Ghost.text.tertiary, marginTop: 2 },
});
