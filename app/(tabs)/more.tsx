import {
  ChevronRight,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Ghost, Radius, Space, Type } from "@/constants/theme";
import { StatusDot, Divider } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import {
  checkHealth,
  connectWebSocket,
  saveConfig,
  GhostConfig,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

const FONT = Fonts.sans;

const CAPABILITIES = [
  { name: "Research", description: "Web search and browsing" },
  { name: "Remember", description: "Saves what matters" },
  { name: "Read", description: "Files, documents, images" },
  { name: "Organize", description: "Notes, lists, tasks" },
  { name: "Monitor", description: "Scheduled checks" },
  { name: "Notify", description: "Reaches you when it matters" },
];

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const {
    config,
    connectionState,
  } = useGhostStore();

  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    checkHealth(config).then((ok) => {
      if (ok) {
        // Version would come from health response in a real implementation
        setVersion("2.0.0");
      }
    });
  }, [config]);

  const handleReconnect = async () => {
    if (!config) return;
    const ok = await checkHealth(config);
    if (ok) connectWebSocket(config);
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
      {/* Profile */}
      <View style={styles.profileSection}>
        <GhostMark size={48} />
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>Ghost</Text>
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
                ? "Online"
                : connectionState === "syncing"
                  ? "Syncing"
                  : "Offline"}
            </Text>
          </View>
        </View>
      </View>

      <Divider style={{ marginHorizontal: Space.xl }} />

      {/* Capabilities */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Capabilities</Text>
        {CAPABILITIES.map((cap, i) => (
          <View key={cap.name}>
            <View style={styles.capRow}>
              <Text style={styles.capName}>{cap.name}</Text>
              <Text style={styles.capDesc}>{cap.description}</Text>
            </View>
            {i < CAPABILITIES.length - 1 && <Divider />}
          </View>
        ))}
      </View>

      <Divider style={{ marginHorizontal: Space.xl }} />

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <TouchableOpacity style={styles.menuRow} activeOpacity={0.6}>
          <Text style={styles.menuLabel}>Connection</Text>
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        </TouchableOpacity>
        <Divider />
        <TouchableOpacity style={styles.menuRow} activeOpacity={0.6}>
          <Text style={styles.menuLabel}>Advanced</Text>
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        </TouchableOpacity>
        <Divider />
        <TouchableOpacity style={styles.menuRow} activeOpacity={0.6}>
          <Text style={styles.menuLabel}>Permissions</Text>
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        </TouchableOpacity>
      </View>

      <Divider style={{ marginHorizontal: Space.xl }} />

      {/* Ghost Pod */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ghost Pod</Text>
        <View style={styles.podRow}>
          <Text style={styles.podLabel}>Status</Text>
          <Text style={styles.podValue}>
            {connectionState === "online" ? "Online" : "Offline"}
          </Text>
        </View>
        <Divider />
        {version && (
          <>
            <View style={styles.podRow}>
              <Text style={styles.podLabel}>Version</Text>
              <Text style={styles.podValue}>{version}</Text>
            </View>
            <Divider />
          </>
        )}
        <TouchableOpacity
          style={styles.reconnectButton}
          onPress={handleReconnect}
          activeOpacity={0.6}
        >
          <Text style={styles.reconnectText}>Reconnect</Text>
        </TouchableOpacity>
      </View>

      <Divider style={{ marginHorizontal: Space.xl }} />

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.podRow}>
          <Text style={styles.podLabel}>Version</Text>
          <Text style={styles.podValue}>{version ?? "—"}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },

  // Profile
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.lg,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xl,
  },
  profileInfo: {
    gap: Space.xs,
  },
  profileName: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    fontSize: 20,
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
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
  },
  sectionTitle: {
    ...Type.caption,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    letterSpacing: 0.3,
    marginBottom: Space.sm,
    marginTop: Space.sm,
  },

  // Capabilities
  capRow: {
    paddingVertical: Space.sm,
  },
  capName: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    fontSize: 15,
  },
  capDesc: {
    ...Type.subhead,
    fontFamily: FONT,
    color: Ghost.text.secondary,
    marginTop: 2,
  },

  // Menu
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.md,
  },
  menuLabel: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    fontSize: 15,
  },

  // Pod
  podRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.sm,
  },
  podLabel: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    fontSize: 15,
  },
  podValue: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    fontSize: 15,
  },
  reconnectButton: {
    paddingVertical: Space.md,
    alignItems: "center",
    marginTop: Space.sm,
  },
  reconnectText: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.accent.primary,
    fontSize: 15,
  },
});
