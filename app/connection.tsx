import { useState } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import {
  GhostButton,
  GhostList,
  GhostRow,
  SectionHeader,
  StatusDot,
} from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { useGhostStore } from "@/lib/store";
import { checkHealthDebug, ConnectionDebugResult } from "@/lib/ghostApi";
import { reconnect, disconnectAndClear } from "@/lib/connection";

const FONT = Fonts.sans;

export default function ConnectionScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const connectionState = useGhostStore((s) => s.connectionState);
  const [debug, setDebug] = useState<ConnectionDebugResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReconnect = async () => {
    setLoading(true);
    await reconnect();
    setLoading(false);
  };

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect",
      "Remove all stored credentials? You'll need to pair again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await disconnectAndClear();
            router.replace("/onboarding");
          },
        },
      ],
    );
  };

  const handleDebug = async () => {
    if (!config) return;
    setLoading(true);
    const result = await checkHealthDebug(config);
    setDebug(result);
    setLoading(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ghost.bg.base }}
      contentContainerStyle={styles.container}
    >
      <GhostText type="title" style={styles.title}>
        Connection
      </GhostText>

      <SectionHeader title="Status" />
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <StatusDot
            status={
              connectionState === "online"
                ? "online"
                : connectionState === "syncing"
                  ? "warning"
                  : "offline"
            }
          />
          <View>
            <GhostText type="body" style={styles.statusText}>
              {connectionState === "online"
                ? "Connected"
                : connectionState === "syncing"
                  ? "Connecting…"
                  : "Disconnected"}
            </GhostText>
            {config && (
              <GhostText type="caption" style={styles.subtext}>
                {config.transport === "relay" ? "Relay" : "Local network"} ·{" "}
                {config.piHost}:{config.piPort}
              </GhostText>
            )}
          </View>
        </View>
      </View>

      <SectionHeader title="Actions" />
      <View style={styles.card}>
        <GhostList>
          <GhostRow
            title="Reconnect"
            subtitle="Attempt to restore connection"
            onPress={handleReconnect}
            chevron={false}
          />
          <GhostRow
            title="Run diagnostics"
            subtitle="Check connectivity to Ghost Pod"
            onPress={handleDebug}
            chevron={false}
          />
          <GhostRow
            title="Disconnect"
            subtitle="Remove stored credentials"
            onPress={handleDisconnect}
            chevron={false}
          />
        </GhostList>
      </View>

      {debug && (
        <View>
          <SectionHeader title="Diagnostics" />
          <View style={styles.card}>
            <GhostText type="caption" style={styles.debugLabel}>
              {debug.ok ? "Reachable" : "Unreachable"}
            </GhostText>
            {debug.latencyMs != null && (
              <GhostText type="caption" style={styles.debugLabel}>
                Latency: {debug.latencyMs}ms
              </GhostText>
            )}
            {debug.status != null && (
              <GhostText type="caption" style={styles.debugLabel}>
                HTTP {debug.status} {debug.statusText}
              </GhostText>
            )}
            {debug.error && (
              <GhostText type="caption" style={[styles.debugLabel, { color: Ghost.status.error }]}>
                {debug.error}
              </GhostText>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
    paddingTop: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 24,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  card: {
    padding: 16,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusText: {
    fontSize: 16,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  subtext: {
    marginTop: 2,
    opacity: 0.5,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  debugLabel: {
    marginBottom: 4,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
});
