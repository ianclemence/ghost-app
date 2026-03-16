
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
import { Clock, Play, Pause, RefreshCw, AlertTriangle, RotateCcw, CheckCircle } from "lucide-react-native";

import {
  CronJob,
  fetchCronJobs,
  pauseCronJob,
  resumeCronJob,
  runCronJobNow,
} from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";
import { Colors, Fonts } from "@/constants/theme";

const C = Colors.dark;
const FONT_MONO = Fonts.mono;

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
    ? C.icon
    : job.state.lastStatus === "error"
      ? C.error
      : C.terminalGreen;

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
            { borderColor: statusColor, backgroundColor: isPaused ? 'transparent' : `${statusColor}20` },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {job.lifecycle_state.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        {job.payload.command ? (
          <Text style={styles.commandText} numberOfLines={2}>
            {job.payload.command}
          </Text>
        ) : null}
        <Text style={styles.statText}>
          Run: {job.run_count} • Last:{" "}
          {job.state.lastRunAtMs
            ? timeAgo(job.state.lastRunAtMs)
            : "Never"}
        </Text>
        {job.state.lastError ? (
          <Text style={[styles.statText, { color: C.error }]}>
            Error: {job.state.lastError}
          </Text>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.runBtn]}
          onPress={() => onAction(job.id, "run")}
        >
          <Play size={12} color={C.terminalGreen} style={{ marginRight: 6 }} />
          <Text style={styles.runBtnText}>RUN NOW</Text>
        </TouchableOpacity>

        {isPaused ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.resumeBtn]}
            onPress={() => onAction(job.id, "resume")}
          >
            <RotateCcw size={12} color={C.terminalGreen} style={{ marginRight: 6 }} />
            <Text style={styles.resumeBtnText}>RESUME</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.pauseBtn]}
            onPress={() => onAction(job.id, "pause")}
          >
            <Pause size={12} color={C.icon} style={{ marginRight: 6 }} />
            <Text style={styles.pauseBtnText}>PAUSE</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function CronScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
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
      if (action === "pause") {
        await pauseCronJob(config, id);
      } else if (action === "resume") {
        await resumeCronJob(config, id);
      } else {
        await runCronJobNow(config, id);
      }
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
        <Clock size={48} color={C.terminalGreen} style={{ marginBottom: 14 }} />
        <Text style={styles.noConfigTitle}>CRON OFFLINE</Text>
        <Text style={styles.noConfigSub}>Configure connection in Settings</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Clock size={20} color={C.terminalGreen} />
          <Text style={styles.headerTitle}>CRON_SCHEDULER</Text>
        </View>
        <TouchableOpacity onPress={loadJobs} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={C.terminalGreen} size="small" />
          ) : (
            <RefreshCw size={18} color={C.terminalGreen} />
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
            tintColor={C.terminalGreen}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>No active schedules found.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { justifyContent: "center", alignItems: "center", flex: 1 },
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
    fontFamily: FONT_MONO,
    fontSize: 16,
    fontWeight: "700",
    color: C.terminalGreen,
    letterSpacing: 1,
  },
  noConfigTitle: { color: C.terminalGreen, fontSize: 18, fontWeight: "700", fontFamily: FONT_MONO },
  noConfigSub: { color: C.icon, fontSize: 13, marginTop: 8, fontFamily: FONT_MONO },
  listContent: { padding: 16, gap: 16 },
  card: {
    backgroundColor: C.card,
    borderRadius: 0,
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
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
    fontFamily: FONT_MONO,
  },
  jobSchedule: {
    color: C.icon,
    fontSize: 11,
    fontFamily: FONT_MONO,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    fontFamily: FONT_MONO,
  },
  statsRow: {
    flexDirection: "column",
    gap: 6,
  },
  statText: {
    color: C.icon,
    fontSize: 11,
    fontFamily: FONT_MONO,
  },
  commandText: {
    color: C.text,
    fontSize: 11,
    fontFamily: FONT_MONO,
    backgroundColor: "#ffffff08",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 0,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    flexDirection: "row",
  },
  runBtn: {
    borderColor: C.terminalGreen,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  runBtnText: {
    color: C.terminalGreen,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_MONO,
  },
  pauseBtn: {
    borderColor: C.icon,
  },
  pauseBtnText: {
    color: C.icon,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_MONO,
  },
  resumeBtn: {
    borderColor: C.terminalGreen,
  },
  resumeBtnText: {
    color: C.terminalGreen,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_MONO,
  },
  emptyText: {
    color: C.icon,
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
    fontFamily: FONT_MONO,
  },
});
