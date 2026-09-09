import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton, StatusDot } from "@/components/ghost";
import { checkHealthInfo, fetchDoctorStatus, type DoctorStatus, type HealthStatus } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

export default function DeviceScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    const [h, d] = await Promise.all([checkHealthInfo(config), fetchDoctorStatus(config)]);
    setHealth(h);
    setDoctor(d);
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const attention = (doctor?.checks ?? []).filter((c) => c.status !== "ok");

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title}>Device</GhostText>
        <GhostText type="subhead" style={styles.sub}>Health of your Ghost. Restart and updates live in the web console.</GhostText>
      </View>
      {!config ? (
        <EmptyState title="Not connected" subtitle="Connect to see device health." />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={Ghost.accent.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.accent.primary} />}
        >
          <View style={styles.row}>
            <StatusDot status={health?.ok ? "online" : "offline"} />
            <GhostText type="body" style={styles.rowTitle}>{health?.ok ? "Ghost is healthy" : "Ghost is unreachable"}</GhostText>
          </View>
          {attention.length > 0 ? (
            <>
              <GhostText type="caption" style={styles.group}>Needs attention</GhostText>
              {attention.map((c) => (
                <View key={c.name} style={styles.check}>
                  <GhostText type="headline" style={styles.rowTitle}>{c.name}</GhostText>
                  <GhostText type="subhead" style={styles.rowSub}>{c.message}</GhostText>
                </View>
              ))}
            </>
          ) : (
            <GhostText type="subhead" style={styles.rowSub}>Everything looks good.</GhostText>
          )}
          <GhostButton title="Refresh" variant="secondary" onPress={() => load()} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  header: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  title: {
    ...Type.largeTitle,
    color: Ghost.text.primary,
  },
  sub: {
    ...Type.subhead,
    color: Ghost.text.secondary,
    marginTop: 2,
  },
  center: {
    flex: 1,
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.huge,
    gap: Space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowSub: {
    color: Ghost.text.secondary,
  },
  group: {
    color: Ghost.text.tertiary,
    marginTop: Space.md,
  },
  check: {
    gap: 2,
    paddingVertical: Space.sm,
  },
});
