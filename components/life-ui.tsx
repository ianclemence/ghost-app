import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { GhostInput } from "@/components/ghost";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import { sourceLabel } from "@/lib/life";
import type { LifeSource } from "@/lib/ghostApi";

/**
 * The small pieces the People, Documents and Money screens share, so the three
 * read as one place: a labelled field for editing, a row of label and value,
 * the line that says where something came from, and a quiet empty state.
 */

export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboard?: "email-address" | "phone-pad" | "numeric";
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <GhostInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        keyboardType={keyboard}
        autoCapitalize={keyboard ? "none" : "sentences"}
        autoCorrect={!keyboard}
        accessibilityLabel={label}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function InfoRow({ label, value, onPress, first }: { label: string; value: string; onPress?: () => void; first?: boolean }) {
  const body = (
    <View style={[styles.row, !first && styles.rowLine]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, onPress && { color: Ghost.accent.primary }]} selectable={!onPress}>{value}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  );
}

export function SourceLine({ source }: { source?: LifeSource }) {
  const when = source?.at ? new Date(source.at) : null;
  const date = when && !isNaN(when.getTime()) ? when.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : null;
  return <Text style={styles.source}>{[sourceLabel(source), date].filter(Boolean).join(" · ")}</Text>;
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Pill({ text, tone, centered }: { text: string; tone: "bad" | "warn" | "neutral" | "good"; centered?: boolean }) {
  const c = tone === "bad" ? Ghost.status.error : tone === "warn" ? Ghost.status.warning : tone === "good" ? Ghost.status.success : Ghost.text.secondary;
  return (
    <View style={[styles.pill, centered && { alignSelf: "center" }, { backgroundColor: alpha(tone === "neutral" ? "#FFFFFF" : c, tone === "neutral" ? 0.06 : 0.12), borderColor: alpha(tone === "neutral" ? "#FFFFFF" : c, tone === "neutral" ? 0.12 : 0.32) }]}>
      <Text style={[styles.pillText, { color: c }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export const lifeStyles = StyleSheet.create({
  group: { borderRadius: 24, borderCurve: "continuous", backgroundColor: "rgba(0,0,0,0.42)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, overflow: "hidden" },
  eyebrow: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 4, marginTop: Space.md, marginBottom: Space.sm },
  sheetGroup: { borderRadius: 18, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, overflow: "hidden" },
});

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 2 },
  hint: { fontSize: 12.5, color: Ghost.text.tertiary, marginLeft: 2 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingHorizontal: 14, paddingVertical: 11 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  rowLabel: { width: 92, fontSize: 13.5, lineHeight: 20, color: Ghost.text.tertiary },
  rowValue: { flex: 1, fontSize: 15, lineHeight: 20, color: Ghost.text.primary },
  source: { fontSize: 12, color: Ghost.text.tertiary, marginTop: 2 },
  empty: { alignItems: "center", paddingTop: Space.huge, paddingHorizontal: Space.xl, gap: Space.sm },
  emptyTitle: { fontFamily: Fonts.voice, fontSize: 34, lineHeight: 40, color: Ghost.text.primary, textAlign: "center" },
  emptyText: { fontSize: 15, lineHeight: 22, fontWeight: "300", color: Ghost.text.secondary, textAlign: "center" },
  pill: { alignSelf: "flex-start", height: 24, paddingHorizontal: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center" },
  pillText: { fontSize: 12, fontWeight: "500" },
});
