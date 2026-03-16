
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
  Terminal, Settings, Server, Wifi, WifiOff, Activity, 
  AlertTriangle, CheckCircle, XCircle, Info, Save, RotateCcw, 
  Shield, Bell, MapPin 
} from "lucide-react-native";

import {
  checkHealth,
  checkHealthDebug,
  connectWebSocket,
  DoctorResponse,
  fetchAvailableTools,
  fetchDoctor,
  getWSState,
  GhostConfig,
  saveConfig,
} from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";
import { Colors, Fonts } from "@/constants/theme";

const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
const C = Colors.dark;
const FONT_MONO = Fonts.mono;

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
  } = useGhostStore();

  const [host, setHost] = useState(config?.piHost ?? "");
  const [port, setPort] = useState(config?.piPort ?? "8766");
  const [secret, setSecret] = useState(config?.secret ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle");
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [sendLocation, setSendLocation] = useState(config?.sendLocation ?? true);

  // Diagnostics state
  const [diagLatency, setDiagLatency] = useState<number | null>(null);
  const [diagWSState, setDiagWSState] = useState<string>("unknown");
  const [diagLastRequest, setDiagLastRequest] = useState<string | null>(null);
  const [doctorData, setDoctorData] = useState<DoctorResponse | null>(null);

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

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 30 }}
    >
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Settings size={20} color={C.terminalGreen} />
          <Text style={s.headerTitle}>SYSTEM_CONFIG</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {connectionState === "online" ? <Wifi size={14} color={C.terminalGreen} /> : <WifiOff size={14} color={C.error} />}
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: connectionState === "online" ? C.terminalGreen : connectionState === "syncing" ? C.terminalAmber : C.error }} />
          <Text style={[s.statusText, { color: connectionState === "online" ? C.terminalGreen : connectionState === "syncing" ? C.terminalAmber : C.error }]}>
            {connectionState.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Connection */}
      <Section title="GHOST_UPLINK">
        <Field label="HOST_IP" value={host} onChangeText={setHost} placeholder="192.168.1.42" keyboardType="numbers-and-punctuation" />
        <Field label="PORT" value={port} onChangeText={setPort} placeholder="8766" keyboardType="numeric" />
        <Field label="SECRET_KEY" value={secret} onChangeText={setSecret} placeholder="Auth secret" secureTextEntry />
        
        <View style={s.btnRow}>
          <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={testConnection} disabled={testing || !host}>
            {testing ? <ActivityIndicator color={C.terminalGreen} size="small" /> : (
              <>
                <Activity size={16} color={C.terminalGreen} />
                <Text style={s.btnOutlineText}>TEST_PING</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnPrimary, !host && s.btnDisabled]} onPress={saveAndConnect} disabled={!host}>
            <Save size={16} color={C.background} />
            <Text style={s.btnPrimaryText}>SAVE_CONFIG</Text>
          </TouchableOpacity>
        </View>

        {testResult !== "idle" && (
          <View style={[s.resultBanner, { borderColor: testResult === "ok" ? C.terminalGreen : C.error }]}>
            {testResult === "ok" ? <CheckCircle size={16} color={C.terminalGreen} /> : <XCircle size={16} color={C.error} />}
            <Text style={[s.resultText, { color: testResult === "ok" ? C.terminalGreen : C.error }]}>
              {testResult === "ok" ? "CONNECTION_ESTABLISHED" : "CONNECTION_FAILED"}
            </Text>
          </View>
        )}
      </Section>

      <Section title="CONTEXT_AWARENESS">
        <View style={s.toggleRow}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <MapPin size={18} color={C.terminalGreen} />
            <View>
              <Text style={s.toggleLabel}>LOCATION_TELEMETRY</Text>
              <Text style={s.toggleSub}>Share coordinates for weather services</Text>
            </View>
          </View>
          <Switch
            value={sendLocation}
            onValueChange={setSendLocation}
            trackColor={{ false: C.border, true: 'rgba(74, 222, 128, 0.3)' }}
            thumbColor={sendLocation ? C.terminalGreen : C.icon}
          />
        </View>
        <View style={s.toggleRow}>
           <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Bell size={18} color={C.terminalGreen} />
            <View>
              <Text style={s.toggleLabel}>PUSH_NOTIFICATIONS</Text>
              <Text style={s.toggleSub}>Alert on proactive messages</Text>
            </View>
          </View>
          <Switch
            value={notifEnabled}
            onValueChange={(v) => { if (v) requestNotifications(); }}
            trackColor={{ false: C.border, true: 'rgba(74, 222, 128, 0.3)' }}
            thumbColor={notifEnabled ? C.terminalGreen : C.icon}
          />
        </View>
      </Section>

      {/* Diagnostics */}
      <Section title="SYSTEM_DIAGNOSTICS">
        {overallStatus && (
          <View style={[s.overallBanner, { borderColor: overallStatus.color, backgroundColor: `${overallStatus.color}11` }]}>
            <Activity size={16} color={overallStatus.color} />
            <Text style={[s.overallText, { color: overallStatus.color }]}>{overallStatus.text}</Text>
          </View>
        )}
        <View style={s.diagGrid}>
          <DiagItem label="API_ENDPOINT" value={config ? `${config.piHost}:${config.piPort}` : "NULL"} />
          <DiagItem label="LATENCY" value={diagLatency !== null ? `${diagLatency}ms` : "—"} accent={diagLatency !== null && diagLatency < 200} />
          <DiagItem label="BRIDGE_VER" value={doctorData?.version ?? "—"} />
          <DiagItem label="UPTIME" value={doctorData?.uptime !== undefined ? formatUptime(doctorData.uptime) : "—"} />
          <DiagItem label="WEBSOCKET" value={diagWSState} accent={diagWSState === "connected"} />
          <DiagItem label="LAST_SYNC" value={diagLastRequest ?? "—"} />
          <DiagItem label="PROFILE_ID" value={doctorData?.profile?.name ?? "—"} />
        </View>

        {doctorData && doctorData.checks.length > 0 && (
          <View style={s.checksList}>
            {doctorData.checks.map((check, i) => (
              <View key={i} style={s.checkRow}>
                {check.status === "ok" ? <CheckCircle size={14} color={C.terminalGreen} /> : 
                 check.status === "warning" ? <AlertTriangle size={14} color={C.terminalAmber} /> : 
                 <XCircle size={14} color={C.error} />}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={s.checkName}>{check.name}</Text>
                    <Text style={s.checkLatency}>{check.latency_ms}ms</Text>
                  </View>
                  {check.message ? <Text style={s.checkMsg}>{check.message}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={s.btnRow}>
          <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={testConnection} disabled={testing || !config}>
            <Activity size={16} color={C.terminalGreen} />
            <Text style={s.btnOutlineText}>RUN_DIAGNOSTICS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnOutline, { borderColor: C.terminalAmber }]} onPress={resetConnection} disabled={!config}>
            <RotateCcw size={16} color={C.terminalAmber} />
            <Text style={[s.btnOutlineText, { color: C.terminalAmber }]}>RESET_LINK</Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="SETUP_GUIDE">
        <View style={s.infoBox}>
          <Info size={16} color={C.icon} style={{ marginBottom: 8 }} />
          <Text style={s.infoText}>
            {`// Ensure Ghost Bridge is running on Pi\n\n1. Check .env configuration\n2. Verify firewall rules (ufw allow 8766)\n3. Run ./ghost-bridge\n4. Connect via LAN IP`}
          </Text>
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionContent}>{children}</View>
    </View>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.fieldInput} placeholderTextColor={C.icon} autoCapitalize="none" autoCorrect={false} {...props} />
    </View>
  );
}

