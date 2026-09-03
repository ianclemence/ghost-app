import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ghost, Radius, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton } from "@/components/ghost";
import {
  fetchSessions,
  fetchCronJobs,
  fetchMemoryFiles,
  fetchTraces,
  SessionSummary,
  CronJob,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

type ActivityKind = "messages" | "automations" | "memory" | "errors";

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  ts: number; // unix seconds
  title: string;
  meta: string;
  sessionId?: string;
};

const FILTERS: { key: ActivityKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "messages", label: "Messages" },
  { key: "automations", label: "Automations" },
  { key: "memory", label: "Memory" },
  { key: "errors", label: "Errors" },
];

const EMPTY_LABELS: Record<string, { title: string; subtitle: string }> = {
  all: { title: "Nothing here yet", subtitle: "This view will fill in as Ghost works for you." },
  messages: { title: "No conversations yet", subtitle: "Chats with Ghost will appear here." },
  automations: { title: "No automations have run", subtitle: "Scheduled tasks will show up once they run." },
  memory: { title: "Nothing remembered yet", subtitle: "Notes Ghost saves will appear here." },
  errors: { title: "No errors", subtitle: "Ghost is healthy." },
};

function truncate(title: string): string {
  const t = (title || "").trim() || "Conversation";
  return t.length > 50 ? t.substring(0, 47) + "…" : t;
}

