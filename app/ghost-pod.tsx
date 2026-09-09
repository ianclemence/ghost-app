import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";
import { GhostText } from "@/components/themed-text";
import { GhostSheet, StatusDot } from "@/components/ghost";
import { Ghost, Space, Type } from "@/constants/theme";
import { timeAgo, formatUptime } from "@/lib/format";
import { useGhostStore } from "@/lib/store";
import { checkHealthInfo, fetchIdentity, revokePairedDevice, type PairedDevice } from "@/lib/ghostApi";
import { refreshDevices } from "@/lib/connection";

function deviceStatus(device: PairedDevice): string {
  if (!device.last_seen_at) return "Paired";
  const seen = new Date(device.last_seen_at).getTime();
  if (Date.now() - seen < 3 * 60_000) return "Connected now";
  return `Last seen ${timeAgo(seen)}`;
}

export default function GhostPodScreen() {
  const insets = useSafeAreaInsets();
  const config = useGhostStore((s) => s.config);
  const connectionState = useGhostStore((s) => s.connectionState);
  const ghostName = useGhostStore((s) => s.ghostName);
  const uptimeSeconds = useGhostStore((s) => s.uptimeSeconds);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [owner, setOwner] = useState("");
  const [disconnectSheet, setDisconnectSheet] = useState<{ visible: boolean; device: PairedDevice | null }>({
    visible: false,
    device: null,
  });
  const [error, setError] = useState("");

  const isOnline = connectionState === "online";

  useEffect(() => {
    refreshDevices().then(setDevices).catch(() => {});
    if (!config) return;
    fetchIdentity(config).then((id) => {
      if (id?.owner) setOwner(id.owner);
    }).catch(() => {});
    checkHealthInfo(config).catch(() => null);
  }, [config]);

  const confirmDisconnect = async () => {
    const device = disconnectSheet.device;
    if (!config || !device) return;
    try {
      await revokePairedDevice(config, device.device_id);
      setDevices(await refreshDevices());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ghost.bg.base }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + Space.xl }]}
    >
      <GhostText type="title" style={styles.title}>
        Ghost Pod
      </GhostText>
      <View style={styles.statusRow}>
        <StatusDot status={isOnline ? "online" : connectionState === "syncing" ? "warning" : "offline"} />
        <View>
          <GhostText type="body" style={styles.statusText}>{ghostName ?? "Ghost"}</GhostText>
          <GhostText type="caption" style={styles.statusLabel}>
            {isOnline ? (uptimeSeconds ? `Online · Up ${formatUptime(uptimeSeconds)}` : "Online") : connectionState === "syncing" ? "Connecting" : "Offline"}
            {owner ? ` · ${owner}'s Ghost` : ""}
          </GhostText>
        </View>
      </View>
      <View style={styles.block}>
        {devices.length === 0 ? (
          <GhostText type="body" style={styles.emptyText}>No devices paired yet.</GhostText>
        ) : (
          devices.map((device, i) => (
            <View key={device.device_id}>
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.6}
                onPress={() => setDisconnectSheet({ visible: true, device })}
              >
                <View style={styles.rowText}>
                  <GhostText type="body" style={styles.rowTitle}>{device.display_name}</GhostText>
                  <GhostText type="caption" style={styles.rowSubtitle}>
                    {`${deviceStatus(device)} · added ${timeAgo(new Date(device.paired_at).getTime())}`}
                  </GhostText>
                </View>
                <ChevronRight size={16} color={Ghost.text.tertiary} />
              </TouchableOpacity>
              {i < devices.length - 1 && <View style={styles.divider} />}
            </View>
          ))
        )}
      </View>
      <GhostSheet
        visible={disconnectSheet.visible}
        onClose={() => setDisconnectSheet({ visible: false, device: null })}
        title="Disconnect this device?"
        message={`"${disconnectSheet.device?.display_name}" will no longer reach your Ghost. Your Ghost itself is not affected.`}
        confirmTitle="Disconnect"
        onConfirm={() => void confirmDisconnect()}
        variant="destructive"
      />
      <GhostSheet
        visible={error !== ""}
        onClose={() => setError("")}
        title="Error"
        message={error}
        confirmTitle="OK"
        onConfirm={() => {}}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
  },
  title: {
    ...Type.largeTitle,
    marginBottom: Space.xl,
    color: Ghost.text.primary,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  statusText: {
    color: Ghost.text.primary,
    fontWeight: "500",
  },
  statusLabel: {
    color: Ghost.text.secondary,
    marginTop: 2,
  },
  block: {
    marginTop: Space.xl,
  },
  emptyText: {
    color: Ghost.text.secondary,
    opacity: 0.5,
    textAlign: "center",
    paddingVertical: Space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowSubtitle: {
    color: Ghost.text.secondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Ghost.border.subtle,
  },
});
