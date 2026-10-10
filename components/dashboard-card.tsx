import React, { memo, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { LayoutDashboard, Maximize2 } from "lucide-react-native";
import { Text } from "@/components/text";
import { MADE_LOOK } from "@/components/made-look";
import { DashTileView } from "@/components/dash-tile";
import { fetchDashboard, type Artifact, type DashTile, type GhostConfig } from "@/lib/ghostApi";
import { alpha, Ghost, Space } from "@/constants/theme";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * A dashboard Ghost made, in the conversation: its first charts as they are
 * now, and a bar that opens it whole, live, with every chart's query.
 */
export const DashboardCard = memo(function DashboardCard({ config, artifact }: { config: GhostConfig; artifact: Artifact }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [tiles, setTiles] = useState<DashTile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchDashboard(config, artifact.id).then((r) => {
      if (!live) return;
      if (r.ok) setTiles(r.data.tiles);
      else setError(r.error);
    });
    return () => { live = false; };
  }, [config, artifact.id]);
  const open = () => router.push({ pathname: "/dashboard", params: { id: artifact.id } } as never);
  const shown = (tiles ?? []).slice(0, 2);
  const more = (tiles?.length ?? 0) - shown.length;
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(220).easing(EASE)} style={styles.wrap}>
      <View style={styles.frame}>
        <View style={styles.body}>
          {tiles === null && !error ? <ActivityIndicator style={{ marginVertical: Space.xl }} color={Ghost.text.secondary} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {shown.map((t, i) => <DashTileView key={i} tile={t} compact />)}
        </View>
        <Pressable onPress={open} style={({ pressed }) => [styles.bar, pressed && styles.barPressed]} accessibilityRole="button" accessibilityLabel={`${artifact.title}, a live dashboard. Open it`}>
          <View style={styles.badge}>
            <LayoutDashboard size={17} color={MADE_LOOK.dashboards.tint} strokeWidth={1.9} />
          </View>
          <View style={styles.titles}>
            <Text style={styles.title} numberOfLines={1}>{artifact.title}</Text>
            <Text style={styles.meta} numberOfLines={1}>{["Live", tiles ? `${tiles.length} ${tiles.length === 1 ? "chart" : "charts"}` : null, more > 0 ? `${more} more inside` : null].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={styles.open}>
            <Maximize2 size={13} color={Ghost.text.primary} strokeWidth={2.1} />
            <Text style={styles.openText}>Open</Text>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: Space.lg },
  frame: { borderRadius: 24, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, backgroundColor: "#0b0b10" },
  body: { padding: Space.sm, gap: Space.sm },
  error: { fontSize: 13.5, color: Ghost.status.warning, padding: Space.md },
  bar: { flexDirection: "row", alignItems: "center", gap: Space.md, height: 60, paddingLeft: 12, paddingRight: 10, backgroundColor: Ghost.bg.raised, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.default },
  barPressed: { backgroundColor: "#15151B" },
  badge: { width: 36, height: 36, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: alpha(MADE_LOOK.dashboards.tint, 0.13), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(MADE_LOOK.dashboards.tint, 0.32) },
  titles: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 14.5, lineHeight: 19, fontWeight: "500", letterSpacing: -0.1, color: Ghost.text.primary },
  meta: { fontSize: 12.5, lineHeight: 16, color: Ghost.text.tertiary },
  open: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  openText: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.primary },
});
