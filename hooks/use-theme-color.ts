/**
 * The colour for a named role in the scheme this run of the app uses (the
 * palette is chosen once at start-up, see constants/theme.ts). A colour passed
 * in for that scheme wins.
 */

import { Colors, scheme } from '@/constants/theme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  return props[scheme] ?? Colors[scheme][colorName];
}
