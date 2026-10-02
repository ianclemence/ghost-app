import { Platform } from "react-native";

/**
 * Ghost Design System: black, one aurora of light, and quiet glass.
 *
 * Pure black is the canvas. All colour comes from a single aurora (amber,
 * magenta, violet, electric blue) that glows behind the screen and fades to
 * black, so nothing else needs to be coloured. Controls are glass: a faint
 * white fill with a hairline edge. Headlines are Instrument Serif; everything
 * else is Inter, light and large where Ghost speaks, regular where you act.
 * Dark only: there is no light theme.
 */

/** Kept for the screens that still ask which scheme this run is in. */
export const scheme = "dark" as const;

/** The aurora's four colours, sampled from the design reference. */
export const Aurora = {
  amber: "#FF9A1A",
  magenta: "#C23DEB",
  violet: "#7A3CF0",
  blue: "#3A2EF0",
} as const;

// ─── Palette ───────────────────────────────────────────────────────────────

const darkPalette = {
  bg: { base: "#000000", raised: "#0E0E12", sunken: "#07070A" },
  text: { primary: "#FFFFFF", secondary: "#B3B1BD", tertiary: "#7C7A88", inverse: "#000000" },
  accent: { primary: "#9C95FF", soft: "rgba(86,72,255,0.20)", medium: "rgba(86,72,255,0.34)" },
  status: { success: "#6FE3A0", warning: "#FFC24D", error: "#FF7A7A", info: "#8FB8FF" },
  border: { subtle: "rgba(255,255,255,0.07)", default: "rgba(255,255,255,0.12)", strong: "rgba(255,255,255,0.22)" },
  bubble: { user: "rgba(255,255,255,0.09)" },
  glass: { fill: "rgba(255,255,255,0.06)", fillStrong: "rgba(255,255,255,0.11)", border: "rgba(255,255,255,0.14)" },
  ember: "#FFA928",
  emberBright: "#FFC266",
  emberDeep: "#FFA928",
};

type Palette = typeof darkPalette;

function tokens(p: Palette) {
  return {
    ...p,
    // Backward compat aliases (for gradual migration)
    background: p.bg.base,
    card: p.bg.raised,
    hairline: p.border.subtle,
    hairlineStrong: p.border.default,
  };
}

/** "#RRGGBB" with an opacity, as an rgba() string. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Shadows are pure black. */
export const shadowRGB = "0, 0, 0";

// ─── Ghost Tokens (canonical) ──────────────────────────────────────────────

export const Ghost = tokens(darkPalette);

/** Navigation and tab colours for the same scheme. */
export const Colors = {
  light: undefined as never,
  dark: {
    text: darkPalette.text.primary,
    background: darkPalette.bg.base,
    tint: darkPalette.accent.primary,
    icon: darkPalette.text.secondary,
    tabIconDefault: darkPalette.text.tertiary,
    tabIconSelected: darkPalette.accent.primary,
    border: darkPalette.border.default,
    card: darkPalette.bg.raised,
    success: darkPalette.status.success,
    error: darkPalette.status.error,
    warning: darkPalette.status.warning,
  },
};

// ─── Camera overlay tokens (always dark: they sit over the live camera) ────

export const Midnight = {
  bg: "#000000",
  bgSoft: "#07070A",
  surface: "#0E0E12",
  surface2: "#17171D",
  surface3: "#202028",

  ink: "#FFFFFF",
  inkDim: "#B3B1BD",
  muted: "#7C7A88",
  faint: "#55535F",

  line: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(255,255,255,0.15)",

  ok: "#6FE3A0",
  clay: "#FF7A7A",
  clayDeep: "#C24B3C",
  warn: "#FFC24D",
} as const;

// ─── Fonts ─────────────────────────────────────────────────────────────────

/** Inter, by weight. Android and iOS pick a custom family per weight, not by fontWeight. */
export const Inter = {
  light: "Inter_300Light",
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: "SF Pro Text",
    display: "SF Pro Display",
    serif: "Georgia",
    /** The written voice: titles and empty states. Loaded at startup (see app/_layout). */
    voice: "InstrumentSerif",
    voiceItalic: "InstrumentSerif-Italic",
    rounded: "SF Pro Rounded",
    mono: "SF Mono",
  },
  android: {
    sans: "sans-serif",
    display: "sans-serif-medium",
    serif: "serif",
    voice: "InstrumentSerif",
    voiceItalic: "InstrumentSerif-Italic",
    rounded: "sans-serif-medium",
    mono: "monospace",
  },
  default: {
    sans: "system-ui",
    display: "system-ui",
    serif: "Georgia",
    voice: "InstrumentSerif",
    voiceItalic: "InstrumentSerif-Italic",
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
  // Canonical edge rhythm: distance from the safe-area top to any screen
  // title, mirrored by the FAB distance from the screen bottom. One value
  // so the button and headers sit identically on every screen.
  edge: 52,
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
  /** Ghost speaking: large, light, quiet. */
  prose: {
    fontSize: 21,
    lineHeight: 30,
    fontWeight: "300" as const,
    letterSpacing: -0.35,
  },
  display: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "600" as const,
    letterSpacing: -0.5,
  },
  largeTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600" as const,
    letterSpacing: -0.4,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "600" as const,
    letterSpacing: -0.25,
  },
  headline: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600" as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 15.5,
    lineHeight: 22,
    fontWeight: "400" as const,
  },
  callout: {
    fontSize: 14.5,
    lineHeight: 20,
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
    fontSize: 12,
    lineHeight: 16,
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
    bottom: 80,
    side: Space.xl,
    backdrop: "rgba(0,0,0,0.74)",
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
