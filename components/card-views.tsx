import React, { useMemo } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Pattern, Rect, Stop } from "react-native-svg";
import { ArrowUpRight, MapPin } from "lucide-react-native";
import { Text } from "@/components/text";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import type { ChartBlock, CompareBlock, MapBlock, Tone } from "@/lib/blocks";
import { chartScale, mapLayout, mapsUrl } from "@/lib/cardViews";

/**
 * The blocks that show what a list or a fact cannot: options side by side, a
 * shape over time, where things are. Same hand as every other block: quiet
 * glass, light type, one colour per meaning, and the accent only where Ghost
 * points at something (the option it recommends, the latest value).
 */

const TONE: Record<Tone, string> = {
  neutral: Ghost.text.primary,
  good: Ghost.status.success,
  warn: Ghost.status.warning,
  bad: Ghost.status.error,
  info: Ghost.status.info,
};

/* ── compare: a few things, side by side ───────────────────────────── */

export function Compare({ block }: { block: CompareBlock }) {
  const n = block.options.length;
  const pick = block.pick;
  return (
    <View style={styles.group} accessibilityRole="summary">
      {/* The recommended option's column carries a quiet light from top to bottom. */}
      {pick !== null ? (
        <View pointerEvents="none" style={[styles.pickColumn, { left: `${(pick / n) * 100}%`, width: `${100 / n}%` }]} />
      ) : null}
      <View style={styles.compareHead}>
        {block.options.map((o, i) => (
          <View key={o.id} style={styles.compareCell}>
            {pick === i ? <Text style={styles.pickTag}>Ghost&apos;s pick</Text> : null}
            <Text style={[styles.compareName, pick === i && { color: Ghost.text.primary }]} numberOfLines={2}>{o.label}</Text>
            {o.detail ? <Text style={styles.compareDetail} numberOfLines={2}>{o.detail}</Text> : null}
          </View>
        ))}
      </View>
      {block.rows.map((r, ri) => (
        <View key={ri} style={styles.compareRow}>
          <Text style={styles.compareLabel} numberOfLines={1}>{r.label}</Text>
          <View style={styles.compareValues}>
            {r.values.map((v, i) => (
              <Text
                key={i}
                style={[styles.compareValue, pick === i && styles.compareValuePick, r.tone !== "neutral" && pick === i && { color: TONE[r.tone] }]}
                numberOfLines={3}
              >
                {v || "—"}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ── chart: a shape over time ──────────────────────────────────────── */

const CHART_H = 132;
/** The line chart is drawn in its own fixed space and stretched to the width it gets. */
const LINE_W = 100;

export function Chart({ block }: { block: ChartBlock }) {
  const scale = useMemo(() => chartScale(block.points.map((p) => p.value)), [block.points]);
  const last = block.points[block.points.length - 1];
  const fmt = (v: number) => formatAmount(v, block.unit);
  const n = block.points.length;
  // Labels under the axis: all of them when they fit, otherwise the first, the
  // last and a few between.
  const every = n <= 8 ? 1 : Math.ceil(n / 6);
  return (
    <View accessible accessibilityLabel={`${block.label}. ${block.points.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}`}>
      <View style={styles.chartHead}>
        <Text style={styles.micro}>{block.label}</Text>
        <Text style={styles.chartLast}>{fmt(last.value)}</Text>
      </View>
      <View style={styles.chartBox}>
        {/* A baseline and a quiet midline, nothing more. */}
        <View style={styles.midline} />
        <View style={styles.baseline} />
        {block.chart === "bar" ? (
          <View style={styles.bars}>
            {block.points.map((p, i) => (
              <View key={i} style={styles.barSlot}>
                <View
                  style={[
                    styles.bar,
                    { height: Math.max(2, scale.y(p.value) * (CHART_H - 8)) },
                    i === n - 1 && { backgroundColor: Ghost.accent.primary },
                  ]}
                />
              </View>
            ))}
          </View>
        ) : (
          <LineChart values={block.points.map((p) => p.value)} y={scale.y} />
        )}
      </View>
      <View style={styles.chartAxis}>
        {block.points.map((p, i) => (
          <Text key={i} style={styles.chartTick} numberOfLines={1}>
            {i % every === 0 || i === n - 1 ? p.label : ""}
          </Text>
        ))}
      </View>
      {block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}
    </View>
  );
}

/** A number with its unit: currency symbols before it ($290), anything else after (5,400 steps). */
export function formatAmount(v: number, unit?: string): string {
  const n = Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (!unit) return n;
  if (/^[$€£¥₦₹₩₱₺₽]$|^(KSh|USh|TSh|R)$/.test(unit)) return `${unit}${unit.length > 1 ? " " : ""}${n}`;
  return unit.length > 2 ? `${n} ${unit}` : `${n}${unit}`;
}

function LineChart({ values, y }: { values: number[]; y: (v: number) => number }) {
  const n = values.length;
  const slot = LINE_W / n;
  const top = 6, bottom = CHART_H - 4;
  const pts = values.map((v, i) => [i * slot + slot / 2, bottom - y(v) * (bottom - top)] as const);
  // A gentle curve through the points (midpoint smoothing), never overshooting.
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  const area = `${d} L ${pts[n - 1][0]} ${CHART_H - 1} L ${pts[0][0]} ${CHART_H - 1} Z`;
  const [lx, ly] = pts[n - 1];
  return (
    <>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${LINE_W} ${CHART_H}`} preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Ghost.accent.primary} stopOpacity={0.32} />
            <Stop offset="1" stopColor={Ghost.accent.primary} stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Path d={area} fill="url(#area)" />
        <Path d={d} stroke={Ghost.accent.primary} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </Svg>
      {/* The latest point, drawn outside the stretched space so it stays round. */}
      <View pointerEvents="none" style={[styles.lastHalo, { left: `${(lx / LINE_W) * 100}%`, top: ly - 7 }]}>
        <View style={styles.lastDot} />
      </View>
    </>
  );
}

/* ── map: where things are, drawn without a map ────────────────────── */
// The places are drawn where they sit relative to each other, on a quiet dot
// grid, with no map tiles: nothing is fetched from a map service, so where the
// owner is looking stays on the phone. Each place opens in the phone's own
// maps app.

const MAP_H = 168;

export function PlacesMap({ block }: { block: MapBlock }) {
  // The pins are laid out for the box's shape and placed by percentage, so
  // they stay inside it whatever width it ends up with.
  const [width, setWidth] = React.useState(330);
  const pins = useMemo(() => mapLayout(block.places, width, MAP_H, 26), [block.places, width]);
  const open = (i: number) => {
    const p = block.places[i];
    Linking.openURL(mapsUrl(p, Platform.OS)).catch(() => Linking.openURL(mapsUrl(p, "web")).catch(() => {}));
  };
  return (
    <View style={styles.group}>
      <View
        style={styles.mapBox}
        onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0 && Math.abs(w - width) > 1) setWidth(w); }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width="100%" height={MAP_H} style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id="dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
              <Circle cx="8" cy="8" r="0.9" fill="rgba(255,255,255,0.10)" />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width="100%" height={MAP_H} fill="url(#dots)" />
        </Svg>
        {pins.map((p, i) => (
          <View key={i} style={[styles.pin, { left: `${(p.x / width) * 100}%`, top: p.y - 13 }]}>
            <View style={[styles.pinHalo, i === 0 && styles.pinHaloFirst]} />
            <View style={[styles.pinDot, i === 0 && styles.pinDotFirst]}>
              <Text style={[styles.pinNumber, i === 0 && { color: "#0B0B10" }]}>{i + 1}</Text>
            </View>
          </View>
        ))}
      </View>
      {block.places.map((p, i) => (
        <Pressable
          key={i}
          onPress={() => open(i)}
          style={({ pressed }) => [styles.placeRow, i > 0 && styles.rowLine, pressed && { opacity: 0.6 }]}
          accessibilityRole="link"
          accessibilityLabel={`${p.name}${p.detail ? `, ${p.detail}` : ""}. Open in Maps`}
        >
          <View style={styles.placeIndex}>
            <Text style={styles.placeIndexText}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.placeName} numberOfLines={1}>{p.name}</Text>
            {p.detail ? <Text style={styles.placeDetail} numberOfLines={1}>{p.detail}</Text> : null}
          </View>
          <ArrowUpRight size={16} color={Ghost.text.tertiary} strokeWidth={2} />
        </Pressable>
      ))}
      {block.places.length === 1 ? null : (
        <View style={styles.mapFoot}>
          <MapPin size={12} color={Ghost.text.tertiary} strokeWidth={2} />
          <Text style={styles.mapFootText}>Drawn where they are relative to each other</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 20, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.045)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, overflow: "hidden" },
  micro: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary },
  caption: { fontSize: 13.5, lineHeight: 19, fontWeight: "300", color: Ghost.text.secondary, marginTop: Space.sm },
  // compare
  pickColumn: { position: "absolute", top: 0, bottom: 0, backgroundColor: alpha(Ghost.accent.primary, 0.08), borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: alpha(Ghost.accent.primary, 0.24) },
  compareHead: { flexDirection: "row", paddingTop: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  compareCell: { flex: 1, paddingHorizontal: 10, gap: 2, justifyContent: "flex-end" },
  pickTag: { fontSize: 10.5, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", color: Ghost.accent.primary, marginBottom: 2 },
  compareName: { fontSize: 14.5, lineHeight: 19, fontWeight: "500", color: Ghost.text.secondary, letterSpacing: -0.1 },
  compareDetail: { fontSize: 12, lineHeight: 16, color: Ghost.text.tertiary },
  compareRow: { paddingTop: 9, paddingBottom: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  compareLabel: { fontSize: 11.5, fontWeight: "500", color: Ghost.text.tertiary, paddingHorizontal: 10, marginBottom: 3 },
  compareValues: { flexDirection: "row" },
  compareValue: { flex: 1, paddingHorizontal: 10, fontSize: 14, lineHeight: 19, fontWeight: "300", color: Ghost.text.secondary, fontVariant: ["tabular-nums"] },
  compareValuePick: { color: Ghost.text.primary, fontWeight: "400" },
  // chart
  chartHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 },
  chartLast: { fontFamily: Fonts.voice, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: Ghost.text.primary },
  chartBox: { height: CHART_H },
  midline: { position: "absolute", left: 0, right: 0, top: Math.round(CHART_H / 2), height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.06)" },
  baseline: { position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: "rgba(255,255,255,0.10)" },
  bars: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", paddingBottom: 1 },
  barSlot: { flex: 1, alignItems: "center" },
  bar: { width: "56%", maxWidth: 28, minWidth: 4, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: "rgba(255,255,255,0.22)" },
  lastHalo: { position: "absolute", width: 14, height: 14, marginLeft: -7, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: alpha(Ghost.accent.primary, 0.25) },
  lastDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Ghost.accent.primary },
  chartAxis: { flexDirection: "row", marginTop: 6 },
  chartTick: { flex: 1, fontSize: 11, color: Ghost.text.tertiary, textAlign: "center", fontVariant: ["tabular-nums"] },
  // map
  mapBox: { height: MAP_H, backgroundColor: "rgba(0,0,0,0.25)", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  pin: { position: "absolute", width: 26, height: 26, marginLeft: -13, alignItems: "center", justifyContent: "center" },
  pinHalo: { position: "absolute", width: 26, height: 26, borderRadius: 13, backgroundColor: alpha(Ghost.accent.primary, 0.14) },
  pinHaloFirst: { backgroundColor: alpha(Ghost.accent.primary, 0.24) },
  pinDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#2A2740", borderWidth: 1.2, borderColor: Ghost.accent.primary },
  pinDotFirst: { backgroundColor: Ghost.accent.primary },
  pinNumber: { fontSize: 10.5, lineHeight: 13, fontWeight: "600", color: Ghost.text.primary },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 9 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  placeIndex: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: alpha(Ghost.accent.primary, 0.14), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(Ghost.accent.primary, 0.34) },
  placeIndexText: { fontSize: 11.5, fontWeight: "600", color: Ghost.accent.primary },
  placeName: { fontSize: 15, lineHeight: 20, fontWeight: "500", color: Ghost.text.primary },
  placeDetail: { fontSize: 13, lineHeight: 17, fontWeight: "300", color: Ghost.text.secondary },
  mapFoot: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingBottom: 10, paddingTop: 2 },
  mapFootText: { fontSize: 11.5, color: Ghost.text.tertiary },
});
