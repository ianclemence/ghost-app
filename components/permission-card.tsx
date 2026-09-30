import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { Easing, FadeInUp, FadeOut, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { Ghost, Radius, shadowRGB, Space } from "@/constants/theme";
import { GhostButton } from "@/components/ghost";
import { isValidGrant, resolveApproval, type GhostConfig, type PendingApproval } from "@/lib/ghostApi";
import { riskCaution, riskNote } from "@/lib/permission-risk";

const CARD_ENTER = FadeInUp.duration(250).easing(Easing.bezier(0.23, 1, 0.32, 1));
// Answering a card should feel like putting it away, not like it blinked out:
// a short fade that lets the items below slide up into its place.
const CARD_EXIT = FadeOut.duration(180).easing(Easing.bezier(0.23, 1, 0.32, 1));
const CARD_LAYOUT = LinearTransition.duration(220).easing(Easing.bezier(0.23, 1, 0.32, 1));

/**
 * A decision Ghost cannot make for you. Deterministic UI, not prose: the
 * question, what's at stake (from the broker's own risk class), and the
 * choices the runtime offers. Nothing the model wrote decides this.
 */
export function PermissionCard({
  item,
  config,
  onResolved,
  position,
}: {
  item: PendingApproval;
  config: GhostConfig;
  onResolved: () => void;
  /** "1 of 3" when several decisions are waiting. */
  position?: { index: number; total: number };
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const card = item.card;
  const title = card?.title ?? "Ghost needs your OK";
  const desc = card?.description ?? "Ghost is waiting for your approval to continue.";
  const note = riskNote(card?.risk);
  const caution = riskCaution(card?.risk);
  const offersAlways = (card?.actions ?? []).some((a) => /always/i.test(a.id));
  const actions = card?.actions ?? [
    { id: "allow_once", label: "Allow once", style: "primary" },
    { id: "deny", label: "Deny", style: "danger" },
  ];
  const act = async (id: string) => {
    if (!isValidGrant(id)) return;
    setBusy(id);
    setError(null);
    const r = await resolveApproval(config, item.id, id);
    setBusy(null);
    if (r.ok) {
      Haptics.notificationAsync(
        id === "deny" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      onResolved();
    } else setError(r.error ?? "That approval is no longer answerable.");
  };
  return (
    <Animated.View
      entering={reduceMotion ? undefined : CARD_ENTER}
      exiting={reduceMotion ? undefined : CARD_EXIT}
      layout={reduceMotion ? undefined : CARD_LAYOUT}
      style={[styles.card, caution ? styles.cardCaution : null]}
      accessibilityLabel={`Ghost is asking: ${title}`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.kickerRow}>
        <View style={[styles.dot, caution ? styles.dotCaution : null]} />
        <Text style={styles.kicker}>{caution ? "Ghost stopped to check" : "Ghost is asking"}</Text>
        {position && position.total > 1 ? (
          <Text style={styles.count}>{position.index + 1} of {position.total}</Text>
        ) : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityHint={expanded ? "Show less" : "Show the full request"}
      >
        <Text style={styles.desc} numberOfLines={expanded ? undefined : 3}>{desc}</Text>
      </Pressable>
      {caution ? <Text style={styles.caution}>{caution}</Text> : note ? <Text style={styles.note}>{note}</Text> : null}
      {offersAlways ? (
        <Text style={styles.note}>“Always” means Ghost won’t ask again for this.</Text>
      ) : null}
      <View style={styles.row}>
        {actions.map((a) => {
          const destructive = a.style === "danger" || /deny|reject/i.test(a.id);
          return (
            <GhostButton
              key={a.id}
              title={busy === a.id ? "One moment" : a.label}
              variant={destructive ? "secondary" : "primary"}
              disabled={busy !== null}
              loading={busy === a.id}
              onPress={() => void act(a.id)}
            />
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.strong,
    borderRadius: Radius.xl,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.raised,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md + 2,
    gap: 4,
    boxShadow: `0 6px 20px rgba(${shadowRGB}, 0.10)`,
  },
  cardCaution: {
    borderColor: Ghost.status.warning,
    borderWidth: 1,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Ghost.emberDeep,
  },
  dotCaution: {
    backgroundColor: Ghost.status.warning,
  },
  kicker: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Ghost.text.secondary,
  },
  count: {
    fontSize: 12,
    color: Ghost.text.tertiary,
    fontVariant: ["tabular-nums"],
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    color: Ghost.text.primary,
    marginTop: 2,
  },
  desc: {
    fontSize: 14,
    lineHeight: 20,
    color: Ghost.text.secondary,
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    color: Ghost.text.tertiary,
  },
  caution: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: Ghost.status.warning,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
    marginTop: Space.sm,
  },
  error: {
    fontSize: 13,
    color: Ghost.status.error,
  },
});
