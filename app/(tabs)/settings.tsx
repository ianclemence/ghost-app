import Constants, { AppOwnership } from "expo-constants";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle,
  Info,
  MapPin,
  Palette,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Settings,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Fonts, UI } from "@/constants/theme";
import QrPairingScanner from "../../components/QrPairingScanner";
import {
  ChannelHealth,
  checkHealth,
  checkHealthDebug,
  connectWebSocket,
  DoctorResponse,
  DeliveryTraceEvent,
  fetchAvailableTools,
  fetchChannelStatus,
  fetchDeliveryTrace,
  fetchDoctor,
  fetchModelInfo,
  fetchSkillDetail,
  fetchSkills,
  getWSState,
  GhostConfig,
  GhostSkill,
  GhostSkillDetail,
  inspectSession,
  installSkill,
  ModelInfo,
  reconnectChannel,
  saveConfig,
  setActiveModel,
  toggleSkill,
} from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";

const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
const C = Colors.dark;
const FONT_MONO = Fonts.mono;

const ACCENTS = [
  { id: "green", label: "GREEN", color: "#4ADE80" },
  { id: "amber", label: "AMBER", color: "#FBBF24" },
  { id: "cyan", label: "CYAN", color: "#22D3EE" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    config,
    setConfig,
    connectionState,
    setConnectionState,
    setConnected,
    setAvailableTools,
    setProfile,
    accentColor,
    setAccentColor,
  } = useGhostStore();

  const [host, setHost] = useState(config?.piHost ?? "");
  const [port, setPort] = useState(config?.piPort ?? "8766");
  const [secret, setSecret] = useState(config?.secret ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle");
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [sendLocation, setSendLocation] = useState(
    config?.sendLocation ?? true,
  );

  // Diagnostics state
  const [diagLatency, setDiagLatency] = useState<number | null>(null);
  const [diagWSState, setDiagWSState] = useState<string>("unknown");
  const [diagLastRequest, setDiagLastRequest] = useState<string | null>(null);
  const [doctorData, setDoctorData] = useState<DoctorResponse | null>(null);
  const [channelHealth, setChannelHealth] = useState<
    Record<string, ChannelHealth>
  >({});
  const [sessionInspector, setSessionInspector] = useState<{
    requested_session: string;
    active_session: { channel: string; chat_id: string };
    delivery_target: string;
    last_request_id: string;
    timestamp: number;
  } | null>(null);
  const [lastTraceStates, setLastTraceStates] = useState<string[]>([]);

  // Skills state
  const [skills, setSkills] = useState<GhostSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [detailSkill, setDetailSkill] = useState<GhostSkillDetail | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [installVisible, setInstallVisible] = useState(false);
  const [installOwner, setInstallOwner] = useState("");
  const [installRepo, setInstallRepo] = useState("");
  const [installPath, setInstallPath] = useState("");
  const [installBusy, setInstallBusy] = useState(false);

  // Pairing QR + model state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelBusyName, setModelBusyName] = useState<string | null>(null);

  const loadSkills = useCallback(async (cfg: GhostConfig) => {
    setSkillsLoading(true);
    try {
      setSkills(await fetchSkills(cfg));
    } catch {}
    setSkillsLoading(false);
  }, []);

  useEffect(() => {
    if (config) loadSkills(config);
  }, [config, loadSkills]);

  const handleToggleSkill = async (name: string, enabled: boolean) => {
    if (!config) return;
    setSkills((prev) =>
      prev.map((sk) => (sk.name === name ? { ...sk, enabled } : sk)),
    );
    try {
      await toggleSkill(config, name, enabled);
    } catch (e: any) {
      setSkills((prev) =>
        prev.map((sk) =>
          sk.name === name ? { ...sk, enabled: !enabled } : sk,
        ),
      );
      Alert.alert("Error", e?.message || "Failed to toggle skill");
    }
  };

  const openSkillDetail = async (name: string) => {
    if (!config) return;
    const detail = await fetchSkillDetail(config, name);
    if (detail) {
      setDetailSkill(detail);
      setDetailVisible(true);
    }
  };

  const handleInstallSkill = async () => {
    if (!config || installBusy) return;
    setInstallBusy(true);
    try {
      await installSkill(config, {
        owner: installOwner.trim(),
        repo: installRepo.trim(),
        path: installPath.trim(),
      });
      setInstallVisible(false);
      setInstallOwner("");
      setInstallRepo("");
      setInstallPath("");
      await loadSkills(config);
      Alert.alert("Installed", "Skill installed successfully.");
    } catch (e: any) {
      Alert.alert("Install Failed", e?.message || "Could not install skill");
    }
    setInstallBusy(false);
  };

  useEffect(() => {
    if (isExpoGo) return;
    import("expo-notifications").then((Notifications) => {
      Notifications.getPermissionsAsync().then(({ status }) => {
        setNotifEnabled(status === "granted");
      });
    });
  }, []);

  const requestNotifications = async () => {
    if (isExpoGo) {
      alert("Push notifications are not supported in Expo Go.");
      return;
    }
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifEnabled(status === "granted");
  };

  const refreshOpsData = async (cfg: GhostConfig) => {
    const channels = await fetchChannelStatus(cfg);
    setChannelHealth(channels);
    const inspect = await inspectSession(cfg, "mobile", "default");
    setSessionInspector(inspect);
    if (inspect?.last_request_id) {
      const trace = await fetchDeliveryTrace(cfg, inspect.last_request_id);
      setLastTraceStates(trace.map((e: DeliveryTraceEvent) => e.state));
    } else {
      setLastTraceStates([]);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult("idle");
    const cfg: GhostConfig = {
      piHost: host.trim(),
      piPort: port.trim(),
      secret: secret.trim(),
      session: config?.session, // Preserve session
      sendLocation,
    };
    const result = await checkHealthDebug(cfg);
    const ok = result.ok;
    setTestResult(ok ? "ok" : "fail");
    setConnected(ok);
    setTesting(false);

    // Update diagnostics
    if (result.latencyMs !== undefined) setDiagLatency(result.latencyMs);
    setDiagWSState(getWSState());
    setDiagLastRequest(new Date().toLocaleTimeString());

    if (ok) {
      try {
        const doc = await fetchDoctor(cfg);
        setDoctorData(doc);
        if (doc.profile) setProfile(doc.profile);
        const tools = await fetchAvailableTools(cfg);
        setAvailableTools(tools);
        await refreshOpsData(cfg);
      } catch (e) {
        console.warn("Doctor fetch failed", e);
      }
    }
  };

  const saveAndConnect = async () => {
    const cfg: GhostConfig = {
      piHost: host.trim(),
      piPort: port.trim(),
      secret: secret.trim(),
      session: config?.session,
      sendLocation,
    };
    await saveConfig(cfg);
    setConfig(cfg);
    const ok = await checkHealth(cfg);
    setConnected(ok);
    setTestResult(ok ? "ok" : "fail");
    if (ok) {
      connectWebSocket(cfg);
      try {
        const doc = await fetchDoctor(cfg);
        setDoctorData(doc);
        if (doc.profile) setProfile(doc.profile);
        const tools = await fetchAvailableTools(cfg);
        setAvailableTools(tools);
        await refreshOpsData(cfg);
      } catch {}
    }
  };

  const resetConnection = async () => {
    if (!config) return;
    setConnectionState("syncing");
    connectWebSocket(config);
    const ok = await checkHealth(config);
    setConnected(ok);
    setTestResult(ok ? "ok" : "fail");
    setDiagWSState(getWSState());
    setDiagLastRequest(new Date().toLocaleTimeString());

    if (ok) {
      try {
        const doc = await fetchDoctor(config);
        setDoctorData(doc);
        if (doc.profile) setProfile(doc.profile);
        const tools = await fetchAvailableTools(config);
        setAvailableTools(tools);
        await refreshOpsData(config);
      } catch (e) {
        console.warn("Doctor fetch failed", e);
      }
    }
  };

  const reconnectSelectedChannel = async (channel: string) => {
    if (!config) return;
    setTesting(true);
    await reconnectChannel(config, channel);
    await refreshOpsData(config);
    setTesting(false);
  };

  const openModelSheet = async () => {
    if (!config) return;
    setModelLoading(true);
    try {
      setModelInfo(await fetchModelInfo(config));
    } catch {}
    setModelLoading(false);
  };

  const handleSelectModel = async (target: string) => {
    if (!config || modelBusyName) return;
    setModelBusyName(target);
    const result = await setActiveModel(config, target);
    setModelBusyName(null);
    if (result.ok) {
      const info = await fetchModelInfo(config);
      setModelInfo(info);
    } else {
      Alert.alert("Switch Failed", result.error ?? "Could not switch model.");
    }
  };

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const overallStatus = useMemo(() => {
    if (!doctorData?.checks?.length) return null;
    const hasError = doctorData.checks.some((c) => c.status === "error");
    const hasWarning = doctorData.checks.some((c) => c.status === "warning");
    if (hasError) return { text: "UNHEALTHY", color: C.error };
    if (hasWarning) return { text: "DEGRADED", color: C.terminalAmber };
    return { text: "HEALTHY", color: C.terminalGreen };
  }, [doctorData]);

  const statusColor =
    connectionState === "online"
      ? C.terminalGreen
      : connectionState === "syncing"
        ? C.terminalAmber
        : C.error;
  const statusLabel =
    connectionState === "online"
      ? "ONLINE"
      : connectionState === "syncing"
        ? "SYNCING"
        : "OFFLINE";
  const statusIcon =
    connectionState === "online" ? (
      <Wifi size={14} color={statusColor} />
    ) : (
      <WifiOff size={14} color={statusColor} />
    );

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 30,
      }}
    >
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Settings size={20} color={C.terminalGreen} />
          <Text style={s.headerTitle}>Settings</Text>
        </View>
        <View style={s.headerRight}>
          {statusIcon}
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {/* Connection */}
      <Section title="Connection">
        <Field
          label="Host IP"
          value={host}
          onChangeText={setHost}
          placeholder="192.168.1.42"
          keyboardType="numbers-and-punctuation"
        />
        <Field
          label="Port"
          value={port}
          onChangeText={setPort}
          placeholder="8766"
          keyboardType="numeric"
        />
        <Field
          label="Secret Key"
          value={secret}
          onChangeText={setSecret}
          placeholder="Auth secret"
          secureTextEntry
        />

        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.btn, s.btnOutline]}
            onPress={() => setScannerOpen(true)}
          >
            <QrCode size={16} color={C.terminalGreen} />
            <Text style={s.btnOutlineText}>Scan Pairing QR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.btnOutline]}
            onPress={openModelSheet}
            disabled={!config}
          >
            <Activity size={16} color={C.terminalGreen} />
            <Text style={s.btnOutlineText}>Model</Text>
          </TouchableOpacity>
        </View>

        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.btn, s.btnOutline]}
            onPress={testConnection}
            disabled={testing || !host}
          >
            {testing ? (
              <ActivityIndicator color={C.terminalGreen} size="small" />
            ) : (
              <>
                <Activity size={16} color={C.terminalGreen} />
                <Text style={s.btnOutlineText}>Test Connection</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.btnPrimary, !host && s.btnDisabled]}
            onPress={saveAndConnect}
            disabled={!host}
          >
            <Save size={16} color={C.background} />
            <Text style={s.btnPrimaryText}>Save</Text>
          </TouchableOpacity>
        </View>

        {testResult !== "idle" && (
          <View
            style={[
              s.resultBanner,
              { borderColor: testResult === "ok" ? C.terminalGreen : C.error },
            ]}
          >
            {testResult === "ok" ? (
              <CheckCircle size={16} color={C.terminalGreen} />
            ) : (
              <XCircle size={16} color={C.error} />
            )}
            <Text
              style={[
                s.resultText,
                { color: testResult === "ok" ? C.terminalGreen : C.error },
              ]}
            >
              {testResult === "ok" ? "Connected" : "Connection Failed"}
            </Text>
          </View>
        )}
      </Section>

      <Section title="Interface">
        <View style={s.toggleRow}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Palette size={18} color={C.terminalGreen} />
            <View>
              <Text style={s.toggleLabel}>Terminal Accent</Text>
              <Text style={s.toggleSub}>Choose your UI highlight color</Text>
            </View>
          </View>
        </View>
        <View style={s.accentRow}>
          {ACCENTS.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[
                s.accentBtn,
                accentColor === a.id && {
                  borderColor: a.color,
                  backgroundColor: `${a.color}20`,
                },
              ]}
              onPress={() => setAccentColor(a.id as any)}
            >
              <View style={[s.accentDot, { backgroundColor: a.color }]} />
              <Text
                style={[
                  s.accentLabel,
                  accentColor === a.id && { color: a.color },
                ]}
              >
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      <Section title="Model">
        <View style={s.diagGrid}>
          <DiagItem
            label="Active"
            value={
              modelLoading && !modelInfo
                ? "…"
                : modelInfo
                  ? modelInfo.active + (modelInfo.provider ? ` (${modelInfo.provider})` : "")
                  : "—"
            }
            accent={!!modelInfo}
          />
        </View>
        <View style={s.checksList}>
          {modelLoading && !modelInfo ? (
            <ActivityIndicator color={C.terminalGreen} />
          ) : (modelInfo?.presets ?? []).length === 0 ? (
            <Text style={s.checkMsg}>No model presets found on this Ghost.</Text>
          ) : (
            (modelInfo?.presets ?? []).map((p) => {
              const isActive =
                !!modelInfo &&
                (modelInfo.active === p.model || modelInfo.active === p.name);
              return (
                <View key={p.name} style={s.skillRow}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        s.checkName,
                        isActive && { color: C.terminalGreen },
                      ]}
                    >
                      {p.name}
                    </Text>
                    <Text style={s.checkMsg}>
                      {p.provider}:{p.model}
                    </Text>
                  </View>
                  {modelBusyName === p.name ? (
                    <ActivityIndicator size="small" color={C.terminalGreen} />
                  ) : isActive ? (
                    <CheckCircle size={16} color={C.terminalGreen} />
                  ) : (
                    <TouchableOpacity
                      style={[s.btn, s.btnOutline, { paddingHorizontal: 10, paddingVertical: 6 }]}
                      disabled={!!modelBusyName}
                      onPress={() => handleSelectModel(p.name)}
                    >
                      <Text style={[s.btnOutlineText, { fontSize: 10 }]}>
                        SWITCH
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      </Section>

      <Section title="Permissions">
        <View style={s.toggleRow}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <MapPin size={18} color={C.terminalGreen} />
            <View>
              <Text style={s.toggleLabel}>Location</Text>
              <Text style={s.toggleSub}>
                Share coordinates for weather services
              </Text>
            </View>
          </View>
          <Switch
            value={sendLocation}
            onValueChange={setSendLocation}
            trackColor={{ false: C.border, true: "rgba(74, 222, 128, 0.3)" }}
            thumbColor={sendLocation ? C.terminalGreen : C.icon}
          />
        </View>
        <View style={s.toggleRow}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Bell size={18} color={C.terminalGreen} />
            <View>
              <Text style={s.toggleLabel}>Notifications</Text>
              <Text style={s.toggleSub}>Alert on proactive messages</Text>
            </View>
          </View>
          <Switch
            value={notifEnabled}
            onValueChange={(v) => {
              if (v) requestNotifications();
            }}
            trackColor={{ false: C.border, true: "rgba(74, 222, 128, 0.3)" }}
            thumbColor={notifEnabled ? C.terminalGreen : C.icon}
          />
        </View>
      </Section>

      {/* Skills */}
      <Section title="Skills">
        <View style={s.checksList}>
          {skillsLoading && skills.length === 0 ? (
            <ActivityIndicator color={C.terminalGreen} />
          ) : skills.length === 0 ? (
            <Text style={s.checkMsg}>No skills found on this Ghost.</Text>
          ) : (
            skills.map((sk) => (
              <View key={sk.name} style={s.skillRow}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => openSkillDetail(sk.name)}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text style={[s.checkName, { textTransform: "none" }]}>
                      {sk.name}
                    </Text>
                    {sk.bundled && (
                      <Text style={s.skillTag}>BUNDLED</Text>
                    )}
                    {sk.user_modified && (
                      <Text style={[s.skillTag, { color: C.terminalAmber }]}>
                        EDITED
                      </Text>
                    )}
                  </View>
                  <Text style={s.checkMsg} numberOfLines={2}>
                    {sk.description || "No description"}
                  </Text>
                </TouchableOpacity>
                <Switch
                  value={sk.enabled}
                  onValueChange={(v) => handleToggleSkill(sk.name, v)}
                  trackColor={{
                    false: C.border,
                    true: "rgba(74, 222, 128, 0.3)",
                  }}
                  thumbColor={sk.enabled ? C.terminalGreen : C.icon}
                />
              </View>
            ))
          )}
          <TouchableOpacity
            style={[s.btn, s.btnOutline, { marginTop: 12 }]}
            onPress={() => setInstallVisible(true)}
          >
            <Plus size={16} color={C.terminalGreen} />
            <Text style={s.btnOutlineText}>Install from GitHub</Text>
          </TouchableOpacity>
        </View>
      </Section>

      {/* Diagnostics */}
      <Section title="Status">
        {overallStatus && (
          <View
            style={[
              s.overallBanner,
              {
                borderColor: overallStatus.color,
                backgroundColor: `${overallStatus.color}11`,
              },
            ]}
          >
            <Activity size={16} color={overallStatus.color} />
            <Text style={[s.overallText, { color: overallStatus.color }]}>
              {overallStatus.text}
            </Text>
          </View>
        )}
        <View style={s.diagGrid}>
          <DiagItem
            label="API Endpoint"
            value={config ? `${config.piHost}:${config.piPort}` : "NULL"}
          />
          <DiagItem
            label="Latency"
            value={diagLatency !== null ? `${diagLatency}ms` : "—"}
            accent={diagLatency !== null && diagLatency < 200}
          />
          <DiagItem label="Version" value={doctorData?.version ?? "—"} />
          <DiagItem
            label="Uptime"
            value={
              doctorData?.uptime !== undefined
                ? formatUptime(doctorData.uptime)
                : "—"
            }
          />
          <DiagItem
            label="WebSocket"
            value={diagWSState}
            accent={diagWSState === "connected"}
          />
          <DiagItem label="Last Sync" value={diagLastRequest ?? "—"} />
          <DiagItem label="Profile" value={doctorData?.profile?.name ?? "—"} />
        </View>

        {doctorData && doctorData.checks.length > 0 && (
          <View style={s.checksList}>
            {doctorData.checks.map((check, i) => (
              <View key={i} style={s.checkRow}>
                {check.status === "ok" ? (
                  <CheckCircle size={14} color={C.terminalGreen} />
                ) : check.status === "warning" ? (
                  <AlertTriangle size={14} color={C.terminalAmber} />
                ) : (
                  <XCircle size={14} color={C.error} />
                )}
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={s.checkName}>{check.name}</Text>
                    <Text style={s.checkLatency}>{check.latency_ms}ms</Text>
                  </View>
                  {check.message ? (
                    <Text style={s.checkMsg}>{check.message}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.btn, s.btnOutline]}
            onPress={testConnection}
            disabled={testing || !config}
          >
            <Activity size={16} color={C.terminalGreen} />
            <Text style={s.btnOutlineText}>Run Diagnostics</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.btnOutline, { borderColor: C.terminalAmber }]}
            onPress={resetConnection}
            disabled={!config}
          >
            <RotateCcw size={16} color={C.terminalAmber} />
            <Text style={[s.btnOutlineText, { color: C.terminalAmber }]}>
              Reset Link
            </Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="Channel Ops">
        <View style={s.checksList}>
          {Object.entries(channelHealth).length === 0 ? (
            <Text style={s.checkMsg}>
              Run diagnostics to load channel health.
            </Text>
          ) : (
            Object.entries(channelHealth).map(([name, ch]) => (
              <View key={name} style={s.checkRow}>
                {ch.running ? (
                  <CheckCircle size={14} color={C.terminalGreen} />
                ) : ch.enabled ? (
                  <AlertTriangle size={14} color={C.terminalAmber} />
                ) : (
                  <XCircle size={14} color={C.icon} />
                )}
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={s.checkName}>{name.toUpperCase()}</Text>
                    <TouchableOpacity
                      style={[
                        s.btn,
                        s.btnOutline,
                        { paddingHorizontal: 10, paddingVertical: 6 },
                      ]}
                      disabled={!config || testing}
                      onPress={() => reconnectSelectedChannel(name)}
                    >
                      <RotateCcw size={12} color={C.terminalAmber} />
                      <Text
                        style={[
                          s.btnOutlineText,
                          { color: C.terminalAmber, fontSize: 10 },
                        ]}
                      >
                        RECONNECT
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.checkMsg}>
                    Enabled: {ch.enabled ? "yes" : "no"} · Running:{" "}
                    {ch.running ? "yes" : "no"} · Failures: {ch.failure_count}
                  </Text>
                  {ch.last_send_error ? (
                    <Text style={[s.checkMsg, { color: C.terminalAmber }]}>
                      Last send error: {ch.last_send_error}
                    </Text>
                  ) : null}
                  {ch.fatal_reason ? (
                    <Text style={[s.checkMsg, { color: C.error }]}>
                      Fatal reason: {ch.fatal_reason}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      </Section>

      <Section title="Session Inspector">
        <View style={s.diagGrid}>
          <DiagItem
            label="Requested Session"
            value={sessionInspector?.requested_session ?? "—"}
          />
          <DiagItem
            label="Active Channel"
            value={sessionInspector?.active_session?.channel ?? "—"}
          />
          <DiagItem
            label="Active Chat ID"
            value={sessionInspector?.active_session?.chat_id ?? "—"}
          />
          <DiagItem
            label="Routing Target"
            value={sessionInspector?.delivery_target ?? "—"}
          />
          <DiagItem
            label="Last Request ID"
            value={sessionInspector?.last_request_id ?? "—"}
          />
          <DiagItem
            label="Delivery Trace"
            value={lastTraceStates.length ? lastTraceStates.join(" → ") : "—"}
          />
        </View>
      </Section>

      <Section title="Help">
        <View style={s.infoBox}>
          <Info size={16} color={C.icon} style={{ marginBottom: 8 }} />
          <Text style={s.infoText}>
            {`Quick Setup\n\n1) Enter Pi Host, Port, and Secret, then tap Save & Connect.\n2) Tap Test Connection to verify /v1/health and capture latency.\n3) Use Run Diagnostics to inspect backend checks and service state.\n\nIf Preview Build Cannot Connect\n\n• Android preview builds require cleartext traffic to be allowed for http:// endpoints.\n• iOS preview builds require ATS exception or HTTPS endpoint.\n• Rebuild the app after native config changes; OTA update alone is not enough.\n\nWorkspace Tips\n\n• Tree mode is precise for file navigation.\n• Map mode is exploratory; use + / − / RESET for framing.\n• Image files now open as image preview, while binary files stay protected.\n\nFast Troubleshooting\n\n• Ensure Ghost gateway is running on the Pi and reachable from your phone network.\n• Confirm Tailscale is connected on both devices when using tailnet IP.\n• If connection drops, tap Reset Link, then Run Diagnostics again.`}
          </Text>
        </View>
      </Section>

      <QrPairingScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onPaired={async (cfg) => {
          setScannerOpen(false);
          setHost(cfg.piHost);
          setPort(cfg.piPort);
          setSecret(cfg.secret);
          const next: GhostConfig = {
            piHost: cfg.piHost.trim(),
            piPort: cfg.piPort.trim(),
            secret: cfg.secret.trim(),
            session: config?.session,
            sendLocation,
          };
          await saveConfig(next);
          setConfig(next);
          const ok = await checkHealth(next);
          setConnected(ok);
          setTestResult(ok ? "ok" : "fail");
          if (ok) {
            connectWebSocket(next);
            try {
              setDoctorData(await fetchDoctor(next));
              setAvailableTools(await fetchAvailableTools(next));
              await refreshOpsData(next);
            } catch {}
          }
        }}
      />

      {/* Skill detail modal */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailVisible(false)}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setDetailVisible(false)}
        />
        <View style={s.modalContent}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{detailSkill?.name ?? "Skill"}</Text>
            <TouchableOpacity onPress={() => setDetailVisible(false)}>
              <Text style={[s.btnOutlineText, { fontSize: 14 }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 480 }}>
            {detailSkill && (
              <View style={s.infoBox}>
                <View style={s.skillMetaRow}>
                  <Text style={s.skillTag}>{detailSkill.enabled ? "ENABLED" : "DISABLED"}</Text>
                  {detailSkill.bundled && <Text style={s.skillTag}>BUNDLED</Text>}
                  {detailSkill.user_modified && (
                    <Text style={[s.skillTag, { color: C.terminalAmber }]}>EDITED</Text>
                  )}
                </View>
                {detailSkill.description ? (
                  <Text style={s.checkMsg}>{detailSkill.description}</Text>
                ) : null}
                {detailSkill.files.map((f) => (
                  <View key={f.path} style={s.skillFileBlock}>
                    <Text style={[s.checkName, { textTransform: "none" }]}>{f.path}</Text>
                    <Text style={s.skillFileText} numberOfLines={8}>
                      {f.content}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Install skill modal */}
      <Modal
        visible={installVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInstallVisible(false)}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setInstallVisible(false)}
        />
        <View style={s.modalContent}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Install Skill</Text>
            <TouchableOpacity onPress={() => setInstallVisible(false)}>
              <Text style={[s.btnOutlineText, { fontSize: 14 }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.infoBox}>
            <Text style={s.checkMsg}>
              Paste a public GitHub repo and path containing a SKILL.md.
            </Text>
            <Field
              label="Owner"
              value={installOwner}
              onChangeText={setInstallOwner}
              placeholder="sipeed"
            />
            <Field
              label="Repo"
              value={installRepo}
              onChangeText={setInstallRepo}
              placeholder="ghost-skills"
            />
            <Field
              label="Path"
              value={installPath}
              onChangeText={setInstallPath}
              placeholder="weather"
            />
            <TouchableOpacity
              style={[
                s.btn,
                s.btnPrimary,
                (installBusy ||
                  !installOwner.trim() ||
                  !installRepo.trim() ||
                  !installPath.trim()) && s.btnDisabled,
              ]}
              disabled={
                installBusy ||
                !installOwner.trim() ||
                !installRepo.trim() ||
                !installPath.trim()
              }
              onPress={handleInstallSkill}
            >
              {installBusy ? (
                <ActivityIndicator color={C.background} size="small" />
              ) : (
                <>
                  <Plus size={16} color={C.background} />
                  <Text style={s.btnPrimaryText}>Install</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionContent}>{children}</View>
    </View>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.fieldInput}
        placeholderTextColor={C.icon}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

function DiagItem({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={s.diagItem}>
      <Text style={s.diagLabel}>{label}</Text>
      <Text style={[s.diagValue, accent && { color: C.terminalGreen }]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    paddingHorizontal: UI.spacing.screenX,
    paddingVertical: UI.spacing.headerY,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: {
    fontFamily: FONT_MONO,
    fontSize: 16,
    fontWeight: "700",
    color: C.terminalGreen,
    letterSpacing: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: FONT_MONO,
    fontSize: UI.typography.status,
    fontWeight: "700",
    letterSpacing: 1,
  },

  section: { marginTop: 18, paddingHorizontal: UI.spacing.screenX },
  sectionTitle: {
    color: C.icon,
    fontSize: UI.typography.meta,
    fontWeight: "700",
    letterSpacing: 2,
    fontFamily: FONT_MONO,
    marginBottom: 8,
  },
  sectionContent: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 0,
  },

  field: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  fieldLabel: {
    color: C.icon,
    fontSize: UI.typography.meta,
    letterSpacing: 1,
    fontFamily: FONT_MONO,
    marginBottom: 4,
  },
  fieldInput: {
    color: C.text,
    fontSize: 14,
    fontFamily: FONT_MONO,
    paddingVertical: 4,
  },

  btnRow: { flexDirection: "row", gap: 10, padding: 14 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  btnPrimary: { backgroundColor: C.terminalGreen },
  btnOutline: { borderWidth: 1, borderColor: C.terminalGreen },
  btnDisabled: { opacity: 0.4 },
  btnPrimaryText: {
    color: C.background,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: FONT_MONO,
  },
  btnOutlineText: {
    color: C.terminalGreen,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: FONT_MONO,
  },

  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 14,
    marginTop: 0,
    padding: 10,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  resultText: { fontFamily: FONT_MONO, fontSize: 12, fontWeight: "700" },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  toggleLabel: {
    color: C.text,
    fontSize: 12,
    fontFamily: FONT_MONO,
    fontWeight: "700",
  },
  toggleSub: {
    color: C.icon,
    fontSize: UI.typography.meta,
    marginTop: 2,
    fontFamily: FONT_MONO,
  },

  accentRow: { flexDirection: "row", padding: 14, gap: 10, flexWrap: "wrap" },
  accentBtn: {
    flex: 1,
    minWidth: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  accentDot: { width: 8, height: 8, borderRadius: 4 },
  accentLabel: {
    color: C.text,
    fontSize: UI.typography.meta,
    fontFamily: FONT_MONO,
    fontWeight: "700",
  },

  diagGrid: { flexDirection: "row", flexWrap: "wrap" },
  diagItem: {
    width: "50%",
    padding: 14,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  diagLabel: {
    color: C.icon,
    fontSize: UI.typography.meta,
    letterSpacing: 1.5,
    fontFamily: FONT_MONO,
    marginBottom: 4,
  },
  diagValue: { color: C.text, fontSize: 12, fontFamily: FONT_MONO },

  overallBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  overallText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    fontFamily: FONT_MONO,
  },

  checksList: {
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  checkName: {
    color: C.text,
    fontSize: 11,
    fontFamily: FONT_MONO,
    textTransform: "uppercase",
  },
  checkLatency: {
    color: C.icon,
    fontSize: UI.typography.meta,
    fontFamily: FONT_MONO,
  },
  checkMsg: {
    color: C.icon,
    fontSize: UI.typography.meta,
    marginTop: 2,
    fontFamily: FONT_MONO,
  },

  infoBox: { padding: 14 },
  infoText: {
    color: C.icon,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: FONT_MONO,
  },

  // Skills
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  skillTag: {
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 5,
    paddingVertical: 1,
    color: C.icon,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.5,
    fontFamily: FONT_MONO,
  },
  skillMetaRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  skillFileBlock: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
  },
  skillFileText: {
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  // Modals
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  modalContent: {
    position: "absolute",
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.terminalGreen,
    borderRadius: UI.radius.panel,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  modalTitle: {
    color: C.terminalGreen,
    fontFamily: FONT_MONO,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
