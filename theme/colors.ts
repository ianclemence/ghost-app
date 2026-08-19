import { Platform } from "react-native";
import { Color } from "expo-router";

/**
 * Semantic color foundation.
 *
 * Values resolve on-device and adapt to the system theme (the app ships with
 * `userInterfaceStyle: "dark"`, so these resolve to dark variants). The
 * terminal-green brand tokens in `constants/theme.ts` remain the accent layer;
 * these are the neutral surfaces. Adopt incrementally — do not repaint
 * existing screens.
 */
export const colors = {
  label: Platform.select({
    ios: Color.ios.label,
    android: Color.android.dynamic.onSurface,
    default: "#EDEDED",
  })!,
  secondaryLabel: Platform.select({
    ios: Color.ios.secondaryLabel,
    android: Color.android.dynamic.onSurfaceVariant,
    default: "#A1A1AA",
  })!,
  separator: Platform.select({
    ios: Color.ios.separator,
    android: Color.android.dynamic.outlineVariant,
    default: "#27272A",
  })!,
  systemBackground: Platform.select({
    ios: Color.ios.systemBackground,
    android: Color.android.dynamic.surface,
    default: "#09090b",
  })!,
  secondarySystemBackground: Platform.select({
    ios: Color.ios.secondarySystemBackground,
    android: Color.android.dynamic.surfaceContainerHigh,
    default: "#18181B",
  })!,
  systemRed: Platform.select({
    ios: Color.ios.systemRed,
    android: Color.android.dynamic.error,
    default: "#EF4444",
  })!,
};
