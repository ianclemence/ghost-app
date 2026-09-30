import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";
import { alpha, Ghost, scheme } from "@/constants/theme";

// A quiet glow drawn from the accent and faded into the canvas colour, so it is
// cool in light and dark alike and never tints the page brown or tan.
const GLOW = scheme === "dark" ? { a: 0.16, b: 0.05 } : { a: 0.09, b: 0.03 };
const CLEAR = alpha(Ghost.bg.base, 0);

/**
 * ScreenBackground — the soft accent wash that lives *behind* all content.
 *
 * Design intent: a soft, low-opacity glow anchored to the lower corner,
 * fading to transparent toward the top so text contrast is never reduced.
 * It is always the first child of a screen (so it paints above the base
 * canvas but below every card, message bubble, and control). Cards carry
 * their own solid surfaces and therefore sit cleanly on top.
 *
 * Never make this the last child — that would overlay the UI instead of
 * sitting beneath it.
 */
export function ScreenBackground({ variant = "bottom" }: { variant?: "bottom" | "top" }) {
  if (variant === "top") {
    return (
      <LinearGradient
        colors={[alpha(Ghost.accent.primary, GLOW.a), alpha(Ghost.accent.primary, GLOW.b), CLEAR]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    );
  }
  return (
    <LinearGradient
      colors={[alpha(Ghost.accent.primary, GLOW.a), alpha(Ghost.accent.primary, GLOW.b), CLEAR]}
      locations={[0, 0.45, 1]}
      start={{ x: 0.12, y: 1 }}
      end={{ x: 0.88, y: 0 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
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
      colors={[alpha(Ghost.accent.primary, 0), alpha(Ghost.accent.primary, GLOW.a)]}
      style={styles.glow}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
  },
});
