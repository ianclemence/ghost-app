import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { GhostMark } from "@/components/ghost-mark";
import type { Presence } from "@/lib/presence";

/**
 * Who you're talking to, as one small mark centred over the conversation. No
 * words: the amber light in the gap of the mark is Ghost's presence. It
 * breathes while Ghost is working, glows when Ghost needs you, and goes grey
 * when the Pod is away. Tapping it opens Ghost's panel (what it is doing,
 * what's coming up, what it did and what it remembers); the status line it
 * used to print is spoken to screen readers instead.
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
  const reduce = useReducedMotion();
  const breathe = useSharedValue(1);
  const working = status.tone === "working";
  useEffect(() => {
    if (!working || reduce) {
      breathe.set(1);
      return;
    }
    breathe.set(
      withRepeat(
        withSequence(
          withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
  }, [working, reduce, breathe]);
  const pulse = useAnimatedStyle(() => ({ opacity: breathe.get() }));

  const light = status.tone === "offline" ? Ghost.text.tertiary : Ghost.ember;
  return (
    <View style={[styles.wrap, { paddingTop: topInset + Space.sm }]} pointerEvents="box-none">
      <Pressable
        onPress={onOpenPanel}
        style={({ pressed }) => [
          styles.mark,
          status.tone === "attention" && styles.attention,
          pressed && { opacity: 0.6 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${status.text}.`}
        accessibilityHint="Opens what Ghost is doing, what's coming up, and what it remembers"
        hitSlop={8}
      >
        <Animated.View style={pulse}>
          <GhostMark size={22} dot={light} />
        </Animated.View>
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
    alignItems: "center",
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  attention: {
    borderColor: "rgba(255,169,40,0.6)",
    boxShadow: "0 0 18px rgba(255,169,40,0.35)",
  },
});
