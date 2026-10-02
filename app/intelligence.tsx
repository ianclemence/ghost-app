import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { filterChoices, friendlyModel, groupChoices, pickerChoices, providerName, resolveActive, sourceNote, type ModelChoice } from "@/lib/models";
import { GhostText } from "@/components/themed-text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostButton, GhostInput, GhostList, GhostSheet, GhostToggle, OfflineBadge, Panel, SectionHeader, StatusDot, StatusPill } from "@/components/ghost";
import {
  fetchDoctorStatus,
  fetchIntelligenceConfig,
  fetchModelState,
  fetchProviders,
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
import { EdgeScrollView } from "@/components/scroll-edge";

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

function isLocalProvider(provider: string): boolean {
  const key = (provider || "").toLowerCase();
  return key === "ollama" || key === "vllm";
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
  const router = useRouter();
  const { config } = useGhostStore();
  const connectionState = useGhostStore((s) => s.connectionState);
  const [state, setState] = useState<ModelState | null>(null);
  const [providersState, setProvidersState] = useState<ProvidersState | null>(null);
  const [intelConfig, setIntelConfig] = useState<IntelligenceConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModelChoice | null>(null);
  // The model picker for one provider: its live list, searchable.
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [health, setHealth] = useState<DoctorCheck[]>([]);
  const [healthRan, setHealthRan] = useState(false);
  const [healthRunning, setHealthRunning] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  // Phone privacy mode (Ghost screen) outranks these toggles: Local only
  // keeps everything on-device no matter what is switched on here.
  const [ghostPrivacy, setGhostPrivacy] = useState<string | null>(null);

  // Provider configure sheet state (mirrors the web console modal).
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Empty save with a stored key keeps the key and says so explicitly —
  // closing silently left doubt about what was stored.
  const [keptKey, setKeptKey] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [modelRes, providersRes, configRes] = await Promise.allSettled([
        fetchModelState(config),
        fetchProviders(config),
        fetchIntelligenceConfig(config),
      ]);
      if (modelRes.status === "rejected") throw modelRes.reason;
      setState(modelRes.value);
      if (providersRes.status === "fulfilled") setProvidersState(providersRes.value);
      if (configRes.status === "fulfilled") setIntelConfig(configRes.value);
      await AsyncStorage.getItem("ghost:privacy").then((p) => setGhostPrivacy(p)).catch(() => {});
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
    setKeptKey(false);
    setKeyInput("");
    setUrlInput(key === "ollama" ? (intelConfig?.ollama_url || "http://localhost:11434") : "");
    setTestResult(null);
    setSaveError(null);
    // The provider's models live in this sheet: ask it what it serves today.
    setPickerFor(key);
    setPickerQuery("");
    if (providersState?.providers[key]?.configured) {
      setPickerLoading(true);
      void reloadProviders(true).finally(() => setPickerLoading(false));
    }
  };

  const reloadProviders = useCallback(async (refresh = false) => {
    if (!config) return;
    const [providersRes, configRes, modelRes] = await Promise.allSettled([
      fetchProviders(config, { refresh }),
      fetchIntelligenceConfig(config),
      fetchModelState(config),
    ]);
    if (modelRes.status === "fulfilled") setState(modelRes.value);
    if (providersRes.status === "fulfilled") setProvidersState(providersRes.value);
    if (configRes.status === "fulfilled") setIntelConfig(configRes.value);
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
      if (configuringCred?.has_key) {
        setKeptKey(true);
        return;
      }
      setConfiguring(null);
      setPickerFor(null);
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
      const saved = configuring;
      setKeptKey(false);
      setKeyInput("");
      setTestResult(null);
      // The key is in: stay here, ask the provider what it serves and let the
      // owner choose from it, in the same sheet.
      setPickerFor(saved);
      setPickerQuery("");
      setPickerLoading(true);
      await reloadProviders(true);
      setPickerLoading(false);
    } catch {
      setSaveError("Couldn't save. Nothing changed, try again.");
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
      setRoutingError("Couldn't save. Routing is unchanged, try again.");
    });
  };

  const providersMeta = useMemo(() => {
    const out: Record<string, { configured: boolean; source?: string; error?: string }> = {};
    for (const [k, v] of Object.entries(providersState?.providers ?? {})) out[k] = { configured: v.configured, source: v.source, error: v.error };
    return out;
  }, [providersState]);

  // What can be switched to, from the providers themselves (not just named presets).
  const groups = useMemo(
    () => groupChoices(state?.options ?? [], state?.active ?? "", providersMeta),
    [state, providersMeta],
  );

  const providerKeys = useMemo(
    () => orderedProviderKeys(Object.keys(providersState?.providers ?? {})),
    [providersState],
  );

  const defaultProvider = (providersState?.provider || intelConfig?.provider || "").toLowerCase();

  const activeOption = useMemo(() => (state ? resolveActive(state.active, state.options) : null), [state]);

  const pickerList = useMemo(() => {
    if (!pickerFor || !state) return [];
    const models = providersState?.providers[pickerFor]?.models ?? [];
    return filterChoices(pickerChoices(pickerFor, models, state.active, state.options), pickerQuery);
  }, [pickerFor, providersState, state, pickerQuery]);

  const doSwitch = async (choice: ModelChoice | null = selected) => {
    if (!config || !choice) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      const active = await switchModel(config, choice.target);
      setState((prev) => (prev ? { ...prev, active } : prev));
      setSelected(null);
      setChosen(choice.label);
      // The owner has chosen: this sheet has done its job.
      setPickerFor(null);
      setConfiguring(null);
      void reloadProviders();
    } catch {
      setSwitchError("Couldn't switch. Still on the current model.");
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

  const configuringCred = configuring ? intelConfig?.providers[configuring] : undefined;
  const configuringInfo = configuring ? providersState?.providers[configuring] : undefined;

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Intelligence" subtitle="Which AI Ghost thinks with" />
      {config && connectionState !== "online" ? (
        <View style={styles.offlineWrap}>
          <OfflineBadge state={connectionState === "syncing" ? "syncing" : "offline"} />
        </View>
      ) : null}
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
        <EdgeScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.text.primary} />}
        >
          <SectionHeader title="Active model" style={styles.first} />
          {activeOption || state?.active ? (
            <Panel style={{ marginTop: 0 }}>
              <View style={[styles.row, styles.rowFlush]}>
                <View style={styles.rowBody}>
                  <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>
                    {activeOption ? friendlyModel(activeOption.model, activeOption.provider) : state!.active}
                  </GhostText>
                  <GhostText type="footnote" style={styles.rowMeta} numberOfLines={2}>
                    {activeOption
                      ? `${providerName(activeOption.provider)} \u00b7 ${activeOption.model}${isLocalProvider(activeOption.provider) ? " \u00b7 On your Pod" : ""}`
                      : "Set on your Pod"}
                  </GhostText>
                </View>
                <StatusPill label="Active" tone="ok" />
              </View>
            </Panel>
          ) : (
            <GhostText type="footnote" style={styles.none}>
              Ghost has no model yet. Connect a provider below and choose one.
            </GhostText>
          )}
          {chosen ? (
            <GhostText type="footnote" style={styles.chosen} accessibilityLiveRegion="polite">
              Ghost now thinks with {chosen}.
            </GhostText>
          ) : null}

          {groups.length > 0 ? (
            <>
              <SectionHeader title="Models" subtitle="What Ghost can switch to now, from the providers you have connected." />
              {groups.map((g) => {
                const open = expanded.has(g.provider);
                const shown = open ? g.models : g.models.slice(0, 5);
                return (
                  <View key={g.provider} style={styles.group}>
                    <View style={styles.groupHead}>
                      <GhostText type="caption" style={styles.groupName}>{g.providerName}</GhostText>
                      <GhostText type="caption" style={styles.groupNote} numberOfLines={1}>
                        {sourceNote(g.provider, g.source, g.error) ? (g.source === "live" || isLocalProvider(g.provider) ? "Live" : "Built-in list") : ""}
                      </GhostText>
                    </View>
                    <GhostList>
                      {shown.map((m) => (
                        <View key={m.target} style={styles.row}>
                          <View style={styles.rowBody}>
                            <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>{m.label}</GhostText>
                            <GhostText type="footnote" style={styles.rowMeta} numberOfLines={1}>{friendlyModel(m.model, m.provider)}</GhostText>
                          </View>
                          {m.active ? (
                            <StatusPill label="Active" tone="ok" />
                          ) : (
                            <GhostButton title="Use" variant="secondary" size="sm" onPress={() => { setSelected(m); setSwitchError(null); }} />
                          )}
                        </View>
                      ))}
                    </GhostList>
                    {g.models.length > 5 ? (
                      <GhostButton
                        title={open ? "Show fewer" : `Show all ${g.models.length}`}
                        variant="ghost"
                        size="sm"
                        style={styles.more}
                        onPress={() => setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.provider)) next.delete(g.provider);
                          else next.add(g.provider);
                          return next;
                        })}
                      />
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : null}

          <SectionHeader title="Providers" subtitle="The AI services Ghost can think with. It only uses what you connect." />
          {providerKeys.length === 0 ? (
            <GhostText type="footnote" style={styles.none}>No provider info yet.</GhostText>
          ) : (
            <GhostList>
              {providerKeys.map((key) => {
                const info = providersState!.providers[key];
                const local = info.local || isLocalProvider(key);
                const isDefault = key === defaultProvider;
                const modelCount = info.models.length;
                return (
                  <View key={key} style={styles.row}>
                    <View style={styles.rowBody}>
                      <View style={styles.nameLine}>
                        <GhostText type="headline" style={styles.rowTitle}>{providerName(key)}</GhostText>
                        {isDefault ? <StatusPill label="Default" tone="ok" /> : null}
                      </View>
                      <GhostText type="footnote" style={styles.rowMeta} numberOfLines={2}>
                        {info.configured
                          ? `Connected${modelCount > 0 ? ` · ${modelCount} model${modelCount !== 1 ? "s" : ""}` : ""}`
                          : local ? "Running locally" : "Not configured"}
                      </GhostText>
                    </View>
                    <View style={styles.rowActions}>
                      <GhostButton title="Configure" variant="secondary" size="sm" onPress={() => openConfigure(key)} />
                    </View>
                  </View>
                );
              })}
            </GhostList>
          )}

          <SectionHeader title="Routing" subtitle="Ghost automatically chooses the best model when a task requires something different." />
          {ghostPrivacy === "local_only" ? (
            <GhostText type="footnote" style={styles.none}>Ghost privacy is Local only, so cloud stays off no matter these toggles. Change it on the Ghost screen.</GhostText>
          ) : null}
          {routingError ? <GhostText type="footnote" style={styles.rowWarn}>{routingError}</GhostText> : null}
          <GhostList>
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
          </GhostList>

          <SectionHeader title="AI health" />
          <Panel style={{ marginTop: 0 }}>
            {healthRunning ? (
              <ActivityIndicator color={Ghost.text.primary} />
            ) : !healthRan ? (
              <GhostText type="footnote" style={styles.none}>Check that Ghost AI is reachable.</GhostText>
            ) : health.length === 0 ? (
              <GhostText type="footnote" style={styles.none}>Health check unavailable. Ghost may be starting.</GhostText>
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
            <GhostButton
              title={healthRunning ? "Checking…" : "Run check"}
              variant="secondary"
              size="sm"
              onPress={() => void runHealth()}
              disabled={healthRunning}
              loading={healthRunning}
              style={{ alignSelf: "flex-start", marginTop: Space.xs }}
            />
          </Panel>
        </EdgeScrollView>
      )}
      <GhostSheet
        visible={selected !== null}
        onClose={() => { if (!switching) setSelected(null); }}
        title={selected ? `Use ${selected.label}?` : "Switch model"}
        message={switchError ?? "Takes effect immediately."}
      >
        <GhostButton title="Switch" fullWidth onPress={() => void doSwitch()} disabled={switching} loading={switching} />
      </GhostSheet>

      <GhostSheet
        visible={configuring !== null}
        onClose={() => { if (!saving && !testing && !switching) { setConfiguring(null); setPickerFor(null); setKeptKey(false); } }}
        title={configuring ? `Configure ${providerName(configuring)}` : "Configure provider"}
        message={saveError ?? switchError ?? undefined}
      >
        <>
        {keptKey ? <GhostText type="footnote" style={styles.testOk}>Kept the saved key. Nothing changed.</GhostText> : null}
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
        <GhostButton title={configuring === "ollama" ? "Save" : "Save key"} fullWidth onPress={() => void doSaveProvider()} disabled={saving || testing} loading={saving} />

        {configuring && configuringInfo?.configured ? (
          <>
            <GhostText type="headline" style={styles.modelsHead}>Models</GhostText>
            <GhostText type="footnote" style={styles.rowMeta}>
              {sourceNote(configuring, configuringInfo.source, configuringInfo.error) || "Choose the one Ghost should think with."}
            </GhostText>
            {configuringInfo.models.length > 8 ? (
              <GhostInput value={pickerQuery} onChangeText={setPickerQuery} placeholder="Search models" autoCapitalize="none" autoCorrect={false} />
            ) : null}
            {pickerLoading ? (
              <View style={styles.pickerLoading}>
                <ActivityIndicator color={Ghost.text.secondary} />
                <GhostText type="footnote" style={styles.rowMeta}>Asking {providerName(configuring)} for its models</GhostText>
              </View>
            ) : pickerList.length === 0 ? (
              <GhostText type="footnote" style={styles.none}>
                {pickerQuery ? "No model matches that." : `${providerName(configuring)} did not list any models.`}
              </GhostText>
            ) : (
              <GhostList>
                {pickerList.slice(0, 60).map((m) => (
                  <View key={m.target} style={styles.row}>
                    <View style={styles.rowBody}>
                      <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>{m.label}</GhostText>
                      <GhostText type="footnote" style={styles.rowMeta} numberOfLines={1}>{friendlyModel(m.model, m.provider)}</GhostText>
                    </View>
                    {m.active ? (
                      <StatusPill label="Active" tone="ok" />
                    ) : (
                      <GhostButton title="Use" variant="secondary" size="sm" disabled={switching} onPress={() => void doSwitch(m)} />
                    )}
                  </View>
                ))}
              </GhostList>
            )}
            {pickerList.length > 60 ? <GhostText type="footnote" style={styles.none}>Showing 60 of {pickerList.length}. Search to narrow it down.</GhostText> : null}
          </>
        ) : null}
        </>
      </GhostSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  offlineWrap: {
    alignItems: "center",
  },
  center: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 44,
  },
  emptyHello: {
    fontFamily: Fonts.voice,
    fontSize: 30,
    lineHeight: 36,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  emptyMuted: {
    color: Ghost.text.secondary,
    fontFamily: undefined,
  },
  emptyInk: {
    color: Ghost.text.primary,
  },
  retry: {
    marginTop: Space.lg,
    fontSize: 15,
    fontWeight: "500",
    color: Ghost.accent.primary,
  },
  list: {
    paddingBottom: 96,
  },
  first: { paddingTop: Space.xs },
  none: {
    color: Ghost.text.tertiary,
    textAlign: "center",
    marginTop: Space.md,
    paddingHorizontal: Space.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.xl,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowFlush: { paddingHorizontal: 0, paddingVertical: 0 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  group: { marginBottom: Space.md },
  groupHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: Space.xl + 6, paddingBottom: Space.xs },
  groupName: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.secondary },
  groupNote: { fontSize: 12, color: Ghost.text.tertiary },
  more: { alignSelf: "center", marginTop: Space.xs },
  chosen: { color: Ghost.status.success, textAlign: "center", marginTop: Space.sm },
  modelsHead: { marginTop: Space.md },
  pickerLoading: { alignItems: "center", gap: Space.sm, paddingVertical: Space.xl },
  nameLine: { flexDirection: "row", alignItems: "center", gap: Space.sm, flexWrap: "wrap" },
  rowTitle: {
    color: Ghost.text.primary,
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: -0.15,
  },
  rowMeta: {
    color: Ghost.text.secondary,
    fontWeight: "300",
    fontSize: 13.5,
    lineHeight: 19,
  },
  rowWarn: {
    color: Ghost.status.warning,
  },
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  checkBody: {
    flex: 1,
    gap: 2,
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
});
