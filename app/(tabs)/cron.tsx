import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { controlCronJob, CronJob, fetchCronJobs } from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";

const C = {
  bg: "#080C0F",
  surface: "#0D1117",
  surface2: "#101820",
  border: "#1A2332",
  accent: "#00FF88",
  accentDim: "#00FF8818",
  text: "#C8D8E8",
  textDim: "#4A6080",
  textMuted: "#1E2E3E",
  danger: "#FF4455",
  warn: "#FFAA00",
  purple: "#AA88FF",
};

function timeAgo(date: number | string | Date): string {
  const seconds = Math.floor(
    (new Date().getTime() - new Date(date).getTime()) / 1000,
  );
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return Math.floor(seconds) + "s ago";
}

function JobCard({
  job,
  onAction,
}: {
  job: CronJob;
  onAction: (id: string, action: "pause" | "resume" | "run") => void;
}) {
  const isPaused = job.lifecycle_state === "paused";
  const statusColor = isPaused
    ? C.textDim
    : job.state.lastStatus === "error"
      ? C.danger
      : C.accent;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.jobName}>{job.name}</Text>
          <Text style={styles.jobSchedule}>
            {job.schedule.kind === "cron"
              ? `Cron: ${job.schedule.expr}`
              : job.schedule.kind === "every"
                ? `Every ${(job.schedule.everyMs ?? 0) / 1000}s`
                : `At ${new Date(job.schedule.atMs ?? 0).toLocaleString()}`}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { borderColor: statusColor, backgroundColor: statusColor + "20" },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {job.lifecycle_state.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statText}>
          Run: {job.run_count} • Last:{" "}
          {job.state.lastRunAtMs
            ? formatDistanceToNow(job.state.lastRunAtMs, { addSuffix: true })
            : "Never"}
        </Text>
        {job.state.lastError ? (
          <Text style={[styles.statText, { color: C.danger }]}>
            Error: {job.state.lastError}
          </Text>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.runBtn]}
          onPress={() => onAction(job.id, "run")}
        >
          <Text style={styles.runBtnText}>▶ RUN NOW</Text>
        </TouchableOpacity>

        {isPaused ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.resumeBtn]}
            onPress={() => onAction(job.id, "resume")}
          >
            <Text style={styles.resumeBtnText}>RESUME</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.pauseBtn]}
            onPress={() => onAction(job.id, "pause")}
          >
            <Text style={styles.pauseBtnText}>PAUSE</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function CronScreen() {
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadJobs = useCallback(async () => {
    if (!config) return;
    try {
      const list = await fetchCronJobs(config);
      setJobs(list);
    } catch (e) {
      console.warn("Failed to load jobs", e);
    }
  }, [config]);

  useEffect(() => {
    setLoading(true);
    loadJobs().finally(() => setLoading(false));
  }, [loadJobs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  };

  const handleAction = async (
    id: string,
    action: "pause" | "resume" | "run",
  ) => {
    if (!config) return;
    // Optimistic update
    const oldJobs = [...jobs];
    if (action !== "run") {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== id) return j;
          return {
            ...j,
            lifecycle_state: action === "pause" ? "paused" : "active",
          };
        }),
      );
    }

    try {
      await controlCronJob(config, id, action);
      if (action === "run") {
        Alert.alert("Success", "Job triggered successfully");
      }
      // Reload to get exact state
      setTimeout(loadJobs, 500);
    } catch (e: any) {
      Alert.alert("Error", e.message);
      setJobs(oldJobs); // Revert
    }
  };

  if (!config) {
    return (
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <Text style={{ fontSize: 40, marginBottom: 14 }}>⏰</Text>
        <Text style={styles.noConfigTitle}>Not connected</Text>
        <Text style={styles.noConfigSub}>Configure your Pi in ⚙️ Settings</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CRON JOBS</Text>
        <TouchableOpacity onPress={loadJobs} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={C.accent} size="small" />
          ) : (
            <Text style={{ color: C.accent, fontSize: 20 }}>↻</Text>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JobCard job={item} onAction={handleAction} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.accent}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>No cron jobs found.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 16,
    fontWeight: "700",
    color: C.accent,
    letterSpacing: 5,
  },
  noConfigTitle: { color: "#C8D8E8", fontSize: 18, fontWeight: "700" },
  noConfigSub: { color: "#4A6080", fontSize: 13, marginTop: 8 },
  listContent: { padding: 16, gap: 16 },
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  jobName: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  jobSchedule: {
    color: C.textDim,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: "column",
    gap: 4,
  },
  statText: {
    color: C.textMuted,
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  runBtn: {
    borderColor: C.accent,
    backgroundColor: C.accentDim,
  },
  runBtnText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  pauseBtn: {
    borderColor: C.textDim,
  },
  pauseBtnText: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: "700",
  },
  resumeBtn: {
    borderColor: C.accent,
  },
  resumeBtnText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  emptyText: {
    color: C.textDim,
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
  },
});
