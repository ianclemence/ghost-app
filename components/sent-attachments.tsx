import React, { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { Ghost } from "@/constants/theme";
import { mosaic } from "@/lib/mosaic";
import { FileCard } from "@/components/file-card";
import { PhotoViewer } from "@/components/photo-viewer";

const WIDTH = 236;
const OUTER = 20;

/**
 * What the owner sent with a message, drawn at its right edge so it sits with
 * the bubble: photos in a mosaic that opens a swipeable viewer, files as the
 * same cards used before sending.
 */
export function SentAttachments({
  photos,
  files,
}: {
  photos: string[];
  files: { name: string; size: number; mime?: string }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0 && files.length === 0) return null;
  const m = mosaic(photos.length, WIDTH);
  return (
    <View style={styles.wrap}>
      {photos.length > 0 ? (
        <View style={[styles.box, { width: WIDTH, height: m.height }]}>
          {m.tiles.map((t, i) => (
            <Pressable
              key={`${i}-${photos[i].slice(-20)}`}
              onPress={() => setOpen(i)}
              accessibilityRole="imagebutton"
              accessibilityLabel={t.more ? `Photo ${i + 1}, and ${t.more} more` : `Photo ${i + 1} of ${photos.length}`}
              style={{ position: "absolute", left: t.x, top: t.y, width: t.w, height: t.h }}
            >
              <Image source={{ uri: photos[i] }} style={styles.img} resizeMode="cover" />
              {t.more ? (
                <View style={styles.more}>
                  <Text style={styles.moreText}>+{t.more}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {files.map((f, i) => (
        <FileCard key={`${f.name}-${i}`} name={f.name} size={f.size} mime={f.mime} width={WIDTH} />
      ))}
      <PhotoViewer uris={photos} start={open} onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-end", alignItems: "flex-end", gap: 6, marginBottom: 4 },
  box: {
    borderRadius: OUTER,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: Ghost.bg.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  img: { width: "100%", height: "100%", backgroundColor: Ghost.bg.sunken },
  more: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,8,6,0.5)" },
  moreText: { color: "#FFFFFF", fontSize: 24, fontWeight: "600", letterSpacing: -0.4 },
});
