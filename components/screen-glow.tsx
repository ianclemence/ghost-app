import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";

/**
 * ScreenBackground — the warm amber wash that lives *behind* all content.
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
        colors={["rgba(255,180,92,0.18)", "rgba(255,196,120,0.06)", "rgba(250,250,247,0)"]}
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
      colors={["rgba(255,180,92,0.22)", "rgba(255,196,120,0.08)", "rgba(250,250,247,0)"]}
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
      colors={["rgba(255,190,90,0)", "rgba(255,190,90,0.20)"]}
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
