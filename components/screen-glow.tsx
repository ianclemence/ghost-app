import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Aurora } from "@/constants/theme";

/**
 * The aurora: one large soft light behind the screen, amber at the top through
 * magenta and violet to electric blue, fading to black below. It is the only
 * colour in the app. Built from radial gradients stretched to the screen, in
 * two layers that drift against each other very slowly, so it is never quite
 * still and never asks for attention.
 *
 * "hero" is the full light, for moments that should feel like something
 * (the empty conversation, the front page). "calm" is the same light turned
 * down so text stays easy to read over it.
 */

type Spot = { id: string; color: string; cx: number; cy: number; r: number; a: number };

// Positions are fractions of the screen. The upper left stays dark, as in the
// reference, and the bottom falls away to black.
const WARM: Spot[] = [
  { id: "amber", color: Aurora.amber, cx: 0.34, cy: -0.02, r: 0.56, a: 1 },
  { id: "magenta", color: Aurora.magenta, cx: 1.0, cy: 0.27, r: 0.52, a: 0.95 },
];
const COOL: Spot[] = [
  { id: "violet", color: Aurora.violet, cx: 0.88, cy: 0.4, r: 0.4, a: 0.85 },
  { id: "blue", color: Aurora.blue, cx: 0.66, cy: 0.5, r: 0.32, a: 1 },
];

function Layer({ spots, dx, dy, seconds }: { spots: Spot[]; dx: number; dy: number; seconds: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.set(withRepeat(withTiming(1, { duration: seconds * 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduce, seconds, t]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: dx * t.get() }, { translateY: dy * t.get() }, { scale: 1.12 + 0.05 * t.get() }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, anim]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          {spots.map((s) => (
            <RadialGradient key={s.id} id={s.id} cx={s.cx} cy={s.cy} rx={s.r} ry={s.r} fx={s.cx} fy={s.cy}>
              <Stop offset="0" stopColor={s.color} stopOpacity={s.a} />
              <Stop offset="0.45" stopColor={s.color} stopOpacity={s.a * 0.55} />
              <Stop offset="1" stopColor={s.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {spots.map((s) => (
          <Rect key={s.id} x="0" y="0" width="100" height="100" fill={`url(#${s.id})`} />
        ))}
      </Svg>
    </Animated.View>
  );
}

export function ScreenBackground({ variant = "hero" }: { variant?: "hero" | "calm" }) {
  const reduce = useReducedMotion();
  const level = useSharedValue(variant === "hero" ? 1 : 0.34);
  useEffect(() => {
    const to = variant === "hero" ? 1 : 0.34;
    level.set(reduce ? to : withTiming(to, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [variant, level, reduce]);
  const fade = useAnimatedStyle(() => ({ opacity: level.get() }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, fade]}>
        <Layer spots={WARM} dx={-14} dy={10} seconds={30} />
        <Layer spots={COOL} dx={16} dy={-12} seconds={37} />
      </Animated.View>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.46" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.82" stopColor="#000" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#floor)" />
      </Svg>
    </View>
  );
}
