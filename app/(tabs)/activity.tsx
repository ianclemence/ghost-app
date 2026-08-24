
import {
  Play,
  Pause,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Fonts, Ghost, Radius, Space, Type } from "@/constants/theme";
import { ConnectionPill, EmptyState } from "@/components/ghost";
import {
  CronJob,
  fetchCronJobs,
  pauseCronJob,
  resumeCronJob,
  runCronJobNow,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

const FONT = Fonts.sans;

function humanSchedule(job: CronJob): string {
  const s = job.schedule;
  if (s.kind === "every") {
    const secs = (s.everyMs ?? 0) / 1000;
    if (secs % 86400 === 0) {
      const days = secs / 86400;
      return days === 1 ? "Every day" : `Every ${days} days`;
    }
    if (secs % 3600 === 0) {
      const hrs = secs / 3600;
      return hrs === 1 ? "Every hour" : `Every ${hrs} hours`;
    }
    if (secs % 60 === 0) return `Every ${secs / 60} min`;
    return `Every ${secs}s`;
  }
  if (s.kind === "at") {
    const d = new Date(s.atMs ?? 0);
    return `Once · ${d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return "Custom schedule";
}

function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diffMs = now - ms;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getNextRunTime(job: CronJob): string | null {
  if (job.state.nextRunAtMs) {
    const d = new Date(job.state.nextRunAtMs);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return `Today · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return d.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return null;
}

interface ActivitySection {
  title: string;
  data: CronJob[];
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();
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

  const handleToggle = async (job: CronJob) => {
    if (!config) return;
    const isPaused = job.lifecycle_state === "paused";
    // Optimistic update
    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id
          ? { ...j, lifecycle_state: isPaused ? "active" : "paused" }
          : j,
      ),
    );
    try {
      if (isPaused) {
        await resumeCronJob(config, job.id);
      } else {
        await pauseCronJob(config, job.id);
      }
    } catch {
      // Revert on error
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, lifecycle_state: isPaused ? "paused" : "active" }
            : j,
        ),
      );
    }
  };

  const handleRunNow = async (job: CronJob) => {
    if (!config) return;
    try {
      await runCronJobNow(config, job.id);
    } catch {
      // Silent
    }
  };

  // Group jobs into sections
  const sections: ActivitySection[] = [];
  const activeJobs = jobs.filter((j) => j.lifecycle_state === "paused");
  const pausedJobs = jobs.filter((j) => j.lifecycle_state !== "paused");

  if (activeJobs.length > 0) {
    sections.push({ title: "Scheduled", data: activeJobs });
  }
  if (pausedJobs.length > 0) {
    sections.push({ title: "Paused", data: pausedJobs });
  }

  const renderJob = useCallback(
    ({ item }: { item: CronJob }) => {
      const isPaused = item.lifecycle_state === "paused";
      const nextRun = getNextRunTime(item);

      return (
        <View style={styles.jobCard}>
          <View style={styles.jobHeader}>
            <View style={styles.jobInfo}>
              <Text style={styles.jobName}>{item.name}</Text>
              <Text style={styles.jobSchedule}>{humanSchedule(item)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleButton, isPaused && styles.toggleButtonPaused]}
              onPress={() => handleToggle(item)}
            >
              {isPaused ? <Play size={14} color={Ghost.text.tertiary} /> : <Pause size={14} color={Ghost.accent.primary} />}
            </TouchableOpacity>
          </View>

          {nextRun && (
            <View style={styles.jobMeta}>
              <Clock size={12} color={Ghost.text.tertiary} />
              <Text style={styles.jobMetaText}>Next: {nextRun}</Text>
            </View>
          )}

          {item.run_count > 0 && (
            <View style={styles.jobMeta}>
              <CheckCircle size={12} color={Ghost.text.tertiary} />
              <Text style={styles.jobMetaText}>
                Ran {item.run_count} time{item.run_count !== 1 ? "s" : ""}
                {item.state.lastRunAtMs
                  ? ` · Last: ${formatRelativeTime(item.state.lastRunAtMs)}`
                  : ""}
              </Text>
            </View>
          )}

          {item.state.lastError && (
            <View style={styles.jobError}>
              <AlertCircle size={12} color={Ghost.status.error} />
              <Text style={styles.jobErrorText} numberOfLines={2}>
                {item.state.lastError}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.runNowButton}
            onPress={() => handleRunNow(item)}
          >
            <Play size={14} color={Ghost.accent.primary} />
            <Text style={styles.runNowText}>Run now</Text>
          </TouchableOpacity>
        </View>
      );
    },
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity</Text>
        <ConnectionPill
          connected={connectionState === "online"}
          degraded={connectionState === "syncing"}
        />
      </View>

      {/* Content */}
      {!config ? (
        <EmptyState
          icon={<Clock size={40} color={Ghost.text.tertiary} />}
          title="Not connected"
          subtitle="Connect to your Ghost to see activity."
        />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Ghost.accent.primary} size="large" />
        </View>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Clock size={40} color={Ghost.text.tertiary} />}
          title="No activity yet"
          subtitle="Ghost will start working for you once you set up scheduled tasks."
        />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.title}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.data.map((job) => (
                <View key={job.id}>{renderJob({ item: job })}</View>
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
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Space.md,
    paddingHorizontal: Space.xs,
  },
  jobCard: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
    padding: Space.lg,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  jobInfo: {
    flex: 1,
    gap: 2,
  },
  jobName: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  jobSchedule: {
    ...Type.subhead,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  toggleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Ghost.accent.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButtonPaused: {
    backgroundColor: Ghost.bg.sunken,
  },
  jobMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  jobMetaText: {
    ...Type.footnote,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
  },
  jobError: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  jobErrorText: {
    ...Type.footnote,
    fontFamily: FONT,
    color: Ghost.status.error,
    flex: 1,
  },
  runNowButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    marginTop: Space.xs,
  },
  runNowText: {
    ...Type.footnote,
    fontFamily: FONT,
    color: Ghost.accent.primary,
  },
});
