import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { EmberDot } from "@/components/thread";
import type { Presence } from "@/lib/presence";

/**
 * Who you're talking to and what it is doing right now, as one small glass
 * pill floating over the conversation: a status light and one live line.
 * There is no header bar. Tapping it opens Ghost's panel (what it's working
 * on, what's coming up, what it remembers, what it did).
 */
export function PresenceHeader({
  name,
  status,
  topInset,
  onOpenPanel,
}: {
  name: string;
  status: Presence;
  scrolled?: boolean;
  topInset: number;
  onOpenPanel: () => void;
}) {
  const light =
    status.tone === "working" ? <EmberDot size={8} /> :
    status.tone === "attention" ? <View style={[styles.light, { backgroundColor: Ghost.emberDeep }]} /> :
    status.tone === "offline" ? <View style={[styles.light, { backgroundColor: Ghost.text.tertiary }]} /> :
    <View style={[styles.light, { backgroundColor: Ghost.status.success }]} />;
  return (
    <View style={[styles.wrap, { paddingTop: topInset + Space.sm }]} pointerEvents="box-none">
      <Pressable
        onPress={onOpenPanel}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${status.text}.`}
        accessibilityHint="Opens what Ghost is doing, what's coming up, and what it remembers"
        hitSlop={6}
      >
        {light}
        <Animated.Text key={status.text} entering={FadeIn.duration(200)} style={styles.status} numberOfLines={1}>
          {status.text}
        </Animated.Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    paddingHorizontal: Space.lg,
    alignItems: "flex-start",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    maxWidth: "88%",
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  light: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  status: {
    flexShrink: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13.5,
    lineHeight: 18,
    color: Ghost.text.primary,
  },
});
