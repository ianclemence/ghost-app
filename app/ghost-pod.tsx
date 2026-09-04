import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";
import { GhostText } from "@/components/themed-text";
import { GhostButton, GhostSheet, StatusDot } from "@/components/ghost";
import { Ghost, Space, Type } from "@/constants/theme";
import { timeAgo, formatUptime } from "@/lib/format";
import { useGhostStore } from "@/lib/store";
import {
  revokePairedDevice,
  PairedDevice,
  fetchStats,
  fetchModelInfo,
  setActiveModel,
  PiStats,
  ModelInfo,
  ModelPresetInfo,
} from "@/lib/ghostApi";
import { refreshDevices } from "@/lib/connection";

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
  const insets = useSafeAreaInsets();
  const config = useGhostStore((s) => s.config);
  const connectionState = useGhostStore((s) => s.connectionState);
  const ghostName = useGhostStore((s) => s.ghostName);
  const uptimeSeconds = useGhostStore((s) => s.uptimeSeconds);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [stats, setStats] = useState<PiStats | null>(null);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [version, setVersion] = useState<string>("—");

  // Sheet state
  const [disconnectSheet, setDisconnectSheet] = useState<{ visible: boolean; device: PairedDevice | null }>({
    visible: false,
    device: null,
  });
  const [errorSheet, setErrorSheet] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });
  const [restartSheet, setRestartSheet] = useState(false);
  const [modelSheet, setModelSheet] = useState<{ visible: boolean; preset: ModelPresetInfo | null }>({
    visible: false,
    preset: null,
  });
  const [switchingModel, setSwitchingModel] = useState(false);

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
    if (s.status === "fulfilled") {
      setStats(s.value);
      setVersion(s.value.version ?? "—");
    }
    if (m.status === "fulfilled") setModel(m.value);
  };

  useEffect(() => {
    if (!config) return;
    loadDevices();
    loadSystemInfo();
  }, [config]);

  const handleDisconnect = (device: PairedDevice) => {
    setDisconnectSheet({ visible: true, device });
  };

  const confirmDisconnect = async () => {
    const device = disconnectSheet.device;
    if (!config || !device) return;
    try {
      await revokePairedDevice(config, device.device_id);
      loadDevices();
    } catch (err: any) {
      setErrorSheet({ visible: true, message: err?.message ?? "Failed to disconnect" });
    }
  };

  const handleRestart = () => {
    setRestartSheet(true);
  };

  const confirmModelSwitch = async () => {
    const preset = modelSheet.preset;
    if (!config || !preset || switchingModel) return;
    setSwitchingModel(true);
    try {
      const res = await setActiveModel(config, preset.name);
      if (res.ok) {
        const m = await fetchModelInfo(config);
        if (m) setModel(m);
        setModelSheet({ visible: false, preset: null });
      } else {
        setErrorSheet({ visible: true, message: res.error ?? "Couldn't switch model." });
      }
    } catch {
      setErrorSheet({ visible: true, message: "Couldn't switch model. Check your connection." });
    }
    setSwitchingModel(false);
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
      contentContainerStyle={[styles.container, { paddingTop: insets.top + Space.xl }]}
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
              {i < devices.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))
        )}
      </View>

      {/* Ghost system info */}
      <View style={styles.block}>
        <SystemInfo
          stats={stats}
          version={version}
          modelLabel={modelLabel}
          addressLabel={addressLabel}
        />
      </View>

      {/* AI Model */}
      {model && model.presets.length > 1 ? (
        <View style={styles.block}>
          <GhostText type="caption" style={styles.sectionTitle}>
            AI MODEL
          </GhostText>
          {model.presets.map((p, i) => {
            const selected = p.name === model.active;
            return (
              <View key={p.name}>
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.6}
                  disabled={switchingModel}
                  onPress={() => {
                    if (!selected) setModelSheet({ visible: true, preset: p });
                  }}
                  accessibilityLabel={`Use ${p.name} for reasoning`}
                >
                  <View style={styles.rowText}>
                    <GhostText type="body" style={styles.rowTitle}>
                      {p.name}
                    </GhostText>
                    <GhostText type="caption" style={styles.rowSubtitle}>
                      {`${p.provider}${p.model ? " · " + p.model : ""}`}
                    </GhostText>
                  </View>
                  <StatusDot status={selected ? "online" : "offline"} />
                </TouchableOpacity>
                {i < model.presets.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Danger zone */}
      <GhostButton
        title="Restart this device"
        variant="danger"
        onPress={handleRestart}
        fullWidth
        style={styles.actionButton}
      />

      {/* Sheets */}
      <GhostSheet
        visible={disconnectSheet.visible}
        onClose={() => setDisconnectSheet({ visible: false, device: null })}
        title="Disconnect this device?"
        message={`"${disconnectSheet.device?.display_name}" will no longer be able to reach your Ghost. Your Ghost itself is not affected.`}
        confirmTitle="Disconnect"
        onConfirm={confirmDisconnect}
        variant="destructive"
      />
      <GhostSheet
        visible={errorSheet.visible}
        onClose={() => setErrorSheet({ visible: false, message: "" })}
        title="Error"
        message={errorSheet.message}
        confirmTitle="OK"
        onConfirm={() => {}}
      />
      <GhostSheet
        visible={restartSheet}
        onClose={() => setRestartSheet(false)}
        title="Restart this device"
        message="Rebooting the hardware is only available from the Ghost web console. Open the console on your Ghost Pod to restart it."
        confirmTitle="OK"
        onConfirm={() => {}}
        variant="destructive"
      />
      <GhostSheet
        visible={modelSheet.visible}
        onClose={() => {
          if (!switchingModel) setModelSheet({ visible: false, preset: null });
        }}
        title="Switch reasoning?"
        message={
          modelSheet.preset
            ? `Ghost will think with "${modelSheet.preset.name}" from now on. Ongoing turns finish on the previous model.`
            : undefined
        }
        confirmTitle={switchingModel ? "Switching…" : "Switch"}
        onConfirm={confirmModelSwitch}
      />
    </ScrollView>
  );
}

function SystemInfo({
  stats,
  version,
  modelLabel,
  addressLabel,
}: {
  stats: PiStats | null;
  version: string;
  modelLabel: string;
  addressLabel: string;
}) {
  const cpu =
    stats?.cpu_percent != null ? `${Math.round(stats.cpu_percent)}%` : "—";
  const memory =
    stats?.memory
      ? `${fmtBytes(stats.memory.used)} / ${fmtBytes(stats.memory.total)}`
      : "—";
  const storage =
    stats?.disk
      ? `${gb(stats.disk.used)} GB / ${gb(stats.disk.total)} GB`
      : "—";
  const load = stats?.load;
  const cores = stats?.cpu_count ?? 1;
  const loadRatio = load ? load.one / cores : 0;
  const loadState: "online" | "warning" | "offline" =
    loadRatio < 0.5 ? "online" : loadRatio < 1 ? "warning" : "offline";
  const loadLabel =
    loadRatio < 0.5 ? "Idle" : loadRatio < 1 ? "Loaded" : "Overloaded";
  const loadValue = load
    ? `${load.one.toFixed(2)} / ${load.five.toFixed(2)} / ${load.fifteen.toFixed(2)}  ·  ${cores} core${cores > 1 ? "s" : ""}`
    : "—";

  return (
    <>
      <InfoRow label="Version" value={version} />
      <InfoRow label="Uptime" value={stats?.uptime} />
      <InfoRow label="Model" value={modelLabel} />
      <InfoRow label="Address" value={addressLabel} />
      <InfoRow label="CPU" value={cpu} />
      <InfoRow label="Memory" value={memory} />
      <InfoRow label="Storage" value={storage} />
      {load ? (
        <View style={styles.infoRow}>
          <GhostText type="caption" style={styles.infoLabel}>
            Load
          </GhostText>
          <View style={styles.loadValue}>
            <View style={styles.loadTop}>
              <StatusDot status={loadState} />
              <GhostText type="body" style={styles.loadLabel}>
                {loadLabel}
              </GhostText>
            </View>
            <GhostText type="caption" style={styles.loadSub}>
              {loadValue}
            </GhostText>
          </View>
        </View>
      ) : (
        <InfoRow label="Load" value="—" />
      )}
    </>
  );
}

function fmtBytes(n?: number): string {
  if (!n) return "0 B";
  const gb = 1073741824;
  const mb = 1048576;
  if (n >= gb) return (n / gb).toFixed(1) + " GB";
  if (n >= mb) return Math.round(n / mb) + " MB";
  return Math.round(n / 1024) + " KB";
}

function gb(n?: number): string {
  if (!n) return "0";
  return String(Math.round(n / 1073741824));
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
  },
  title: {
    ...Type.largeTitle,
    marginBottom: Space.xl,
    color: Ghost.text.primary,
  },
  sectionTitle: {
    color: Ghost.text.tertiary,
    marginBottom: Space.sm,
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
  offlineText: {
    color: Ghost.text.secondary,
    fontStyle: "italic",
    marginTop: Space.sm,
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
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.sm,
  },
  infoLabel: {
    color: Ghost.text.secondary,
  },
  infoValue: {
    color: Ghost.text.primary,
    flexShrink: 1,
    textAlign: "right",
    marginLeft: Space.lg,
  },
  loadValue: {
    flexShrink: 1,
    alignItems: "flex-end",
    gap: 2,
    marginLeft: Space.lg,
  },
  loadTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  loadLabel: {
    color: Ghost.text.primary,
  },
  loadSub: {
    color: Ghost.text.secondary,
  },
  actionButton: {
    marginTop: Space.xl,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Ghost.border.subtle,
  },
});
