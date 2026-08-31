import {
  ChevronRight,
} from "lucide-react-native";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ghost, Radius, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { StatusDot } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { useGhostStore } from "@/lib/store";

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
  const router = useRouter();
  const { connectionState } = useGhostStore();

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
          <GhostText type="headline" style={styles.profileName}>Ghost</GhostText>
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
            <GhostText type="subhead" style={styles.profileStatusText}>
              {connectionState === "online"
                ? "Online"
                : connectionState === "syncing"
                  ? "Syncing"
                  : "Offline"}
            </GhostText>
          </View>
        </View>
      </View>

      {/* Capabilities */}
      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionTitle}>Capabilities</GhostText>
        {CAPABILITIES.map((cap) => (
          <View key={cap.name} style={styles.capRow}>
            <GhostText type="headline" style={styles.capName}>{cap.name}</GhostText>
            <GhostText type="subhead" style={styles.capDesc}>{cap.description}</GhostText>
          </View>
        ))}
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionTitle}>Settings</GhostText>
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.6}
          onPress={() => router.push("/ghost-pod")}
        >
          <GhostText type="headline" style={styles.menuLabel}>Ghost Pod</GhostText>
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.6}
          onPress={() => router.push("/permissions")}
        >
          <GhostText type="headline" style={styles.menuLabel}>Permissions</GhostText>
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionTitle}>About</GhostText>
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.6}
          onPress={() => router.push("/about")}
        >
          <GhostText type="headline" style={styles.menuLabel}>About Ghost</GhostText>
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        </TouchableOpacity>
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
    color: Ghost.text.primary,
    fontSize: 20,
  },
  profileStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  profileStatusText: {
    color: Ghost.text.secondary,
  },

  // Sections
  section: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
  },
  sectionTitle: {
    color: Ghost.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Space.sm,
    marginTop: Space.sm,
  },

  // Capabilities
  capRow: {
    paddingVertical: Space.sm,
  },
  capName: {
    color: Ghost.text.primary,
    fontSize: 15,
  },
  capDesc: {
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
    color: Ghost.text.primary,
    fontSize: 15,
  },
});
