import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { AlarmClock, Info, Repeat, TriangleAlert } from "lucide-react-native";
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
 */
const KINDS: Record<NoticeKind, { label: string; Icon: typeof Info; tint: string }> = {
  reminder: { label: "Reminder", Icon: AlarmClock, tint: Ghost.accent.primary },
  notice: { label: "Ghost noticed", Icon: Info, tint: Ghost.status.info },
  alert: { label: "Needs you", Icon: TriangleAlert, tint: Ghost.ember },
  routine: { label: "Routine", Icon: Repeat, tint: Ghost.status.success },
};

export function NoticeCard({ kind, time, content }: { kind: NoticeKind; time: string | null; content: string }) {
  const k = KINDS[kind];
  const { title, body } = shapeNotice(content);
  if (!k) return null;
  return (
    <GlassCard
      tone={kind === "alert" ? "attention" : "default"}
      style={styles.card}
      accessibilityLabel={[k.label, time, title ?? content].filter(Boolean).join(". ")}
    >
      <View style={styles.header}>
        <View style={[styles.chip, { backgroundColor: alpha(k.tint, 0.14), borderColor: alpha(k.tint, 0.34) }]}>
          <k.Icon size={15} color={k.tint} strokeWidth={1.9} />
        </View>
        <Text style={[styles.label, { color: k.tint }]}>{k.label}</Text>
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {body ? <MarkdownBubble content={body} streaming={false} /> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: Space.xs, gap: Space.sm },
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
