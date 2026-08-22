import { Platform } from "react-native";

/**
 * Ghost design system — warm, calm, permanent.
 *
 * `Colors` keeps the historical key names (text / background / icon / border /
 * card / terminalGreen …) so the 200+ existing references keep working, but the
 * DARK values are rebaselined to the warm palette. The `Ghost` object below is
 * the canonical token set for the new components.
 */

export const Colors = {
  light: {
    text: "#1A1611",
    background: "#F4EFE6",
    tint: "#4F9E72",
    icon: "#8A7F6E",
    tabIconDefault: "#8A7F6E",
    tabIconSelected: "#4F9E72",
    border: "#E2DACA",
    card: "#FBF8F2",
    success: "#4F9E72",
    error: "#C24B3C",
    warning: "#B07C2E",
    terminalGreen: "#4F9E72",
    terminalAmber: "#B07C2E",
    terminalCyan: "#4F9E72",
  },
  dark: {
    text: "#EFE9DF",
    background: "#0E0C09",
    tint: "#6FBE8E",
    icon: "#A79C8C",
    tabIconDefault: "#6E665A",
    tabIconSelected: "#6FBE8E",
    border: "#26201A",
    card: "#17130E",
    success: "#6FBE8E",
    error: "#D4685A",
    warning: "#D6A05A",
    terminalGreen: "#6FBE8E",
    terminalAmber: "#D6A05A",
    terminalCyan: "#6FBE8E",
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "Menlo",
  },
  android: {
    sans: "sans-serif",
    serif: "serif",
    rounded: "sans-serif-medium",
    mono: "monospace",
  },
  default: {
    sans: "system-ui",
    serif: "serif",
    rounded: "system-ui",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/** Canonical design tokens (dark-first; app ships dark-only). */
export const Ghost = {
  bg: {
    base: "#0E0C09",
    surface: "#17130E",
    surface2: "#1F1A14",
  },
  text: {
    primary: "#EFE9DF",
    secondary: "#A79C8C",
    tertiary: "#6E665A",
  },
  hairline: "rgba(237,228,212,0.09)",
  hairlineStrong: "rgba(237,228,212,0.16)",
  accent: "#6FBE8E",
  accentSoft: "rgba(111,190,142,0.14)",
  accentInk: "#0E0C09",
  warn: "#D6A05A",
  danger: "#D4685A",
  /** warmth for primary surfaces used outside of Colors (e.g. new components) */
  get background() {
    return Colors.dark.background;
  },
  get card() {
    return Colors.dark.card;
  },
  get border() {
    return Colors.dark.border;
  },
  get icon() {
    return Colors.dark.icon;
  },
} as const;

/** Spacing scale: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  section: 56,
  screen: 72,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
  bubble: 18,
} as const;

/** Type scale (system sans). lineHeight in px. */
export const Type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
  subtitle: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: "600" as const },
  secondary: { fontSize: 14, lineHeight: 21, fontWeight: "400" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const, letterSpacing: 0.8 },
} as const;

export const UI = {
  spacing: {
    screenX: Space.xl,
    headerY: Space.md,
    card: Space.lg,
    section: Space.md,
  },
  radius: {
    panel: Radius.md,
    bubble: Radius.bubble,
  },
  typography: {
    meta: 11,
    status: 11,
  },
  modal: {
    top: 100,
    side: Space.xl,
    backdrop: "rgba(0,0,0,0.6)",
    headerPadding: Space.lg,
    bodyPadding: Space.lg,
    buttonY: Space.sm,
    buttonX: Space.md,
  },
} as const;
