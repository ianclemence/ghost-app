import React, { useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { alpha, Ghost, scheme } from "@/constants/theme";

// Three fields of soft light, the same three hues as the web console's
// background: indigo from the upper left, ember from the upper right, and rose
// (teal at night) rising from below. They drift very slowly, so the screen is
// never quite still and never asks for attention. Strengths are kept low
// enough that text contrast on top of them is unchanged.
const INDIGO = scheme === "dark" ? "#7066D6" : "#7066CC";
const EMBER = "#FFB45C";
const LOW = scheme === "dark" ? "#3C8296" : "#E28C80";
const A = scheme === "dark" ? { indigo: 0.22, ember: 0.1, low: 0.12 } : { indigo: 0.2, ember: 0.2, low: 0.13 };

/** Concentric translucent discs: a soft round glow with no edge to see. */
const RINGS = 30;

/** One field of light that drifts in a slow loop. */
function Field({
  color,
  strength,
  size,
  pos,
  dx,
  dy,
  seconds,
  scale = 1,
}: {
  color: string;
  strength: number;
  size: number;
  pos: { left?: number; right?: number; top?: number; bottom?: number };
  dx: number;
  dy: number;
  seconds: number;
  scale?: number;
}) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.set(withRepeat(withTiming(1, { duration: seconds * 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduce, seconds, t]);
  const anim = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx * t.get() },
      { translateY: dy * t.get() },
      { scale: 1 + (scale - 1) * t.get() },
    ],
  }));
  // Each disc adds a little; the stack reaches `strength` at the centre and
  // falls to nothing at the rim, so the light has no visible boundary.
  const per = Math.min(0.5, strength * 0.1);
  return (
    <Animated.View style={[styles.field, { width: size, height: size }, pos, anim]} pointerEvents="none">
      {Array.from({ length: RINGS }, (_, k) => {
        const d = size * (1 - k / RINGS);
        return (
          <View
            key={k}
            style={{
              position: "absolute",
              width: d,
              height: d,
              left: (size - d) / 2,
              top: (size - d) / 2,
              borderRadius: d / 2,
              backgroundColor: alpha(color, per / (1 + k * 0.07)),
            }}
          />
        );
      })}
    </Animated.View>
  );
}

/**
 * ScreenBackground: the living light behind every screen. Always the first
 * child of a screen, so it paints above the base canvas and below every card,
 * bubble and control. `variant` only moves where the light is strongest:
 * "bottom" (the conversation) keeps the top calmer, "top" keeps the bottom
 * calmer.
 */
export function ScreenBackground({ variant = "bottom" }: { variant?: "bottom" | "top" }) {
  const { width } = useWindowDimensions();
  const S = Math.max(width, 360) * 1.3;
  const k = variant === "bottom" ? 0.85 : 1;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Field color={INDIGO} strength={A.indigo * k * 1.25} size={S} pos={{ left: -S * 0.42, top: -S * 0.5 }} dx={26} dy={18} seconds={26} scale={1.06} />
      <Field color={EMBER} strength={A.ember * k * 1.25} size={S * 0.95} pos={{ right: -S * 0.45, top: -S * 0.5 }} dx={-30} dy={22} seconds={32} scale={1.05} />
      <Field color={LOW} strength={A.low * (variant === "bottom" ? 1.5 : 1) * 1.25} size={S} pos={{ left: width * 0.05, bottom: -S * 0.62 }} dx={20} dy={-14} seconds={29} scale={1.08} />
    </View>
  );
}

/**
 * ScreenGlow — legacy bottom-only wash, retained for surfaces that want a
 * subtle edge glow rather than a full background. Prefer ScreenBackground
 * for screens; this stays for small overlays.
 */
export function ScreenGlow() {
  return (
    <LinearGradient
      colors={[alpha(Ghost.accent.primary, 0), alpha(Ghost.accent.primary, scheme === "dark" ? 0.16 : 0.09)]}
      style={styles.glow}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  field: { position: "absolute" },
  glow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
  },
});
