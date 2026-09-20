// Ghost — where Ghost runs: this phone + your Pod.
//
// Merged from the old Ghost Local (phone Mini travel cache) and Ghost Pod
// (home hardware health) screens. One destination, three blocks in order:
// Status, This phone, Home Pod. The phone answers + collects offline; the
// Pod remains the only brain for routines, hardware, and durable memory.
// Pod-local Ollama models live here under Home Pod (hardware capacity),
// not under Intelligence (which model Ghost runs on).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { GhostButton, GhostInput, StatusDot } from "@/components/ghost";
import { formatUptime } from "@/lib/format";
import {
  authHeaders,
  baseURL,
  checkHealthInfo,
  fetchDoctorStatus,
  fetchOllamaModels,
  fetchStats,
  pullOllamaModel,
  switchModel,
  type DoctorStatus,
  type PiStats,
} from "@/lib/ghostApi";
import { downloadCompletionRate, getLocalMetrics, recordLocalMetric, type LocalMetrics } from "@/lib/local/metrics";
import { funnelSnapshot, getMilestones, type FunnelSnapshot } from "@/lib/onboarding-metrics";
import { useGhostStore } from "@/lib/store";
import { dismissFirstRun } from "@/lib/firstRun";
import { ensureNotificationPermission } from "@/lib/notify";
import { evaluate, formatBytes, inspectDevice, manifestNeed, type DeviceInfo } from "@/lib/local/devcap";
import { loadCatalog } from "@/lib/local/catalog";
import { SUPPORTED_PHONE_MODEL_IDS, isSupportedPhoneModel, isVerifiedPublisher, type ModelManifest } from "@/lib/local/registry";
import { modelManager, type ModelState, type StorageUsage } from "@/lib/local/modelManager";
import { mobileLocalRuntime } from "@/lib/local/localRuntime";
import type { Privacy } from "@/lib/local/planner";

const PRIVACY_KEY = "ghost:privacy";

const VERDICT_LABEL: Record<string, string> = {
  compatible: "Recommended for this phone",
  compatible_not_recommended: "Works, but slow",
  incompatible: "Not supported on this phone",
  temporarily_unavailable: "Available again shortly",
};

function modelLabel(id: string): string {
  if (id.startsWith("ghost-mini")) return "Ghost Mini";
  if (id.startsWith("ghost-balanced")) return "Ghost Balanced (legacy)";
  return id;
}

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

type Phase = "idle" | "downloading" | "verifying";

