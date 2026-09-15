// Ghost · Local — the phone as a Ghost runtime.
//
// One screen, two states. First run: a focused recommendation and a single
// download. After a model is active: management (models, storage, privacy).
// Deliberately no wizard: setup is one decision and one progress bar.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ghost, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { GhostButton, StatusDot } from "@/components/ghost";
import { useGhostStore } from "@/lib/store";
import { evaluate, formatBytes, inspectDevice, manifestNeed, type DeviceInfo } from "@/lib/local/devcap";
import { loadCatalog } from "@/lib/local/catalog";
import { isVerifiedPublisher, type ModelManifest } from "@/lib/local/registry";
import { modelManager, type ModelState, type StorageUsage } from "@/lib/local/modelManager";
import { mobileLocalRuntime } from "@/lib/local/localRuntime";
import type { Privacy } from "@/lib/local/planner";
import { baseURL, authHeaders } from "@/lib/ghostApi";

const PRIVACY_KEY = "ghost:privacy";

const VERDICT_LABEL: Record<string, string> = {
  compatible: "Recommended for this phone",
  compatible_not_recommended: "Works, but slow",
  incompatible: "Not supported on this phone",
  temporarily_unavailable: "Available again shortly",
};

function modelLabel(id: string): string {
  if (id.startsWith("ghost-mini")) return "Ghost Mini";
  if (id.startsWith("ghost-balanced")) return "Ghost Balanced";
  return id;
}

type Phase = "idle" | "downloading" | "verifying";

