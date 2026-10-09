import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { ActivityTree } from "@/components/activity-tree";
import { EdgeScrollView } from "@/components/scroll-edge";
import { fetchActivity, type ActivityChip } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

/**
 * Everything Ghost did, newest first, as a tree of days: what, the outcome
 * the runtime recorded, and why Ghost acted. The owner's audit trail.
 */
export default function ActivityScreen() {
  const config = useGhostStore((s) => s.config);
  const [items, setItems] = useState<ActivityChip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!config) return;
    try {
      setItems(await fetchActivity(config, { limit: 100 }));
      setError(null);
    } catch {
      setError("Couldn't reach your Pod to read activity.");
    }
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Activity" subtitle="What Ghost did, and when" />
      {!config ? (
        <Text style={styles.empty}>Activity is recorded on your Ghost Pod. Connect one to see it.</Text>
      ) : items === null && !error ? (
        <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} />
      ) : (
        <EdgeScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={Ghost.text.tertiary}
            />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {items && items.length === 0 && !error ? (
            <Text style={styles.empty}>Nothing yet. Every action Ghost takes for you is recorded here.</Text>
          ) : null}
          {items ? <ActivityTree items={items} foldable /> : null}
        </EdgeScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingTop: Space.sm, paddingBottom: 96, paddingHorizontal: Space.xl },
  empty: {
    fontSize: 15.5,
    lineHeight: 23,
    fontWeight: "300",
    color: Ghost.text.secondary,
    textAlign: "center",
    marginTop: Space.lg,
    paddingHorizontal: Space.xl,
  },
  error: { fontSize: 14, color: Ghost.status.error, marginTop: Space.md, textAlign: "center" },
});
