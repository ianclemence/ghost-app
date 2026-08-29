import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from "react-native";
import { ChevronRight } from "lucide-react-native";
import { GhostText } from "@/components/themed-text";
import { GhostButton, StatusDot } from "@/components/ghost";
import { Ghost, Fonts, Space } from "@/constants/theme";
import { timeAgo, formatUptime } from "@/lib/format";
import { useGhostStore } from "@/lib/store";
import {
  revokePairedDevice,
  PairedDevice,
  fetchStats,
  fetchDoctor,
  fetchModelInfo,
  PiStats,
  ModelInfo,
} from "@/lib/ghostApi";
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
  const config = useGhostStore((s) => s.config);
  const connectionState = useGhostStore((s) => s.connectionState);
  const ghostName = useGhostStore((s) => s.ghostName);
  const uptimeSeconds = useGhostStore((s) => s.uptimeSeconds);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [stats, setStats] = useState<PiStats | null>(null);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [version, setVersion] = useState<string>("—");

  const isOnline = connectionState === "online";

  const loadDevices = async () => {
    const list = await refreshDevices();
    setDevices(list);
  };

  const loadSystemInfo = async () => {
    if (!config) return;
    const [s, m] = await Promise.allSettled([
      fetchStats(config),
      fetchModelInfo(config),
    ]);
    if (s.status === "fulfilled") setStats(s.value);
    if (m.status === "fulfilled") setModel(m.value);
  };

  const loadDoctor = async () => {
    if (!config) return;
    try {
      const res = await fetchDoctor(config);
      setVersion(res.version ?? "—");
    } catch {
      /* keep default */
    }
  };

  useEffect(() => {
    if (!config) return;
    loadDevices();
    loadSystemInfo();
    loadDoctor();
  }, [config]);

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

  const handleRestart = () => {
    Alert.alert(
      "Restart this device",
      "Rebooting the hardware is only available from the Ghost web console. Open the console on your Ghost Pod to restart it.",
      [{ text: "OK" }],
    );
  };

  const activePreset =
    model?.presets?.find((p) => p.name === model.active) ??
    model?.presets?.[0];
  const modelLabel = activePreset
    ? `${activePreset.provider}${activePreset.model ? " · " + activePreset.model : ""}`
    : model?.provider ?? "—";
  const addressLabel = stats
    ? `${stats.ip}${stats.hostname ? " (" + stats.hostname + ")" : ""}`
    : "—";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ghost.bg.base }}
      contentContainerStyle={styles.container}
    >
      <GhostText type="title" style={styles.title}>
        Ghost Pod
      </GhostText>

      {/* Connection status */}
      <View style={styles.statusRow}>
        <StatusDot
          status={
            isOnline
              ? "online"
              : connectionState === "syncing"
                ? "warning"
                : "offline"
          }
        />
        <View>
          <GhostText type="body" style={styles.statusText}>
            {ghostName ?? "Ghost"}
          </GhostText>
          <GhostText type="caption" style={styles.statusLabel}>
            {isOnline
              ? uptimeSeconds
                ? `Online · Up ${formatUptime(uptimeSeconds)}`
                : "Online"
              : connectionState === "syncing"
                ? "Connecting…"
                : "Offline"}
          </GhostText>
        </View>
      </View>
      {!isOnline && (
        <GhostText type="body" style={styles.offlineText}>
          I can&apos;t reach your Ghost Pod right now.
        </GhostText>
      )}

      {/* Paired devices */}
      <View style={styles.block}>
        {devices.length === 0 ? (
          <GhostText type="body" style={styles.emptyText}>
            No devices paired yet.
          </GhostText>
        ) : (
          devices.map((device, i) => (
            <View key={device.device_id}>
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.6}
                onPress={() => handleDisconnect(device)}
              >
                <View style={styles.rowText}>
                  <GhostText type="body" style={styles.rowTitle}>
                    {device.display_name}
                  </GhostText>
                  <GhostText type="caption" style={styles.rowSubtitle}>
                    {`${devicePlatform(device)}  ·  ${deviceStatus(device)}  ·  added ${timeAgo(new Date(device.paired_at).getTime())}`}
                  </GhostText>
                </View>
                <ChevronRight size={16} color={Ghost.text.tertiary} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Ghost system info */}
      <View style={styles.block}>
        <SystemInfo
          stats={stats}
          modelLabel={modelLabel}
          addressLabel={addressLabel}
        />
      </View>

      {/* Version */}
      <View style={styles.block}>
        <InfoRow label="Version" value={version} />
      </View>

      {/* Danger zone */}
      <GhostButton
        title="Restart this device"
        variant="danger"
        onPress={handleRestart}
        fullWidth
        style={styles.actionButton}
      />
      <GhostText type="caption" style={styles.dangerHint}>
        Reboots the hardware Ghost runs on. Use only if something is wrong.
      </GhostText>
    </ScrollView>
  );
}

function SystemInfo({
  stats,
  modelLabel,
  addressLabel,
}: {
  stats: PiStats | null;
  modelLabel: string;
  addressLabel: string;
}) {
  const rows: { label: string; value?: string }[] = [
    { label: "Uptime", value: stats?.uptime },
    { label: "Model", value: modelLabel },
    { label: "Address", value: addressLabel },
    { label: "CPU temp", value: stats?.cpu_temp },
    { label: "Memory", value: stats?.memory },
    { label: "Storage", value: stats?.disk },
    { label: "Load", value: stats?.load },
    { label: "Service", value: stats?.ghost_svc },
  ];
  return (
    <>
      {rows.map((r) => (
        <InfoRow key={r.label} label={r.label} value={r.value} />
      ))}
    </>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <GhostText type="caption" style={styles.infoLabel}>
        {label}
      </GhostText>
      <GhostText type="body" style={styles.infoValue}>
        {value && value.length > 0 ? value : "—"}
      </GhostText>
    </View>
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
  offlineText: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    fontStyle: "italic",
    marginTop: Space.sm,
  },
  block: {
    marginTop: Space.xl,
  },
  emptyText: {
    fontFamily: FONT,
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
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  rowSubtitle: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.sm,
  },
  infoLabel: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  infoValue: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    flexShrink: 1,
    textAlign: "right",
    marginLeft: Space.lg,
  },
  actionButton: {
    marginTop: Space.xl,
  },
  dangerHint: {
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    marginTop: Space.xs,
    textAlign: "center",
  },
});