export default function GhostScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ firstRun?: string }>();
  const firstRun = params.firstRun === "1";
  const { config } = useGhostStore();
  const setLocalReady = useGhostStore((s) => s.setLocalReady);

  // ─── Pod state ──────────────────────────────────────────────────────
  const [version, setVersion] = useState("—");
  const [uptime, setUptime] = useState("—");
  const [stats, setStats] = useState<PiStats | null>(null);
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null);
  const [podLoading, setPodLoading] = useState(false);
  const [podRefreshing, setPodRefreshing] = useState(false);
  const [podError, setPodError] = useState<string | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [localMetrics, setLocalMetrics] = useState<LocalMetrics | null>(null);
  const [funnel, setFunnel] = useState<FunnelSnapshot | null>(null);

  // ─── Pod-local (Ollama) models ──────────────────────────────────────
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [installName, setInstallName] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<string | null>(null);
  const [ollamaBusy, setOllamaBusy] = useState<string | null>(null);

  // ─── Phone-local (Mini) state ───────────────────────────────────────
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [catalog, setCatalog] = useState<ModelManifest[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, ModelState>>({});
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [privacy, setPrivacy] = useState<Privacy>("balanced");
  const [health, setHealth] = useState<{ available: boolean; reason?: string } | null>(null);

  const pod = useMemo(
    () => (config ? { baseUrl: baseURL(config), headers: authHeaders(config) } : null),
    [config],
  );

  const loadPod = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setPodLoading(true);
    setPodError(null);
    try {
      const [healthInfo, s, d, m, ollama] = await Promise.all([
        checkHealthInfo(config),
        fetchStats(config).catch(() => null),
        fetchDoctorStatus(config),
        getLocalMetrics().catch(() => null),
        fetchOllamaModels(config).catch(() => [] as string[]),
      ]);
      setLocalMetrics(m);
      setFunnel(funnelSnapshot(await getMilestones().catch(() => ({}))));
      if (healthInfo.uptimeS != null) setUptime(formatUptime(healthInfo.uptimeS));
      else if (s?.uptime) setUptime(s.uptime);
      setVersion(s?.version ?? "—");
      setStats(s);
      setDoctor(d);
      setOllamaModels(ollama);
      if (!healthInfo.ok && !s && !d) setPodError("Ghost is unreachable right now.");
    } catch {
      setPodError("Ghost is unreachable right now.");
    }
    setPodLoading(false);
  }, [config]);

  const refreshLocal = useCallback(async () => {
    const d = await inspectDevice();
    setDevice(d);
    const stored = await AsyncStorage.getItem(PRIVACY_KEY);
    if (stored === "local_only" || stored === "balanced" || stored === "cloud_capable") setPrivacy(stored);
    setHealth(await mobileLocalRuntime.health());
    const models = await loadCatalog(pod, { includeLegacy: true });
    setCatalog(models);
    setActiveId(await modelManager.activeModelId());
    const next: Record<string, ModelState> = {};
    for (const m of models) next[m.id] = await modelManager.state(m);
    setStates(next);
    await modelManager.repair(models).catch(() => {});
    setStorage(await modelManager.storageUsage(models).catch(() => null));
  }, [pod]);

  useEffect(() => {
    loadPod().catch(() => {});
  }, [loadPod]);

  useEffect(() => {
    refreshLocal().catch(() => {});
  }, [refreshLocal]);

  const runDiagnostics = useCallback(async () => {
    if (!config || diagRunning) return;
    setDiagRunning(true);
    const d = await fetchDoctorStatus(config);
    if (d) setDoctor(d);
    setDiagRunning(false);
  }, [config, diagRunning]);

  const runSetup = async (m: ModelManifest) => {
    if (!isSupportedPhoneModel(m.id)) {
      setLocalError("Ghost Balanced is retired. Ghost Mini is the supported offline model. Remove Balanced to reclaim space.");
      return;
    }
    setBusy(m.id);
    setLocalError(null);
    setProgress(0);
    await recordLocalMetric("download_started").catch(() => undefined);
    try {
      const alreadyInstalled = states[m.id]?.status === "installed" || states[m.id]?.status === "active";
      if (!alreadyInstalled) {
        setPhase("downloading");
        await modelManager.download(m, {
          onProgress: (w, t) => setProgress(t > 0 ? w / t : 0),
        });
      }
      setPhase("verifying");
      await modelManager.activate(m.id, catalog);
      await recordLocalMetric("download_completed").catch(() => undefined);
      setLocalReady(true);
      setActiveId(m.id);
      setPhase("idle");
      setProgress(0);
      if (firstRun) {
        // Match the Pod path: offer notifications once, best-effort, without
        // blocking the first useful turn. Same shared ask as pairing success.
        await ensureNotificationPermission();
        router.replace("/(tabs)");
      } else {
        await refreshLocal();
      }
    } catch (e) {
      await recordLocalMetric("download_failed").catch(() => undefined);
      setPhase("idle");
      setProgress(0);
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const activate = async (m: ModelManifest) => {
    if (!isSupportedPhoneModel(m.id)) {
      setLocalError("Ghost Balanced is retired. Activate Ghost Mini instead.");
      return;
    }
    setBusy(m.id);
    setLocalError(null);
    try {
      await modelManager.activate(m.id, catalog);
      setLocalReady(true);
      setActiveId(m.id);
      await refreshLocal();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const cleanupLegacy = async () => {
    if (busy) return;
    Alert.alert("Remove legacy downloads?", "Retired Balanced files will be deleted. Ghost Mini is untouched.", [
      { text: "Keep them", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          setBusy("legacy-cleanup");
          setLocalError(null);
          try {
            const removed = await modelManager.cleanupLegacyModels(SUPPORTED_PHONE_MODEL_IDS);
            if (removed.length > 0) await recordLocalMetric("legacy_cleaned", removed.length).catch(() => undefined);
            if (activeId && !isSupportedPhoneModel(activeId)) {
              setLocalReady(false);
              setActiveId(null);
            }
            await refreshLocal();
          } catch (e) {
            setLocalError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const remove = async (m: ModelManifest) => {
    if (busy) return;
    Alert.alert("Remove this model?", `${modelLabel(m.id)} will be deleted from this phone. You'll need to download it again to use Ghost offline.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          setBusy(m.id);
          try {
            await modelManager.remove(m);
            if (activeId === m.id) setLocalReady(false);
            await refreshLocal();
          } catch (e) {
            setLocalError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const setPrivacyMode = async (p: Privacy) => {
    setPrivacy(p);
    await AsyncStorage.setItem(PRIVACY_KEY, p);
  };

  const doOllamaInstall = async () => {
    if (!config || installing) return;
    const name = installName.trim();
    if (!name) return;
    setInstalling(true);
    setInstallResult(null);
    try {
      await pullOllamaModel(config, name);
      setInstallResult("Download started. This can take a while.");
      setInstallName("");
    } catch {
      setInstallResult("Could not start download.");
    }
    setInstalling(false);
  };

  const useOllamaModel = async (name: string) => {
    if (!config || ollamaBusy) return;
    setOllamaBusy(name);
    try {
      await switchModel(config, `ollama:${name}`);
    } catch {
      setInstallResult("Couldn't switch. Still on the current model.");
    }
    setOllamaBusy(null);
  };

  const evaluated = useMemo(
    () => catalog.map((m) => ({ m, verdict: device ? evaluate(device, manifestNeed(m)) : null })),
    [catalog, device],
  );

  const recommended = useMemo(() => {
    const bySize = (a: { m: ModelManifest }, b: { m: ModelManifest }) => a.m.size_bytes - b.m.size_bytes;
    const ready = evaluated.filter((x) => x.verdict?.verdict === "compatible").sort(bySize);
    if (ready[0]) return ready[0];
    const ok = evaluated.filter((x) => x.verdict?.verdict === "compatible_not_recommended").sort(bySize);
    return ok[0] ?? null;
  }, [evaluated]);

  const loadRatio = stats?.load ? stats.load.one / (stats.cpu_count ?? 1) : 0;
  const loadState: "online" | "warning" | "offline" =
    loadRatio < 0.5 ? "online" : loadRatio < 1 ? "warning" : "offline";
  const loadLabel = loadRatio < 0.5 ? "Idle" : loadRatio < 1 ? "Loaded" : "Overloaded";
  const attention = (doctor?.checks ?? []).filter((c) => c.status !== "ok");

  // ─── First run: one recommendation, one action ───────────────────────
  if (firstRun && !activeId) {
    const unavailable = health && !health.available;
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.firstRunBody} showsVerticalScrollIndicator={false}>
          <GhostText type="largeTitle" style={styles.title}>Set up Ghost</GhostText>
          <GhostText type="body" style={styles.sub}>
            Download Ghost Mini once. Chat and note-taking work offline. Routines, home control, and full memory stay on your Pod.
          </GhostText>

          {unavailable ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>On-device models aren’t available in this build</Text>
              <Text style={styles.meta}>{health?.reason ?? "Use a development build to run models locally."}</Text>
            </View>
          ) : !device ? (
            <View style={styles.card}>
              <ActivityIndicator />
              <Text style={styles.meta}>Checking what this phone can run…</Text>
            </View>
          ) : !recommended ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>This phone can’t run a local model</Text>
              <Text style={styles.meta}>
                Connect a Ghost Pod to use Ghost on this phone.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{modelLabel(recommended.m.id)}</Text>
              <Text style={styles.recommend}>{VERDICT_LABEL[recommended.verdict!.verdict] ?? recommended.verdict!.verdict}</Text>
              <Text style={styles.meta}>
                {recommended.m.size_estimated ? "~" : ""}{formatBytes(recommended.m.size_bytes)} · {recommended.m.quantization}
              </Text>
              <Text style={styles.meta}>Runs entirely on this device after download.</Text>
              {recommended.verdict!.reason ? <Text style={styles.meta}>{recommended.verdict!.reason}</Text> : null}

              {phase !== "idle" ? (
                <View style={styles.progressWrap}>
                  <View style={styles.bar}>
                    <View style={[styles.fill, { flex: Math.max(0.02, progress) }]} />
                    <View style={{ flex: 1 - Math.min(1, progress) }} />
                  </View>
                  <Text style={styles.meta}>
                    {phase === "verifying" ? "Verifying…" : `Downloading… ${Math.round(progress * 100)}%`}
                  </Text>
                </View>
              ) : (
                <GhostButton
                  title={states[recommended.m.id]?.status === "installed" ? "Finish setup" : "Download"}
                  onPress={() => runSetup(recommended.m)}
                  disabled={busy === recommended.m.id}
                  loading={busy === recommended.m.id}
                  fullWidth
                />
              )}
            </View>
          )}

          {localError ? <Text style={styles.error}>{localError}</Text> : null}
        </ScrollView>

        <View style={[styles.firstRunBottom, { paddingBottom: insets.bottom + Space.xxl }]}>
          <TouchableOpacity onPress={() => router.replace("/connect")} activeOpacity={0.6} style={styles.quietHit} accessibilityRole="button">
            <GhostText type="callout" style={styles.quiet}>Connect a Ghost Pod instead</GhostText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await dismissFirstRun();
              router.replace("/(tabs)");
            }}
            activeOpacity={0.6}
            style={styles.quietHit}
            accessibilityRole="button"
          >
            <GhostText type="footnote" style={styles.quiet}>Continue without a model</GhostText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Manage: status, this phone, home Pod ───────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">Ghost</GhostText>
        <GhostText type="subhead" style={styles.sub}>This phone + your Pod.</GhostText>
      </View>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={podRefreshing}
            onRefresh={async () => {
              setPodRefreshing(true);
              await Promise.all([loadPod(true), refreshLocal().catch(() => {})]);
              setPodRefreshing(false);
            }}
            tintColor={Ghost.text.primary}
          />
        }
      >
        <GhostText type="caption" style={styles.group}>Status</GhostText>
        {!config ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Not connected</Text>
            <Text style={styles.meta}>Connect a Ghost Pod to see its health. This phone still works offline with Ghost Mini.</Text>
            <View style={styles.actions}>
              <GhostButton title="Connect a Ghost Pod" onPress={() => router.push("/connect")} />
            </View>
          </View>
        ) : podLoading ? (
          <View style={styles.card}>
            <ActivityIndicator color={Ghost.text.primary} />
          </View>
        ) : podError && !stats && !doctor ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ghost is unreachable</Text>
            <Text style={styles.meta}>Check your connection and try again.</Text>
            <View style={styles.actions}>
              <GhostButton title="Retry" variant="secondary" onPress={() => loadPod()} />
            </View>
          </View>
        ) : (
          <>
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
          </>
        )}

        <GhostText type="caption" style={styles.group}>This phone</GhostText>
        <Text style={styles.sectionDesc}>
          {health?.available
            ? activeId
              ? "Running on this phone"
              : "No model active"
            : (health?.reason ?? "Checking local runtime…")}
        </Text>
        {localError ? <Text style={styles.error}>{localError}</Text> : null}
        {evaluated.map(({ m, verdict }) => {
          const isActive = activeId === m.id;
          const supported = isSupportedPhoneModel(m.id);
          const status = states[m.id]?.status ?? "not_installed";
          const installed = status === "active" || status === "installed";
          const loading = busy === m.id;
          return (
            <View key={m.id} style={styles.card}>
              <View style={styles.row}>
                <StatusDot status={isActive ? "online" : "offline"} />
                <Text style={styles.cardTitle}>{modelLabel(m.id)}</Text>
              </View>
              <Text style={styles.meta}>
                {m.size_estimated ? "~" : ""}{formatBytes(m.size_bytes)} · {m.quantization} · v{m.version}
              </Text>
              {!supported ? (
                <Text style={styles.meta}>Legacy, retired. Remove to reclaim space; Mini is the supported offline model.</Text>
              ) : verdict ? <Text style={styles.meta}>{VERDICT_LABEL[verdict.verdict] ?? verdict.verdict}{verdict.reason ? `: ${verdict.reason}` : ""}</Text> : null}
              <Text style={styles.meta}>
                {isVerifiedPublisher(m) ? "Signed publisher" : "HTTPS · hash pinned on install"}
              </Text>
              {phase !== "idle" && busy === m.id ? (
                <View style={styles.bar}>
                  <View style={[styles.fill, { flex: Math.max(0.02, progress) }]} />
                  <View style={{ flex: 1 - Math.min(1, progress) }} />
                </View>
              ) : null}
              <View style={styles.actions}>
                {installed ? (
                  <>
                    {!isActive && supported ? (
                      <GhostButton title="Use" onPress={() => activate(m)} disabled={loading} loading={loading} />
                    ) : null}
                    <GhostButton title="Remove" variant="danger" onPress={() => remove(m)} disabled={loading} />
                  </>
                ) : supported ? (
                  <GhostButton
                    title="Download"
                    onPress={() => runSetup(m)}
                    disabled={loading}
                    loading={loading}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Legacy downloads</Text>
          <Text style={styles.meta}>Retired Balanced files can be reclaimed in one tap. Mini is untouched.</Text>
          <View style={styles.actions}>
            <GhostButton title="Remove legacy downloads" onPress={cleanupLegacy} disabled={busy === "legacy-cleanup"} loading={busy === "legacy-cleanup"} />
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Storage</Text>
          {storage ? (
            <Text style={styles.meta}>
              Models {formatBytes(storage.appPrivateModels)} · Temporary {formatBytes(storage.modelCache)}
            </Text>
          ) : (
            <Text style={styles.meta}>Not measured yet.</Text>
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Privacy</Text>
          <Text style={styles.meta}>This decides first, before the Intelligence toggles. Local only keeps everything on your devices.</Text>
          {(["local_only", "balanced", "cloud_capable"] as Privacy[]).map((p) => (
            <GhostButton
              key={p}
              title={`${privacy === p ? "● " : "○ "}${p === "local_only" ? "Local only: never cloud" : p === "balanced" ? "Balanced: local first" : "Cloud capable"}`}
              variant={privacy === p ? "primary" : "secondary"}
              onPress={() => setPrivacyMode(p)}
            />
          ))}
        </View>
        {(() => {
          const phone = localMetrics?.phone_turns ?? 0;
          const podTurns = localMetrics?.pod_turns ?? 0;
          const rate = localMetrics ? downloadCompletionRate(localMetrics) : null;
          const remembered = localMetrics?.remember_captures ?? 0;
          const synced = localMetrics?.remember_sync_confirmed ?? 0;
          return (
            <>
              <InfoRow label="Phone answers" value={String(phone)} />
              <InfoRow label="Pod answers" value={String(podTurns)} />
              <InfoRow label="Notes saved offline" value={`${remembered} · synced ${synced}`} />
              <InfoRow
                label="Mini downloads"
                value={rate == null ? "—" : `${Math.round(rate * 100)}% completed`}
              />
            </>
          );
        })()}

        {config ? (
          <>
            <GhostText type="caption" style={styles.group}>Home Pod</GhostText>
            <GhostText type="caption" style={styles.group}>Diagnostics</GhostText>
            {diagRunning ? (
              <View style={styles.card}>
                <Text style={styles.meta}>Running diagnostics…</Text>
              </View>
            ) : !doctor ? (
              <View style={styles.card}>
                <Text style={styles.meta}>Diagnostics unavailable. Ghost may be starting.</Text>
              </View>
            ) : attention.length > 0 ? (
              attention.map((c) => (
                <View key={c.name} style={styles.card}>
                  <Text style={styles.cardTitle}>{c.name}</Text>
                  <Text style={styles.meta}>{c.message}</Text>
                </View>
              ))
            ) : (
              <View style={styles.card}>
                <Text style={styles.meta}>Everything looks good. No attention items right now.</Text>
              </View>
            )}
            <View style={styles.actions}>
              <GhostButton
                title={diagRunning ? "Running…" : "Run diagnostics"}
                variant="secondary"
                onPress={() => void runDiagnostics()}
                disabled={diagRunning}
                loading={diagRunning}
              />
            </View>

            <GhostText type="caption" style={styles.group}>Pod AI models</GhostText>
            <Text style={styles.meta}>Installed on your Pod via Ollama. Phone Mini is managed above.</Text>
            {ollamaModels.length === 0 ? (
              <Text style={styles.meta}>No Pod models installed yet.</Text>
            ) : ollamaModels.map((m) => (
              <View key={m} style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>{m}</Text>
                </View>
                <Text style={styles.meta}>On your Pod</Text>
                <View style={styles.actions}>
                  <GhostButton
                    title="Use"
                    variant="secondary"
                    onPress={() => void useOllamaModel(m)}
                    disabled={ollamaBusy === m}
                    loading={ollamaBusy === m}
                  />
                </View>
              </View>
            ))}
            <View style={styles.installRow}>
              <View style={styles.installInput}>
                <GhostInput
                  value={installName}
                  onChangeText={setInstallName}
                  placeholder="Model name (e.g. qwen3:8b)"
                />
              </View>
              <GhostButton title="Install" variant="secondary" onPress={() => void doOllamaInstall()} disabled={installing || installName.trim() === ""} loading={installing} />
            </View>
            {installResult ? <Text style={styles.meta}>{installResult}</Text> : null}

            <GhostText type="caption" style={styles.group}>Getting started</GhostText>
            {(() => {
              const f = funnel;
              const fmt = (ms: number | null) =>
                ms == null ? "—" : ms < 60000 ? "under a minute" : ms < 3600000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 3600000)} h`;
              return (
                <>
                  <InfoRow label="First routine working" value={f == null ? "—" : f.gotFirstRoutine ? fmt(f.msToFirstRoutine) : "not yet"} />
                  <InfoRow label="First standing grant" value={f == null ? "—" : f.gotFirstGrant ? fmt(f.msToFirstGrant) : "not yet"} />
                </>
              );
            })()}
          </>
        ) : null}
      </ScrollView>
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
  root: { flex: 1, backgroundColor: Ghost.bg.base },
  header: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  title: { ...Type.largeTitle, color: Ghost.text.primary },
  sub: { ...Type.subhead, color: Ghost.text.secondary, marginTop: 2 },
  body: { paddingHorizontal: Space.xl, gap: Space.md, paddingBottom: Space.huge + Space.edge },
  firstRunBody: { paddingHorizontal: Space.xl, paddingTop: Space.section, gap: Space.lg },
  firstRunBottom: { alignItems: "center", paddingTop: Space.md },
  quietHit: { minHeight: 44, justifyContent: "center", paddingVertical: Space.sm },
  group: {
    color: Ghost.text.tertiary,
    textTransform: "uppercase",
    marginBottom: Space.sm,
    marginTop: Space.lg,
  },
  sectionDesc: { color: Ghost.text.secondary, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: Ghost.bg.raised, borderRadius: 14, padding: Space.lg, gap: Space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  cardTitle: { color: Ghost.text.primary, fontSize: 16, fontWeight: "600" },
  recommend: { color: Ghost.text.primary, fontSize: 14, fontWeight: "600" },
  meta: { color: Ghost.text.secondary, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: Space.sm, marginTop: Space.xs },
  progressWrap: { gap: Space.sm },
  bar: { flexDirection: "row", height: 6, borderRadius: 3, backgroundColor: Ghost.border.default, overflow: "hidden" },
  fill: { backgroundColor: Ghost.text.primary },
  quiet: { color: Ghost.text.tertiary },
  error: { color: Ghost.status.error, fontSize: 13 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.md + 2,
  },
  infoLabel: { color: Ghost.text.secondary },
  infoValue: { color: Ghost.text.primary, flexShrink: 1, textAlign: "right", marginLeft: Space.lg },
  loadValue: { flexShrink: 1, alignItems: "flex-end", gap: 2, marginLeft: Space.lg },
  loadTop: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  loadLabel: { color: Ghost.text.primary },
  loadSub: { color: Ghost.text.secondary },
  installRow: { flexDirection: "row", alignItems: "center", gap: Space.md, marginTop: Space.md },
  installInput: { flex: 1 },
});
