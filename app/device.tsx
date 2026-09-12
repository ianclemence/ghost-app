import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { GhostButton, StatusDot } from "@/components/ghost";
import { formatUptime } from "@/lib/format";
import {
  checkHealthInfo,
  fetchDoctorStatus,
  fetchStats,
  type DoctorStatus,
  type PiStats,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

function fmtBytes(n?: number): string {
  if (!n) return "0 B";
  const gb = 1073741824;
  const mb = 1048576;
  if (n >= gb) return (n / gb).toFixed(1) + " GB";
  if (n >= mb) return Math.round(n / mb) + " MB";
  return Math.round(n / 1024) + " KB";
}

function fmtGB(n?: number): string {
  if (!n) return "0";
  return String(Math.round(n / 1073741824));
}

export default function DeviceScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [version, setVersion] = useState("—");
  const [uptime, setUptime] = useState("—");
  const [stats, setStats] = useState<PiStats | null>(null);
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [health, s, d] = await Promise.all([
        checkHealthInfo(config),
        fetchStats(config).catch(() => null),
        fetchDoctorStatus(config),
      ]);
      if (health.uptimeS != null) setUptime(formatUptime(health.uptimeS));
      else if (s?.uptime) setUptime(s.uptime);
      setVersion(s?.version ?? "—");
      setStats(s);
      setDoctor(d);
      if (!health.ok && !s && !d) setError("Ghost is unreachable right now.");
    } catch {
      setError("Ghost is unreachable right now.");
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const runDiagnostics = useCallback(async () => {
    if (!config || diagRunning) return;
    setDiagRunning(true);
    const d = await fetchDoctorStatus(config);
    if (d) setDoctor(d);
    setDiagRunning(false);
  }, [config, diagRunning]);

  const loadRatio = stats?.load ? stats.load.one / (stats.cpu_count ?? 1) : 0;
  const loadState: "online" | "warning" | "offline" =
    loadRatio < 0.5 ? "online" : loadRatio < 1 ? "warning" : "offline";
  const loadLabel = loadRatio < 0.5 ? "Idle" : loadRatio < 1 ? "Loaded" : "Overloaded";
  const attention = (doctor?.checks ?? []).filter((c) => c.status !== "ok");

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">Ghost Pod</GhostText>
        <GhostText type="subhead" style={styles.sub}>The hardware your Ghost runs on.</GhostText>
      </View>
      {!config ? (
        <View style={styles.center}>
          <Text style={styles.emptyHello}>
            <Text style={styles.emptyInk}>Not connected. </Text>
            <Text style={styles.emptyMuted}>Connect to see device health.</Text>
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={Ghost.text.primary} size="large" /></View>
      ) : error && !stats && !doctor ? (
        <View style={styles.center}>
          <Text style={styles.emptyHello}>
            <Text style={styles.emptyInk}>Ghost is unreachable. </Text>
            <Text style={styles.emptyMuted}>Check your connection and try again.</Text>
          </Text>
          <TouchableOpacity onPress={() => load()} hitSlop={12} accessibilityLabel="Retry loading device">
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.text.primary} />}
        >
          <GhostText type="caption" style={styles.group}>System</GhostText>
          <InfoRow label="Version" value={version} />
          <InfoRow label="Uptime" value={uptime} />
          <InfoRow
            label="Address"
            value={stats ? `${stats.ip ?? "—"}${stats.hostname ? ` (${stats.hostname})` : ""}` : "—"}
          />
          <InfoRow label="CPU" value={stats?.cpu_percent != null ? `${Math.round(stats.cpu_percent)}%` : "—"} />
          <InfoRow label="Memory" value={stats?.memory ? `${fmtBytes(stats.memory.used)} / ${fmtBytes(stats.memory.total)}` : "—"} />
          <InfoRow label="Storage" value={stats?.disk ? `${fmtGB(stats.disk.used)} GB / ${fmtGB(stats.disk.total)} GB` : "—"} />
          <View style={styles.infoRow}>
            <GhostText type="caption" style={styles.infoLabel}>Load</GhostText>
            <View style={styles.loadValue}>
              <View style={styles.loadTop}>
                <StatusDot status={loadState} />
                <GhostText type="body" style={styles.loadLabel}>{stats?.load ? loadLabel : "—"}</GhostText>
              </View>
              {stats?.load ? (
                <GhostText type="caption" style={styles.loadSub}>
                  {`${stats.load.one.toFixed(2)} / ${stats.load.five.toFixed(2)} / ${stats.load.fifteen.toFixed(2)} · ${stats.cpu_count ?? 1} core${(stats.cpu_count ?? 1) > 1 ? "s" : ""}`}
                </GhostText>
              ) : null}
            </View>
          </View>

          <GhostText type="caption" style={styles.group}>Diagnostics</GhostText>
          {diagRunning ? (
            <View style={styles.diagEmpty}>
              <Text style={styles.emptyHello}>
                <Text style={styles.emptyMuted}>Running diagnostics…</Text>
              </Text>
            </View>
          ) : !doctor ? (
            <View style={styles.diagEmpty}>
              <Text style={styles.emptyHello}>
                <Text style={styles.emptyInk}>Diagnostics unavailable. </Text>
                <Text style={styles.emptyMuted}>Ghost may be starting.</Text>
              </Text>
            </View>
          ) : attention.length > 0 ? (
            attention.map((c) => (
              <View key={c.name} style={styles.check}>
                <GhostText type="headline" style={styles.rowTitle}>{c.name}</GhostText>
                <GhostText type="subhead" style={styles.rowSub}>{c.message}</GhostText>
              </View>
            ))
          ) : (
            <View style={styles.diagEmpty}>
              <Text style={styles.emptyHello}>
                <Text style={styles.emptyInk}>Everything looks good. </Text>
                <Text style={styles.emptyMuted}>No attention items right now.</Text>
              </Text>
            </View>
          )}
          <View style={styles.diagBtnWrap}>
            <GhostButton
              title={diagRunning ? "Running…" : "Run diagnostics"}
              variant="secondary"
              onPress={() => void runDiagnostics()}
              disabled={diagRunning}
              loading={diagRunning}
              style={{ alignSelf: "center" }}
            />
          </View>
        </ScrollView>
      )}
      <PlusMenu />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.infoRow}>
      <GhostText type="caption" style={styles.infoLabel}>{label}</GhostText>
      <GhostText type="body" style={styles.infoValue}>{value && value.length > 0 ? value : "—"}</GhostText>
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
  },
  group: {
    color: Ghost.text.tertiary,
    textTransform: "uppercase",
    marginBottom: Space.sm,
    marginTop: Space.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.md + 2,
  },
  infoLabel: {
    color: Ghost.text.secondary,
  },
  infoValue: {
    color: Ghost.text.primary,
    flexShrink: 1,
    textAlign: "right",
    marginLeft: Space.lg,
  },
  loadValue: {
    flexShrink: 1,
    alignItems: "flex-end",
    gap: 2,
    marginLeft: Space.lg,
  },
  loadTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  loadLabel: {
    color: Ghost.text.primary,
  },
  loadSub: {
    color: Ghost.text.secondary,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowSub: {
    color: Ghost.text.secondary,
  },
  check: {
    gap: 2,
    paddingVertical: Space.md + 2,
  },
  diagEmpty: {
    alignItems: "center",
    paddingVertical: Space.xl,
    paddingHorizontal: Space.md,
  },
  diagBtnWrap: {
    alignItems: "center",
    marginTop: Space.md,
  },
});
