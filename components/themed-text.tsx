
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { Fonts } from '@/constants/theme';
import { useGhostStore } from '@/lib/store';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'mono';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const fontScale = useGhostStore((s) => s.fontScale);

  const getFontSize = (baseSize: number) => baseSize * fontScale;

  return (
    <Text
      style={[
        { color, fontFamily: Fonts?.mono }, // Default to mono for everything
        type === 'default' ? { fontSize: getFontSize(16), lineHeight: getFontSize(24) } : undefined,
        type === 'title' ? { fontSize: getFontSize(24), lineHeight: getFontSize(32), fontWeight: 'bold' } : undefined,
        type === 'defaultSemiBold' ? { fontSize: getFontSize(16), lineHeight: getFontSize(24), fontWeight: '600' } : undefined,
        type === 'subtitle' ? { fontSize: getFontSize(18), fontWeight: 'bold' } : undefined,
        type === 'link' ? { fontSize: getFontSize(16), lineHeight: getFontSize(30), color: '#0a7ea4', textDecorationLine: 'underline' } : undefined,
        type === 'mono' ? { fontSize: getFontSize(14) } : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  // Static styles are mostly overridden by dynamic ones above
});
