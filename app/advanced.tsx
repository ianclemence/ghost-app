import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton, GhostList, GhostRow, SectionHeader } from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { useGhostStore } from "@/lib/store";
import { checkHealthDebug, ConnectionDebugResult } from "@/lib/ghostApi";
import { getDeviceCredential, getConnectionMeta, clearAllCredentials } from "@/lib/credentials";

const FONT = Fonts.sans;

/**
 * Advanced connection settings.
 * For troubleshooting and development.
 * Normal users should never need this.
 */
export default function AdvancedScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const [debug, setDebug] = useState<ConnectionDebugResult | null>(null);
  const [meta, setMeta] = useState<{ host: string; port: string; transport: string; deviceId: string } | null>(null);

  const loadMeta = async () => {
    const connMeta = await getConnectionMeta();
    const cred = await getDeviceCredential();
    if (connMeta) {
      setMeta({
        host: connMeta.host,
        port: connMeta.port,
        transport: connMeta.transport === "lan" ? "Local network" : "Relay",
        deviceId: cred?.deviceID ? cred.deviceID.slice(0, 8) + "…" : "—",
      });
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  const handleDebug = async () => {
    if (!config) return;
    const result = await checkHealthDebug(config);
    setDebug(result);
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear all data",
      "This will remove all stored credentials and settings. You'll need to pair again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearAllCredentials();
            router.replace("/onboarding");
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ghost.bg.base }}
      contentContainerStyle={styles.container}
    >
      <GhostText type="title" style={styles.title}>
        Advanced
      </GhostText>

      <SectionHeader title="Connection details" />
      <View style={styles.card}>
        {meta ? (
          <>
            <DetailRow label="Transport" value={meta.transport} />
            <DetailRow label="Endpoint" value={`${meta.host}:${meta.port}`} />
            <DetailRow label="Device" value={meta.deviceId} />
          </>
        ) : (
          <GhostText type="body" style={styles.emptyText}>
            No connection data available.
          </GhostText>
        )}
      </View>

      <SectionHeader title="Diagnostics" />
      <View style={styles.card}>
        <GhostButton
          title="Run connectivity check"
          variant="secondary"
          onPress={handleDebug}
          fullWidth
        />
        {debug && (
          <View style={styles.debugResult}>
            <GhostText type="caption" style={styles.detailText}>
              {debug.ok ? "Reachable" : "Unreachable"}{" "}
              {debug.latencyMs != null ? `(${debug.latencyMs}ms)` : ""}
            </GhostText>
            {debug.status != null && (
              <GhostText type="caption" style={styles.detailText}>
                HTTP {debug.status}
              </GhostText>
            )}
            {debug.error && (
              <GhostText type="caption" style={[styles.detailText, { color: Ghost.status.error }]}>
                {debug.error}
              </GhostText>
            )}
          </View>
        )}
      </View>

      <SectionHeader title="Danger zone" />
      <View style={styles.card}>
        <GhostButton
          title="Clear all data"
          variant="danger"
          onPress={handleClearAll}
          fullWidth
        />
        <GhostText type="caption" style={styles.hint}>
          Remove all stored credentials, settings, and cached data.
        </GhostText>
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.row}>
      <GhostText type="caption" style={detailStyles.label}>{label}</GhostText>
      <GhostText type="body" style={detailStyles.value}>{value}</GhostText>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    paddingVertical: Space.sm,
  },
  label: {
    fontFamily: Fonts.sans,
    color: Ghost.text.tertiary,
    marginBottom: 2,
  },
  value: {
    fontFamily: Fonts.sans,
    color: Ghost.text.primary,
  },
});

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
  emptyText: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    opacity: 0.5,
    textAlign: "center",
    paddingVertical: Space.sm,
  },
  debugResult: {
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Ghost.border.subtle,
  },
  detailText: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    marginBottom: 4,
  },
  hint: {
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    opacity: 0.5,
    marginTop: Space.sm,
  },
});
