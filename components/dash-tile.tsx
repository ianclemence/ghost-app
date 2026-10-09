import React, { memo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { Code2 } from "lucide-react-native";
import { Text } from "@/components/text";
import { Chart } from "@/components/card-views";
import { Fonts, Ghost, Space } from "@/constants/theme";
import type { DashTile } from "@/lib/ghostApi";
import { cell, change, shares, tileNumber } from "@/lib/dashboards";

const SHARE_TINTS = [Ghost.accent.primary, "#8FB8FF", "#6FE3A0", "#FFC24D", "#FF9A1A", "rgba(255,255,255,0.35)"];

/**
 * One chart of a dashboard: what it answers, the answer drawn plainly, and,
 * a tap away, the query that answered it and where it ran. A chart whose
 * query failed says so in words instead of drawing nothing.
 */
export const DashTileView = memo(function DashTileView({ tile, compact = false }: { tile: DashTile; compact?: boolean }) {
  const reduce = useReducedMotion();
  const [showQuery, setShowQuery] = useState(false);
  const from = tile.source === "pod" ? "Your Pod" : tile.source;
  return (
    <View style={styles.tile}>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={2}>{tile.title}</Text>
        {!compact ? (
          <Pressable onPress={() => setShowQuery((v) => !v)} hitSlop={8} style={({ pressed }) => [styles.qBtn, showQuery && styles.qBtnOn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityState={{ expanded: showQuery }} accessibilityLabel={showQuery ? "Hide the query" : "Show the query behind this chart"}>
            <Code2 size={13} color={showQuery ? Ghost.text.primary : Ghost.text.tertiary} strokeWidth={2} />
            <Text style={[styles.qText, showQuery && { color: Ghost.text.primary }]}>Query</Text>
          </Pressable>
        ) : null}
      </View>

      {tile.error ? (
        <Text style={styles.error}>{`This chart couldn't be drawn: ${tile.error}`}</Text>
      ) : tile.chart === "metric" ? (
        <Metric tile={tile} compact={compact} />
      ) : tile.chart === "bar" || tile.chart === "line" ? (
        <Chart block={{ type: "chart", chart: tile.chart, label: "", points: (tile.points ?? []).slice(-(compact ? 12 : 120)), unit: tile.unit }} />
      ) : tile.chart === "donut" ? (
        <Shares tile={tile} />
      ) : (
        <Table tile={tile} compact={compact} />
      )}

      {tile.note && !tile.error ? <Text style={styles.note}>{tile.note}</Text> : null}
      {showQuery ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(160)} style={styles.query}>
          <Text style={styles.queryFrom}>{from}</Text>
          <Text style={styles.queryText} selectable>{tile.query}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
});

function Metric({ tile, compact }: { tile: DashTile; compact: boolean }) {
  if (tile.value === undefined) return null;
  const ch = change(tile);
  return (
    <View style={{ gap: 4 }}>
      <Text style={[styles.metric, compact && { fontSize: 34, lineHeight: 38 }]} adjustsFontSizeToFit numberOfLines={1}>{tileNumber(tile.value, tile.unit)}</Text>
      {ch ? <Text style={[styles.change, { color: ch.up ? Ghost.status.success : Ghost.status.warning }]}>{ch.text}</Text> : null}
    </View>
  );
}

function Shares({ tile }: { tile: DashTile }) {
  const s = shares(tile.points ?? []);
  return (
    <View style={{ gap: Space.sm }}>
      <View style={styles.shareBar} accessible accessibilityLabel={s.map((x) => `${x.label} ${Math.round(x.share * 100)}%`).join(", ")}>
        {s.map((x, i) => <View key={x.label} style={{ flex: x.share, backgroundColor: SHARE_TINTS[i] ?? SHARE_TINTS[5] }} />)}
      </View>
      <View style={{ gap: 6 }}>
        {s.map((x, i) => (
          <View key={x.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: SHARE_TINTS[i] ?? SHARE_TINTS[5] }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>{x.label}</Text>
            <Text style={styles.legendValue}>{`${Math.round(x.share * 100)}%`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Table({ tile, compact }: { tile: DashTile; compact: boolean }) {
  const cols = tile.columns ?? [];
  const rows = (tile.rows ?? []).slice(0, compact ? 5 : 50);
  if (rows.length === 0) return <Text style={styles.note}>Nothing yet.</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: "100%" }}>
      <View style={{ minWidth: "100%" }}>
        <View style={[styles.tr, styles.thRow]}>
          {cols.map((c, j) => <Text key={c} style={[styles.td, styles.th, typeof rows[0]?.[j] === "number" && styles.num]} numberOfLines={1}>{c.replace(/_/g, " ")}</Text>)}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={[styles.tr, i > 0 && styles.trLine]}>
            {cols.map((c, j) => <Text key={c} style={[styles.td, typeof r[j] === "number" && styles.num]} numberOfLines={1}>{cell(r[j])}</Text>)}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tile: { gap: Space.sm, padding: Space.lg, borderRadius: 22, borderCurve: "continuous", backgroundColor: "rgba(0,0,0,0.42)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  head: { flexDirection: "row", alignItems: "flex-start", gap: Space.sm },
  title: { flex: 1, fontSize: 13, fontWeight: "500", letterSpacing: 0.2, color: Ghost.text.secondary },
  qBtn: { flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 12 },
  qBtnOn: { backgroundColor: Ghost.glass.fill },
  qText: { fontSize: 11.5, fontWeight: "500", color: Ghost.text.tertiary },
  metric: { fontFamily: Fonts.voice, fontSize: 44, lineHeight: 48, letterSpacing: -0.8, color: Ghost.text.primary, fontVariant: ["tabular-nums"] },
  change: { fontSize: 13, fontWeight: "500" },
  note: { fontSize: 13, lineHeight: 18, color: Ghost.text.tertiary },
  error: { fontSize: 13.5, lineHeight: 19, color: Ghost.status.warning },
  query: { gap: 4, padding: Space.md, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.border.subtle },
  queryFrom: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: Ghost.text.tertiary },
  queryText: { fontFamily: Fonts.mono, fontSize: 12.5, lineHeight: 18, color: "#D7D5E0" },
  shareBar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 13.5, color: Ghost.text.secondary },
  legendValue: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.primary, fontVariant: ["tabular-nums"] },
  tr: { flexDirection: "row", minHeight: 34, alignItems: "center" },
  thRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.default },
  trLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  td: { width: 112, paddingRight: 10, fontSize: 13, color: Ghost.text.primary },
  th: { fontSize: 11, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", color: Ghost.text.tertiary },
  num: { fontVariant: ["tabular-nums"], textAlign: "right" },
});

