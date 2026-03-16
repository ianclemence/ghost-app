
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { 
  Globe, Terminal, Folder, Music, Monitor, HardDrive, Cpu, Activity, 
  LayoutGrid, Image as ImageIcon, Play, Command, RefreshCw, Power
} from "lucide-react-native";

import {
  ExecResult,
  fetchStats,
  openOnPi,
  PiStats,
  runExec,
  takeScreenshot,
} from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";
import { Colors, Fonts } from "@/constants/theme";

const C = Colors.dark;
const FONT_MONO = Fonts.mono;

// ─── Quick-launch app buttons ─────────────────────────────────────────────
const QUICK_APPS = [
  { label: "Firefox", icon: Globe, target: "firefox" },
  { label: "Chromium", icon: Globe, target: "chromium" },
  { label: "Terminal", icon: Terminal, target: "terminal" },
  { label: "Files", icon: Folder, target: "files" },
  { label: "Spotify", icon: Music, target: "spotify" },
  { label: "VLC", icon: Monitor, target: "vlc" },
];

// ─── Common shell commands ─────────────────────────────────────────────────
const QUICK_CMDS = [
  { label: "Ghost status", cmd: "systemctl status ghost" },
  { label: "Disk usage", cmd: "df -h" },
  { label: "Memory", cmd: "free -h" },
  { label: "Processes", cmd: "ps aux --sort=-%cpu | head -10" },
  { label: "Network", cmd: "ip addr show" },
  { label: "Uptime", cmd: "uptime" },
];

