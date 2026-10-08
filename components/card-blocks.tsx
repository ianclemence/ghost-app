import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react-native";
import { alpha, Aurora, Fonts, Ghost } from "@/constants/theme";
import { CodeBlock } from "@/components/code-block";
import type { Block, StepState, Tone } from "@/lib/blocks";

/**
 * One renderer per block type. A presented card is only ever these, so every
 * dynamic card in the app has the same hand: glass, serif for the one big
 * thing, light type for the rest, one colour per meaning. The model chooses
 * which blocks and what they say; it never chooses how they look.
 */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const TONE: Record<Tone, string> = {
  neutral: Ghost.text.primary,
  good: Ghost.status.success,
  warn: Ghost.status.warning,
  bad: Ghost.status.error,
  info: Ghost.status.info,
};
/** A tone's light: neutral is a quiet grey rather than white. */
const LIGHT: Record<Tone, string> = { ...TONE, neutral: "rgba(255,255,255,0.32)" };

export function CardBlock({ block, index }: { block: Block; index: number }) {
  const reduce = useReducedMotion();
  // A card draws top to bottom, a breath apart: occasional, so it may have a moment.
  const entering = reduce ? undefined : FadeInDown.duration(220).delay(Math.min(index, 5) * 45).easing(EASE_OUT);
  return <Animated.View entering={entering}>{render(block)}</Animated.View>;
}

function render(b: Block) {
  switch (b.type) {
    case "text":
      return <Text style={styles.text}>{b.text}</Text>;
    case "note":
      return <Note text={b.text} tone={b.tone} />;
    case "metric":
      return <Metric block={b} />;
    case "facts":
      return <Facts rows={b.rows} />;
    case "list":
      return <ListBlock items={b.items} />;
    case "timeline":
      return <Timeline steps={b.steps} />;
    case "progress":
      return <Progress label={b.label} value={b.progress} caption={b.caption} />;
    case "code":
      return <CodeBlock language={b.language} code={b.code} />;
  }
}

/* ── metric: the one big thing ─────────────────────────────────────── */

