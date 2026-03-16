
import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    border: '#E6E8EB',
    card: '#F9FAFB',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    terminalGreen: '#10B981', // Green 500
    terminalAmber: '#F59E0B', // Amber 500
  },
  dark: {
    text: '#EDEDED',
    background: '#09090b', // Deep charcoal/black
    tint: tintColorDark,
    icon: '#A1A1AA',
    tabIconDefault: '#71717A',
    tabIconSelected: tintColorDark,
    border: '#27272A', // Zinc 800
    card: '#18181B', // Zinc 900
    success: '#22C55E', // Green 500
    error: '#EF4444', // Red 500
    warning: '#F59E0B', // Amber 500
    terminalGreen: '#4ADE80', // Terminal Green
    terminalAmber: '#FBBF24', // Terminal Amber
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'Menlo', // Better mono for iOS
  },
  android: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif-medium',
    mono: 'monospace',
  },
  default: {
    sans: 'system-ui',
    serif: 'serif',
    rounded: 'system-ui',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
