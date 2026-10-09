// Your Pod: the machine Ghost lives on. Health, updates, anything needing
// attention, and the web console's reset code. (Its models are in
// Intelligence, with choosing what Ghost thinks with.) The Pod is Ghost's local brain; the
// phone is a window into it, so there is no second, weaker Ghost here.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, View } from "react-native";
import { showDialog } from "@/lib/dialog";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostButton, StatusDot } from "@/components/ghost";
import { formatUptime } from "@/lib/format";
import { checkTitle } from "@/lib/models";
import {
  checkHealthInfo,
  fetchDoctorStatus,
  fetchPodUpdate,
  startPodUpdate,
  requestConsoleResetCode,
  type PodUpdate,
  fetchStats,
  type DoctorStatus,
  type PiStats,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import { EdgeScrollView } from "@/components/scroll-edge";

function fmtBytes(n?: number): string {
  if (!n) return "0 B";
  const gb = 1073741824;
  const mb = 1048576;
  if (n >= gb) return (n / gb).toFixed(1) + " GB";
  if (n >= mb) return Math.round(n / mb) + " MB";
  return Math.round(n / 1024) + " KB";
}

export default function PodScreen() {
  const router = useRouter();
  const { config, connectionState } = useGhostStore();
  const [version, setVersion] = useState<string | null>(null);
  const [uptime, setUptime] = useState<string | null>(null);
  const [stats, setStats] = useState<PiStats | null>(null);
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [update, setUpdate] = useState<PodUpdate | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    const [health, s, d] = await Promise.all([
      checkHealthInfo(config).catch(() => ({ ok: false, uptimeS: null as number | null })),
      fetchStats(config).catch(() => null),
      fetchDoctorStatus(config).catch(() => null),
    ]);
    setUnreachable(!health.ok && !s && !d);
    if (health.uptimeS != null) setUptime(formatUptime(health.uptimeS));
    else if (s?.uptime) setUptime(s.uptime);
    setVersion(s?.version ?? null);
    setStats(s);
    setDoctor(d);
    setLoading(false);
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadUpdate = useCallback(async () => {
    if (!config) return;
    setUpdate(await fetchPodUpdate(config).catch(() => null));
  }, [config]);

  useEffect(() => {
    void loadUpdate();
  }, [loadUpdate]);

  // While an update runs the Pod restarts, so the check fails for a while and
  // then succeeds on the new version; poll until it settles.
  useEffect(() => {
    if (!updating) return;
    const t = setInterval(async () => {
      if (!config) return;
      const u = await fetchPodUpdate(config).catch(() => null);
      if (u && !u.running) {
        setUpdate(u);
        setUpdating(false);
        void load(true);
      }
    }, 6000);
    return () => clearInterval(t);
  }, [updating, config, load]);

  const confirmUpdate = () => {
    if (!config || !update?.available) return;
    showDialog(
      `Update to ${update.available}?`,
      "Ghost restarts while it updates and is unavailable for a few minutes. Your memory and settings are kept.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Update",
          onPress: async () => {
            try {
              await startPodUpdate(config);
              setUpdating(true);
              setNote(null);
            } catch (e) {
              setNote(e instanceof Error ? e.message : "Couldn't start the update.");
            }
          },
        },
      ],
    );
  };

  const runDiagnostics = async () => {
    if (!config || diagRunning) return;
    setDiagRunning(true);
    const d = await fetchDoctorStatus(config).catch(() => null);
    if (d) setDoctor(d);
    setDiagRunning(false);
  };


  const attention = (doctor?.checks ?? []).filter((c) => c.status !== "ok");
  const loadRatio = stats?.load ? stats.load.one / (stats.cpu_count ?? 1) : 0;
  const loadWord = loadRatio < 0.5 ? "Idle" : loadRatio < 1 ? "Busy" : "Overloaded";

  if (!config) {
    return (
      <View style={styles.root}>
      <ScreenBackground variant="calm" />
        <ScreenHeader title="Your Pod" subtitle="Where Ghost runs: its health and updates" />
        <View style={styles.body}>
          <Text style={styles.lead}>
            Ghost runs on a small computer you own: your memory, permissions, and tools stay there. Connect yours to talk to it from anywhere.
          </Text>
          <GhostButton title="Scan QR code" onPress={() => router.push("/scan" as never)} />
          <GhostButton title="Enter manually" variant="secondary" onPress={() => router.push("/manual" as never)} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenBackground variant="calm" />
      <ScreenHeader
        title="Your Pod"
        subtitle={connectionState === "online" ? "Online" : connectionState === "syncing" ? "Reconnecting" : "Offline"}
      />
      <EdgeScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load(true);
              setRefreshing(false);
            }}
            tintColor={Ghost.text.tertiary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={Ghost.text.tertiary} style={{ marginTop: Space.xl }} />
        ) : unreachable ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Can&apos;t reach your Pod</Text>
            <Text style={styles.meta}>Messages you send will wait and go out when it&apos;s back.</Text>
            <GhostButton title="Try again" variant="secondary" onPress={() => void load()} />
          </View>
        ) : (
          <>
            <Text style={styles.group}>Health</Text>
            <View style={styles.card}>
              {(() => {
                // Only what the Pod actually reported; no rows of "Unknown".
                const rows = [
                  { label: "Version", value: version },
                  { label: "Running for", value: uptime },
                  { label: "Load", value: stats?.load ? loadWord : null, dot: (stats?.load ? (loadRatio < 0.5 ? "online" : loadRatio < 1 ? "warning" : "offline") : undefined) as "online" | "warning" | "offline" | undefined },
                  { label: "Memory", value: stats?.memory ? `${fmtBytes(stats.memory.used)} of ${fmtBytes(stats.memory.total)}` : null },
                  { label: "Storage", value: stats?.disk ? `${fmtBytes(stats.disk.used)} of ${fmtBytes(stats.disk.total)}` : null },
                  { label: "Address", value: stats?.hostname ?? stats?.ip ?? null },
                ].filter((r) => r.value);
                if (rows.length === 0) return <Text style={styles.meta}>Your Pod didn&apos;t report its health details.</Text>;
                return rows.map((r, i) => <Info key={r.label} label={r.label} value={r.value} dot={r.dot} last={i === rows.length - 1} />);
              })()}
            </View>

            <Text style={styles.group}>Updates</Text>
            <View style={styles.card}>
              {updating || update?.running ? (
                <>
                  <Text style={styles.cardTitle}>Updating your Pod</Text>
                  <Text style={styles.meta}>Ghost restarts when it finishes. This page updates on its own.</Text>
                  <ActivityIndicator color={Ghost.text.tertiary} />
                </>
              ) : update?.newer && update.available ? (
                <>
                  <Text style={styles.cardTitle}>{update.available} is available</Text>
                  <Text style={styles.meta}>You have {update.installed}.</Text>
                  {update.notes ? <Text style={styles.meta} numberOfLines={8}>{update.notes}</Text> : null}
                  <GhostButton title="Update" onPress={confirmUpdate} />
                </>
              ) : update?.check_failed ? (
                <Text style={styles.meta}>{update.check_failed}</Text>
              ) : update ? (
                <Text style={styles.meta}>Ghost is up to date ({update.installed}).</Text>
              ) : (
                <Text style={styles.meta}>Couldn&apos;t check for updates.</Text>
              )}
            </View>

            <Text style={styles.group}>Web console</Text>
            <View style={styles.card}>
              {resetCode ? (
                <>
                  <Text style={styles.meta}>Enter this on the console&apos;s sign-in page, under Forgot your password. It works once and lasts 10 minutes.</Text>
                  <Text selectable style={styles.code} accessibilityLabel={`Reset code ${resetCode.split("").join(" ")}`}>
                    {resetCode}
                  </Text>
                </>
              ) : (
                <Text style={styles.meta}>
                  Forgot the password for the web console? This phone can get you a one-time code to set a new one. No terminal needed.
                </Text>
              )}
              <GhostButton
                title={resetCode ? "Get a new code" : "Get a reset code"}
                variant="secondary"
                loading={resetBusy}
                disabled={resetBusy}
                onPress={async () => {
                  if (!config) return;
                  setResetBusy(true);
                  try {
                    const r = await requestConsoleResetCode(config);
                    setResetCode(r.code);
                    if (resetTimer.current) clearTimeout(resetTimer.current);
                    resetTimer.current = setTimeout(() => setResetCode(null), r.expiresIn * 1000);
                    setNote(null);
                  } catch (e) {
                    setNote(e instanceof Error ? e.message : "Couldn't get a reset code.");
                  } finally {
                    setResetBusy(false);
                  }
                }}
              />
            </View>

            <Text style={styles.group}>Needs attention</Text>
            <View style={styles.card}>
              {!doctor ? (
                <Text style={styles.meta}>Checks aren&apos;t available yet. Ghost may still be starting.</Text>
              ) : attention.length === 0 ? (
                <Text style={styles.meta}>Nothing. Every check passed.</Text>
              ) : (
                attention.map((c) => (
                  <View key={c.name} style={styles.check}>
                    <Text style={styles.cardTitle}>{checkTitle(c)}</Text>
                    <Text style={styles.meta}>{c.message}</Text>
                  </View>
                ))
              )}
              <GhostButton
                title={diagRunning ? "Checking" : "Check again"}
                variant="secondary"
                onPress={() => void runDiagnostics()}
                disabled={diagRunning}
                loading={diagRunning}
              />
            </View>
          </>
        )}

        {note ? <Text style={[styles.meta, { textAlign: "center", marginTop: Space.lg, paddingHorizontal: Space.xl }]} accessibilityLiveRegion="polite">{note}</Text> : null}
      </EdgeScrollView>
    </View>
  );
}

