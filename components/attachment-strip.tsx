import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { X } from "lucide-react-native";
import { Ghost } from "@/constants/theme";
import { attachmentSummary, type Attachment } from "@/lib/attachments";
import { FileCard } from "@/components/file-card";

const TILE = 68;
const FILE_W = 176;

/**
 * What is about to be sent: photos as themselves, files as cards that say what
 * they are, each with a small remove button, and one quiet line saying how
 * much is going. It scrolls sideways, so ten files take the room of one.
 */
export function AttachmentStrip({ items, onRemove }: { items: Attachment[]; onRemove: (index: number) => void }) {
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;
  return (
    <View style={styles.wrap}>
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
            entering={reduceMotion ? undefined : FadeIn.duration(160)}
            exiting={reduceMotion ? undefined : FadeOut.duration(110)}
            layout={reduceMotion ? undefined : LinearTransition.duration(180)}
            style={a.kind === "image" ? styles.photo : styles.file}
          >
            {a.kind === "image" ? (
              <Image source={{ uri: a.uri }} style={styles.tile} accessibilityLabel={`Photo ${a.name}`} />
            ) : (
              <FileCard name={a.name} size={a.size} mime={a.mime} width={FILE_W} />
            )}
            <Pressable
              onPress={() => onRemove(i)}
              hitSlop={10}
              style={styles.x}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${a.name}`}
            >
              <X size={11} color={Ghost.text.primary} strokeWidth={2.4} />
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>
      {items.length > 1 ? <Text style={styles.summary}>{attachmentSummary(items)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  scroll: { flexGrow: 0 },
  row: { gap: 10, paddingTop: 8, paddingBottom: 4, paddingRight: 8, paddingLeft: 2 },
  photo: { width: TILE, height: TILE },
  file: { width: FILE_W },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  summary: { fontSize: 12, lineHeight: 16, color: Ghost.text.tertiary, marginTop: 4, marginLeft: 4 },
  x: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(20,20,26,0.92)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.strong,
  },
});