export default function LocalModelsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ firstRun?: string }>();
  const firstRun = params.firstRun === "1";
  const config = useGhostStore((s) => s.config);
  const setLocalReady = useGhostStore((s) => s.setLocalReady);

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [catalog, setCatalog] = useState<ModelManifest[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, ModelState>>({});
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [privacy, setPrivacy] = useState<Privacy>("balanced");
  const [health, setHealth] = useState<{ available: boolean; reason?: string } | null>(null);

  const pod = useMemo(
    () => (config ? { baseUrl: baseURL(config), headers: authHeaders(config) } : null),
    [config],
  );

  const refresh = useCallback(async () => {
    const d = await inspectDevice();
    setDevice(d);
    const stored = await AsyncStorage.getItem(PRIVACY_KEY);
    if (stored === "local_only" || stored === "balanced" || stored === "cloud_capable") setPrivacy(stored);
    setHealth(await mobileLocalRuntime.health());
    const models = await loadCatalog(pod);
    setCatalog(models);
    setActiveId(await modelManager.activeModelId());
    const next: Record<string, ModelState> = {};
    for (const m of models) next[m.id] = await modelManager.state(m);
    setStates(next);
    await modelManager.repair(models).catch(() => {});
    setStorage(await modelManager.storageUsage(models).catch(() => null));
  }, [pod]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

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

  const runSetup = async (m: ModelManifest) => {
    setBusy(m.id);
    setError(null);
    setProgress(0);
    try {
      // A verified artifact already on disk is never re-downloaded; setup just
      // finishes by loading and activating it.
      const alreadyInstalled = states[m.id]?.status === "installed" || states[m.id]?.status === "active";
      if (!alreadyInstalled) {
        setPhase("downloading");
        await modelManager.download(m, {
          onProgress: (w, t) => setProgress(t > 0 ? w / t : 0),
        });
      }
      setPhase("verifying");
      await modelManager.activate(m.id, catalog);
      setLocalReady(true);
      setActiveId(m.id);
      setPhase("idle");
      setProgress(0);
      if (firstRun) {
        // Setup complete. Land on Home — the same destination pairing uses —
        // where Ghost confirms it is running on this phone.
        router.replace("/(tabs)");
      } else {
        await refresh();
      }
    } catch (e) {
      setPhase("idle");
      setProgress(0);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const activate = async (m: ModelManifest) => {
    setBusy(m.id);
    setError(null);
    try {
      await modelManager.activate(m.id, catalog);
      setLocalReady(true);
      setActiveId(m.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m: ModelManifest) => {
    setBusy(m.id);
    try {
      await modelManager.remove(m);
      if (activeId === m.id) setLocalReady(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const setPrivacyMode = async (p: Privacy) => {
    setPrivacy(p);
    await AsyncStorage.setItem(PRIVACY_KEY, p);
  };

  // ─── First run: one recommendation, one action ─────────────────────────
  if (firstRun && !activeId) {
    const unavailable = health && !health.available;
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.firstRunBody} showsVerticalScrollIndicator={false}>
          <GhostText type="largeTitle" style={styles.title}>Set up Ghost</GhostText>
          <GhostText type="body" style={styles.sub}>
            Ghost runs on this phone. Download a model once, then it works without a connection.
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

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={[styles.firstRunBottom, { paddingBottom: insets.bottom + Space.xxl }]}>
          <TouchableOpacity onPress={() => router.replace("/connect")} activeOpacity={0.6}>
            <GhostText type="callout" style={styles.quiet}>Connect a Ghost Pod instead</GhostText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Manage: models, storage, privacy ──────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <GhostText type="largeTitle" style={styles.title}>Ghost · Local</GhostText>
        <Text style={styles.sub}>
          {health?.available
            ? activeId
              ? "Running on this phone"
              : "No model active"
            : (health?.reason ?? "Checking local runtime…")}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {evaluated.map(({ m, verdict }) => {
          const isActive = activeId === m.id;
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
              {verdict ? <Text style={styles.meta}>{VERDICT_LABEL[verdict.verdict] ?? verdict.verdict}{verdict.reason ? ` — ${verdict.reason}` : ""}</Text> : null}
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
                    {!isActive ? (
                      <GhostButton title="Use" onPress={() => activate(m)} disabled={loading} loading={loading} />
                    ) : null}
                    <GhostButton title="Remove" variant="danger" onPress={() => remove(m)} disabled={loading} />
                  </>
                ) : (
                  <GhostButton
                    title="Download"
                    onPress={() => runSetup(m)}
                    disabled={loading}
                    loading={loading}
                  />
                )}
              </View>
            </View>
          );
        })}

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
          {(["local_only", "balanced", "cloud_capable"] as Privacy[]).map((p) => (
            <GhostButton
              key={p}
              title={`${privacy === p ? "● " : "○ "}${p === "local_only" ? "Local only — never cloud" : p === "balanced" ? "Balanced — local first" : "Cloud capable"}`}
              variant={privacy === p ? "primary" : "secondary"}
              onPress={() => setPrivacyMode(p)}
            />
          ))}
        </View>
      </ScrollView>
      <PlusMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Ghost.bg.base },
  body: { padding: Space.edge, gap: Space.md, paddingBottom: 140 },
  firstRunBody: { paddingHorizontal: Space.xl, paddingTop: Space.section, gap: Space.lg },
  firstRunBottom: { alignItems: "center", paddingTop: Space.md },
  title: { color: Ghost.text.primary },
  sub: { color: Ghost.text.secondary, fontSize: 15, lineHeight: 21 },
  recommend: { color: Ghost.text.primary, fontSize: 14, fontWeight: "600" },
  card: { backgroundColor: Ghost.bg.raised, borderRadius: 14, padding: Space.lg, gap: Space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  cardTitle: { color: Ghost.text.primary, fontSize: 16, fontWeight: "600" },
  meta: { color: Ghost.text.secondary, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: Space.sm, marginTop: Space.xs },
  progressWrap: { gap: Space.sm },
  bar: { flexDirection: "row", height: 6, borderRadius: 3, backgroundColor: Ghost.border.default, overflow: "hidden" },
  fill: { backgroundColor: Ghost.text.primary },
  quiet: { color: Ghost.text.tertiary },
  error: { color: Ghost.status.error, fontSize: 13 },
});
