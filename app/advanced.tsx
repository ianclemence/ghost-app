import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import {
  GhostButton,
  GhostList,
  GhostRow,
  SectionHeader,
} from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { useGhostStore } from "@/lib/store";
import { checkHealthDebug, ConnectionDebugResult } from "@/lib/ghostApi";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const FONT = Fonts.sans;

export default function AdvancedScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const [debug, setDebug] = useState<ConnectionDebugResult | null>(null);

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
            await AsyncStorage.clear();
            await SecureStore.deleteItemAsync("ghost.device_id");
            await SecureStore.deleteItemAsync("ghost.credential");
            await SecureStore.deleteItemAsync("ghost.client_token");
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
        <GhostText type="caption" style={styles.detailText}>
          Transport: {config?.transport === "relay" ? "Relay" : "LAN"}
        </GhostText>
        <GhostText type="caption" style={styles.detailText}>
          Host: {config?.piHost ?? "—"}
        </GhostText>
        <GhostText type="caption" style={styles.detailText}>
          Port: {config?.piPort ?? "—"}
        </GhostText>
        <GhostText type="caption" style={styles.detailText}>
          Device credentials: {config?.deviceID ? "Stored" : "None"}
        </GhostText>
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
  detailText: {
    marginBottom: 4,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  debugResult: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Ghost.border.subtle,
  },
  hint: {
    marginTop: 8,
    opacity: 0.4,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
  },
});
