import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton } from "@/components/ghost";
import { PlusMenu } from "@/components/plus-menu";
import { fetchActivity, type ActivityChip } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [items, setItems] = useState<ActivityChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastSeq = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setFailed(false);
    try {
      const chips = await fetchActivity(config, { limit: 50 });
      setItems(chips);
      lastSeq.current = chips.reduce((m, c) => Math.max(m, c.seq ?? 0), 0);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!config) return;
    const t = setInterval(async () => {
      try {
        const fresh = await fetchActivity(config, { limit: 50, sinceSeq: lastSeq.current });
        if (fresh.length > 0) {
          setItems((prev) => [...fresh, ...prev]);
          lastSeq.current = fresh.reduce((m, c) => Math.max(m, c.seq ?? 0), lastSeq.current);
        }
      } catch {}
    }, 20000);
    return () => clearInterval(t);
  }, [config]);

  const onRefresh = async () => {
    if (!config) return;
    setRefreshing(true);
    try {
      const fresh = await fetchActivity(config, { limit: 50, sinceSeq: lastSeq.current });
      if (fresh.length > 0) {
        setItems((prev) => [...fresh, ...prev]);
        lastSeq.current = fresh.reduce((m, c) => Math.max(m, c.seq ?? 0), lastSeq.current);
      } else {
        await load(true);
      }
      setFailed(false);
    } catch {
      setFailed(items.length === 0);
    }
    setRefreshing(false);
  };

  const loadOlder = async () => {
    // No older-page cursor exists; since_seq only moves forward. Reload is
    // the honest path until the backend adds paging.
    if (!config || loadingMore) return;
    setLoadingMore(true);
    try {
      const chips = await fetchActivity(config, { limit: 100 });
      setItems(chips);
      lastSeq.current = chips.reduce((m, c) => Math.max(m, c.seq ?? 0), 0);
    } catch {}
    setLoadingMore(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.headerTitle}>Activity</GhostText>
        <GhostText type="subhead" style={styles.headerSubtitle}>
          What Ghost has been doing.
        </GhostText>
      </View>
      {!config ? (
        <EmptyState title="Not connected" subtitle="Connect to your Ghost to see activity." />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Ghost.accent.primary} size="large" />
        </View>
      ) : failed && items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState title="No activity yet" subtitle="Ghost hasn't recorded anything visible yet." action={<GhostButton title="Retry" onPress={() => load()} />} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState title="Nothing here yet" subtitle="This fills in as Ghost works for you." />
        </View>
      ) : (
        <ScrollView
          style={styles.timeline}
          contentContainerStyle={styles.timelineContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Ghost.accent.primary} />}
          onScrollEndDrag={loadOlder}
        >
          {items.map((item, idx) => {
            const day = dayLabel(item.timestamp);
            const prevDay = idx > 0 ? dayLabel(items[idx - 1].timestamp) : null;
            return (
              <View key={`${item.seq}-${item.id}`}>
                {day !== prevDay && day ? <GhostText type="caption" style={styles.dayLabel}>{day}</GhostText> : null}
                <View style={styles.row}>
                  <GhostText type="footnote" style={styles.rowTime}>{clockTime(item.timestamp)}</GhostText>
                  <View style={styles.rowContent}>
                    <GhostText type="headline" style={styles.rowTitle} numberOfLines={2}>{item.title}</GhostText>
                    {item.summary ? <GhostText type="footnote" style={styles.rowMeta} numberOfLines={2}>{item.summary}</GhostText> : null}
                  </View>
                </View>
              </View>
            );
          })}
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
  headerTitle: {
    ...Type.largeTitle,
    color: Ghost.text.primary,
  },
  headerSubtitle: {
    ...Type.subhead,
    color: Ghost.text.secondary,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
  },
  timeline: {
    flex: 1,
  },
  timelineContent: {
    paddingHorizontal: Space.xl,
    paddingBottom: 128,
  },
  dayLabel: {
    ...Type.caption,
    color: Ghost.text.tertiary,
    marginTop: Space.lg,
    marginBottom: Space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Space.md,
  },
  rowTime: {
    ...Type.footnote,
    color: Ghost.text.tertiary,
    width: 72,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    ...Type.headline,
    color: Ghost.text.primary,
  },
  rowMeta: {
    ...Type.footnote,
    color: Ghost.text.secondary,
    marginTop: 2,
  },
});
