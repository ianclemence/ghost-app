import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { alpha, Ghost } from "@/constants/theme";
import { fileKind, fileSize, type FileTone } from "@/lib/attachments";

const TONE: Record<FileTone, string> = {
  error: Ghost.status.error,
  info: Ghost.status.info,
  success: Ghost.status.success,
  ember: Ghost.emberDeep,
  warning: Ghost.status.warning,
  muted: Ghost.text.secondary,
};

/**
 * A file, shown as what it is: a badge tinted by its kind (PDFs read warm,
 * spreadsheets green, archives amber), the name on one line, and its type and
 * size under it. Used before sending (in the strip) and after (in the thread),
 * so a file looks the same in both places.
 */
export function FileCard({
  name,
  size,
  mime,
  width,
  onPress,
}: {
  name: string;
  size: number;
  mime?: string;
  width?: number;
  onPress?: () => void;
}) {
  const kind = fileKind(name, mime);
  const color = TONE[kind.tone];
  const body = (
    <View style={[styles.card, width ? { width } : null]} accessibilityLabel={`${name}, ${fileSize(size)}`}>
      <View style={[styles.badge, { backgroundColor: alpha(color, 0.14), borderColor: alpha(color, 0.3) }]}>
        <Text style={[styles.badgeText, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {kind.label.slice(0, 4)}
        </Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="middle">
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {kind.label} · {fileSize(size)}
        </Text>
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 8,
    paddingRight: 18,
    borderRadius: 26,
    borderCurve: "continuous",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 11.5, fontWeight: "600", letterSpacing: 0.4 },
  text: { flexShrink: 1, minWidth: 0 },
  name: { fontSize: 14.5, lineHeight: 19, fontWeight: "500", color: Ghost.text.primary },
  meta: { fontSize: 12.5, lineHeight: 16, color: Ghost.text.tertiary, marginTop: 1 },
});
