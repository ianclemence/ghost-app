import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { GhostButton, GhostInput, GhostSheet, GhostToggle, StatusDot } from "@/components/ghost";
import {
  fetchDoctorStatus,
  fetchIntelligenceConfig,
  fetchModelState,
  fetchOllamaModels,
  fetchProviders,
  pullOllamaModel,
  saveIntelligenceConfig,
  switchModel,
  testProviderConnection,
  type DoctorCheck,
  type IntelligenceConfig,
  type ModelPreset,
  type ModelState,
  type ProvidersState,
  type RoutingPrefs,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

// Provider display names, ported from the web console's modelFriendly map.
const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  moonshot: "Kimi",
  groq: "Groq",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  gemini: "Gemini",
  zhipu: "Zhipu",
  openrouter: "OpenRouter",
  nvidia: "Nvidia",
  shengsuanyun: "ShengSuanYun",
  ollama: "Ollama",
  vllm: "Local",
};

// Provider order, ported from the web console. Extras sort after.
const PROVIDER_ORDER = [
  "ollama",
  "openai",
  "anthropic",
  "moonshot",
  "groq",
  "deepseek",
  "qwen",
  "gemini",
  "zhipu",
  "openrouter",
];

function providerName(provider: string): string {
  const key = (provider || "").toLowerCase();
  if (PROVIDER_NAMES[key]) return PROVIDER_NAMES[key];
  if (!key) return "Unknown";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function isLocalProvider(provider: string): boolean {
  const key = (provider || "").toLowerCase();
  return key === "ollama" || key === "vllm";
}

function presetSpec(p: ModelPreset): string {
  return `${p.provider}:${p.model}`;
}

function matchesActive(p: ModelPreset, active: string): boolean {
  return active !== "" && (active === p.name || active === presetSpec(p));
}

function orderedProviderKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = PROVIDER_ORDER.indexOf(a);
    const ib = PROVIDER_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// AI health only cares about these checks — same filter as the web console.
const HEALTH_CHECKS = new Set(["provider", "database", "gateway"]);

function checkStatus(s: string): "online" | "warning" | "offline" {
  if (s === "ok") return "online";
  if (s === "warn" || s === "info") return "warning";
  return "offline";
}

const ROUTING_ROWS: { key: keyof RoutingPrefs; label: string; desc: string }[] = [
  { key: "prefer_local", label: "Prefer local AI", desc: "Always try the local model first, even for complex tasks." },
  { key: "allow_cloud", label: "Allow cloud AI", desc: "Let Ghost use cloud providers when one is configured." },
  { key: "cloud_when_local_fails", label: "Fall back to cloud", desc: "If the local model fails or is unavailable, try cloud instead." },
];

export default function IntelligenceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config } = useGhostStore();
  const [state, setState] = useState<ModelState | null>(null);
  const [providersState, setProvidersState] = useState<ProvidersState | null>(null);
  const [intelConfig, setIntelConfig] = useState<IntelligenceConfig | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModelPreset | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [health, setHealth] = useState<DoctorCheck[]>([]);
  const [healthRan, setHealthRan] = useState(false);
  const [healthRunning, setHealthRunning] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);

  // Provider configure sheet state (mirrors the web console modal).
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Local model install state (mirrors the web console install row).
  const [installName, setInstallName] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [modelRes, providersRes, configRes, ollamaRes] = await Promise.allSettled([
        fetchModelState(config),
        fetchProviders(config),
        fetchIntelligenceConfig(config),
        fetchOllamaModels(config),
      ]);
      if (modelRes.status === "rejected") throw modelRes.reason;
      setState(modelRes.value);
      if (providersRes.status === "fulfilled") setProvidersState(providersRes.value);
      if (configRes.status === "fulfilled") setIntelConfig(configRes.value);
      if (ollamaRes.status === "fulfilled") setOllamaModels(ollamaRes.value);
    } catch {
      setError("Could not load models.");
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const openConfigure = (key: string) => {
    setConfiguring(key);
    setKeyInput("");
    setUrlInput(key === "ollama" ? (intelConfig?.ollama_url || "http://localhost:11434") : "");
    setTestResult(null);
    setSaveError(null);
  };

  const reloadProviders = useCallback(async () => {
    if (!config) return;
    const [providersRes, configRes, ollamaRes] = await Promise.allSettled([
      fetchProviders(config),
      fetchIntelligenceConfig(config),
      fetchOllamaModels(config),
    ]);
    if (providersRes.status === "fulfilled") setProvidersState(providersRes.value);
    if (configRes.status === "fulfilled") setIntelConfig(configRes.value);
    if (ollamaRes.status === "fulfilled") setOllamaModels(ollamaRes.value);
  }, [config]);

  const doTest = async () => {
    if (!config || !configuring || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testProviderConnection(config, configuring, keyInput);
      setTestResult(res);
    } catch {
      setTestResult({ ok: false, message: "Check your connection and try again." });
    }
    setTesting(false);
  };

  const doSaveProvider = async () => {
    if (!config || !configuring || saving) return;
    const isOllama = configuring === "ollama";
    const key = keyInput.trim();
    const url = urlInput.trim();
    if (!isOllama && key === "") {
      setConfiguring(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (isOllama) {
        await saveIntelligenceConfig(config, url !== "" ? { ollama_url: url } : {});
      } else {
        await saveIntelligenceConfig(config, { api_keys: { [configuring]: key } });
      }
      setConfiguring(null);
      await reloadProviders();
    } catch {
      setSaveError("Could not save. Try again.");
    }
    setSaving(false);
  };

  const toggleRouting = (key: keyof RoutingPrefs, on: boolean) => {
    if (!config || !intelConfig) return;
    const prev = intelConfig.routing;
    const next = { ...prev, [key]: on };
    setIntelConfig({ ...intelConfig, routing: next });
    setRoutingError(null);
    saveIntelligenceConfig(config, { routing: next }).catch(() => {
      setIntelConfig((cur) => (cur ? { ...cur, routing: prev } : cur));
      setRoutingError("Could not save. Try again.");
    });
  };

  const groups = useMemo(() => {
    const presets = state?.presets ?? [];
    const byProvider = new Map<string, ModelPreset[]>();
    for (const p of presets) {
      const key = (p.provider || "unknown").toLowerCase();
      if (!byProvider.has(key)) byProvider.set(key, []);
      byProvider.get(key)!.push(p);
    }
    return orderedProviderKeys([...byProvider.keys()]).map((key) => ({ provider: key, presets: byProvider.get(key)! }));
  }, [state]);

  const providerKeys = useMemo(
    () => orderedProviderKeys(Object.keys(providersState?.providers ?? {})),
    [providersState],
  );

  const defaultProvider = (providersState?.provider || intelConfig?.provider || "").toLowerCase();

  const activePreset = useMemo(
    () => (state ? state.presets.find((p) => matchesActive(p, state.active)) ?? null : null),
    [state],
  );

  const doSwitch = async () => {
    if (!config || !selected) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      const active = await switchModel(config, selected.name || presetSpec(selected));
      setState((prev) => (prev ? { ...prev, active } : prev));
      setSelected(null);
    } catch {
      setSwitchError("Could not switch. Try again.");
    }
    setSwitching(false);
  };

  const runHealth = useCallback(async () => {
    if (!config || healthRunning) return;
    setHealthRunning(true);
    try {
      const d = await fetchDoctorStatus(config);
      setHealth((d?.checks ?? []).filter((c) => HEALTH_CHECKS.has(c.name)));
    } catch {
      setHealth([]);
    }
    setHealthRan(true);
    setHealthRunning(false);
  }, [config, healthRunning]);

  const doInstall = async () => {
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

  const configuringCred = configuring ? intelConfig?.providers[configuring] : undefined;
  const configuringInfo = configuring ? providersState?.providers[configuring] : undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">Intelligence</GhostText>
        <GhostText type="subhead" style={styles.sub}>Which AI Ghost runs on.</GhostText>
      </View>
      {!config ? (
        <View style={styles.center}>
          <Text style={styles.emptyHello}>
            <Text style={styles.emptyInk}>Not connected. </Text>
            <Text style={styles.emptyMuted}>Connect a Ghost Pod to manage Ghost AI.</Text>
          </Text>
          <View style={{ height: Space.lg }} />
          <GhostButton title="Connect a Ghost Pod" onPress={() => router.push("/connect")} />
        </View>
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={Ghost.text.primary} size="large" /></View>
      ) : error && !state ? (
        <View style={styles.center}>
          <Text style={styles.emptyHello}>
            <Text style={styles.emptyInk}>Models would not load. </Text>
            <Text style={styles.emptyMuted}>Check your connection and try again.</Text>
          </Text>
          <TouchableOpacity onPress={() => load()} hitSlop={12} accessibilityLabel="Retry loading models">
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.text.primary} />}
        >
          <GhostText type="caption" style={styles.group}>Active model</GhostText>
          {activePreset ? (
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>{activePreset.name}</GhostText>
                <GhostText type="footnote" style={styles.rowMeta} numberOfLines={2}>
                  {providerName(activePreset.provider)}{activePreset.model ? ` · ${activePreset.model}` : ""}
                  {isLocalProvider(activePreset.provider) ? " · Local" : ""}
                </GhostText>
              </View>
              <View style={styles.activePill}>
                <StatusDot status="online" />
                <GhostText type="footnote" style={styles.activeLabel}>Active</GhostText>
              </View>
            </View>
          ) : (
            <GhostText type="footnote" style={styles.rowMeta}>
              {state?.active ? state.active : "No model selected."}
            </GhostText>
          )}

          {groups.map((g) => (
            <View key={g.provider}>
              <GhostText type="caption" style={styles.group}>{providerName(g.provider)}</GhostText>
              {g.presets.map((p) => {
                const active = state ? matchesActive(p, state.active) : false;
                return (
                  <View key={`${p.provider}:${p.name || p.model}`} style={styles.row}>
                    <View style={styles.rowBody}>
                      <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>{p.name || p.model}</GhostText>
                      <GhostText type="footnote" style={styles.rowMeta} numberOfLines={2}>
                        {p.model}{isLocalProvider(p.provider) ? " · Local" : ""}
                      </GhostText>
                      {!p.available && p.unavailable_reason ? (
                        <GhostText type="footnote" style={styles.rowWarn} numberOfLines={2}>{p.unavailable_reason}</GhostText>
                      ) : null}
                    </View>
                    {active ? (
                      <View style={styles.activePill}>
                        <StatusDot status="online" />
                        <GhostText type="footnote" style={styles.activeLabel}>Active</GhostText>
                      </View>
                    ) : p.available ? (
                      <GhostButton title="Use" variant="secondary" onPress={() => { setSelected(p); setSwitchError(null); }} />
                    ) : (
                      <GhostText type="footnote" style={styles.needsKey}>Needs key</GhostText>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
          {(state?.presets ?? []).length === 0 ? (
            <GhostText type="footnote" style={styles.rowMeta}>No models configured yet.</GhostText>
          ) : null}

          <GhostText type="caption" style={styles.group}>Providers</GhostText>
          <GhostText type="footnote" style={styles.sectionDesc}>Connect to cloud AI services. Ghost only uses what you configure.</GhostText>
          {providerKeys.length === 0 ? (
            <GhostText type="footnote" style={styles.rowMeta}>No provider info yet.</GhostText>
          ) : providerKeys.map((key) => {
            const info = providersState!.providers[key];
            const local = info.local || isLocalProvider(key);
            const isDefault = key === defaultProvider;
            const modelCount = local ? ollamaModels.length : info.models.length;
            return (
              <View key={key} style={styles.row}>
                <View style={styles.rowBody}>
                  <GhostText type="headline" style={styles.rowTitle}>{providerName(key)}</GhostText>
                  <GhostText type="footnote" style={styles.rowMeta} numberOfLines={2}>
                    {info.configured
                      ? `Connected${modelCount > 0 ? ` · ${modelCount} model${modelCount !== 1 ? "s" : ""}` : ""}`
                      : local ? "Running locally" : "Not configured"}
                    {isDefault ? (info.configured ? " · Default" : local ? " · Default · local" : " · Default · needs key") : ""}
                  </GhostText>
                </View>
                <GhostButton
                  title={info.configured ? "Configure" : "Set up"}
                  variant="secondary"
                  onPress={() => openConfigure(key)}
                />
              </View>
            );
          })}

          <GhostText type="caption" style={styles.group}>Routing</GhostText>
          <GhostText type="footnote" style={styles.sectionDesc}>Ghost automatically chooses the best model when a task requires something different.</GhostText>
          {routingError ? <GhostText type="footnote" style={styles.rowWarn}>{routingError}</GhostText> : null}
          {ROUTING_ROWS.map((r) => (
            <View key={r.key} style={styles.row}>
              <View style={styles.rowBody}>
                <GhostText type="headline" style={styles.rowTitle}>{r.label}</GhostText>
                <GhostText type="footnote" style={styles.rowMeta} numberOfLines={3}>{r.desc}</GhostText>
              </View>
              <GhostToggle
                value={intelConfig?.routing[r.key] ?? false}
                onValueChange={(v) => toggleRouting(r.key, v)}
                accessibilityLabel={r.label}
              />
            </View>
          ))}

          <GhostText type="caption" style={styles.group}>Local models</GhostText>
          <GhostText type="footnote" style={styles.sectionDesc}>Installed on your Ghost via Ollama.</GhostText>
          {ollamaModels.length === 0 ? (
            <GhostText type="footnote" style={styles.rowMeta}>No local models installed yet.</GhostText>
          ) : ollamaModels.map((m) => {
            const active = state ? state.active === `ollama:${m}` : false;
            return (
              <View key={m} style={styles.row}>
                <View style={styles.rowBody}>
                  <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>{m}</GhostText>
                  <GhostText type="footnote" style={styles.rowMeta} numberOfLines={1}>Local</GhostText>
                </View>
                {active ? (
                  <View style={styles.activePill}>
                    <StatusDot status="online" />
                    <GhostText type="footnote" style={styles.activeLabel}>Active</GhostText>
                  </View>
                ) : (
                  <GhostButton
                    title="Use"
                    variant="secondary"
                    onPress={() => { setSelected({ name: "", provider: "ollama", model: m, available: true }); setSwitchError(null); }}
                  />
                )}
              </View>
            );
          })}
          <View style={styles.installRow}>
            <View style={styles.installInput}>
              <GhostInput
                value={installName}
                onChangeText={setInstallName}
                placeholder="Model name (e.g. qwen3:8b)"
              />
            </View>
            <GhostButton title="Install" variant="secondary" onPress={() => void doInstall()} disabled={installing || installName.trim() === ""} loading={installing} />
          </View>
          {installResult ? <GhostText type="footnote" style={styles.rowMeta}>{installResult}</GhostText> : null}

          <GhostText type="caption" style={styles.group}>AI health</GhostText>
          {healthRunning ? (
            <View style={styles.healthEmpty}>
              <ActivityIndicator color={Ghost.text.primary} />
            </View>
          ) : !healthRan ? (
            <View style={styles.healthEmpty}>
              <Text style={styles.emptyHello}>
                <Text style={styles.emptyMuted}>Check that Ghost AI is reachable.</Text>
              </Text>
            </View>
          ) : health.length === 0 ? (
            <View style={styles.healthEmpty}>
              <Text style={styles.emptyHello}>
                <Text style={styles.emptyInk}>Health check unavailable. </Text>
                <Text style={styles.emptyMuted}>Ghost may be starting.</Text>
              </Text>
            </View>
          ) : (
            health.map((c) => (
              <View key={c.name} style={styles.check}>
                <StatusDot status={checkStatus(c.status)} />
                <View style={styles.checkBody}>
                  <GhostText type="headline" style={styles.rowTitle}>{c.name}</GhostText>
                  {c.message ? <GhostText type="subhead" style={styles.rowMeta} numberOfLines={3}>{c.message}</GhostText> : null}
                </View>
              </View>
            ))
          )}
          <View style={styles.healthBtnWrap}>
            <GhostButton
              title={healthRunning ? "Checking…" : "Run check"}
              variant="secondary"
              onPress={() => void runHealth()}
              disabled={healthRunning}
              loading={healthRunning}
              style={{ alignSelf: "center" }}
            />
          </View>
        </ScrollView>
      )}
      <GhostSheet
        visible={selected !== null}
        onClose={() => { if (!switching) setSelected(null); }}
        title={selected ? `Use ${selected.name || selected.model}?` : "Switch model"}
        message={switchError ?? "Takes effect immediately."}
      >
        <GhostButton title="Switch" fullWidth onPress={() => void doSwitch()} disabled={switching} loading={switching} />
      </GhostSheet>
      <GhostSheet
        visible={configuring !== null}
        onClose={() => { if (!saving && !testing) setConfiguring(null); }}
        title={configuring ? `Configure ${providerName(configuring)}` : "Configure provider"}
        message={saveError ?? undefined}
      >
        {configuring === "ollama" ? (
          <GhostText type="footnote" style={styles.sheetDesc}>Ollama runs on your Ghost. No API key needed.</GhostText>
        ) : (
          <GhostText type="footnote" style={styles.sheetDesc}>
            {configuringCred?.has_key ? "A key is saved. Leave the field empty to keep it." : "Stored securely in the secrets file. Never shown back in full."}
          </GhostText>
        )}
        {configuring === "ollama" ? (
          <GhostInput value={urlInput} onChangeText={setUrlInput} placeholder="http://localhost:11434" keyboardType="url" />
        ) : (
          <GhostInput value={keyInput} onChangeText={setKeyInput} placeholder={configuringCred?.has_key ? "Leave empty to keep current key" : "Paste your API key"} secureTextEntry />
        )}
        {configuring !== "ollama" && configuringCred?.key_masked ? (
          <GhostText type="footnote" style={styles.rowMeta}>Saved key: {configuringCred.key_masked}</GhostText>
        ) : null}
        {configuring !== "ollama" ? (
          <View style={styles.testRow}>
            <GhostButton title="Test connection" variant="secondary" onPress={() => void doTest()} disabled={testing} loading={testing} />
            {testResult ? (
              <GhostText type="footnote" style={testResult.ok ? styles.testOk : styles.testBad} numberOfLines={3}>
                {testResult.message}
              </GhostText>
            ) : null}
          </View>
        ) : null}
        {configuringInfo && !configuringInfo.configured && configuring !== "ollama" && (configuringInfo.models.length > 0) ? (
          <GhostText type="footnote" style={styles.rowMeta}>
            Unlocks {configuringInfo.models.length} model{configuringInfo.models.length !== 1 ? "s" : ""}.
          </GhostText>
        ) : null}
        <GhostButton title="Save" fullWidth onPress={() => void doSaveProvider()} disabled={saving || testing} loading={saving} />
      </GhostSheet>
      <PlusMenu />
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
    marginTop: Space.lg,
  },
  sectionDesc: {
    color: Ghost.text.secondary,
    marginBottom: Space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowMeta: {
    color: Ghost.text.secondary,
  },
  rowWarn: {
    color: Ghost.text.secondary,
    fontStyle: "italic",
  },
  needsKey: {
    color: Ghost.text.tertiary,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  activeLabel: {
    color: Ghost.text.primary,
    fontWeight: "600",
  },
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
  },
  checkBody: {
    flex: 1,
    gap: 2,
  },
  healthEmpty: {
    alignItems: "center",
    paddingVertical: Space.lg,
    paddingHorizontal: Space.md,
  },
  healthBtnWrap: {
    alignItems: "center",
    marginTop: Space.sm,
  },
  sheetDesc: {
    color: Ghost.text.secondary,
    marginBottom: Space.md,
  },
  testRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginTop: Space.md,
  },
  testOk: {
    color: Ghost.text.primary,
    flex: 1,
  },
  testBad: {
    color: Ghost.text.secondary,
    flex: 1,
  },
  installRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginTop: Space.md,
  },
  installInput: {
    flex: 1,
  },
});
