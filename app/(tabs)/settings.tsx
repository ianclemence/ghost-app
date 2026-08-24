import {
  User,
  Server,
  Shield,
  Info,
  QrCode,
  Zap,
  ChevronRight,
  type LucideIcon,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Fonts, Ghost, Radius, Space, Type } from "@/constants/theme";
import { ConnectionPill, GhostInput, StatusDot } from "@/components/ghost";
import QrPairingScanner from "@/components/QrPairingScanner";
import {
  checkHealth,
  connectWebSocket,
  fetchModelInfo,
  ModelInfo,
  saveConfig,
  GhostConfig,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

const FONT = Fonts.sans;

const ICON_MAP: Record<string, LucideIcon> = {
  server: Server,
  shield: Shield,
  zap: Zap,
  info: Info,
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    config,
    setConfig,
    connectionState,
    setConnected,
    profile,
  } = useGhostStore();

  // Connection fields
  const [host, setHost] = useState(config?.piHost ?? "");
  const [port, setPort] = useState(config?.piPort ?? "8766");
  const [secret, setSecret] = useState(config?.secret ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sendLocation, setSendLocation] = useState(config?.sendLocation ?? true);

  const handleTestConnection = async () => {
    if (!host.trim()) return;
    setTesting(true);
    setTestResult("idle");
    try {
      const testConfig: GhostConfig = {
        piHost: host.trim(),
        piPort: port.trim() || "8766",
        secret: secret.trim(),
        sendLocation,
      };
      const ok = await checkHealth(testConfig);
      setTestResult(ok ? "ok" : "fail");
      if (ok) {
        setConnected(true);
        connectWebSocket(testConfig);
      }
    } catch {
      setTestResult("fail");
    }
    setTesting(false);
  };

  const handleSave = async () => {
    const cfg: GhostConfig = {
      piHost: host.trim(),
      piPort: port.trim() || "8766",
      secret: secret.trim(),
      sendLocation,
    };
    await saveConfig(cfg);
    setConfig(cfg);
    const ok = await checkHealth(cfg);
    setConnected(ok);
    if (ok) connectWebSocket(cfg);
  };

  const handlePaired = async (cfg: GhostConfig) => {
    setHost(cfg.piHost);
    setPort(cfg.piPort);
    setSecret(cfg.secret);
    setScannerOpen(false);
    await saveConfig(cfg);
    setConfig(cfg);
    const ok = await checkHealth(cfg);
    setConnected(ok);
    if (ok) connectWebSocket(cfg);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + Space.xxxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <ConnectionPill
          connected={connectionState === "online"}
          degraded={connectionState === "syncing"}
        />
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <User size={24} color={Ghost.accent.primary} />
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {profile?.name ?? "Ghost Owner"}
          </Text>
          <View style={styles.profileStatus}>
            <StatusDot
              status={
                connectionState === "online"
                  ? "online"
                  : connectionState === "syncing"
                    ? "warning"
                    : "offline"
              }
            />
            <Text style={styles.profileStatusText}>
              {connectionState === "online"
                ? "Connected"
                : connectionState === "syncing"
                  ? "Syncing"
                  : "Offline"}
            </Text>
          </View>
        </View>
      </View>

      {/* Connection Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CONNECTION</Text>
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Host</Text>
            <GhostInput
              value={host}
              onChangeText={setHost}
              placeholder="192.168.1.100"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Port</Text>
            <GhostInput
              value={port}
              onChangeText={setPort}
              placeholder="8766"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Secret Key</Text>
            <GhostInput
              value={secret}
              onChangeText={setSecret}
              placeholder="Enter your secret"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={styles.qrButton}
            onPress={() => setScannerOpen(true)}
          >
            <QrCode size={18} color={Ghost.accent.primary} />
            <Text style={styles.qrButtonText}>Scan QR Code</Text>
          </TouchableOpacity>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleTestConnection}
              disabled={testing || !host.trim()}
            >
              {testing ? (
                <ActivityIndicator size="small" color={Ghost.accent.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>Test</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleSave}
            >
              <Text style={styles.primaryButtonText}>Save & Connect</Text>
            </TouchableOpacity>
          </View>

          {testResult === "ok" && (
            <Text style={styles.successText}>Connected successfully</Text>
          )}
          {testResult === "fail" && (
            <Text style={styles.errorText}>Connection failed</Text>
          )}
        </View>
      </View>

      {/* Permissions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PERMISSIONS</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Location</Text>
              <Text style={styles.toggleDescription}>
                Share location for weather and context
              </Text>
            </View>
            <Switch
              value={sendLocation}
              onValueChange={setSendLocation}
              trackColor={{ false: Ghost.bg.sunken, true: Ghost.accent.medium }}
              thumbColor={sendLocation ? Ghost.accent.primary : Ghost.text.tertiary}
            />
          </View>
        </View>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutDivider} />
          <TouchableOpacity style={styles.aboutRow} activeOpacity={0.6}>
            <View style={styles.aboutLeft}>
              <Zap size={18} color={Ghost.text.secondary} />
              <Text style={styles.aboutLabel}>Capabilities</Text>
            </View>
            <ChevronRight size={16} color={Ghost.text.tertiary} />
          </TouchableOpacity>
          <View style={styles.aboutDivider} />
          <TouchableOpacity style={styles.aboutRow} activeOpacity={0.6}>
            <View style={styles.aboutLeft}>
              <Info size={18} color={Ghost.text.secondary} />
              <Text style={styles.aboutLabel}>About Ghost</Text>
            </View>
            <ChevronRight size={16} color={Ghost.text.tertiary} />
          </TouchableOpacity>
        </View>
      </View>

      <QrPairingScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onPaired={handlePaired}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  headerTitle: {
    ...Type.largeTitle,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },

  // Profile
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.lg,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
    marginHorizontal: Space.xl,
    padding: Space.lg,
    marginBottom: Space.xxl,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Ghost.accent.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
    gap: Space.xs,
  },
  profileName: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  profileStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  profileStatusText: {
    ...Type.subhead,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },

  // Sections
  section: {
    marginBottom: Space.xxl,
  },
  sectionTitle: {
    ...Type.caption,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: Space.xl,
    marginBottom: Space.md,
  },
  card: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
    marginHorizontal: Space.xl,
    padding: Space.lg,
    gap: Space.lg,
  },

  // Connection fields
  field: {
    gap: Space.sm,
  },
  fieldLabel: {
    ...Type.subhead,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  qrButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    paddingVertical: Space.md,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.md,
  },
  qrButtonText: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.accent.primary,
    fontSize: 15,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Space.sm,
  },
  button: {
    flex: 1,
    paddingVertical: Space.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
  },
  primaryButton: {
    backgroundColor: Ghost.accent.primary,
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Ghost.border.default,
  },
  primaryButtonText: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.inverse,
    fontSize: 15,
  },
  secondaryButtonText: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    fontSize: 15,
  },
  successText: {
    ...Type.subhead,
    fontFamily: FONT,
    color: Ghost.status.success,
    textAlign: "center",
  },
  errorText: {
    ...Type.subhead,
    fontFamily: FONT,
    color: Ghost.status.error,
    textAlign: "center",
  },

  // Toggles
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleInfo: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    fontSize: 16,
  },
  toggleDescription: {
    ...Type.subhead,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },

  // About
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  aboutLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
  },
  aboutLabel: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    fontSize: 16,
  },
  aboutValue: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    fontSize: 16,
  },
  aboutDivider: {
    height: 0.5,
    backgroundColor: Ghost.border.subtle,
  },
});
