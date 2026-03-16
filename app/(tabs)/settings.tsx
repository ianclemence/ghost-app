import Constants, { AppOwnership } from "expo-constants";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  checkHealth,
  checkHealthDebug,
  connectWebSocket,
  DoctorResponse,
  fetchAvailableTools,
  fetchDoctor,
  fetchHistory,
  getWSState,
  GhostConfig,
  Message,
  saveConfig,
} from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";

const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

const C = {
  bg: "#080C0F",
  surface: "#0D1117",
  border: "#1A2332",
  accent: "#00FF88",
  accentDim: "#00FF8822",
  text: "#C8D8E8",
  textDim: "#4A6080",
  textMuted: "#2A3A4A",
  danger: "#FF4455",
  warn: "#FFAA00",
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    config,
    setConfig,
    connectionState,
    setConnectionState,
    setConnected,
    setAvailableTools,
    setMessages,
    currentSession,
    setCurrentSession,
    setProfile,
  } = useGhostStore();

  const [host, setHost] = useState(config?.piHost ?? "");
  const [port, setPort] = useState(config?.piPort ?? "8766");
  const [secret, setSecret] = useState(config?.secret ?? "");
  const [session, setSession] = useState(config?.session ?? "mobile:default");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle");
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [recentSessions, setRecentSessions] = useState<string[]>([]);

  // Diagnostics state
  const [diagLatency, setDiagLatency] = useState<number | null>(null);
  const [diagWSState, setDiagWSState] = useState<string>("unknown");
  const [diagLastRequest, setDiagLastRequest] = useState<string | null>(null);
  const [doctorData, setDoctorData] = useState<DoctorResponse | null>(null);

  useEffect(() => {
    const values = [currentSession, session, "mobile:default"].filter(Boolean);
    setRecentSessions((prev) =>
      Array.from(new Set([...values, ...prev])).slice(0, 8),
    );
  }, [currentSession, session]);

  const normalizeHistory = (items: Message[]) =>
    items.map((m) => ({ ...m, status: "completed" as const }));

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
      alert(
        "Push notifications are not supported in Expo Go. Use a development build to enable them.",
      );
      return;
    }
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifEnabled(status === "granted");
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult("idle");
    const cfg: GhostConfig = {
      piHost: host.trim(),
      piPort: port.trim(),
      secret: secret.trim(),
      session: session.trim() === "" ? undefined : session.trim(),
    };
    const result = await checkHealthDebug(cfg);
    const ok = result.ok;
    console.log("[ghost-bridge:test]", {
      inputHost: host,
      inputPort: port,
      hasSecret: secret.trim().length > 0,
      ...result,
    });
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
      session: session.trim() === "" ? undefined : session.trim(),
    };
    await saveConfig(cfg);
    setConfig(cfg);
    if (cfg.session) {
      setCurrentSession(cfg.session);
    }
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
      } catch (e) {
        console.warn("Doctor fetch failed", e);
      }
    }
  };

  const switchSession = async (newSession: string) => {
    if (!config || !newSession.trim()) return;
    const nextSession = newSession.trim();
    const nextCfg: GhostConfig = { ...config, session: nextSession };
    await saveConfig(nextCfg);
    setConfig(nextCfg);
    setSession(nextSession);
    setCurrentSession(nextSession);
    setMessages([]);
    const history = await fetchHistory(nextCfg, 50, 0).catch(() => ({
      messages: [],
      total: 0,
    }));
    setMessages(normalizeHistory(history.messages));
    setRecentSessions((prev) =>
      Array.from(new Set([nextSession, ...prev])).slice(0, 8),
    );
    connectWebSocket(nextCfg);
  };

  const createNewSession = () => {
    const next = `mobile:${Date.now()}`;
    switchSession(next);
  };

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const statusColor =
    testResult === "ok"
      ? C.accent
      : testResult === "fail"
        ? C.danger
        : C.textDim;
  const statusText =
    testResult === "ok"
      ? "✓ Connected"
      : testResult === "fail"
        ? "✗ Unreachable"
        : "";
  const overallStatus = useMemo(() => {
    if (!doctorData?.checks?.length) return null;
    const hasError = doctorData.checks.some((c) => c.status === "error");
    const hasWarning = doctorData.checks.some((c) => c.status === "warning");
    if (hasError) return { text: "UNHEALTHY", color: C.danger };
    if (hasWarning) return { text: "DEGRADED", color: C.warn };
    return { text: "HEALTHY", color: C.accent };
  }, [doctorData]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 30,
      }}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SETTINGS</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  connectionState === "online"
                    ? C.accent
                    : connectionState === "syncing"
                      ? C.warn
                      : C.danger,
              }}
            />
            <Text
              style={{
                color:
                  connectionState === "online"
                    ? C.accent
                    : connectionState === "syncing"
                      ? C.warn
                      : C.danger,
                fontSize: 9,
                fontWeight: "700",
                letterSpacing: 1.5,
                fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
              }}
            >
              {connectionState.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Connection */}
      <Section title="GHOST PI CONNECTION">
        <Field
          label="Pi IP Address"
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
          label="Shared Secret"
          value={secret}
          onChangeText={setSecret}
          placeholder="Optional auth secret"
          secureTextEntry
        />
        <Field
          label="Session (optional)"
          value={session}
          onChangeText={setSession}
          placeholder="mobile:default"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline]}
            onPress={() => switchSession(session)}
            disabled={!config || !session.trim()}
          >
            <Text style={styles.btnOutlineText}>SWITCH SESSION</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline]}
            onPress={createNewSession}
            disabled={!config}
          >
            <Text style={styles.btnOutlineText}>NEW SESSION</Text>
          </TouchableOpacity>
        </View>
        {recentSessions.length > 0 && (
          <View style={styles.sessionChipsWrap}>
            {recentSessions.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.sessionChip}
                onPress={() => {
                  setSession(s);
                  switchSession(s);
                }}
              >
                <Text style={styles.sessionChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline]}
            onPress={testConnection}
            disabled={testing || !host}
          >
            {testing ? (
              <ActivityIndicator color={C.accent} size="small" />
            ) : (
              <Text style={styles.btnOutlineText}>TEST</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, !host && styles.btnDisabled]}
            onPress={saveAndConnect}
            disabled={!host}
          >
            <Text style={styles.btnPrimaryText}>SAVE & CONNECT</Text>
          </TouchableOpacity>
        </View>

        {statusText !== "" && (
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusText}
          </Text>
        )}
      </Section>

      {/* Diagnostics */}
      <Section title="CONNECTION DIAGNOSTICS">
        {overallStatus && (
          <View
            style={[
              styles.overallBanner,
              {
                borderColor: overallStatus.color,
                backgroundColor: `${overallStatus.color}22`,
              },
            ]}
          >
            <Text style={[styles.overallText, { color: overallStatus.color }]}>
              {overallStatus.text}
            </Text>
          </View>
        )}
        <View style={styles.diagGrid}>
          <DiagItem
            label="API URL"
            value={config ? `${config.piHost}:${config.piPort}` : "Not set"}
          />
          <DiagItem
            label="LATENCY"
            value={diagLatency !== null ? `${diagLatency}ms` : "—"}
            accent={diagLatency !== null && diagLatency < 200}
          />
          <DiagItem label="BRIDGE VER." value={doctorData?.version ?? "—"} />
          <DiagItem
            label="BRIDGE UPTIME"
            value={
              doctorData?.uptime !== undefined
                ? formatUptime(doctorData.uptime)
                : "—"
            }
          />
          <DiagItem
            label="WEBSOCKET"
            value={diagWSState}
            accent={diagWSState === "connected"}
          />
          <DiagItem label="LAST CHECK" value={diagLastRequest ?? "—"} />
          <DiagItem label="PROFILE" value={doctorData?.profile?.name ?? "—"} />
        </View>

        {/* Doctor Checks */}
        {doctorData && doctorData.checks.length > 0 && (
          <View style={styles.checksList}>
            {doctorData.checks.map((check, i) => (
              <View key={i} style={styles.checkRow}>
                <Text
                  style={[
                    styles.checkIcon,
                    {
                      color:
                        check.status === "ok"
                          ? C.accent
                          : check.status === "warning"
                            ? C.warn
                            : C.danger,
                    },
                  ]}
                >
                  {check.status === "ok"
                    ? "✓"
                    : check.status === "warning"
                      ? "⚠"
                      : "✗"}
                </Text>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={styles.checkName}>{check.name}</Text>
                    <Text style={styles.checkLatency}>
                      {check.latency_ms}ms
                    </Text>
                  </View>
                  {check.message ? (
                    <Text style={styles.checkMsg}>{check.message}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline]}
            onPress={testConnection}
            disabled={testing || !config}
          >
            <Text style={styles.btnOutlineText}>RUN DIAGNOSTICS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { borderColor: C.warn }]}
            onPress={resetConnection}
            disabled={!config}
          >
            <Text style={[styles.btnOutlineText, { color: C.warn }]}>
              RESET
            </Text>
          </TouchableOpacity>
        </View>
      </Section>

      {/* Notifications */}
      <Section title="NOTIFICATIONS">
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Push Notifications</Text>
            <Text style={styles.toggleSub}>
              Alert when Ghost sends proactive messages
            </Text>
          </View>
          <Switch
            value={notifEnabled}
            onValueChange={(v) => {
              if (v) requestNotifications();
            }}
            trackColor={{ false: C.border, true: C.accentDim }}
            thumbColor={notifEnabled ? C.accent : C.textDim}
          />
        </View>
      </Section>

      {/* Bridge Setup Instructions */}
      <Section title="PI SETUP INSTRUCTIONS">
        <View style={styles.infoBox}>
          <Text
            style={styles.infoText}
          >{`1. Set Ghost Internal API in .env:\n   GHOST_API_PORT=8765\n\n2. Set ghost-bridge in .env:\n   BRIDGE_PORT=8766\n   BRIDGE_SECRET=your_secret_here\n\n3. Build and run bridge:\n   cd ghost-bridge\n   go build -o ghost-bridge .\n   ./ghost-bridge\n\n4. Open both ports in your firewall:\n   sudo ufw allow 8765\n   sudo ufw allow 8766`}</Text>
        </View>
      </Section>

      {/* Status */}
      <Section title="STATUS">
        <View style={styles.statusGrid}>
          <StatusItem label="PI HOST" value={config?.piHost ?? "Not set"} />
          <StatusItem label="PORT" value={config?.piPort ?? "—"} />
          <StatusItem
            label="CONNECTION"
            value={
              connectionState === "online"
                ? "Online"
                : connectionState === "syncing"
                  ? "Syncing"
                  : "Offline"
            }
            accent={connectionState === "online"}
          />
          <StatusItem label="APP VERSION" value="1.1.0" />
        </View>
      </Section>
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
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        placeholderTextColor="#2A3A4A"
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

function StatusItem({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.statusItem}>
      <Text style={styles.statusItemLabel}>{label}</Text>
      <Text style={[styles.statusItemValue, accent && { color: "#00FF88" }]}>
        {value}
      </Text>
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
    <View style={styles.diagItem}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={[styles.diagValue, accent && { color: C.accent }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080C0F" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 16,
    fontWeight: "700",
    color: C.accent,
    letterSpacing: 4,
  },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: {
    color: C.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    marginBottom: 10,
  },
  sectionContent: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    gap: 1,
  },
  field: { padding: 14, gap: 6 },
  fieldLabel: { color: C.textDim, fontSize: 11, letterSpacing: 1 },
  fieldInput: {
    color: C.text,
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 6,
  },
  btnRow: { flexDirection: "row", gap: 10, padding: 14 },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: C.accent },
  btnOutline: { borderWidth: 1, borderColor: C.accent },
  btnDisabled: { opacity: 0.4 },
  btnPrimaryText: {
    color: C.bg,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  btnOutlineText: {
    color: C.accent,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  sessionChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  sessionChip: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#ffffff08",
  },
  sessionChipText: {
    color: C.textDim,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  statusText: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    fontSize: 13,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  toggleLabel: { color: C.text, fontSize: 14 },
  toggleSub: { color: C.textDim, fontSize: 12, marginTop: 2 },
  infoBox: { padding: 14 },
  infoText: {
    color: C.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statusItem: { width: "50%", padding: 14, gap: 4 },
  statusItemLabel: { color: C.textMuted, fontSize: 10, letterSpacing: 1 },
  statusItemValue: {
    color: C.text,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  diagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  diagItem: { width: "50%", padding: 14, gap: 4 },
  diagLabel: {
    color: C.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  diagValue: {
    color: C.text,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  overallBanner: {
    marginHorizontal: 14,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  overallText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  checksList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
    paddingHorizontal: 14,
    gap: 10,
    paddingBottom: 4,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  checkIcon: {
    fontSize: 14,
    fontWeight: "700",
    width: 14,
    textAlign: "center",
    marginTop: 1,
  },
  checkName: {
    color: C.text,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textTransform: "uppercase",
  },
  checkLatency: {
    color: C.textDim,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  checkMsg: {
    color: C.textDim,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
});
