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
import { EmptyState, GhostButton, GhostRow, GhostSheet } from "@/components/ghost";
import {
  fetchSessions,
  fetchCronJobs,
  fetchMemorySelf,
  fetchTraces,
  controlScheduledItem,
  deleteScheduledItem,
  fetchScheduled,
  SessionSummary,
  CronJob,
  MemoryFact,
  ScheduledItem,
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
  scheduledId?: string;
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

// Semantic layer: every raw record becomes a human sentence. No file paths,
// session ids, tool names, or raw event strings ever reach the timeline.
function humanSessionTitle(s: SessionSummary): string {
  if (s.title && s.title !== s.id) return truncate(s.title);
  return "Conversation";
}

function humanErrorTitle(message: string): string {
  const m = (message || "").trim() || "Something didn't work";
  return m
    .replace(/^(tool|agent|channel|exec|schedule|cron)[\s_:.>-]+/i, "")
    .replace(/\b[0-9a-f]{8,}\b/gi, "…")
    .trim() || "Something didn't work";
}

const MEMORY_KIND_LABEL: Record<string, string> = {
  identity: "Identity",
  preference: "Preferences",
  fact: "About you",
  goal: "Goals",
  relationship: "People",
  routine: "Routines",
};

function memoryEventDate(createdAt?: string): number {
  if (!createdAt) return 0;
  const ts = Math.floor(new Date(createdAt).getTime() / 1000);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

function scheduledEventDate(value?: string | null): number {
  if (!value) return 0;
  const ts = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

function humanNextRun(value?: string | null, timezone?: string): string | null {
  const ts = scheduledEventDate(value);
  if (!ts) return null;
  const d = new Date(ts * 1000);
  const day = d.toLocaleDateString([], { weekday: "short" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const when = ts * 1000 > Date.now() ? "Next" : "Last run";
  return `${when} ${day} ${time}${timezone ? ` · ${timezone}` : ""}`;
}

function humanScheduledState(item: ScheduledItem): string {
  switch (item.state) {
    case "paused":
      return "Paused";
    case "failed":
      return "Needs attention";
    case "completed":
      return "Done";
    case "missed":
      return "Missed";
    case "cancelled":
      return "Cancelled";
    case "running":
    case "due":
      return "Running now";
    default:
      return item.type === "reminder" ? "Reminder" : "Automation";
  }
}

function collectItems(
  sessions: SessionSummary[],
  jobs: CronJob[],
  scheduled: ScheduledItem[],
  memory: MemoryFact[],
  traces: { timestamp: number; message: string; level: string }[],
): ActivityItem[] {
  const items: ActivityItem[] = [];
  const seen = new Set<string>();

  for (const s of sessions) {
    if (!s.id || seen.has(`m:${s.id}`)) continue;
    seen.add(`m:${s.id}`);
    const ts = s.last_activity || 0;
    if (!ts) continue;
    items.push({
      id: `m:${s.id}`,
      kind: "messages",
      ts,
      title: humanSessionTitle(s),
      meta: `${(s.message_count || 0).toLocaleString("en-US")} messages`,
      sessionId: s.id,
    });
  }

  for (const j of jobs) {
    if (!j.id || seen.has(`a:${j.id}`)) continue;
    seen.add(`a:${j.id}`);
    const lr = j.state?.lastRunAtMs ? Math.floor(j.state.lastRunAtMs / 1000) : 0;
    const tz = (j.schedule as any)?.tz;
    const nextRun = (j as any)?.next_run_at;
    const metaParts: string[] = [];
    if (lr) metaParts.push("Last run");
    if (typeof nextRun === "string" && nextRun) metaParts.push(`Next ${nextRun}`);
    if (typeof tz === "string" && tz) metaParts.push(tz);
    const ts = lr || (typeof (j as any)?.createdAtMs === "number" ? Math.floor((j as any).createdAtMs / 1000) : 0);
    if (!ts) continue;
    const name = (j.name || "Automation").trim() || "Automation";
    const paused = j.enabled === false;
    items.push({
      id: `a:${j.id}`,
      kind: "automations",
      ts,
      title: paused ? `${name} (paused)` : name,
      meta: metaParts.join(" · ") || "Scheduled",
    });
  }

  // Reminders and automations live in the scheduled store — the same one
  // the agent's schedule tool writes to. Upcoming items sort first so the
  // timeline answers "what's next", not just "what happened".
  for (const item of scheduled) {
    if (!item.id || seen.has(`s:${item.id}`)) continue;
    seen.add(`s:${item.id}`);
    if (item.state === "cancelled") continue;
    const ts =
      scheduledEventDate(item.next_run_at) || scheduledEventDate(item.last_run_at);
    if (!ts) continue;
    const next = humanNextRun(item.next_run_at, item.timezone);
    const metaParts = [humanScheduledState(item)];
    if (next) metaParts.push(next);
    else if (item.timezone) metaParts.push(item.timezone);
    if (item.last_error) metaParts.push("Needs attention");
    const title = (item.title || "Scheduled item").trim() || "Scheduled item";
    items.push({
      id: `s:${item.id}`,
      kind: "automations",
      ts,
      title,
      meta: metaParts.join(" · "),
      scheduledId: item.id,
    });
  }

  // Memory events come from learned facts (created_at is the truthful
  // "when"), never from workspace filenames or file mtimes.
  for (const e of memory.slice(0, 50)) {
    if (!e.id || seen.has(`mem:${e.id}`)) continue;
    seen.add(`mem:${e.id}`);
    const ts = memoryEventDate(e.created_at);
    if (!ts) continue;
    const kindLabel = MEMORY_KIND_LABEL[e.kind] ?? MEMORY_KIND_LABEL.fact;
    const metaParts = [kindLabel];
    if ((e.reinforce_count ?? 0) > 1) metaParts.push(`confirmed ${e.reinforce_count}×`);
    items.push({
      id: `mem:${e.id}`,
      kind: "memory",
      ts,
      title: `Ghost learned: ${(e.title || e.value || "something new").trim()}`,
      meta: metaParts.join(" · "),
    });
  }

  for (const inc of traces.slice(0, 20)) {
    const ts = Math.floor((inc.timestamp || 0) / 1000);
    if (!ts) continue;
    const title = humanErrorTitle(inc.message).slice(0, 120);
    const key = `e:${ts}:${title.slice(0, 32)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: key,
      kind: "errors",
      ts,
      title,
      meta: "Needs attention",
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
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);
  const [manageSheet, setManageSheet] = useState<{ visible: boolean; id: string | null }>({
    visible: false,
    id: null,
  });
  const [deleteSheet, setDeleteSheet] = useState<{ visible: boolean; id: string | null }>({
    visible: false,
    id: null,
  });
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

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

      const [sessions, jobs, sched, memory, traces] = await Promise.all([
        safe("sessions", () => fetchSessions(config)),
        safe("cron", () => fetchCronJobs(config)),
        safe("scheduled", () => fetchScheduled(config)),
        safe("memory", () => fetchMemorySelf(config).then((self) => self.entries)),
        safe("traces", () => fetchTraces(config)),
      ]);

      const s = Array.isArray(sessions) ? (sessions as SessionSummary[]) : [];
      const j = Array.isArray(jobs) ? (jobs as CronJob[]) : [];
      const sch = Array.isArray(sched) ? (sched as ScheduledItem[]) : [];
      const m = Array.isArray(memory) ? (memory as MemoryFact[]) : [];
      const t = Array.isArray(traces)
        ? (traces as { timestamp: number; message: string; level: string }[])
        : [];

      // Failure means every source errored — genuine emptiness is not failure.
      setFailed(
        sessions === null &&
          jobs === null &&
          sched === null &&
          memory === null &&
          traces === null,
      );
      setScheduled(sch);
      setItems(collectItems(s, j, sch, m, t));
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

  const mutateScheduled = async (
    id: string,
    fn: (cfg: NonNullable<typeof config>, itemId: string) => Promise<unknown>,
    failure: string,
  ) => {
    if (!config) return;
    setMutating(true);
    setMutationError(null);
    try {
      await fn(config, id);
      setManageSheet({ visible: false, id: null });
      setDeleteSheet({ visible: false, id: null });
      await load(true);
    } catch {
      setMutationError(failure);
    }
    setMutating(false);
  };

  const managedItem = manageSheet.id
    ? scheduled.find((x) => x.id === manageSheet.id) ?? null
    : null;
  const deleteItem = deleteSheet.id
    ? scheduled.find((x) => x.id === deleteSheet.id) ?? null
    : null;

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
            const openSession = item.kind === "messages" && !!item.sessionId;
            const openMemory = item.kind === "memory";
            const manageScheduled = item.kind === "automations" && !!item.scheduledId;
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
                {openSession ? (
                  <TouchableOpacity
                    activeOpacity={0.6}
                    accessibilityLabel="Open conversation"
                    onPress={() => {
                      setCurrentSession(item.sessionId!);
                      router.push({
                        pathname: "/conversation",
                        params: { sessionId: item.sessionId!, title: item.title },
                      } as any);
                    }}
                  >
                    {Row}
                  </TouchableOpacity>
                ) : openMemory ? (
                  <TouchableOpacity
                    activeOpacity={0.6}
                    accessibilityLabel="Open memory"
                    onPress={() => router.push("/(tabs)/memory" as any)}
                  >
                    {Row}
                  </TouchableOpacity>
                ) : manageScheduled ? (
                  <TouchableOpacity
                    activeOpacity={0.6}
                    accessibilityLabel={`Manage ${item.title}`}
                    onPress={() => {
                      setMutationError(null);
                      setManageSheet({ visible: true, id: item.scheduledId! });
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

      <GhostSheet
        visible={manageSheet.visible}
        onClose={() => {
          if (!mutating) {
            setManageSheet({ visible: false, id: null });
            setMutationError(null);
          }
        }}
        title={managedItem?.title ?? "Scheduled item"}
        message={
          mutationError ??
          (managedItem
            ? `${humanScheduledState(managedItem)}${
                humanNextRun(managedItem.next_run_at, managedItem.timezone)
                  ? ` · ${humanNextRun(managedItem.next_run_at, managedItem.timezone)}`
                  : ""
              }`
            : undefined)
        }
      >
        {managedItem && !mutating ? (
          <>
            {managedItem.state === "paused" ? (
              <GhostRow
                title="Resume"
                style={{ paddingHorizontal: 0 }}
                onPress={() =>
                  mutateScheduled(
                    managedItem.id,
                    (cfg, id) => controlScheduledItem(cfg, id, "resume"),
                    "Couldn't resume it.",
                  )
                }
              />
            ) : (
              <GhostRow
                title="Pause"
                style={{ paddingHorizontal: 0 }}
                onPress={() =>
                  mutateScheduled(
                    managedItem.id,
                    (cfg, id) => controlScheduledItem(cfg, id, "pause"),
                    "Couldn't pause it.",
                  )
                }
              />
            )}
            <GhostRow
              title="Run now"
              style={{ paddingHorizontal: 0 }}
              onPress={() =>
                mutateScheduled(
                  managedItem.id,
                  (cfg, id) => controlScheduledItem(cfg, id, "run"),
                  "Couldn't run it.",
                )
              }
            />
            <GhostRow
              title="Delete"
              style={{ paddingHorizontal: 0 }}
              onPress={() => {
                setManageSheet({ visible: false, id: null });
                setDeleteSheet({ visible: true, id: managedItem.id });
              }}
            />
          </>
        ) : null}
      </GhostSheet>

      <GhostSheet
        visible={deleteSheet.visible}
        onClose={() => {
          if (!mutating) {
            setDeleteSheet({ visible: false, id: null });
            setMutationError(null);
          }
        }}
        title="Delete this?"
        message={
          mutationError ??
          (deleteItem
            ? `"${deleteItem.title}" won't run again.`
            : undefined)
        }
        confirmTitle={mutating ? "Deleting…" : "Delete"}
        variant="destructive"
        onConfirm={() => {
          if (deleteSheet.id) {
            mutateScheduled(deleteSheet.id, deleteScheduledItem, "Couldn't delete it.");
          }
        }}
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
