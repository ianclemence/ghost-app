import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Platform, ActivityIndicator, Image,
  FlatList, Alert, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useGhostStore } from '../../lib/store';
import {
  fetchStats, runExec, openOnPi, takeScreenshot,
  PiStats, ExecResult,
} from '../../lib/ghostApi';

const C = {
  bg: '#080C0F',
  surface: '#0D1117',
  surface2: '#101820',
  border: '#1A2332',
  accent: '#00FF88',
  accentDim: '#00FF8818',
  text: '#C8D8E8',
  textDim: '#4A6080',
  textMuted: '#1E2E3E',
  danger: '#FF4455',
  warn: '#FFAA00',
  purple: '#AA88FF',
};

// ─── Quick-launch app buttons ─────────────────────────────────────────────
const QUICK_APPS = [
  { label: 'Firefox', icon: '🦊', target: 'firefox' },
  { label: 'Chromium', icon: '🌐', target: 'chromium' },
  { label: 'Terminal', icon: '⬛', target: 'terminal' },
  { label: 'Files', icon: '📁', target: 'files' },
  { label: 'Spotify', icon: '🎵', target: 'spotify' },
  { label: 'VLC', icon: '📺', target: 'vlc' },
];

// ─── Common shell commands ─────────────────────────────────────────────────
const QUICK_CMDS = [
  { label: 'Ghost status', cmd: 'systemctl status ghost' },
  { label: 'Disk usage', cmd: 'df -h' },
  { label: 'Memory', cmd: 'free -h' },
  { label: 'Processes', cmd: "ps aux --sort=-%cpu | head -10" },
  { label: 'Network', cmd: 'ip addr show' },
  { label: 'Uptime', cmd: 'uptime' },
];

