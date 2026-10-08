import React, { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { Brain, Check, ChevronRight, FileText, Globe, Search, Terminal, TriangleAlert, Wrench } from "lucide-react-native";
import { Text } from "@/components/text";
import { GhostSheet } from "@/components/ghost";
import { EmberDot } from "@/components/ember-dot";
import { Fonts, Ghost, Inter, Space } from "@/constants/theme";
import { failedCount, formatDuration, liveLine, stepTitle, summarize, type RunStep, type StepKind } from "@/lib/runSteps";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

const ICONS: Record<StepKind, typeof Globe> = {
  search: Search,
  page: Globe,
  browser: Globe,
  command: Terminal,
  memory: Brain,
  files: FileText,
  other: Wrench,
};

/** Seconds since `since`, ticking only while something is running. */
function useElapsed(since: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return Math.max(0, now - since);
}

/**
 * What Ghost did while it worked, as one quiet line in the thread.
 *
 * While Ghost works the line says what it is doing right now and for how long
 * ("Searching the web · 12s"); when it is done it says what happened in total
 * ("Searched the web, ran 2 commands (1 failed)"). It is one row of fixed
 * height either way, so work starting, changing and finishing never moves the
 * conversation. Tapping it opens the run, step by step; a simple answer that
 * needed no tools has no line at all.
 */
export const RunActivity = memo(function RunActivity({
  steps,
  live,
  startedAt,
}: {
  steps: RunStep[];
  /** The reply is still being written. */
  live: boolean;
  /** When the turn began, for the running clock. */
  startedAt: number;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const elapsed = useElapsed(startedAt, live);
  const failed = failedCount(steps);
  const headline = live ? liveLine(steps) : summarize(steps);
  const clock = live && elapsed >= 3000 ? ` · ${formatDuration(elapsed)}` : "";
  const label = `${headline}${clock}`;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={{ top: 6, bottom: 6, right: 12 }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}. See what Ghost did`}
        accessibilityLiveRegion={live ? "polite" : undefined}
      >
        {live ? (
          <EmberDot size={6} />
        ) : failed > 0 ? (
          <View style={[styles.dot, { backgroundColor: Ghost.status.warning }]} />
        ) : null}
        <Animated.Text
          // Keyed by the words so a new step eases in; the row never changes size.
          key={headline}
          entering={reduce || !live ? undefined : FadeIn.duration(180).easing(EASE)}
          style={styles.text}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
        <ChevronRight size={14} color={Ghost.text.tertiary} strokeWidth={2} />
      </Pressable>
      <GhostSheet visible={open} onClose={() => setOpen(false)} title={live ? "Working" : summarize(steps)}>
        <RunSteps steps={steps} live={live} />
      </GhostSheet>
    </>
  );
});

/** The run, step by step: what each was, what it was about, how it went. */
function RunSteps({ steps, live }: { steps: RunStep[]; live: boolean }) {
  if (steps.length === 0) {
    return <Text style={styles.empty}>{live ? "Ghost is thinking. Steps appear here as it works." : "Nothing to show."}</Text>;
  }
  return (
    <View>
      {steps.map((s, i) => (
        <StepRow key={s.id} step={s} last={i === steps.length - 1} />
      ))}
    </View>
  );
}

function StepRow({ step, last }: { step: RunStep; last: boolean }) {
  const Icon = ICONS[step.kind];
  const running = step.state === "running";
  const failed = step.state === "failed";
  const tint = failed ? Ghost.status.error : running ? Ghost.text.primary : Ghost.text.secondary;
  return (
    <View style={styles.step} accessible accessibilityLabel={`${stepTitle(step)}${step.detail ? `, ${step.detail}` : ""}${failed ? ", failed" : ""}`}>
      <View style={styles.rail} pointerEvents="none">
        <View style={[styles.trunk, last && styles.trunkEnd]} />
        <View style={styles.node}>{failed ? <TriangleAlert size={15} color={tint} strokeWidth={1.8} /> : <Icon size={15} color={tint} strokeWidth={1.8} />}</View>
      </View>
      <View style={styles.stepBody}>
        <View style={styles.stepTop}>
          <Text style={[styles.stepTitle, running && { color: Ghost.text.primary }, failed && { color: Ghost.status.error }]} numberOfLines={1}>
            {stepTitle(step)}
          </Text>
          <View style={styles.stepEnd}>
            {running ? <EmberDot size={6} /> : step.ms !== undefined ? <Text style={styles.stepTime}>{formatDuration(step.ms)}</Text> : null}
            {!running && !failed ? <Check size={13} color={Ghost.text.tertiary} strokeWidth={2.2} /> : null}
          </View>
        </View>
        {step.detail ? (
          <Text style={[styles.stepDetail, (step.kind === "command" || step.kind === "files") && styles.mono]} numberOfLines={2} selectable>
            {step.detail}
          </Text>
        ) : null}
        {failed && step.note ? <Text style={styles.stepNote} numberOfLines={3} selectable>{step.note}</Text> : null}
      </View>
    </View>
  );
}

const RAIL = 30;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 7,
    // Fixed: a line that changes its words never changes its height.
    height: 28,
  },
  pressed: { opacity: 0.6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: {
    fontFamily: Inter.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Ghost.text.tertiary,
    flexShrink: 1,
  },
  empty: { fontSize: 14.5, lineHeight: 21, color: Ghost.text.tertiary, paddingVertical: Space.md },
  step: { flexDirection: "row", minHeight: 44 },
  rail: { width: RAIL, alignItems: "center" },
  trunk: { position: "absolute", top: 24, bottom: 0, width: StyleSheet.hairlineWidth * 2, backgroundColor: "rgba(255,255,255,0.14)" },
  trunkEnd: { display: "none" },
  node: { height: 24, justifyContent: "center", alignItems: "center", marginTop: 1 },
  stepBody: { flex: 1, paddingBottom: Space.md, gap: 2 },
  stepTop: { flexDirection: "row", alignItems: "center", gap: Space.md, minHeight: 26 },
  stepTitle: { flex: 1, fontSize: 15.5, lineHeight: 22, fontWeight: "500", color: Ghost.text.secondary, letterSpacing: -0.15 },
  stepEnd: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepTime: { fontSize: 12.5, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  stepDetail: { fontSize: 13.5, lineHeight: 19, color: Ghost.text.tertiary },
  mono: { fontFamily: Fonts.mono, fontSize: 12.5, lineHeight: 18 },
  stepNote: { fontSize: 13, lineHeight: 18, color: Ghost.status.error, opacity: 0.85 },
});
