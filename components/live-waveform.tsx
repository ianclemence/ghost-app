import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";

const BARS = 24;

function Bar({ value, index, speaking }: { value: number; index: number; speaking: boolean }) {
  const height = useSharedValue(6);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const jitter = 0.72 + 0.28 * Math.sin(index * 1.7);
    const target = 6 + Math.min(1, Math.max(0, value)) * 44 * jitter;
    height.set(withTiming(reduceMotion ? 6 : target, { duration: 130 }));
  }, [value, index, height, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    height: height.get(),
    opacity: 0.35 + Math.min(1, value * 1.4) * 0.65,
  }));
  return <Animated.View style={[styles.bar, speaking && styles.barSpeaking, style]} />;
}

export function LiveWaveform({ level, speaking }: { level: number; speaking: boolean }) {
  return (
    <View style={styles.row} accessibilityLabel={speaking ? "Ghost is speaking" : "Listening"}>
      {Array.from({ length: BARS }, (_, i) => (
        <Bar key={i} index={i} value={speaking ? level : 0} speaking={speaking} />
      ))}
    </View>
  );
}

export function LiveOrb({ speaking, listening }: { speaking: boolean; listening: boolean }) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    scale.set(withTiming(speaking ? 1.12 : listening ? 1.05 : 1, { duration: 280 }));
  }, [speaking, listening, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.get() }],
  }));
  return (
    <View style={styles.orbWrap}>
      <Animated.View style={[styles.orb, speaking && styles.orbSpeaking, style]} />
      <View style={[styles.orbCore, speaking && styles.orbCoreSpeaking]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 56,
    paddingVertical: Space.sm,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: Ghost.accent.primary,
  },
  barSpeaking: {
    backgroundColor: Ghost.emberDeep,
  },
  orbWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  orb: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Ghost.accent.soft,
    borderWidth: 1,
    borderColor: Ghost.border.default,
  },
  orbSpeaking: {
    backgroundColor: "rgba(255,180,92,0.22)",
    borderColor: Ghost.ember,
  },
  orbCore: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Ghost.accent.primary,
  },
  orbCoreSpeaking: {
    backgroundColor: Ghost.emberDeep,
  },
});
