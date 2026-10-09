import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { DashTileView } from "@/components/dash-tile";
import { Ghost, Space } from "@/constants/theme";
import { fetchDashboard, type DashTile } from "@/lib/ghostApi";
import { whenAgo } from "@/lib/when";
import { useGhostStore } from "@/lib/store";

const EVERY_MS = 30_000;

/**
 * A dashboard, whole and live: every chart's query runs again when it is
 * opened, every 30 seconds while it is looked at, and on a pull. Each chart
 * can show the query that answered it.
 */
export default function DashboardScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const config = useGhostStore((s) => s.config);
  const [title, setTitle] = useState("Dashboard");
  const [tiles, setTiles] = useState<DashTile[] | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, tick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!config || typeof id !== "string") return;
    const r = await fetchDashboard(config, id);
    if (r.ok) {
      setTitle(r.data.title);
      setTiles(r.data.tiles);
      setRanAt(r.data.ran_at);
      setError(null);
    } else setError(r.error);
  }, [config, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      timer.current = setInterval(() => {
        if (AppState.currentState === "active") void load();
        tick((n) => n + 1);
      }, EVERY_MS);
      return () => { if (timer.current) clearInterval(timer.current); };
    }, [load]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && void load());
    return () => sub.remove();
  }, [load]);

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title={title} subtitle={ranAt ? `Live · updated ${(whenAgo(ranAt) ?? "just now").toLowerCase()}` : "Live"} />
      <EdgeScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={Ghost.text.secondary} />}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {tiles === null && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}
        {(tiles ?? []).map((t, i) => <DashTileView key={`${i}-${t.title}`} tile={t} />)}
        {tiles ? <Text style={styles.foot}>Pull to run every query again. Ghost only reads; nothing here changes your data.</Text> : null}
      </EdgeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg, gap: Space.md },
  error: { fontSize: 13.5, lineHeight: 19, color: Ghost.status.error, textAlign: "center" },
  foot: { fontSize: 12.5, lineHeight: 18, color: Ghost.text.tertiary, textAlign: "center", marginTop: Space.sm, paddingHorizontal: Space.lg },
});
