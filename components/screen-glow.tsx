import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";

/**
 * Shared warm wash pinned to the bottom of every screen. Absolute,
 * non-interactive, identical everywhere it renders.
 */
export function ScreenGlow() {
  return (
    <LinearGradient
      colors={["rgba(255,190,90,0)", "rgba(255,190,90,0.22)"]}
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
