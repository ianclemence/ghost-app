import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { GhostRow, StatusDot } from "@/components/ghost";
import { PlusMenu } from "@/components/plus-menu";
import { useGhostStore } from "@/lib/store";
import { fetchIdentity } from "@/lib/ghostApi";

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, connectionState, ghostName, setGhostName } = useGhostStore();
  const [owner, setOwner] = useState("");

  useEffect(() => {
    if (!config) return;
    fetchIdentity(config).then((id) => {
      if (id?.name) setGhostName(id.name);
      if (id?.owner) setOwner(id.owner);
    }).catch(() => {});
  }, [config, setGhostName]);

  const loadIdentity = useCallback(async () => {
    if (!config) return;
    const id = await fetchIdentity(config).catch(() => null);
    if (id?.name) setGhostName(id.name);
    if (id?.owner) setOwner(id.owner);
  }, [config, setGhostName]);

  useEffect(() => {
    loadIdentity();
  }, [loadIdentity]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + Space.xxxl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <GhostText type="title" style={styles.avatarMark}>G</GhostText>
          <View style={[styles.dot, connectionState === "online" ? styles.dotOn : styles.dotOff]} />
        </View>
        <View style={styles.profileInfo}>
          <GhostText type="headline" style={styles.profileName}>{ghostName ?? "Ghost"}</GhostText>
          <View style={styles.profileStatus}>
            <StatusDot status={connectionState === "online" ? "online" : connectionState === "syncing" ? "warning" : "offline"} />
            <GhostText type="subhead" style={styles.profileStatusText}>
              {connectionState === "online" ? (owner ? `Online · ${owner}'s Ghost` : "Online") : connectionState === "syncing" ? "Syncing" : "Offline"}
            </GhostText>
          </View>
        </View>
      </View>
      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionTitle}>Manage</GhostText>
        <GhostRow title="Routines" subtitle="What Ghost does automatically" chevron style={{ paddingHorizontal: 0 }} onPress={() => router.push("/routines" as never)} />
        <GhostRow title="Connected Apps" subtitle="Status of connected services" chevron style={{ paddingHorizontal: 0 }} onPress={() => router.push("/connections" as never)} />
        <GhostRow title="Device" subtitle="Health and attention items" chevron style={{ paddingHorizontal: 0 }} onPress={() => router.push("/device" as never)} />
      </View>
      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionTitle}>Settings</GhostText>
        <GhostRow title="Ghost Pod" chevron style={{ paddingHorizontal: 0 }} onPress={() => router.push("/ghost-pod")} />
        <GhostRow title="Permissions" chevron style={{ paddingHorizontal: 0 }} onPress={() => router.push("/permissions")} />
      </View>
      <View style={styles.section}>
        <GhostText type="caption" style={styles.sectionTitle}>About</GhostText>
        <GhostRow title="About Ghost" chevron style={{ paddingHorizontal: 0 }} onPress={() => router.push("/about")} />
      </View>
      <View style={{ height: 96 }} />
      <PlusMenu />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.lg,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xl,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Ghost.bg.sunken,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMark: {
    color: Ghost.text.primary,
  },
  dot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Ghost.bg.base,
  },
  dotOn: {
    backgroundColor: Ghost.status.success,
  },
  dotOff: {
    backgroundColor: Ghost.text.tertiary,
  },
  profileInfo: {
    gap: Space.xs,
  },
  profileName: {
    color: Ghost.text.primary,
  },
  profileStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  profileStatusText: {
    color: Ghost.text.secondary,
  },
  section: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
  },
  sectionTitle: {
    color: Ghost.text.tertiary,
    textTransform: "uppercase",
    marginBottom: Space.sm,
    marginTop: Space.sm,
  },
});