function Metric({ block }: { block: Extract<Block, { type: "metric" }> }) {
  const tint = TONE[block.tone];
  const up = /^\s*[+↑▲]/.test(block.delta ?? "");
  const down = /^\s*[-−–↓▼]/.test(block.delta ?? "");
  return (
    <View accessible accessibilityLabel={`${block.label}: ${block.value}${block.unit ? " " + block.unit : ""}${block.delta ? ", " + block.delta : ""}`}>
      <Text style={styles.micro}>{block.label}</Text>
      <View style={styles.metricRow}>
        <Text style={[styles.metricValue, block.tone !== "neutral" && { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {block.value}
        </Text>
        {block.unit ? <Text style={styles.metricUnit}>{block.unit}</Text> : null}
        {block.delta ? (
          <View style={[styles.delta, { backgroundColor: alpha(down ? Ghost.status.error : up ? Ghost.status.success : Ghost.text.secondary, 0.14) }]}>
            <Text style={[styles.deltaText, { color: down ? Ghost.status.error : up ? Ghost.status.success : Ghost.text.secondary }]}>{block.delta}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ── facts and list: quiet rows ────────────────────────────────────── */

function Facts({ rows }: { rows: Extract<Block, { type: "facts" }>["rows"] }) {
  return (
    <View style={styles.group}>
      {rows.map((r, i) => (
        <View key={i} style={[styles.row, i < rows.length - 1 && styles.rowLine]} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
          <Text style={styles.factLabel}>{r.label}</Text>
          <View style={styles.factValueWrap}>
            {r.tone !== "neutral" ? <View style={[styles.dot, { backgroundColor: LIGHT[r.tone] }]} /> : null}
            <Text style={[styles.factValue, r.tone !== "neutral" && { color: TONE[r.tone] }]} numberOfLines={2}>{r.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ListBlock({ items }: { items: Extract<Block, { type: "list" }>["items"] }) {
  return (
    <View style={styles.group}>
      {items.map((it, i) => (
        <View key={i} style={[styles.row, i < items.length - 1 && styles.rowLine]} accessible accessibilityLabel={[it.title, it.subtitle, it.trailing].filter(Boolean).join(", ")}>
          <View style={[styles.lead, { backgroundColor: LIGHT[it.tone] }]} />
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle} numberOfLines={2}>{it.title}</Text>
            {it.subtitle ? <Text style={styles.itemSub} numberOfLines={3}>{it.subtitle}</Text> : null}
          </View>
          {it.trailing ? <Text style={[styles.trailing, it.tone !== "neutral" && { color: TONE[it.tone] }]}>{it.trailing}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/* ── timeline: a journey or a day, with a "now" that breathes ──────── */

function Timeline({ steps }: { steps: Extract<Block, { type: "timeline" }>["steps"] }) {
  return (
    <View>
      {steps.map((s, i) => (
        <Step key={i} step={s} last={i === steps.length - 1} />
      ))}
    </View>
  );
}

function Step({ step, last }: { step: Extract<Block, { type: "timeline" }>["steps"][number]; last: boolean }) {
  const state: StepState | null = step.state;
  const now = state === "now";
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!now || reduce) return;
    pulse.set(withRepeat(withSequence(withTiming(0.4, { duration: 1100, easing: Easing.inOut(Easing.sin) }), withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) })), -1));
  }, [now, reduce, pulse]);
  const glow = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const color = state === "done" ? Ghost.status.success : now ? Ghost.ember : "rgba(255,255,255,0.28)";
  return (
    <View style={styles.step} accessible accessibilityLabel={[step.time, step.title, step.detail, now ? "now" : state === "done" ? "done" : null].filter(Boolean).join(", ")}>
      <Text style={styles.stepTime}>{step.time ?? ""}</Text>
      <View style={styles.rail}>
        {!last ? <View style={[styles.trunk, state === "done" && { backgroundColor: alpha(Ghost.status.success, 0.4) }]} /> : null}
        {now ? <Animated.View style={[styles.halo, glow]} /> : null}
        <View style={[styles.node, state === "next" || state === null ? { backgroundColor: "#000", borderColor: color } : { backgroundColor: color, borderColor: "#000" }]} />
      </View>
      <View style={styles.stepBody}>
        <Text style={[styles.itemTitle, state === "done" && { color: Ghost.text.secondary }, now && { color: Ghost.text.primary }]} numberOfLines={2}>{step.title}</Text>
        {step.detail ? <Text style={styles.itemSub} numberOfLines={3}>{step.detail}</Text> : null}
      </View>
    </View>
  );
}

/* ── progress: fills in once, in the aurora's colours ──────────────── */

function Progress({ label, value, caption }: { label: string; value: number; caption?: string }) {
  const reduce = useReducedMotion();
  const fill = useSharedValue(reduce ? value : 0);
  useEffect(() => {
    fill.set(reduce ? value : withDelay(120, withTiming(value, { duration: 700, easing: EASE_OUT })));
  }, [value, reduce, fill]);
  const style = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, fill.get())) * 100}%` as `${number}%` }));
  const pct = Math.round(value * 100);
  return (
    <View accessible accessibilityLabel={`${label}: ${pct} percent${caption ? ", " + caption : ""}`}>
      <View style={styles.progressHead}>
        <Text style={styles.itemTitle}>{label}</Text>
        <Text style={styles.percent}>{pct}%</Text>
      </View>
      {/* The fill is absolutely placed and has no layout children, so growing it costs no layout pass for anything else. */}
      <View style={styles.track}>
        <Animated.View style={[styles.fill, style]}>
          <LinearGradient
            colors={[Aurora.amber, Aurora.magenta, Aurora.violet, Aurora.blue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
      {caption ? <Text style={styles.itemSub}>{caption}</Text> : null}
    </View>
  );
}

/* ── note: a tinted line with an icon that says which kind ─────────── */

const NOTE_ICON = { neutral: Info, info: Info, good: CircleCheck, warn: TriangleAlert, bad: CircleAlert } as const;

function Note({ text, tone }: { text: string; tone: Tone }) {
  const color = tone === "neutral" ? Ghost.text.secondary : TONE[tone];
  const Icon = NOTE_ICON[tone];
  return (
    <View style={[styles.note, { backgroundColor: alpha(tone === "neutral" ? "#FFFFFF" : TONE[tone], tone === "neutral" ? 0.05 : 0.09), borderColor: alpha(tone === "neutral" ? "#FFFFFF" : TONE[tone], tone === "neutral" ? 0.1 : 0.28) }]} accessible accessibilityLabel={text}>
      <Icon size={16} color={color} strokeWidth={1.9} style={{ marginTop: 2 }} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15.5, lineHeight: 23, fontWeight: "300", color: "rgba(255,255,255,0.82)" },
  micro: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary },
  metricRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  metricValue: { fontFamily: Fonts.voice, fontSize: 68, lineHeight: 78, letterSpacing: -2, color: Ghost.text.primary, flexShrink: 1 },
  metricUnit: { fontSize: 20, fontWeight: "300", color: Ghost.text.secondary },
  delta: { marginLeft: "auto", alignSelf: "center", paddingHorizontal: 10, height: 24, borderRadius: 12, justifyContent: "center" },
  deltaText: { fontSize: 12.5, fontWeight: "500" },
  group: { borderRadius: 20, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.045)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  factLabel: { flex: 1, fontSize: 14.5, fontWeight: "300", color: Ghost.text.secondary },
  factValueWrap: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1, maxWidth: "62%" },
  factValue: { fontSize: 14.5, fontWeight: "500", color: Ghost.text.primary, textAlign: "right", flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  lead: { width: 8, height: 8, borderRadius: 4 },
  itemBody: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 15.5, lineHeight: 21, fontWeight: "500", letterSpacing: -0.15, color: Ghost.text.primary },
  itemSub: { fontSize: 13.5, lineHeight: 19, fontWeight: "300", color: Ghost.text.secondary },
  trailing: { fontSize: 14, fontWeight: "500", color: Ghost.text.secondary, fontVariant: ["tabular-nums"] },
  step: { flexDirection: "row", paddingBottom: 14 },
  stepTime: { width: 54, fontSize: 12.5, lineHeight: 21, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  rail: { width: 22, alignItems: "center" },
  trunk: { position: "absolute", top: 12, bottom: -14, width: StyleSheet.hairlineWidth * 2, backgroundColor: "rgba(255,255,255,0.14)" },
  halo: { position: "absolute", top: 1, width: 20, height: 20, borderRadius: 10, backgroundColor: alpha(Ghost.ember, 0.28) },
  node: { marginTop: 6, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  stepBody: { flex: 1, gap: 2, paddingLeft: 4 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  percent: { fontSize: 14, fontWeight: "500", color: Ghost.text.secondary, fontVariant: ["tabular-nums"] },
  track: { height: 7, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.09)", marginBottom: 8 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4, overflow: "hidden" },
  note: { flexDirection: "row", gap: 10, padding: 12, paddingHorizontal: 14, borderRadius: 16, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth },
  noteText: { flex: 1, fontSize: 14.5, lineHeight: 21, fontWeight: "300", color: "rgba(255,255,255,0.86)" },
});