// ─── System Stats Card ────────────────────────────────────────────────────
function StatsGrid({ stats, loading, onRefresh }: { stats: PiStats | null; loading: boolean; onRefresh: () => void }) {
  const items = stats ? [
    { label: 'HOST', value: stats.hostname },
    { label: 'IP', value: stats.ip },
    { label: 'UPTIME', value: stats.uptime.replace('up ', '') },
    { label: 'CPU TEMP', value: stats.cpu_temp },
    { label: 'MEMORY', value: stats.memory },
    { label: 'DISK', value: stats.disk },
    { label: 'LOAD', value: stats.load },
    { label: 'GHOST', value: stats.ghost_svc || '—', accent: stats.ghost_svc === 'active' },
  ] : [];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>SYSTEM</Text>
        <TouchableOpacity onPress={onRefresh} disabled={loading}>
          {loading ? <ActivityIndicator color={C.accent} size="small" /> : <Text style={styles.refreshBtn}>↻</Text>}
        </TouchableOpacity>
      </View>
      {!stats && !loading && (
        <Text style={styles.dimText}>Tap ↻ to fetch stats</Text>
      )}
      <View style={styles.statsGrid}>
        {items.map((item) => (
          <View key={item.label} style={styles.statCell}>
            <Text style={styles.statLabel}>{item.label}</Text>
            <Text style={[styles.statValue, item.accent && { color: C.accent }]} numberOfLines={1}>
              {item.value || '—'}
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
  const { config, isConnected } = useGhostStore();

  // Stats
  const [stats, setStats] = useState<PiStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Browser/URL open
  const [urlInput, setUrlInput] = useState('');
  const [openLoading, setOpenLoading] = useState(false);
  const [openResult, setOpenResult] = useState<string | null>(null);

  // Shell exec
  const [cmdInput, setCmdInput] = useState('');
  const [execLoading, setExecLoading] = useState(false);
  const [execResult, setExecResult] = useState<ExecResult | null>(null);

  // Screenshot
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

  useEffect(() => { loadStats(); }, [config]);

  const handleOpenURL = async () => {
    if (!config || !urlInput.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpenLoading(true);
    setOpenResult(null);
    Keyboard.dismiss();

    let target = urlInput.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }

    const result = await openOnPi(config, target);
    setOpenResult(result.ok ? `✓ Opened on Pi` : `✗ ${result.error ?? 'Failed'}`);
    setOpenLoading(false);
  };

  const handleOpenApp = async (appTarget: string) => {
    if (!config) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await openOnPi(config, appTarget);
    setOpenResult(result.ok ? `✓ Launched ${appTarget}` : `✗ ${result.error ?? 'Failed'}`);
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
      setExecResult({ stdout: '', stderr: err.message, exit_code: -1, duration_ms: 0 });
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
      Alert.alert('Screenshot failed', err.message);
    }
    setScreenshotLoading(false);
  };

  if (!config) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={{ fontSize: 40, marginBottom: 14 }}>🖥️</Text>
        <Text style={styles.noConfigTitle}>Not connected</Text>
        <Text style={styles.noConfigSub}>Configure your Pi in ⚙️ Settings</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 30 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>REMOTE</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? C.accent : C.danger }]} />
          <Text style={{ color: isConnected ? C.accent : C.danger, fontSize: 10, letterSpacing: 1 }}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* System Stats */}
        <StatsGrid stats={stats} loading={statsLoading} onRefresh={loadStats} />

        {/* Browser / URL Launcher */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>BROWSER</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={styles.urlInput}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="https://example.com"
              placeholderTextColor={C.textMuted}
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
              {openLoading ? <ActivityIndicator color={C.bg} size="small" /> : <Text style={styles.goBtnTxt}>GO</Text>}
            </TouchableOpacity>
          </View>
          {openResult && (
            <Text style={[styles.resultText, openResult.startsWith('✓') ? { color: C.accent } : { color: C.danger }]}>
              {openResult}
            </Text>
          )}
        </View>

        {/* Quick App Launch */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>LAUNCH APP</Text>
          <View style={styles.appGrid}>
            {QUICK_APPS.map((app) => (
              <TouchableOpacity
                key={app.target}
                style={styles.appBtn}
                onPress={() => handleOpenApp(app.target)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 22 }}>{app.icon}</Text>
                <Text style={styles.appLabel}>{app.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Screenshot */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>SCREENSHOT</Text>
            <TouchableOpacity
              style={[styles.smallBtn, screenshotLoading && styles.smallBtnOff]}
              onPress={handleScreenshot}
              disabled={screenshotLoading}
            >
              {screenshotLoading
                ? <ActivityIndicator color={C.accent} size="small" />
                : <Text style={styles.smallBtnTxt}>CAPTURE</Text>}
            </TouchableOpacity>
          </View>
          {screenshot ? (
            <Image
              source={{ uri: screenshot }}
              style={styles.screenshotImg}
              resizeMode="contain"
            />
          ) : (
            <Text style={styles.dimText}>Tap CAPTURE to grab Pi screen{'\n'}(requires scrot: sudo apt install scrot)</Text>
          )}
        </View>

        {/* Shell Exec */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>SHELL</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={[styles.urlInput, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 }]}
              value={cmdInput}
              onChangeText={setCmdInput}
              placeholder="systemctl status ghost"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => handleExec()}
            />
            <TouchableOpacity
              style={[styles.goBtn, !cmdInput.trim() && styles.goBtnOff]}
              onPress={() => handleExec()}
              disabled={execLoading || !cmdInput.trim()}
            >
              {execLoading ? <ActivityIndicator color={C.bg} size="small" /> : <Text style={styles.goBtnTxt}>RUN</Text>}
            </TouchableOpacity>
          </View>

          {/* Quick commands */}
          <View style={styles.quickCmds}>
            {QUICK_CMDS.map((q) => (
              <TouchableOpacity
                key={q.cmd}
                style={styles.quickCmdBtn}
                onPress={() => { setCmdInput(q.cmd); handleExec(q.cmd); }}
              >
                <Text style={styles.quickCmdTxt}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Exec output */}
          {execResult && (
            <View style={styles.execOutput}>
              <View style={styles.execOutputHeader}>
                <Text style={[
                  styles.exitBadge,
                  { color: execResult.exit_code === 0 ? C.accent : C.danger }
                ]}>
                  exit {execResult.exit_code}
                </Text>
                <Text style={styles.durationTxt}>{execResult.duration_ms}ms</Text>
              </View>
              {execResult.stdout ? (
                <Text style={styles.execText}>{execResult.stdout.trim()}</Text>
              ) : null}
              {execResult.stderr ? (
                <Text style={[styles.execText, { color: C.danger }]}>{execResult.stderr.trim()}</Text>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 16, fontWeight: '700', color: C.accent, letterSpacing: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  content: { padding: 12, gap: 12 },
  card: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, padding: 14, gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: {
    color: C.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  refreshBtn: { color: C.accent, fontSize: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', paddingVertical: 6, paddingRight: 8 },
  statLabel: {
    color: C.textMuted, fontSize: 9, letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 2,
  },
  statValue: {
    color: C.text, fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  urlRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlInput: {
    flex: 1, backgroundColor: '#ffffff08', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  goBtn: {
    backgroundColor: C.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 9,
    alignItems: 'center', justifyContent: 'center', minWidth: 52,
  },
  goBtnOff: { opacity: 0.35 },
  goBtnTxt: {
    color: C.bg, fontWeight: '800', fontSize: 12, letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  resultText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  appBtn: {
    backgroundColor: C.surface2, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    paddingVertical: 10, paddingHorizontal: 14,
    alignItems: 'center', gap: 4, minWidth: 70,
  },
  appLabel: {
    color: C.textDim, fontSize: 10, letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  screenshotImg: { width: '100%', height: 200, borderRadius: 8 },
  dimText: { color: C.textDim, fontSize: 12, lineHeight: 18 },
  quickCmds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickCmdBtn: {
    backgroundColor: C.accentDim, borderRadius: 6, borderWidth: 1, borderColor: '#00FF8830',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  quickCmdTxt: {
    color: C.accent, fontSize: 11, fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  execOutput: {
    backgroundColor: '#050A0F', borderRadius: 8, borderWidth: 1, borderColor: C.border,
    padding: 12, gap: 8,
  },
  execOutputHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exitBadge: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  durationTxt: { color: C.textDim, fontSize: 10 },
  execText: {
    color: C.text, fontSize: 12, lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  smallBtn: {
    borderWidth: 1, borderColor: C.accent, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  smallBtnOff: { opacity: 0.4 },
  smallBtnTxt: {
    color: C.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  noConfigTitle: { color: '#C8D8E8', fontSize: 18, fontWeight: '700' },
  noConfigSub: { color: '#4A6080', fontSize: 13, marginTop: 8 },
});