function Info({ label, value, dot, last }: { label: string; value: string | null | undefined; dot?: "online" | "warning" | "offline"; last?: boolean }) {
  return (
    <View style={[styles.info, !last && styles.infoDivider]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoRight}>
        {dot ? <StatusDot status={dot} /> : null}
        <Text style={styles.infoValue} numberOfLines={1}>{value && value.length > 0 ? value : "Unknown"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Ghost.bg.base },
  body: { paddingBottom: 96 },
  lead: { fontSize: 17, lineHeight: 25, fontWeight: "300", color: "rgba(255,255,255,0.78)", textAlign: "center", marginBottom: Space.sm, paddingHorizontal: Space.md },
  group: {
    fontSize: 11.5,
    fontWeight: "500",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Ghost.text.tertiary,
    marginTop: Space.lg,
    paddingHorizontal: Space.xl + 6,
    paddingBottom: Space.sm,
  },
  card: {
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 26,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    padding: Space.xl,
    marginHorizontal: Space.lg,
    gap: Space.sm,
  },
  cardTitle: { color: Ghost.text.primary, fontSize: 16.5, fontWeight: "500", letterSpacing: -0.2 },
  meta: { color: Ghost.text.secondary, fontSize: 14.5, lineHeight: 21, fontWeight: "300" },
  code: { color: Ghost.text.primary, fontFamily: Fonts.voice, fontSize: 44, lineHeight: 56, letterSpacing: 4, textAlign: "center", paddingVertical: Space.md, fontVariant: ["tabular-nums"] },
  check: { gap: 2, paddingBottom: Space.sm },
  info: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11 },
  infoDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  infoLabel: { fontSize: 15, color: Ghost.text.secondary, fontWeight: "300" },
  infoRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, marginLeft: Space.lg },
  infoValue: { fontSize: 15, color: Ghost.text.primary, fontWeight: "500", flexShrink: 1, textAlign: "right" },
});