// ─── System Stats Card ────────────────────────────────────────────────────
function StatsGrid({
  stats,
  loading,
  onRefresh,
}: {
  stats: PiStats | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const items = stats
    ? [
        { label: "HOST", value: stats.hostname },
        { label: "IP", value: stats.ip },
        { label: "UPTIME", value: stats.uptime.replace("up ", "") },
        { label: "CPU TEMP", value: stats.cpu_temp },
        { label: "MEMORY", value: stats.memory },
        { label: "DISK", value: stats.disk },
        { label: "LOAD", value: stats.load },
        {
          label: "GHOST",
          value: stats.ghost_svc || "—",
          accent: stats.ghost_svc === "active",
        },
      ]
    : [];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>SYSTEM_STATS</Text>
        <TouchableOpacity onPress={onRefresh} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={C.terminalGreen} size="small" />
          ) : (
            <RefreshCw size={16} color={C.terminalGreen} />
          )}
        </TouchableOpacity>
      </View>
      {!stats && !loading && (
        <Text style={styles.dimText}>Awaiting telemetry...</Text>
      )}
      <View style={styles.statsGrid}>
        {items.map((item) => (
          <View key={item.label} style={styles.statCell}>
            <Text style={styles.statLabel}>{item.label}</Text>
            <Text
              style={[styles.statValue, item.accent && { color: C.terminalGreen }]}
              numberOfLines={1}
            >
              {item.value || "—"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────
export default function RemoteScreen() {
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();

  const [stats, setStats] = useState<PiStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [openLoading, setOpenLoading] = useState(false);
  const [openResult, setOpenResult] = useState<string | null>(null);
  const [cmdInput, setCmdInput] = useState("");
  const [execLoading, setExecLoading] = useState(false);
  const [execResult, setExecResult] = useState<ExecResult | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  const loadStats = useCallback(async () => {
    if (!config) return;
    setStatsLoading(true);
    try {
      const s = await fetchStats(config);
      setStats(s);
    } catch {}
    setStatsLoading(false);
  }, [config]);

  useEffect(() => {
    loadStats();
  }, [config]);

  const handleOpenURL = async () => {
    if (!config || !urlInput.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpenLoading(true);
    setOpenResult(null);
    Keyboard.dismiss();

    let target = urlInput.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = "https://" + target;
    }

    const result = await openOnPi(config, target);
    setOpenResult(
      result.ok ? `✓ Launched on Pi` : `✗ ${result.error ?? "Failed"}`,
    );
    setOpenLoading(false);
  };

  const handleOpenApp = async (appTarget: string) => {
    if (!config) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await openOnPi(config, appTarget);
    setOpenResult(
      result.ok ? `✓ Launched ${appTarget}` : `✗ ${result.error ?? "Failed"}`,
    );
  };

  const handleExec = async (cmd?: string) => {
    if (!config) return;
    const command = cmd ?? cmdInput.trim();
    if (!command) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExecLoading(true);
    setExecResult(null);
    Keyboard.dismiss();
    try {
      const result = await runExec(config, command, 15);
      setExecResult(result);
    } catch (err: any) {
      setExecResult({
        stdout: "",
        stderr: err.message,
        exit_code: -1,
        duration_ms: 0,
      });
    }
    setExecLoading(false);
  };

  const handleScreenshot = async () => {
    if (!config) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScreenshotLoading(true);
    setScreenshot(null);
    try {
      const result = await takeScreenshot(config);
      setScreenshot(`data:${result.mime_type};base64,${result.image}`);
    } catch (err: any) {
      Alert.alert("Screenshot failed", err.message);
    }
    setScreenshotLoading(false);
  };

  if (!config) {
    return (
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <Monitor size={48} color={C.terminalGreen} />
        <Text style={styles.noConfigTitle}>REMOTE OFFLINE</Text>
        <Text style={styles.noConfigSub}>Configure connection in Settings</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 30,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Monitor size={20} color={C.terminalGreen} />
          <Text style={styles.headerTitle}>REMOTE_ACCESS</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: connectionState === "online" ? C.terminalGreen : C.error }} />
          <Text style={{ color: connectionState === "online" ? C.terminalGreen : C.error, fontSize: 10, letterSpacing: 1, fontFamily: FONT_MONO }}>
            {connectionState.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* System Stats */}
        <StatsGrid stats={stats} loading={statsLoading} onRefresh={loadStats} />

        {/* Browser / URL Launcher */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>BROWSER_LAUNCHER</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={styles.urlInput}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="https://example.com"
              placeholderTextColor={C.icon}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onSubmitEditing={handleOpenURL}
            />
            <TouchableOpacity
              style={[styles.goBtn, !urlInput.trim() && styles.goBtnOff]}
              onPress={handleOpenURL}
              disabled={openLoading || !urlInput.trim()}
            >
              {openLoading ? (
                <ActivityIndicator color={C.background} size="small" />
              ) : (
                <Text style={styles.goBtnTxt}>GO</Text>
              )}
            </TouchableOpacity>
          </View>
          {openResult && (
            <Text style={[styles.resultText, openResult.startsWith("✓") ? { color: C.terminalGreen } : { color: C.error }]}>
              {openResult}
            </Text>
          )}
        </View>

        {/* Quick App Launch */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>APP_LAUNCHER</Text>
          <View style={styles.appGrid}>
            {QUICK_APPS.map((app) => (
              <TouchableOpacity
                key={app.target}
                style={styles.appBtn}
                onPress={() => handleOpenApp(app.target)}
                activeOpacity={0.7}
              >
                <app.icon size={24} color={C.text} />
                <Text style={styles.appLabel}>{app.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Screenshot */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>SCREEN_CAPTURE</Text>
            <TouchableOpacity
              style={[styles.smallBtn, screenshotLoading && styles.smallBtnOff]}
              onPress={handleScreenshot}
              disabled={screenshotLoading}
            >
              {screenshotLoading ? (
                <ActivityIndicator color={C.terminalGreen} size="small" />
              ) : (
                <Text style={styles.smallBtnTxt}>CAPTURE</Text>
              )}
            </TouchableOpacity>
          </View>
          {screenshot ? (
            <Image
              source={{ uri: screenshot }}
              style={styles.screenshotImg}
              resizeMode="contain"
            />
          ) : (
            <Text style={styles.dimText}>
              Awaiting visual confirmation...
            </Text>
          )}
        </View>

        {/* Shell Exec */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>SHELL_EXEC</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={[styles.urlInput, { fontSize: 13 }]}
              value={cmdInput}
              onChangeText={setCmdInput}
              placeholder="systemctl status ghost"
              placeholderTextColor={C.icon}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => handleExec()}
            />
            <TouchableOpacity
              style={[styles.goBtn, !cmdInput.trim() && styles.goBtnOff]}
              onPress={() => handleExec()}
              disabled={execLoading || !cmdInput.trim()}
            >
              {execLoading ? (
                <ActivityIndicator color={C.background} size="small" />
              ) : (
                <Text style={styles.goBtnTxt}>RUN</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Quick commands */}
          <View style={styles.quickCmds}>
            {QUICK_CMDS.map((q) => (
              <TouchableOpacity
                key={q.cmd}
                style={styles.quickCmdBtn}
                onPress={() => {
                  setCmdInput(q.cmd);
                  handleExec(q.cmd);
                }}
              >
                <Text style={styles.quickCmdTxt}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Exec output */}
          {execResult && (
            <View style={styles.execOutput}>
              <View style={styles.execOutputHeader}>
                <Text style={[styles.exitBadge, { color: execResult.exit_code === 0 ? C.terminalGreen : C.error }]}>
                  exit {execResult.exit_code}
                </Text>
                <Text style={styles.durationTxt}>
                  {execResult.duration_ms}ms
                </Text>
              </View>
              {execResult.stdout ? (
                <Text style={styles.execText}>{execResult.stdout.trim()}</Text>
              ) : null}
              {execResult.stderr ? (
                <Text style={[styles.execText, { color: C.error }]}>
                  {execResult.stderr.trim()}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { justifyContent: "center", alignItems: "center", flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontFamily: FONT_MONO, fontSize: 16, fontWeight: "700", color: C.terminalGreen, letterSpacing: 1 },
  content: { padding: 12, gap: 12 },
  card: {
    backgroundColor: C.card, borderRadius: 0, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: C.icon, fontSize: 10, fontWeight: "700", letterSpacing: 2, fontFamily: FONT_MONO },
  statsGrid: { flexDirection: "row", flexWrap: "wrap" },
  statCell: { width: "50%", paddingVertical: 6, paddingRight: 8 },
  statLabel: { color: C.icon, fontSize: 9, letterSpacing: 1.5, fontFamily: FONT_MONO, marginBottom: 2 },
  statValue: { color: C.text, fontSize: 13, fontFamily: FONT_MONO },
  
  urlRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  urlInput: {
    flex: 1, backgroundColor: "#ffffff08", paddingHorizontal: 12, paddingVertical: 9,
    color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border, fontFamily: FONT_MONO,
  },
  goBtn: {
    backgroundColor: C.terminalGreen, paddingHorizontal: 14, paddingVertical: 9,
    alignItems: "center", justifyContent: "center", minWidth: 52, borderRadius: 0,
  },
  goBtnOff: { opacity: 0.35 },
  goBtnTxt: { color: C.background, fontWeight: "800", fontSize: 12, letterSpacing: 0.5, fontFamily: FONT_MONO },
  resultText: { fontSize: 13, fontWeight: "600", letterSpacing: 0.3, fontFamily: FONT_MONO },
  
  appGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  appBtn: {
    backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
    paddingVertical: 10, paddingHorizontal: 14, alignItems: "center", gap: 6, minWidth: 70, borderRadius: 0,
  },
  appLabel: { color: C.icon, fontSize: 10, letterSpacing: 0.5, fontFamily: FONT_MONO },
  
  screenshotImg: { width: "100%", height: 200, borderRadius: 4, borderWidth: 1, borderColor: C.border },
  dimText: { color: C.icon, fontSize: 12, fontFamily: FONT_MONO },
  
  quickCmds: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  quickCmdBtn: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)', borderWidth: 1, borderColor: C.terminalGreen,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 0,
  },
  quickCmdTxt: { color: C.terminalGreen, fontSize: 11, fontWeight: "600", fontFamily: FONT_MONO },
  
  execOutput: { backgroundColor: "#000", borderWidth: 1, borderColor: C.border, padding: 12, gap: 8 },
  execOutputHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  exitBadge: { fontSize: 11, fontWeight: "700", letterSpacing: 1, fontFamily: FONT_MONO },
  durationTxt: { color: C.icon, fontSize: 10, fontFamily: FONT_MONO },
  execText: { color: C.text, fontSize: 12, lineHeight: 18, fontFamily: FONT_MONO },
  
  smallBtn: { borderWidth: 1, borderColor: C.terminalGreen, paddingHorizontal: 10, paddingVertical: 5 },
  smallBtnOff: { opacity: 0.4 },
  smallBtnTxt: { color: C.terminalGreen, fontSize: 10, fontWeight: "700", letterSpacing: 1, fontFamily: FONT_MONO },
  
  noConfigTitle: { color: C.terminalGreen, fontSize: 18, fontWeight: "700", fontFamily: FONT_MONO },
  noConfigSub: { color: C.icon, fontSize: 13, marginTop: 8, fontFamily: FONT_MONO },
});