function dayLabel(unixSec: number): string {
  if (!unixSec) return "";
  const d = new Date(unixSec * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function clockTime(unixSec: number): string {
  if (!unixSec) return "";
  return new Date(unixSec * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function collectItems(
  sessions: SessionSummary[],
  jobs: CronJob[],
  memory: { name: string; modified: number }[],
  traces: { timestamp: number; message: string; level: string }[],
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const s of sessions) {
    const ts = s.last_activity || 0;
      items.push({
        id: "m-" + s.id,
        kind: "messages",
        ts,
        title: truncate(s.title),
        meta: (s.message_count || 0).toLocaleString("en-US") + " messages",
        sessionId: s.id,
      });
  }

  for (const j of jobs) {
    const lr = j.state?.lastRunAtMs ? Math.floor(j.state.lastRunAtMs / 1000) : 0;
    const tz = (j.schedule as any)?.tz;
    const nextRun = (j as any)?.next_run_at;
    const metaParts: string[] = [];
    if (lr) metaParts.push("Last run");
    if (typeof nextRun === "string" && nextRun) metaParts.push(`Next ${nextRun}`);
    if (typeof tz === "string" && tz) metaParts.push(tz);
    const ts = lr || (typeof (j as any)?.createdAtMs === "number" ? Math.floor((j as any).createdAtMs / 1000) : 0);
    if (!ts) continue;
    items.push({
      id: "a-" + j.id,
      kind: "automations",
      ts,
      title: (j.name || "Automation").trim(),
      meta: metaParts.join(" · ") || "Scheduled",
    });
  }

  for (const m of memory.slice(0, 20)) {
    const ts = m.modified || 0;
    if (!ts) continue;
    const name = String(m.name || "").replace(/\.md$/, "").trim();
    if (!name) continue;
    items.push({
      id: "mem-" + name,
      kind: "memory",
      ts,
      title: name,
      meta: "Remembered",
    });
  }

  for (const inc of traces.slice(0, 20)) {
    const ts = Math.floor((inc.timestamp || 0) / 1000);
    items.push({
      id: "e-" + ts + "-" + (inc.message || "incident").slice(0, 12),
      kind: "errors",
      ts,
      title: (inc.message || "Incident").trim(),
      meta: inc.level || "error",
    });
  }

  items.sort((a, b) => b.ts - a.ts);
  return items;
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, setCurrentSession } = useGhostStore();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<ActivityKind | "all">("all");

  const load = useCallback(
    async (silent = false) => {
      if (!config) return;
      if (!silent) setLoading(true);

      // Each source fails independently so one bad endpoint can't blank the
      // whole screen. Mirrors the web UI, which renders whatever loaded.
      const safe = async (label: string, fn: () => Promise<unknown>) => {
        try {
          return await fn();
        } catch (err) {
          console.warn(`[activity] ${label} failed:`, err);
          return null;
        }
      };

      const [sessions, jobs, memory, traces] = await Promise.all([
        safe("sessions", () => fetchSessions(config)),
        safe("cron", () => fetchCronJobs(config)),
        safe("memory", () => fetchMemoryFiles(config)),
        safe("traces", () => fetchTraces(config)),
      ]);

      const s = Array.isArray(sessions) ? (sessions as SessionSummary[]) : [];
      const j = Array.isArray(jobs) ? (jobs as CronJob[]) : [];
      const m = Array.isArray(memory) ? (memory as { name: string; modified: number }[]) : [];
      const t = Array.isArray(traces)
        ? (traces as { timestamp: number; message: string; level: string }[])
        : [];

      const anyLoaded =
        s.length > 0 || j.length > 0 || m.length > 0 || t.length > 0;
      setFailed(!anyLoaded);
      setItems(collectItems(s, j, m, t));
      setLoading(false);
    },
    [config],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  const empty = EMPTY_LABELS[filter] || EMPTY_LABELS.all;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.headerTitle}>Activity</GhostText>
        <GhostText type="subhead" style={styles.headerSubtitle}>
          A record of what Ghost has done on your behalf.
        </GhostText>
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.6}
                onPress={() => setFilter(f.key)}
              >
                <GhostText type="subhead" style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {f.label}
                </GhostText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {!config ? (
        <EmptyState
          title="Not connected"
          subtitle="Connect to your Ghost Pod to see activity."
        />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Ghost.accent.primary} size="large" />
        </View>
      ) : failed && filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title="No activity yet"
            subtitle="Ghost hasn't recorded any sessions, automations, memory, or errors."
            action={
              <GhostButton title="Retry" onPress={() => load()} />
            }
          />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState title={empty.title} subtitle={empty.subtitle} />
        </View>
      ) : (
        <ScrollView
          style={styles.timeline}
          contentContainerStyle={styles.timelineContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Ghost.accent.primary}
            />
          }
        >
          {filtered.map((item, idx) => {
            const day = dayLabel(item.ts);
            const prevDay = idx > 0 ? dayLabel(filtered[idx - 1].ts) : null;
            const showDay = day !== prevDay;
            const tappable = item.kind === "messages" && !!item.sessionId;
            const Row = (
              <View style={styles.row}>
                <GhostText type="footnote" style={styles.rowTime}>{clockTime(item.ts)}</GhostText>
                <View style={styles.rowContent}>
                  <GhostText type="headline" style={styles.rowTitle} numberOfLines={2}>
                    {item.title}
                  </GhostText>
                  <GhostText type="footnote" style={styles.rowMeta}>{item.meta}</GhostText>
                </View>
              </View>
            );
            return (
              <View key={item.id}>
                {showDay && <GhostText type="caption" style={styles.dayLabel}>{day}</GhostText>}
                {tappable ? (
                  <TouchableOpacity
                    activeOpacity={0.6}
                    onPress={() => {
                      setCurrentSession(item.sessionId!);
                      router.push("/conversation" as any);
                    }}
                  >
                    {Row}
                  </TouchableOpacity>
                ) : (
                  Row
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
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
  chipsWrap: {
    paddingHorizontal: Space.xl,
    marginBottom: Space.md,
  },
  chips: {
    gap: Space.sm,
    paddingVertical: 2,
  },
  chip: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    backgroundColor: Ghost.bg.raised,
  },
  chipActive: {
    backgroundColor: Ghost.accent.primary,
    borderColor: Ghost.accent.primary,
  },
  chipLabel: {
    ...Type.subhead,
    color: Ghost.text.secondary,
  },
  chipLabelActive: {
    color: Ghost.text.inverse,
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
    paddingBottom: Space.huge,
  },
  dayLabel: {
    ...Type.caption,
    color: Ghost.text.tertiary,
    letterSpacing: 0.3,
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
    textTransform: "capitalize",
  },
});
