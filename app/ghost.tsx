// Your Pod: the machine Ghost lives on. Health, anything needing attention,
// and the AI models installed on it. The Pod is Ghost's local brain; the
// phone is a window into it, so there is no second, weaker Ghost here.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { GhostButton, GhostInput, StatusDot } from "@/components/ghost";
import { formatUptime } from "@/lib/format";
import {
  checkHealthInfo,
  fetchDoctorStatus,
  fetchOllamaModels,
  fetchPodUpdate,
  startPodUpdate,
  requestConsoleResetCode,
  type PodUpdate,
  fetchStats,
  pullOllamaModel,
  switchModel,
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
  const [models, setModels] = useState<string[]>([]);
  const [installName, setInstallName] = useState("");
  const [installing, setInstalling] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [update, setUpdate] = useState<PodUpdate | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    const [health, s, d, m] = await Promise.all([
      checkHealthInfo(config).catch(() => ({ ok: false, uptimeS: null as number | null })),
      fetchStats(config).catch(() => null),
      fetchDoctorStatus(config).catch(() => null),
      fetchOllamaModels(config).catch(() => [] as string[]),
    ]);
    setUnreachable(!health.ok && !s && !d);
    if (health.uptimeS != null) setUptime(formatUptime(health.uptimeS));
    else if (s?.uptime) setUptime(s.uptime);
    setVersion(s?.version ?? null);
    setStats(s);
    setDoctor(d);
    setModels(m);
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
    Alert.alert(
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

  const install = async () => {
    const name = installName.trim();
    if (!config || installing || !name) return;
    setInstalling(true);
    setNote(null);
    try {
      await pullOllamaModel(config, name);
      setNote(`Downloading ${name} to your Pod. This can take a while.`);
      setInstallName("");
    } catch {
      setNote("Couldn't start that download. Check the model name.");
    }
    setInstalling(false);
  };

  const use = async (name: string) => {
    if (!config || busyModel) return;
    setBusyModel(name);
    try {
      await switchModel(config, `ollama:${name}`);
      setNote(`Ghost now thinks with ${name}, on your Pod.`);
    } catch {
      setNote("Couldn't switch. Ghost is still on its current model.");
    }
    setBusyModel(null);
  };

  const attention = (doctor?.checks ?? []).filter((c) => c.status !== "ok");
  const loadRatio = stats?.load ? stats.load.one / (stats.cpu_count ?? 1) : 0;
  const loadWord = loadRatio < 0.5 ? "Idle" : loadRatio < 1 ? "Busy" : "Overloaded";

  if (!config) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Your Pod" subtitle="The machine Ghost lives on" />
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
                    <Text style={styles.cardTitle}>{c.name}</Text>
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

        <Text style={styles.group}>Models on your Pod</Text>
        <Text style={styles.meta}>
          Models installed here answer without anything leaving your Pod. Cloud models are set in Intelligence.
        </Text>
        <View style={styles.card}>
          {models.length === 0 ? (
            <Text style={styles.meta}>None installed yet.</Text>
          ) : (
            models.map((m) => (
              <View key={m} style={styles.modelRow}>
                <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={1}>{m}</Text>
                <GhostButton title="Use" variant="secondary" onPress={() => void use(m)} disabled={busyModel !== null} loading={busyModel === m} />
              </View>
            ))
          )}
          <View style={styles.installRow}>
            <View style={{ flex: 1 }}>
              <GhostInput value={installName} onChangeText={setInstallName} placeholder="Add a model, e.g. qwen3:8b" />
            </View>
            <GhostButton title="Add" variant="secondary" onPress={() => void install()} disabled={installing || installName.trim() === ""} loading={installing} />
          </View>
          {note ? <Text style={styles.meta} accessibilityLiveRegion="polite">{note}</Text> : null}
        </View>
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
  body: { paddingHorizontal: Space.xl, gap: Space.md, paddingBottom: Space.huge },
  lead: { fontSize: 16, lineHeight: 23, color: Ghost.text.secondary, marginBottom: Space.sm },
  group: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Ghost.text.tertiary,
    marginTop: Space.lg,
  },
  card: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: Space.lg,
    gap: Space.sm,
  },
  cardTitle: { color: Ghost.text.primary, fontSize: 16, fontWeight: "600" },
  meta: { color: Ghost.text.secondary, fontSize: 14, lineHeight: 20 },
  code: { color: Ghost.text.primary, fontSize: 30, fontWeight: "700", letterSpacing: 3, textAlign: "center", paddingVertical: Space.md, fontVariant: ["tabular-nums"] },
  check: { gap: 2, paddingBottom: Space.sm },
  info: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  infoDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  infoLabel: { fontSize: 15, color: Ghost.text.secondary },
  infoRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, marginLeft: Space.lg },
  infoValue: { fontSize: 15, color: Ghost.text.primary, flexShrink: 1, textAlign: "right" },
  modelRow: { flexDirection: "row", alignItems: "center", gap: Space.md },
  installRow: { flexDirection: "row", alignItems: "center", gap: Space.md, marginTop: Space.xs },
});
