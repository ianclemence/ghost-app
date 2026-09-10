import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Ghost, Space } from "@/constants/theme";

const DOT_COUNT = 3;
const DOT_SIZE = 6;
const CYCLE_MS = 900;

/**
 * Calm wave indicator for the sentence currently being written.
 * Three dots rise and fade in sequence while streaming; the parent
 * unmounts this the moment streaming completes, so nothing lingers.
 */
function WaveDot({ index }: { index: number }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.set(0.5);
      return;
    }
    progress.set(withDelay(
      index * (CYCLE_MS / DOT_COUNT / 2),
      withRepeat(
        withSequence(
          withTiming(1, { duration: CYCLE_MS / 2 }),
          withTiming(0, { duration: CYCLE_MS / 2 }),
        ),
        -1,
        false,
      ),
    ));
  }, [index, progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + progress.get() * 0.75,
    transform: [{ translateY: -3 * progress.get() }],
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

export function WaveDots() {
  return (
    <View style={styles.row} accessibilityLabel="Ghost is writing" accessibilityLiveRegion="polite">
      {Array.from({ length: DOT_COUNT }, (_, i) => (
        <WaveDot key={i} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingTop: Space.sm,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Ghost.text.tertiary,
  },
});
