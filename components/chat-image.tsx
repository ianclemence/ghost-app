/**
 * Chat image: safe remote images with loading, failure, and viewer states.
 *
 * Only https:// sources render (no http IP leaks, no data: blobs — the
 * caller enforces this via isSafeImageUrl). Tapping opens a full-screen
 * viewer; a failed load degrades to the alt text instead of a broken box.
 */
import React, { memo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ImageOff, X } from "lucide-react-native";
import { Ghost } from "@/constants/theme";

interface Props {
  src: string;
  alt?: string;
}

export const ChatImage = memo(function ChatImage({ src, alt }: Props) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState(false);

  if (failed) {
    return (
      <View
        style={styles.fallback}
        accessibilityRole="image"
        accessibilityLabel={alt ? `Image failed to load: ${alt}` : "Image failed to load"}
      >
        <ImageOff size={18} color={Ghost.text.tertiary} />
        <Text style={styles.fallbackText} numberOfLines={2}>
          {alt || "Image unavailable"}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setViewing(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={alt ? `View image: ${alt}` : "View image"}
      >
        <View style={styles.frame}>
          <Image
            source={{ uri: src }}
            style={styles.image}
            resizeMode="contain"
            accessible
            accessibilityLabel={alt || "Image"}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
          />
          {loading && (
            <View style={styles.loader}>
              <ActivityIndicator size="small" color={Ghost.text.secondary} />
            </View>
          )}
        </View>
      </Pressable>
      <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
        <View style={styles.viewer}>
          <Pressable
            style={styles.close}
            onPress={() => setViewing(false)}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
            hitSlop={12}
          >
            <X size={22} color={Ghost.text.inverse} />
          </Pressable>
          <Image
            source={{ uri: src }}
            style={styles.full}
            resizeMode="contain"
            accessible
            accessibilityLabel={alt || "Image"}
          />
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  frame: {
    backgroundColor: Ghost.bg.sunken,
    borderRadius: 8,
    marginVertical: 6,
    minHeight: 120,
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: 220,
    borderRadius: 8,
  },
  loader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Ghost.bg.sunken,
    borderRadius: 8,
    marginVertical: 6,
    padding: 12,
  },
  fallbackText: {
    color: Ghost.text.secondary,
    fontSize: 14,
    flexShrink: 1,
  },
  viewer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  full: {
    width: "100%",
    height: "80%",
  },
  close: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 1,
  },
});
