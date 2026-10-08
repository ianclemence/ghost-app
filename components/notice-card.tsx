import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { AlarmClock, ChevronDown, ChevronUp, CircleCheck, Info, Repeat, TriangleAlert } from "lucide-react-native";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { MarkdownBubble } from "@/components/markdown-bubble";
import { shapeNotice, type NoticeKind } from "@/lib/notice";

/**
 * Something Ghost started by itself, as a card: a reminder, something it
 * noticed, a need for you, a routine's result. The colour says which at a
 * glance (indigo reminds, blue notices, amber needs you, green is a routine),
 * a short one is a serif headline, and a long one keeps its formatting.
 * Built from the same glass card as every other dynamic card.
 *
 * An alert is about a condition ("almost out of storage"). When the Pod says the
 * condition has cleared, the card settles into one quiet line, "Resolved", that
 * opens again on a tap: it is a record of what Ghost said, no longer something
 * that needs you, so it stops glowing amber and stops taking the room.
 */
const KINDS: Record<NoticeKind, { label: string; Icon: typeof Info; tint: string }> = {
  reminder: { label: "Reminder", Icon: AlarmClock, tint: Ghost.accent.primary },
  notice: { label: "Ghost noticed", Icon: Info, tint: Ghost.status.info },
  alert: { label: "Needs you", Icon: TriangleAlert, tint: Ghost.ember },
  routine: { label: "Routine", Icon: Repeat, tint: Ghost.status.success },
};

export function NoticeCard({
  kind,
  time,
  content,
  resolved = false,
}: {
  kind: NoticeKind;
  time: string | null;
  content: string;
  /** The condition this reports has cleared. */
  resolved?: boolean;
}) {
  const k = KINDS[kind];
  const { title, body } = shapeNotice(content);
  const [open, setOpen] = useState(false);
  if (!k) return null;
  const gist = (title ?? body).replace(/\s+/g, " ").trim();
  if (resolved && !open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.settled, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`Resolved. ${gist}. Tap to read it again.`}
      >
        <CircleCheck size={16} color={Ghost.status.success} strokeWidth={1.9} />
        <Text style={styles.settledText} numberOfLines={1}>{gist}</Text>
        <Text style={styles.settledTag}>Resolved</Text>
        <ChevronDown size={15} color={Ghost.text.tertiary} strokeWidth={1.8} />
      </Pressable>
    );
  }
  const tint = resolved ? Ghost.status.success : k.tint;
  const label = resolved ? "Resolved" : k.label;
  return (
    <GlassCard
      tone={kind === "alert" && !resolved ? "attention" : "default"}
      style={styles.card}
      accessibilityLabel={[label, time, title ?? content].filter(Boolean).join(". ")}
    >
      <View style={styles.header}>
        <View style={[styles.chip, { backgroundColor: alpha(tint, 0.14), borderColor: alpha(tint, 0.34) }]}>
          {resolved ? <CircleCheck size={15} color={tint} strokeWidth={1.9} /> : <k.Icon size={15} color={tint} strokeWidth={1.9} />}
        </View>
        <Text style={[styles.label, { color: tint }]}>{label}</Text>
        {time ? <Text style={styles.time}>{time}</Text> : null}
        {resolved ? (
          <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Put it away">
            <ChevronUp size={16} color={Ghost.text.tertiary} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {body ? <MarkdownBubble content={body} streaming={false} /> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Space.sm },
  settled: {
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
  settledText: { flex: 1, fontSize: 14.5, fontWeight: "400", color: Ghost.text.secondary },
  settledTag: { fontSize: 13, fontWeight: "500", color: Ghost.status.success },
  header: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  chip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { flex: 1, fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase" },
  time: { fontSize: 12.5, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  title: {
    fontFamily: Fonts.voice,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: Ghost.text.primary,
  },
});
