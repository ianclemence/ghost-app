import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { Check, X } from "lucide-react-native";
import { Text } from "@/components/text";
import { EmberDot } from "@/components/ember-dot";
import { Ghost, Inter, Radius } from "@/constants/theme";
import { canCancel, type QueuedMessage } from "@/lib/queue";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const SHOWN = 3;

const WORD: Record<QueuedMessage["state"], string> = {
  steering: "Queued",
  picked: "Picked up",
  waiting: "Up next",
};

/**
 * What you said while Ghost was working, until it is part of the conversation.
 *
 * Each message is one quiet line above the bar that says what became of it:
 * queued (Ghost reads it at its next step), picked up (it has, and is acting
 * on it), or up next (this run could not take it, so it goes out when the run
 * ends; only then can it be taken back). Nothing here moves the thread: the
 * tray belongs to the dock, and the thread keeps its place under it.
 */
export function QueueTray({ items, onCancel }: { items: QueuedMessage[]; onCancel: (id: string) => void }) {
  const reduce = useReducedMotion();
  if (items.length === 0) return null;
  const shown = items.slice(-SHOWN);
  const hidden = items.length - shown.length;
  return (
    <View style={styles.tray} accessibilityLabel={`${items.length} queued`}>
      {hidden > 0 ? <Text style={styles.more}>{hidden} earlier queued</Text> : null}
      {shown.map((q) => (
        <Animated.View
          key={q.id}
          entering={reduce ? undefined : FadeIn.duration(180).easing(EASE)}
          exiting={reduce ? undefined : FadeOut.duration(140)}
          style={styles.row}
          accessible
          accessibilityLabel={`${WORD[q.state]}: ${q.text}`}
        >
          {q.state === "picked" ? <Check size={13} color={Ghost.status.success} strokeWidth={2.4} /> : <EmberDot size={6} active={q.state === "steering"} />}
          <Text style={styles.text} numberOfLines={1}>{q.text}</Text>
          <Text style={[styles.state, q.state === "picked" && { color: Ghost.status.success }]}>{WORD[q.state]}</Text>
          {canCancel(q) ? (
            <Pressable onPress={() => onCancel(q.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Take it back">
              <X size={14} color={Ghost.text.tertiary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  text: { flex: 1, fontFamily: Inter.regular, fontSize: 14, color: Ghost.text.secondary },
  state: { fontFamily: Inter.regular, fontSize: 12.5, color: Ghost.text.tertiary },
  more: { fontSize: 12, color: Ghost.text.tertiary, textAlign: "center" },
});
