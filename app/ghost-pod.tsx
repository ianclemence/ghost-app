import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import {
  GhostButton,
  GhostList,
  GhostRow,
  SectionHeader,
  StatusDot,
  Divider,
} from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { timeAgo } from "@/lib/format";
import { useGhostStore } from "@/lib/store";
import { startPairing, cancelPairing, PairedDevice } from "@/lib/ghostApi";
import { refreshDevices } from "@/lib/connection";

const FONT = Fonts.sans;

const CONNECTED_WINDOW_MS = 3 * 60_000;

function devicePlatform(device: PairedDevice): string {
  const p = device.platform ?? "device";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function deviceStatus(device: PairedDevice): string {
  if (!device.last_seen_at) return "Paired";
  const seen = new Date(device.last_seen_at).getTime();
  if (Date.now() - seen < CONNECTED_WINDOW_MS) return "Connected now";
  return `Last seen ${timeAgo(seen)}`;
}

export default function GhostPodScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const connectionState = useGhostStore((s) => s.connectionState);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [pairingID, setPairingID] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDevices = async () => {
    const list = await refreshDevices();
    setDevices(list);
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleStartPairing = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const result = await startPairing(config, "Phone");
      setPairingToken(result.token);
      setPairingID(result.pairing_id);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to start pairing");
    }
    setLoading(false);
  };

  const handleCancelPairing = async () => {
    if (!config || !pairingID) return;
    try {
      await cancelPairing(config, pairingID);
    } catch {}
    setPairingToken(null);
    setPairingID(null);
  };

  const handleDisconnect = (device: PairedDevice) => {
    Alert.alert(
      "Disconnect this device?",
      `"${device.display_name}" will no longer be able to reach your Ghost. Your Ghost itself is not affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            if (!config) return;
            try {
              const { revokePairedDevice } = await import("@/lib/ghostApi");
              await revokePairedDevice(config, device.device_id);
              loadDevices();
            } catch (err: any) {
              Alert.alert("Error", err?.message ?? "Failed to disconnect");
            }
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
        Ghost Pod
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
          <GhostText type="body" style={styles.statusText}>
              {connectionState === "online"
                ? "Connected"
                : connectionState === "syncing"
                  ? "Connecting…"
                  : "Disconnected"}
          </GhostText>
        </View>
      </View>

      <SectionHeader title="Paired devices" />
      <View style={styles.card}>
        {devices.length === 0 ? (
          <GhostText type="body" style={styles.emptyText}>
            No devices paired yet.
          </GhostText>
        ) : (
          <GhostList>
            {devices.map((device) => (
              <GhostRow
                key={device.device_id}
                title={device.display_name}
                subtitle={`${devicePlatform(device)}  ·  ${deviceStatus(device)}  ·  added ${timeAgo(new Date(device.paired_at).getTime())}`}
                onPress={() => handleDisconnect(device)}
              />
            ))}
          </GhostList>
        )}
      </View>

      <SectionHeader title="Pair new device" />
      <View style={styles.card}>
        {pairingToken ? (
          <View>
            <GhostText type="body" style={styles.tokenLabel}>
              Pairing token:
            </GhostText>
            <GhostText type="mono" style={styles.tokenText}>
              {pairingToken}
            </GhostText>
            <GhostText type="caption" style={styles.hint}>
              Enter this token on your phone. Expires in 5 minutes.
            </GhostText>
            <GhostButton
              title="Cancel"
              variant="secondary"
              onPress={handleCancelPairing}
              style={styles.cancelButton}
            />
          </View>
        ) : (
          <GhostButton
            title={loading ? "Generating…" : "Generate pairing token"}
            variant="primary"
            onPress={handleStartPairing}
            disabled={loading || connectionState !== "online"}
            loading={loading}
            fullWidth
          />
        )}
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
    fontSize: 16,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  emptyText: {
    opacity: 0.5,
    textAlign: "center",
    paddingVertical: 12,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  tokenLabel: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 8,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  tokenText: {
    fontSize: 18,
    fontFamily: "Courier",
    letterSpacing: 1,
    marginBottom: 8,
    color: Ghost.text.primary,
  },
  hint: {
    opacity: 0.4,
    marginBottom: 16,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
  },
  cancelButton: {
    marginTop: 8,
  },
});
