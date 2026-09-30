import { Appearance, Platform } from "react-native";

/**
 * Ghost Design System: cool, quiet, confident.
 *
 * One palette in light and one in dark, chosen from the system setting when
 * the app starts (the root layout reloads the app if the setting changes, so
 * no screen is ever half one and half the other). Dark is true black. Nothing
 * here is borrowed from anyone else's palette: neutral greys with a cool cast,
 * one ink-blue accent, and amber as the single warm signal, used only when
 * Ghost is working or needs the owner. Monospace only for technical values.
 */

/** The scheme this run of the app uses. */
export const scheme: "light" | "dark" = Appearance.getColorScheme() === "dark" ? "dark" : "light";

// ─── Palettes ──────────────────────────────────────────────────────────────

const lightPalette = {
  bg: { base: "#F6F7F9", raised: "#FFFFFF", sunken: "#ECEEF2" },
  text: { primary: "#0B0D12", secondary: "#4B505C", tertiary: "#6A6F7B", inverse: "#FFFFFF" },
  accent: { primary: "#2C3AA8", soft: "rgba(44,58,168,0.08)", medium: "rgba(44,58,168,0.16)" },
  status: { success: "#1F7A4D", warning: "#8A5A00", error: "#C0392B", info: "#1F5F99" },
  border: { subtle: "rgba(8,10,16,0.06)", default: "rgba(8,10,16,0.12)", strong: "rgba(8,10,16,0.20)" },
  bubble: { user: "#E6E8EE" },
  ember: "#F5B942",
  emberBright: "#F8CF72",
  emberDeep: "#B8710A",
};

const darkPalette = {
  bg: { base: "#000000", raised: "#0C0D10", sunken: "#060608" },
  text: { primary: "#EDEDF0", secondary: "#B1B4BD", tertiary: "#868A94", inverse: "#05070D" },
  accent: { primary: "#9FB0FF", soft: "rgba(159,176,255,0.13)", medium: "rgba(159,176,255,0.24)" },
  status: { success: "#58C58F", warning: "#F0C25A", error: "#FF7A6B", info: "#7AB8EE" },
  border: { subtle: "rgba(255,255,255,0.07)", default: "rgba(255,255,255,0.13)", strong: "rgba(255,255,255,0.22)" },
  bubble: { user: "#1C1D22" },
  ember: "#F5B942",
  emberBright: "#F8CF72",
  emberDeep: "#F5B942",
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

/** The colour shadows are cast in: near-black ink in light, pure black in dark. */
export const shadowRGB = scheme === "dark" ? "0, 0, 0" : "8, 10, 16";

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
  bg: "#000000",
  bgSoft: "#08090B",
  surface: "#0C0D10",
  surface2: "#131418",
  surface3: "#1B1C21",

  ink: "#EDEDF0",
  inkDim: "#B1B4BD",
  muted: "#868A94",
  faint: "#5C606A",

  line: "rgba(255,255,255,0.07)",
  lineStrong: "rgba(255,255,255,0.14)",

  ok: "#58C58F",
  clay: "#FF7A6B",
  clayDeep: "#C0392B",
  warn: "#F0C25A",
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
