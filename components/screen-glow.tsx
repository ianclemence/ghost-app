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

// One field of soft light that drifts very slowly, so the screen is never quite
// still and never asks for attention. A single warm-neutral hue replaces the
// earlier three coloured fields, which read as smudges. Strength is low enough
// that text contrast on top of it is unchanged.
const SOFT = scheme === "dark" ? "#8C7AB8" : "#C9A57A";
const A = scheme === "dark" ? { glow: 0.1 } : { glow: 0.12 };

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
  const S = Math.max(width, 360) * 1.5;
  // One quiet light, low on the screen, so the top (header and first lines)
  // sits on the plain canvas and nothing tints the text above it.
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Field
        color={SOFT}
        strength={A.glow}
        size={S}
        pos={variant === "bottom" ? { left: (width - S) / 2, bottom: -S * 0.7 } : { left: (width - S) / 2, top: -S * 0.7 }}
        dx={0}
        dy={variant === "bottom" ? -10 : 10}
        seconds={34}
        scale={1.05}
      />
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
