import { Appearance, Platform } from "react-native";

/**
 * Ghost Design System: warm, quiet, alive.
 *
 * Warm paper by day and warm midnight by night, the same two worlds as the web
 * console. One palette in light and one in dark, chosen from the system
 * setting when the app starts (the root layout reloads the app if the setting
 * changes, so no screen is ever half one and half the other). Deep indigo for
 * structure and the primary action, ember (amber) as the single warm signal,
 * used only when Ghost is working or needs the owner. Instrument Serif for the
 * few moments that should read as written; the system face for everything you
 * act on. Monospace only for technical values.
 */

/** The scheme this run of the app uses. */
export const scheme: "light" | "dark" = Appearance.getColorScheme() === "dark" ? "dark" : "light";

// ─── Palettes ──────────────────────────────────────────────────────────────

const lightPalette = {
  bg: { base: "#F8F6F1", raised: "#FFFEFB", sunken: "#F0ECE3" },
  text: { primary: "#1A1611", secondary: "#5B554C", tertiary: "#6F6A63", inverse: "#FFFFFF" },
  accent: { primary: "#3D3B5C", soft: "rgba(61,59,92,0.09)", medium: "rgba(61,59,92,0.17)" },
  status: { success: "#2D7A4A", warning: "#8A5A00", error: "#C24B3C", info: "#34688F" },
  border: { subtle: "rgba(60,45,25,0.07)", default: "rgba(60,45,25,0.13)", strong: "rgba(60,45,25,0.22)" },
  bubble: { user: "#EAE5DA" },
  ember: "#FFB45C",
  emberBright: "#FFCB8A",
  emberDeep: "#A8620A",
};

const darkPalette = {
  bg: { base: "#14110D", raised: "#1C1813", sunken: "#0F0C09" },
  text: { primary: "#F1E9DC", secondary: "#CDBFAC", tertiary: "#A3927F", inverse: "#14110D" },
  accent: { primary: "#B9B6F2", soft: "rgba(185,182,242,0.13)", medium: "rgba(185,182,242,0.24)" },
  status: { success: "#6FCB93", warning: "#F0C25A", error: "#FF8576", info: "#86B8E0" },
  border: { subtle: "rgba(240,233,223,0.07)", default: "rgba(240,233,223,0.13)", strong: "rgba(240,233,223,0.22)" },
  bubble: { user: "#26211A" },
  ember: "#FFB45C",
  emberBright: "#FFCB8A",
  emberDeep: "#FFB45C",
};

type Palette = typeof lightPalette;

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

/** The colour shadows are cast in: warm brown-black in light, pure black in dark. */
export const shadowRGB = scheme === "dark" ? "0, 0, 0" : "60, 45, 25";

// ─── Ghost Tokens (canonical) ──────────────────────────────────────────────

export const Ghost = tokens(scheme === "dark" ? darkPalette : lightPalette);

/** Navigation and tab colours for the same scheme. */
export const Colors = {
  light: {
    text: lightPalette.text.primary,
    background: lightPalette.bg.base,
    tint: lightPalette.accent.primary,
    icon: lightPalette.text.secondary,
    tabIconDefault: lightPalette.text.tertiary,
    tabIconSelected: lightPalette.accent.primary,
    border: lightPalette.border.default,
    card: lightPalette.bg.raised,
    success: lightPalette.status.success,
    error: lightPalette.status.error,
    warning: lightPalette.status.warning,
  },
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
  bg: "#0F0C09",
  bgSoft: "#14110D",
  surface: "#1C1813",
  surface2: "#26211A",
  surface3: "#302A21",

  ink: "#F1E9DC",
  inkDim: "#CDBFAC",
  muted: "#A3927F",
  faint: "#7A6D5E",

  line: "rgba(240,233,223,0.08)",
  lineStrong: "rgba(240,233,223,0.15)",

  ok: "#6FCB93",
  clay: "#FF8576",
  clayDeep: "#C24B3C",
  warn: "#F0C25A",
} as const;

// ─── Fonts ─────────────────────────────────────────────────────────────────

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
    backdrop: scheme === "dark" ? "rgba(8,6,4,0.72)" : "rgba(26,22,17,0.46)",
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
