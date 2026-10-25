import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ghost } from "@/constants/theme";

/**
 * The card: dark translucent glass with a hairline edge and a faint light
 * along the top, so it reads as a surface over the aurora without a slab of
 * colour. Everything that is a "card" in the app (an approval, a file, a
 * result, a receipt) is this, so they all sit the same way.
 */
export function GlassCard({
  children,
  style,
  tone = "default",
  solid = false,
  ...rest
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** "attention" warms the edge: Ghost is asking, or stopped to check. */
  tone?: "default" | "attention";
  /**
   * A card that floats over the thread (an approval above the composer) rather
   * than sharing its black ground. Translucency there shows the words moving
   * underneath, which is exactly what a decision should not do: it gets an
   * opaque raised surface, the same as the sheet a form opens in.
   */
  solid?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "summary";
  accessibilityLiveRegion?: "polite";
}) {
  return (
    <View style={[styles.card, solid && styles.solid, tone === "attention" && styles.attention, style]} {...rest}>
      <LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0)"]} style={styles.sheen} />
      {children}
    </View>
  );
}

export const glass = {
  radius: 28,
  pad: 20,
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: glass.radius,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    padding: glass.pad,
    gap: 6,
    overflow: "hidden",
  },
  solid: {
    backgroundColor: Ghost.bg.raised,
    borderColor: "rgba(255,255,255,0.12)",
    boxShadow: "0 14px 34px rgba(0,0,0,0.6)",
  },
  attention: {
    borderColor: "rgba(255,169,40,0.55)",
    boxShadow: "0 0 24px rgba(255,169,40,0.14)",
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 88,
  },
});
