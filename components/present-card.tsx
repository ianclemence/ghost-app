import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import Animated, { Easing, FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { ChevronDown, CircleCheck } from "lucide-react-native";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { GhostMark } from "@/components/ghost-mark";
import { GhostButton } from "@/components/ghost";
import { EmberDot } from "@/components/ember-dot";
import { CardBlock } from "@/components/card-blocks";
import { CardInput } from "@/components/card-inputs";
import { blockSpeech, isInput, type Block, type InputBlock } from "@/lib/blocks";
import { answerPayload, answerProblem, initialAnswers, type Answers, type AnswerValue } from "@/lib/cardAnswers";
import type { CardAction, RichCard } from "@/lib/cards";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * A card Ghost chose to show instead of write, or a question it needs answered:
 * a title, then blocks (see card-blocks.tsx), then up to three choices. A card
 * that asks holds the owner's answers until they send them, and says what is
 * still missing first; the Pod checks them again before they count. A list
 * ticked as you go keeps each tick on the Pod as it happens.
 *
 * Once answered or chosen, the card puts itself away into one quiet line
 * ("Dinner · Fri 16 Oct, 19:30") that opens again on a tap, so a long
 * conversation does not fill with spent cards. The Pod remembers it, so it is
 * put away on every device.
 */
/** Cards already shown this session (by id), so their entrance plays once. */
const seenCards = new Set<string>();

export function PresentCard({
  card,
  busy,
  error,
  onAction,
  onSubmit,
  onCheck,
}: {
  card: RichCard;
  busy?: boolean;
  /** Why the last choice did not go through; the buttons are back. */
  error?: string | null;
  onAction: (a: CardAction) => void;
  /** Send the answers of a card that asks. */
  onSubmit?: (answers: Record<string, unknown>) => void;
  /** Tick a line of a list that is ticked as you go. */
  onCheck?: (key: string, item: string, done: boolean) => void;
}) {
  const reducedMotion = useReducedMotion();
  // A card eases in the first time it appears, never again: the thread is a
  // virtualized list that unmounts rows scrolled away and mounts them again,
  // and an entrance replayed on every scroll reads as the card jittering.
  const [firstTime] = useState(() => !seenCards.has(card.id));
  useEffect(() => {
    seenCards.add(card.id);
  }, [card.id]);
  const reduce = reducedMotion || !firstTime;
  const [open, setOpen] = useState(false);
  const resolved = card.resolved;
  const question = card.kind === "question";
  const blocks = useMemo(() => card.blocks ?? [], [card.blocks]);
  const inputs = useMemo(() => blocks.filter(isInput), [blocks]);
  const submit = (card.actions ?? []).find((a) => a.kind === "submit");
  // A list ticked as you go: checklists only, and no Send.
  const living = inputs.length > 0 && !submit && inputs.every((b) => b.type === "checklist");
  const [answers, setAnswers] = useState<Answers>(() => ({ ...initialAnswers(blocks), ...(resolved?.answers as Answers | undefined) }));
  const [problem, setProblem] = useState<string | null>(null);
  // The Pod's copy wins: a list ticked on another device, an answer given there.
  // Only when what the Pod holds changed: the thread refreshes cards as new
  // objects, and resetting on each of those re-rendered the inputs mid-scroll.
  const podCopy = JSON.stringify([card.blocks ?? [], card.resolved?.answers ?? null]);
  useEffect(() => {
    const [b, a] = JSON.parse(podCopy) as [Block[], Answers | null];
    setAnswers({ ...initialAnswers(b), ...(a ?? undefined) });
  }, [podCopy]);
  const collapsed = !!resolved && !open;
  const speech = [question ? "Ghost is asking" : null, card.title, card.body, ...blocks.map(blockSpeech)].filter(Boolean).join(". ");

  const change = (b: InputBlock, v: AnswerValue) => {
    setProblem(null);
    if (living && b.type === "checklist" && onCheck) {
      const before = new Set(Array.isArray(answers[b.key]) ? (answers[b.key] as string[]) : []);
      const after = new Set(Array.isArray(v) ? v : []);
      for (const c of b.checks) {
        if (before.has(c.id) !== after.has(c.id)) onCheck(b.key, c.id, after.has(c.id));
      }
    }
    setAnswers((prev) => ({ ...prev, [b.key]: v }));
  };

  const send = () => {
    const p = answerProblem(blocks, answers, { question });
    if (p) {
      setProblem(p);
      return;
    }
    onSubmit?.(answerPayload(blocks, answers));
  };

  if (collapsed) {
    return (
      <View>
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.collapsed, pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
          accessibilityLabel={`${card.title}. ${resolved.label}. Tap to open the card again.`}
        >
          <CircleCheck size={16} color={Ghost.status.success} strokeWidth={1.9} />
          <Text style={styles.collapsedTitle} numberOfLines={1}>{card.title}</Text>
          <Text style={styles.collapsedLabel} numberOfLines={1}>{resolved.label}</Text>
          <ChevronDown size={15} color={Ghost.text.tertiary} strokeWidth={1.8} />
        </Pressable>
      </View>
    );
  }

  const locked = !!resolved || !!busy;
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.duration(240).easing(EASE_OUT)}>
      <GlassCard style={styles.card} accessibilityLabel={speech}>
        <View style={styles.head}>
          {question ? (
            <View style={styles.asking}>
              <EmberDot size={6} active={!resolved} />
              <Text style={styles.askingText}>Ghost is asking</Text>
            </View>
          ) : (
            // Ghost's own mark: this was made, not fetched.
            <GhostMark size={16} color={Ghost.text.tertiary} />
          )}
          {resolved ? (
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Put the card away">
              <Text style={styles.resolvedTag} numberOfLines={1}>{resolved.label}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.title, question && styles.questionTitle]} accessibilityRole="header">{card.title}</Text>
        {card.body ? <Text style={styles.body}>{card.body}</Text> : null}
        <View style={styles.blocks}>
          {blocks.map((b, i) =>
            isInput(b) ? (
              <Animated.View key={i} entering={reduce ? undefined : FadeInDown.duration(220).delay(Math.min(i, 5) * 45).easing(EASE_OUT)}>
                <CardInput block={b} value={answers[b.key]} onChange={(v) => change(b, v)} disabled={locked && !living} />
              </Animated.View>
            ) : (
              <CardBlock key={i} block={b} index={i} still={reduce} />
            ),
          )}
        </View>
        {problem ? (
          <Animated.Text entering={reduce ? undefined : FadeIn.duration(160)} style={styles.problem} accessibilityLiveRegion="polite">
            {problem}
          </Animated.Text>
        ) : null}
        {!resolved && card.actions && card.actions.length > 0 ? (
          <View style={styles.actions}>
            {card.actions.map((a) =>
              a.kind === "submit" ? (
                <GhostButton key={a.id} title={busy ? "Sending…" : a.label} size="sm" variant="primary" disabled={busy} onPress={send} />
              ) : (
                <GhostButton
                  key={a.id}
                  title={a.label}
                  size="sm"
                  // One glows: the Send of a card that asks, or else a choice
                  // the card marked as the main one.
                  variant={!submit && a.style === "primary" ? "primary" : "secondary"}
                  disabled={busy}
                  onPress={() => onAction(a)}
                />
              ),
            )}
          </View>
        ) : null}
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Space.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 20, gap: Space.md },
  asking: { flexDirection: "row", alignItems: "center", gap: 7 },
  askingText: { fontSize: 12.5, fontWeight: "500", color: Ghost.text.secondary },
  resolvedTag: { flexShrink: 1, fontSize: 12.5, color: Ghost.status.success, fontWeight: "500" },
  title: { fontFamily: Fonts.voice, fontSize: 30, lineHeight: 36, letterSpacing: -0.55, color: Ghost.text.primary, marginTop: -Space.xs },
  questionTitle: { fontSize: 26, lineHeight: 32, letterSpacing: -0.45 },
  body: { fontSize: 15.5, lineHeight: 23, fontWeight: "300", color: "rgba(255,255,255,0.78)", marginTop: -Space.xs },
  blocks: { gap: Space.lg },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, marginTop: Space.xs },
  problem: { fontSize: 13.5, color: Ghost.status.warning, marginTop: -Space.xs },
  error: { fontSize: 13, color: Ghost.status.error },
  collapsed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  // The answer is what matters once it is given: it keeps its words, the title gives way.
  collapsedTitle: { flex: 1, fontSize: 14.5, fontWeight: "500", color: Ghost.text.secondary },
  collapsedLabel: { flexShrink: 0, maxWidth: "55%", fontSize: 14, fontWeight: "400", color: Ghost.text.primary },
});
