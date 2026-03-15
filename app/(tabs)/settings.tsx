import Constants, { AppOwnership } from "expo-constants";
import React, { useEffect, useState } from "react";
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
  getWSState,
  GhostConfig,
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
  } = useGhostStore();

  const [host, setHost] = useState(config?.piHost ?? "");
  const [port, setPort] = useState(config?.piPort ?? "8765");
  const [remotePort, setRemotePort] = useState(config?.remotePort ?? "8766");
  const [secret, setSecret] = useState(config?.secret ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle");
  const [notifEnabled, setNotifEnabled] = useState(false);

  // Diagnostics state
  const [diagLatency, setDiagLatency] = useState<number | null>(null);
  const [diagBridgeVersion, setDiagBridgeVersion] = useState<string | null>(
    null,
  );
  const [diagBridgeUptime, setDiagBridgeUptime] = useState<number | null>(null);
  const [diagWSState, setDiagWSState] = useState<string>("unknown");
  const [diagLastRequest, setDiagLastRequest] = useState<string | null>(null);

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
      remotePort: remotePort.trim(),
      secret: secret.trim(),
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
    if (result.body) {
      try {
        const parsed = JSON.parse(result.body);
        if (parsed.version) setDiagBridgeVersion(parsed.version);
        if (parsed.uptime_s !== undefined) setDiagBridgeUptime(parsed.uptime_s);
      } catch {}
    }
    setDiagWSState(getWSState());
    setDiagLastRequest(new Date().toLocaleTimeString());
  };

  const saveAndConnect = async () => {
    const cfg: GhostConfig = {
      piHost: host.trim(),
      piPort: port.trim(),
      secret: secret.trim(),
    };
    await saveConfig(cfg);
    setConfig(cfg);
    const ok = await checkHealth(cfg);
    setConnected(ok);
    setTestResult(ok ? "ok" : "fail");
    if (ok) {
      connectWebSocket(cfg);
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 30,
      }}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SETTINGS</Text>
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
          label="Internal API Port"
          value={port}
          onChangeText={setPort}
          placeholder="8765"
          keyboardType="numeric"
        />
        <Field
          label="Remote Port (optional)"
          value={remotePort}
          onChangeText={setRemotePort}
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
        <View style={styles.diagGrid}>
          <DiagItem
            label="BRIDGE URL"
            value={config ? `${config.piHost}:${config.piPort}` : "Not set"}
          />
          <DiagItem
            label="LATENCY"
            value={diagLatency !== null ? `${diagLatency}ms` : "—"}
            accent={diagLatency !== null && diagLatency < 200}
          />
          <DiagItem label="BRIDGE VER." value={diagBridgeVersion ?? "—"} />
          <DiagItem
            label="BRIDGE UPTIME"
            value={
              diagBridgeUptime !== null ? formatUptime(diagBridgeUptime) : "—"
            }
          />
          <DiagItem
            label="WEBSOCKET"
            value={diagWSState}
            accent={diagWSState === "connected"}
          />
          <DiagItem label="LAST CHECK" value={diagLastRequest ?? "—"} />
        </View>
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
          <Text style={styles.infoText}>
            {`1. Copy ghost-bridge/ folder to your Pi\n\n2. Add to your Ghost .env:\n   BRIDGE_PORT=8765\n   BRIDGE_SECRET=your_secret_here\n\n3. Build and run:\n   cd ghost-bridge\n   go build -o ghost-bridge .\n   ./ghost-bridge\n\n4. Or add to ghost.service as an ExecStartPost\n\n5. Open port 8765 in your firewall:\n   sudo ufw allow 8765`}
          </Text>
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
});
