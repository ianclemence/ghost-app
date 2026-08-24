import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Ghost, Space, Type } from "@/constants/theme";
import { EmptyState, Divider } from "@/components/ghost";
import {
  CronJob,
  fetchCronJobs,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

const FONT = Fonts.sans;

function humanSchedule(job: CronJob): string {
  const s = job.schedule;
  if (s.kind === "every") {
    const ms = s.everyMs ?? 0;
    if (ms >= 86400000 && ms % 86400000 === 0) {
      const days = ms / 86400000;
      return days === 1 ? "Daily" : `Every ${days} days`;
    }
    if (ms >= 3600000 && ms % 3600000 === 0) {
      const hrs = ms / 3600000;
      return hrs === 1 ? "Every hour" : `Every ${hrs} hours`;
    }
    if (ms >= 60000 && ms % 60000 === 0) return `Every ${ms / 60000} min`;
    return `Every ${ms / 1000}s`;
  }
  if (s.kind === "at") {
    const d = new Date(s.atMs ?? 0);
    return `Once · ${d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })}`;
  }
  if (s.kind === "cron" && s.expr) {
    const parts = s.expr.split(" ");
    if (parts.length >= 2) {
      const hour = parseInt(parts[1], 10);
      if (!isNaN(hour)) {
        const ampm = hour >= 12 ? "PM" : "AM";
        const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `Daily at ${h12}:00 ${ampm}`;
      }
    }
    return "Custom schedule";
  }
  return "Custom schedule";
}

function getNextRunText(job: CronJob): string | null {
  if (job.state.nextRunAtMs) {
    const d = new Date(job.state.nextRunAtMs);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isTomorrow =
      d.toDateString() === new Date(now.getTime() + 86400000).toDateString();

    if (isToday) {
      return `Today · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    if (isTomorrow) {
      return `Tomorrow · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return d.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  return null;
}

function getJobStatus(job: CronJob): string {
  if (job.lifecycle_state === "paused") return "Paused";
  if (job.state.lastRunAtMs) {
    const d = new Date(job.state.lastRunAtMs);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (job.state.nextRunAtMs) {
    return getNextRunText(job) ?? "Scheduled";
  }
  return "Scheduled";
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadJobs = useCallback(
    async (silent = false) => {
      if (!config) return;
      if (!silent) setLoading(true);
      try {
        const list = await fetchCronJobs(config);
        setJobs(list);
      } catch {
        // Fine
      }
      setLoading(false);
    },
    [config],
  );

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadJobs(true);
    setRefreshing(false);
  };

  const completedJobs = jobs.filter(
    (j) => j.lifecycle_state !== "paused" && j.run_count > 0,
  );
  const upcomingJobs = jobs.filter(
    (j) => j.lifecycle_state !== "paused" && j.run_count === 0,
  );
  const pausedJobs = jobs.filter((j) => j.lifecycle_state === "paused");

  const sections: { title: string; data: CronJob[] }[] = [];
  if (completedJobs.length > 0) sections.push({ title: "TODAY", data: completedJobs });
  if (upcomingJobs.length > 0) sections.push({ title: "UPCOMING", data: upcomingJobs });
  if (pausedJobs.length > 0) sections.push({ title: "PAUSED", data: pausedJobs });

  const renderJob = useCallback(
    ({ item }: { item: CronJob }) => {
      const status = getJobStatus(item);
      const isPaused = item.lifecycle_state === "paused";

      return (
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <Text style={styles.rowStatus}>
            {isPaused ? "Paused" : status}
          </Text>
        </View>
      );
    },
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity</Text>
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
      ) : jobs.length === 0 ? (
        <EmptyState
          title="Nothing to report."
          subtitle="Ghost will start working for you once you set up scheduled tasks."
        />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.title}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.data.map((job, i) => (
                <View key={job.id}>
                  {renderJob({ item: job })}
                  {i < section.data.length - 1 && <Divider />}
                </View>
              ))}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Ghost.accent.primary}
            />
          }
        />
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  headerTitle: {
    ...Type.largeTitle,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.huge,
  },
  section: {
    marginBottom: Space.xxl,
  },
  sectionTitle: {
    ...Type.caption,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    letterSpacing: 0.3,
    marginBottom: Space.sm,
  },
  row: {
    paddingVertical: Space.md,
  },
  rowContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowTitle: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    flex: 1,
  },
  rowStatus: {
    ...Type.footnote,
    fontFamily: FONT,
    color: Ghost.text.secondary,
    marginLeft: Space.sm,
  },
});
