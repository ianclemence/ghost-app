import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton } from "@/components/ghost";
import { fetchConnections, type ConnectionInfo } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

function statusLabel(s: string): string {
  switch (s) {
    case "connected":
      return "Connected";
    case "not_configured":
      return "Not connected";
    case "configuring":
      return "Setting up";
    case "expired":
    case "invalid":
    case "revoked":
      return "Needs attention";
    case "error":
      return "Error";
    default:
      return s ? s.replace(/_/g, " ") : "Unknown";
  }
}

export default function ConnectionsScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [items, setItems] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      setItems(await fetchConnections(config));
    } catch {
      setError("Couldn't load connected apps.");
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title}>Connected Apps</GhostText>
        <GhostText type="subhead" style={styles.sub}>What Ghost can reach. Connecting happens in the web console for now.</GhostText>
      </View>
      {!config ? (
        <EmptyState title="Not connected" subtitle="Connect to see app status." />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={Ghost.accent.primary} size="large" /></View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}><EmptyState title="Couldn't load apps." subtitle={error} action={<GhostButton title="Retry" onPress={() => load()} />} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><EmptyState title="No apps yet." subtitle="Connected services will appear here." /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.accent.primary} />}
        >
          {items.map((c) => (
            <View key={c.id} style={styles.row}>
              <View style={styles.rowBody}>
                <GhostText type="headline" style={styles.rowTitle}>{c.display_name || c.provider}</GhostText>
                <GhostText type="footnote" style={styles.rowMeta}>{statusLabel(c.status)}</GhostText>
              </View>
            </View>
          ))}
          <GhostText type="footnote" style={styles.note}>To connect or repair an app, use the Ghost web console.</GhostText>
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
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Space.md,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowMeta: {
    color: Ghost.text.secondary,
  },
  note: {
    color: Ghost.text.tertiary,
    marginTop: Space.lg,
  },
});
