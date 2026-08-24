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
import { reconnect, disconnectAndClear } from "@/lib/connection";

const FONT = Fonts.sans;

/**
 * Connection settings screen.
 * More → Connection.
 * Restrained — no CPU, RAM, disk, IP, port, hostname.
 */
export default function ConnectionScreen() {
  const router = useRouter();
  const connectionState = useGhostStore((s) => s.connectionState);

  const isOnline = connectionState === "online";

  const handleReconnect = async () => {
    await reconnect();
  };

  const handlePairAnother = () => {
    Alert.alert(
      "Pair another Ghost?",
      "This will disconnect this phone from the current Ghost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: async () => {
            await disconnectAndClear();
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
        Connection
      </GhostText>

      <SectionHeader title="Ghost Pod" />
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <StatusDot
            status={isOnline ? "online" : connectionState === "syncing" ? "warning" : "offline"}
          />
          <View>
            <GhostText type="body" style={styles.statusText}>
              Ghost
            </GhostText>
            <GhostText type="caption" style={styles.statusLabel}>
              {isOnline
                ? "Online"
                : connectionState === "syncing"
                  ? "Connecting…"
                  : "Offline"}
            </GhostText>
          </View>
        </View>

        {!isOnline && (
          <View style={styles.offlineMessage}>
            <GhostText type="body" style={styles.offlineText}>
              I can't reach your Ghost Pod right now.
            </GhostText>
          </View>
        )}
      </View>

      <SectionHeader title="Actions" />
      <View style={styles.card}>
        <GhostList>
          <GhostRow
            title="Reconnect"
            subtitle="Retry the existing connection"
            onPress={handleReconnect}
            chevron={false}
          />
          <GhostRow
            title="Pair another Ghost"
            subtitle="Connect to a different Ghost Pod"
            onPress={handlePairAnother}
            chevron={false}
          />
        </GhostList>
      </View>

      <SectionHeader title="Advanced" />
      <View style={styles.card}>
        <GhostList>
          <GhostRow
            title="Advanced settings"
            subtitle="Connection details, diagnostics"
            onPress={() => router.push("/advanced")}
            chevron
          />
        </GhostList>
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusText: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    fontWeight: "500",
  },
  statusLabel: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    marginTop: 2,
  },
  offlineMessage: {
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Ghost.border.subtle,
  },
  offlineText: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    fontStyle: "italic",
  },
});
