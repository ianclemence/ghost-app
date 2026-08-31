import { Platform } from "react-native";

/**
 * Ghost Design System — Warm, quiet, premium, human.
 *
 * This replaces the terminal aesthetic with a calm, personal interface.
 * Light-first design. Monospace only for actual technical values.
 */

// ─── Colors ────────────────────────────────────────────────────────────────

export const Colors = {
  light: {
    text: "#1A1611",
    background: "#FAFAF7",
    tint: "#3d3b5c",
    icon: "#6B6560",
    tabIconDefault: "#9C9590",
    tabIconSelected: "#3d3b5c",
    border: "rgba(26,22,17,0.12)",
    card: "#F5F3EE",
    success: "#2d7a4a",
    error: "#C24B3C",
    warning: "#B07C2E",
  },
  dark: {
    text: "#EFE9DF",
    background: "#0E0C09",
    tint: "#9b99c9",
    icon: "#A79C8C",
    tabIconDefault: "#6E665A",
    tabIconSelected: "#9b99c9",
    border: "#26201A",
    card: "#17130E",
    success: "#57b07a",
    error: "#D4685A",
    warning: "#D6A05A",
  },
};

// ─── Ghost Tokens (canonical) ──────────────────────────────────────────────

export const Ghost = {
  // Canvas
  bg: {
    base: "#FAFAF7",
    raised: "#F5F3EE",
    sunken: "#EDEBE6",
  },

  // Text
  text: {
    primary: "#1A1611",
    secondary: "#6B6560",
    tertiary: "#9C9590",
    inverse: "#FAFAF7",
  },

  // Accent
  accent: {
    primary: "#3d3b5c",
    soft: "rgba(61,59,92,0.10)",
    medium: "rgba(61,59,92,0.18)",
  },

  // Status
  status: {
    success: "#2d7a4a",
    warning: "#B07C2E",
    error: "#C24B3C",
    info: "#5A7A9A",
  },

  // Borders
  border: {
    subtle: "rgba(26,22,17,0.06)",
    default: "rgba(26,22,17,0.12)",
    strong: "rgba(26,22,17,0.20)",
  },

  // Backward compat getters (for gradual migration)
  get background() {
    return this.bg.base;
  },
  get card() {
    return this.bg.raised;
  },
  get hairline() {
    return this.border.subtle;
  },
  get hairlineStrong() {
    return this.border.default;
  },

  // Ember — Ghost's presence light (warm midnight accent)
  ember: "#ffb45c",
  emberBright: "#ffca8f",
  emberDeep: "#d88a33",
} as const;

// ─── Midnight Tokens (warm dark conversation world) ────────────────────────

export const Midnight = {
  bg: "#17130f",
  bgSoft: "#1d1813",
  surface: "#241e17",
  surface2: "#2c251d",
  surface3: "#352c22",

  ink: "#f1e9dc",
  inkDim: "#c3b6a6",
  muted: "#a3927f",
  faint: "#7a6c5d",

  line: "rgba(240,233,223,0.07)",
  lineStrong: "rgba(240,233,223,0.14)",

  ok: "#86b28f",
  clay: "#e08667",
  clayDeep: "#a64f36",
  warn: "#e8c06a",
} as const;

// ─── Fonts ─────────────────────────────────────────────────────────────────

export const Fonts = Platform.select({
  ios: {
    sans: "SF Pro Text",
    display: "SF Pro Display",
    serif: "Georgia",
    rounded: "SF Pro Rounded",
    mono: "SF Mono",
  },
  android: {
    sans: "sans-serif",
    display: "sans-serif-medium",
    serif: "serif",
    rounded: "sans-serif-medium",
    mono: "monospace",
  },
  default: {
    sans: "system-ui",
    display: "system-ui",
    serif: "Georgia",
    rounded: "system-ui",
    mono: "monospace",
  },
});

// ─── Spacing ───────────────────────────────────────────────────────────────

export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  section: 64,
} as const;

// ─── Radius ────────────────────────────────────────────────────────────────

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  full: 999,
} as const;

// ─── Typography ────────────────────────────────────────────────────────────

export const Type = {
  display: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "600" as const,
    letterSpacing: -0.5,
  },
  largeTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600" as const,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  callout: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "400" as const,
  },
  subhead: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400" as const,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500" as const,
    letterSpacing: 0.2,
  },
} as const;

// ─── UI Composite Tokens ───────────────────────────────────────────────────

export const UI = {
  spacing: {
    screenX: Space.xl,
    headerY: Space.md,
    card: Space.lg,
    section: Space.xxl,
  },
  radius: {
    panel: Radius.lg,
    bubble: Radius.xl,
  },
  typography: {
    meta: 11,
    status: 12,
  },
  modal: {
    top: 100,
    side: Space.xl,
    backdrop: "rgba(26,22,17,0.4)",
    headerPadding: Space.lg,
    bodyPadding: Space.lg,
    buttonY: Space.sm,
    buttonX: Space.md,
  },
} as const;

// ─── Motion ────────────────────────────────────────────────────────────────

export const Motion = {
  fast: 120,
  base: 180,
  moderate: 240,
  slow: 320,
} as const;
