import React, { useEffect, useRef, useState } from "react";
import { FlatList, Image, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/text";
import { X } from "lucide-react-native";
import { Midnight } from "@/constants/theme";

/**
 * Full-screen photos, swipe to move between them. Opens on the one that was
 * tapped; the counter says where you are among several.
 */
export function PhotoViewer({
  uris,
  start,
  onClose,
}: {
  uris: string[];
  /** Index to open on, or null for closed. */
  start: number | null;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);
  const [index, setIndex] = useState(start ?? 0);
  useEffect(() => {
    if (start !== null) setIndex(start);
  }, [start]);
  if (start === null) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={uris}
          horizontal
          pagingEnabled
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(u, i) => `${i}-${u.slice(-24)}`}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <Pressable style={{ width }} onPress={onClose} accessibilityLabel="Photo. Tap to close">
              <Image source={{ uri: item }} style={styles.photo} resizeMode="contain" />
            </Pressable>
          )}
        />
        <View style={styles.top} pointerEvents="box-none">
          {uris.length > 1 ? <Text style={styles.count}>{index + 1} / {uris.length}</Text> : <View />}
          <Pressable onPress={onClose} hitSlop={14} style={styles.close} accessibilityRole="button" accessibilityLabel="Close photo">
            <X size={20} color={Midnight.ink} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "rgba(10,8,6,0.96)", justifyContent: "center" },
  photo: { flex: 1, width: "100%" },
  top: { position: "absolute", top: 54, left: 20, right: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  count: { color: Midnight.inkDim, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(241,233,220,0.12)" },
});
