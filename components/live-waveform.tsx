import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { alpha, Ghost } from "@/constants/theme";

const SIZE = 200;

/**
 * The voice call, as one shape. A core that holds still when nothing is
 * happening, and a halo that swells with whichever of you is speaking: blue when
 * Ghost is listening, amber when Ghost is talking (amber is for Ghost acting).
 * While connecting it breathes. It is the only thing on the screen that moves.
 */
export function VoiceOrb({
  level,
  speaking,
  listening,
  connecting,
}: {
  /** 0 to 1: how loud whoever is speaking is. */
  level: number;
  speaking: boolean;
  listening: boolean;
  connecting: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const halo = useSharedValue(1);
  const ring = useSharedValue(1);
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    const l = Math.min(1, Math.max(0, level));
    halo.set(withSpring(1 + l * 0.55, { damping: 14, stiffness: 120, mass: 0.7 }));
    ring.set(withSpring(1 + l * 0.22, { damping: 16, stiffness: 160, mass: 0.6 }));
  }, [level, halo, ring, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !connecting) {
      breathe.set(withTiming(0, { duration: 240 }));
      return;
    }
    breathe.set(withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1, false));
  }, [connecting, breathe, reduceMotion]);

  const tone = speaking ? Ghost.ember : Ghost.accent.primary;
  const active = speaking || listening || connecting;

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: halo.get() + breathe.get() * 0.08 }],
    opacity: active ? 0.16 + breathe.get() * 0.1 : 0.07,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring.get() + breathe.get() * 0.04 }],
    opacity: active ? 0.32 : 0.14,
  }));

  return (
    <View style={styles.wrap} accessible accessibilityLabel={speaking ? "Ghost is speaking" : listening ? "Listening" : "Voice"}>
      <Animated.View style={[styles.halo, { backgroundColor: tone }, haloStyle]} />
      <Animated.View style={[styles.ring, { borderColor: tone }, ringStyle]} />
      <View style={[styles.core, { backgroundColor: active ? tone : Ghost.text.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: SIZE * 0.72, height: SIZE * 0.72, borderRadius: SIZE },
  ring: { position: "absolute", width: SIZE * 0.5, height: SIZE * 0.5, borderRadius: SIZE, borderWidth: 1.5, backgroundColor: alpha(Ghost.bg.base, 0) },
  core: { width: SIZE * 0.22, height: SIZE * 0.22, borderRadius: SIZE },
});
