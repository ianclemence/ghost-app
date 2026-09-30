import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { FileText, X } from "lucide-react-native";
import { Ghost, Radius } from "@/constants/theme";
import { fileSize, type Attachment } from "@/lib/attachments";

const TILE = 64;

function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name);
  return m ? m[1].toUpperCase() : "FILE";
}

/**
 * What is about to be sent: one row of small tiles, photos as themselves and
 * files as their type, each with a remove button. It scrolls sideways, so ten
 * files take the room of one.
 */
export function AttachmentStrip({ items, onRemove }: { items: Attachment[]; onRemove: (index: number) => void }) {
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((a, i) => (
        <Animated.View
          key={`${a.uri}-${i}`}
          entering={reduceMotion ? undefined : FadeIn.duration(140)}
          exiting={reduceMotion ? undefined : FadeOut.duration(100)}
          layout={reduceMotion ? undefined : LinearTransition.duration(160)}
          style={styles.item}
        >
          {a.kind === "image" ? (
            <Image source={{ uri: a.uri }} style={styles.tile} accessibilityLabel={`Photo ${a.name}`} />
          ) : (
            <View style={[styles.tile, styles.file]} accessibilityLabel={`${a.name}, ${fileSize(a.size)}`}>
              <FileText size={20} color={Ghost.text.secondary} strokeWidth={1.6} />
              <Text style={styles.ext} numberOfLines={1}>{extOf(a.name)}</Text>
            </View>
          )}
          <Pressable
            onPress={() => onRemove(i)}
            hitSlop={8}
            style={styles.x}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${a.name}`}
          >
            <X size={11} color={Ghost.text.inverse} strokeWidth={3} />
          </Pressable>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: 8 },
  row: { gap: 8, paddingVertical: 6, paddingRight: 6 },
  item: { width: TILE, height: TILE },
  tile: { width: TILE, height: TILE, borderRadius: Radius.lg, borderCurve: "continuous", backgroundColor: Ghost.bg.sunken },
  file: { alignItems: "center", justifyContent: "center", gap: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.border.default },
  ext: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, color: Ghost.text.tertiary },
  x: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Ghost.text.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Ghost.bg.base,
  },
});
