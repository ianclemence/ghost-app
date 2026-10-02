import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import Animated, { Easing, FadeInDown, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { ChevronDown, CircleCheck } from "lucide-react-native";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { GhostMark } from "@/components/ghost-mark";
import { GhostButton } from "@/components/ghost";
import { CardBlock } from "@/components/card-blocks";
import { blockSpeech } from "@/lib/blocks";
import type { CardAction, RichCard } from "@/lib/cards";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * A card Ghost chose to show instead of write: a title, then blocks (see
 * card-blocks.tsx), then up to three choices. Once you choose, the card puts
 * itself away into one quiet line ("Nairobi today · Track it") that opens again
 * on a tap, so a long conversation does not fill with spent cards. The Pod
 * remembers the choice, so it is put away on every device.
 */
export function PresentCard({
  card,
  busy,
  onAction,
}: {
  card: RichCard;
  busy?: boolean;
  onAction: (a: CardAction) => void;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const resolved = card.resolved;
  const collapsed = !!resolved && !open;
  const layout = reduce ? undefined : LinearTransition.duration(200).easing(EASE_OUT);
  const speech = [card.title, card.body, ...(card.blocks ?? []).map(blockSpeech)].filter(Boolean).join(". ");

  if (collapsed) {
    return (
      <Animated.View layout={layout}>
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
      </Animated.View>
    );
  }

  return (
    <Animated.View layout={layout} entering={reduce ? undefined : FadeInDown.duration(240).easing(EASE_OUT)}>
      <GlassCard style={styles.card} accessibilityLabel={speech}>
        <View style={styles.head}>
          {/* Ghost's own mark: this was made, not fetched. */}
          <GhostMark size={16} color={Ghost.text.tertiary} />
          {resolved ? (
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Put the card away">
              <Text style={styles.resolvedTag}>{resolved.label}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.title} accessibilityRole="header">{card.title}</Text>
        {card.body ? <Text style={styles.body}>{card.body}</Text> : null}
        <View style={styles.blocks}>
          {(card.blocks ?? []).map((b, i) => (
            <CardBlock key={i} block={b} index={i} />
          ))}
        </View>
        {!resolved && card.actions && card.actions.length > 0 ? (
          <View style={styles.actions}>
            {card.actions.map((a) => (
              <GhostButton
                key={a.id}
                title={a.label}
                size="sm"
                variant={a.style === "primary" ? "primary" : "secondary"}
                disabled={busy}
                onPress={() => onAction(a)}
              />
            ))}
          </View>
        ) : null}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: Space.sm, gap: Space.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 20 },
  resolvedTag: { fontSize: 12.5, color: Ghost.status.success, fontWeight: "500" },
  title: { fontFamily: Fonts.voice, fontSize: 30, lineHeight: 36, letterSpacing: -0.55, color: Ghost.text.primary, marginTop: -Space.xs },
  body: { fontSize: 15.5, lineHeight: 23, fontWeight: "300", color: "rgba(255,255,255,0.78)", marginTop: -Space.xs },
  blocks: { gap: Space.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, marginTop: Space.xs },
  collapsed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    marginVertical: Space.xs,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  collapsedTitle: { flexShrink: 1, fontSize: 14.5, fontWeight: "500", color: Ghost.text.secondary },
  collapsedLabel: { flex: 1, fontSize: 14, fontWeight: "300", color: Ghost.text.tertiary },
});
