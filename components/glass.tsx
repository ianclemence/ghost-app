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
  ...rest
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** "attention" warms the edge: Ghost is asking, or stopped to check. */
  tone?: "default" | "attention";
  accessibilityLabel?: string;
  accessibilityRole?: "summary";
  accessibilityLiveRegion?: "polite";
}) {
  return (
    <View style={[styles.card, tone === "attention" && styles.attention, style]} {...rest}>
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