function DiagItem({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.diagItem}>
      <Text style={s.diagLabel}>{label}</Text>
      <Text style={[s.diagValue, accent && { color: C.terminalGreen }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  headerTitle: { fontFamily: FONT_MONO, fontSize: 16, fontWeight: "700", color: C.terminalGreen, letterSpacing: 1 },
  statusText: { fontFamily: FONT_MONO, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: { color: C.icon, fontSize: 10, fontWeight: "700", letterSpacing: 2, fontFamily: FONT_MONO, marginBottom: 8 },
  sectionContent: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 0 },
  
  field: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  fieldLabel: { color: C.icon, fontSize: 10, letterSpacing: 1, fontFamily: FONT_MONO, marginBottom: 4 },
  fieldInput: { color: C.text, fontSize: 14, fontFamily: FONT_MONO, paddingVertical: 4 },
  
  btnRow: { flexDirection: "row", gap: 10, padding: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 0, alignItems: "center", justifyContent: "center", flexDirection: 'row', gap: 8 },
  btnPrimary: { backgroundColor: C.terminalGreen },
  btnOutline: { borderWidth: 1, borderColor: C.terminalGreen },
  btnDisabled: { opacity: 0.4 },
  btnPrimaryText: { color: C.background, fontWeight: "700", fontSize: 12, letterSpacing: 1, fontFamily: FONT_MONO },
  btnOutlineText: { color: C.terminalGreen, fontWeight: "700", fontSize: 12, letterSpacing: 1, fontFamily: FONT_MONO },
  
  resultBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 14, marginTop: 0, padding: 10, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  resultText: { fontFamily: FONT_MONO, fontSize: 12, fontWeight: "700" },
  
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  toggleLabel: { color: C.text, fontSize: 12, fontFamily: FONT_MONO, fontWeight: "700" },
  toggleSub: { color: C.icon, fontSize: 10, marginTop: 2, fontFamily: FONT_MONO },
  
  diagGrid: { flexDirection: "row", flexWrap: "wrap" },
  diagItem: { width: "50%", padding: 14, borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.border },
  diagLabel: { color: C.icon, fontSize: 9, letterSpacing: 1.5, fontFamily: FONT_MONO, marginBottom: 4 },
  diagValue: { color: C.text, fontSize: 12, fontFamily: FONT_MONO },
  
  overallBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 14, paddingVertical: 8, borderWidth: 1 },
  overallText: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2, fontFamily: FONT_MONO },
  
  checksList: { padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: C.border },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  checkName: { color: C.text, fontSize: 11, fontFamily: FONT_MONO, textTransform: "uppercase" },
  checkLatency: { color: C.icon, fontSize: 10, fontFamily: FONT_MONO },
  checkMsg: { color: C.icon, fontSize: 10, marginTop: 2, fontFamily: FONT_MONO },
  
  infoBox: { padding: 14 },
  infoText: { color: C.icon, fontSize: 11, lineHeight: 16, fontFamily: FONT_MONO },
});
