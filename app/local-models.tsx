// Ghost · Local — on-device intelligence: recommended model, download with
// progress, activation, switching, removal, storage accounting, privacy mode,
// and runtime health. Models are data from the Pod catalog, never invented.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ghost, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { GhostButton, StatusDot } from "@/components/ghost";
import { useGhostStore } from "@/lib/store";
import { evaluate, formatBytes, inspectDevice, type DeviceInfo } from "@/lib/local/devcap";
import { fetchCatalog, isVerifiedPublisher, type ModelManifest } from "@/lib/local/registry";
import { modelManager, type ModelState } from "@/lib/local/modelManager";
import { mobileLocalRuntime } from "@/lib/local/localRuntime";
import type { Privacy } from "@/lib/local/planner";
import { baseURL, authHeaders } from "@/lib/ghostApi";

const PRIVACY_KEY = "ghost:privacy";

const VERDICT_LABEL: Record<string, string> = {
  compatible: "Ready for this phone",
  compatible_not_recommended: "Works, but slow",
  incompatible: "Not supported",
  temporarily_unavailable: "Try again later",
};

export default function LocalModelsScreen() {
  const insets = useSafeAreaInsets();
  const config = useGhostStore((s) => s.config);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [catalog, setCatalog] = useState<ModelManifest[]>([]);
  const [states, setStates] = useState<Record<string, ModelState>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [privacy, setPrivacy] = useState<Privacy>("balanced");
  const [health, setHealth] = useState<{ available: boolean; reason?: string; loadedModel?: string } | null>(null);
  const [storage, setStorage] = useState<{ appPrivateModels: number; modelCache: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const d = await inspectDevice();
      setDevice(d);
      const p = await AsyncStorage.getItem(PRIVACY_KEY);
      if (p === "local_only" || p === "balanced" || p === "cloud_capable") setPrivacy(p);
      setHealth(await mobileLocalRuntime.health());
      if (config) {
        const cat = await fetchCatalog(baseURL(config), authHeaders(config));
        setCatalog(cat.models);
        const next: Record<string, ModelState> = {};
        for (const m of cat.models) next[m.id] = await modelManager.state(m);
        setStates(next);
        await modelManager.repair(cat.models);
        setStorage(await modelManager.storageUsage(cat.models));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [config]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setPrivacyMode = async (p: Privacy) => {
    setPrivacy(p);
    await AsyncStorage.setItem(PRIVACY_KEY, p);
  };

  const download = async (m: ModelManifest) => {
    setBusy(m.id);
    setError(null);
    try {
      await modelManager.download(m, {
        onProgress: (w, t) => setProgress((prev) => ({ ...prev, [m.id]: t > 0 ? w / t : 0 })),
      });
      const refreshed = await modelManager.state(m);
      setStates((prev) => ({ ...prev, [m.id]: refreshed }));
      setStorage(await modelManager.storageUsage(catalog));
      setHealth(await mobileLocalRuntime.health());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const activate = async (m: ModelManifest) => {
    setBusy(m.id);
    try {
      await modelManager.activate(m.id, catalog);
      const next: Record<string, ModelState> = {};
      for (const x of catalog) next[x.id] = await modelManager.state(x);
      setStates(next);
      setHealth(await mobileLocalRuntime.health());
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
      const next: Record<string, ModelState> = {};
      for (const x of catalog) next[x.id] = await modelManager.state(x);
      setStates(next);
      setStorage(await modelManager.storageUsage(catalog));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const activeId = Object.entries(states).find(([, s]) => s.status === "active")?.[0] ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <GhostText type="title">Ghost · Local</GhostText>
        <Text style={styles.sub}>
          {health?.available ? "On-device intelligence ready" : (health?.reason ?? "Checking local runtime…")}
        </Text>

        {activeId === null ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              No local model yet. Download Ghost Mini to use Ghost fully offline — after the download, inference needs no network.
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <View style={styles.row}>
            <StatusDot status={health?.available ? "online" : "offline"} />
            <Text style={styles.cardTitle}>Local runtime</Text>
          </View>
          <Text style={styles.meta}>Backend: llama.cpp (GGUF) · app-private model storage</Text>
          {storage ? (
            <Text style={styles.meta}>
              Models {formatBytes(storage.appPrivateModels)} · Cache {formatBytes(storage.modelCache)}
            </Text>
          ) : null}
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
          <Text style={styles.meta}>Local-only blocks cloud even when a local model is missing.</Text>
        </View>

        {catalog.map((m) => {
          const st = states[m.id];
          const v = device
            ? evaluate(device, {
                modelId: m.id, runtime: m.runtime, platforms: m.platforms, archs: m.architectures,
                minRamMb: m.minimum_ram_mb ?? 0, recRamMb: m.recommended_ram_mb ?? 0,
                sizeMb: Math.ceil(m.size_bytes / (1024 * 1024)),
              })
            : null;
          const pct = progress[m.id] ?? 0;
          const loading = busy === m.id;
          return (
            <View key={m.id} style={styles.card}>
              <Text style={styles.cardTitle}>{m.id}</Text>
              <Text style={styles.meta}>
                {m.quantization} · {m.size_estimated ? "~" : ""}{formatBytes(m.size_bytes)}
                {m.size_estimated ? " (publisher estimate)" : ""} · v{m.version}
              </Text>
              <Text style={styles.meta}>
                Capabilities: {m.capabilities.join(", ")}
              </Text>
              <Text style={styles.meta}>
                {v ? VERDICT_LABEL[v.verdict] ?? v.verdict : "Checking compatibility…"}
                {v?.reason ? ` — ${v.reason}` : ""}
              </Text>
              <Text style={styles.meta}>
                {isVerifiedPublisher(m) ? "Signed publisher" : "HTTPS download · hash pinned on install"}
              </Text>
              <Text style={styles.meta}>Status: {st?.status ?? "…"}</Text>
              {pct > 0 && pct < 1 ? (
                <View style={styles.bar}>
                  <View style={[styles.fill, { flex: pct }]} />
                  <View style={{ flex: 1 - pct }} />
                </View>
              ) : null}
              <View style={styles.actions}>
                {st?.status === "not_installed" || st?.status === "paused" ? (
                  <GhostButton title={st?.status === "paused" ? "Resume" : "Download"} onPress={() => download(m)} disabled={loading} loading={loading} />
                ) : null}
                {st?.status === "installed" ? (
                  <GhostButton title="Activate" onPress={() => activate(m)} disabled={loading} loading={loading} />
                ) : null}
                {st?.status === "installed" || st?.status === "active" ? (
                  <GhostButton title="Remove" variant="danger" onPress={() => remove(m)} disabled={loading} />
                ) : null}
              </View>
            </View>
          );
        })}

        {busy ? <ActivityIndicator /> : null}
      </ScrollView>
      <PlusMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Ghost.bg.base },
  body: { padding: Space.edge, gap: Space.md, paddingBottom: 120 },
  sub: { color: Ghost.text.secondary, fontSize: 14 },
  banner: { backgroundColor: Ghost.bg.raised, borderRadius: 12, padding: Space.md },
  bannerText: { color: Ghost.text.primary, fontSize: 14 },
  error: { color: Ghost.status.error, fontSize: 13 },
  card: { backgroundColor: Ghost.bg.raised, borderRadius: 12, padding: Space.md, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { color: Ghost.text.primary, fontSize: 16, fontWeight: "600" },
  meta: { color: Ghost.text.secondary, fontSize: 13 },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  bar: { flexDirection: "row", height: 6, borderRadius: 3, backgroundColor: Ghost.border.default, overflow: "hidden" },
  fill: { backgroundColor: Ghost.text.primary },
});
